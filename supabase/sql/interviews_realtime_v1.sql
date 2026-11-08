-- Calendar realtime v1.
-- Private Broadcast only. Payload is a generic invalidation signal.

create or replace function public.broadcast_calendar_company_change(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_company_id is null then
    return;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'companyId', p_company_id,
      'changedAt', statement_timestamp()
    ),
    'calendar_changed',
    'calendar:company:' || p_company_id::text,
    true
  );
end;
$$;

create or replace function public.broadcast_interview_calendar_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.broadcast_calendar_company_change(coalesce(new.company_id, old.company_id));
  return null;
end;
$$;

drop trigger if exists interviews_calendar_realtime_broadcast on public.interviews;
create trigger interviews_calendar_realtime_broadcast
  after insert or update or delete on public.interviews
  for each row
  execute function public.broadcast_interview_calendar_change();

create or replace function public.broadcast_candidate_calendar_display_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_company_id uuid;
begin
  for changed_company_id in
    select distinct i.company_id
    from public.interviews i
    where i.candidate_id = coalesce(new.id, old.id)
  loop
    perform public.broadcast_calendar_company_change(changed_company_id);
  end loop;

  return null;
end;
$$;

drop trigger if exists candidates_calendar_display_realtime_broadcast on public.candidates;
create trigger candidates_calendar_display_realtime_broadcast
  after update of name on public.candidates
  for each row
  execute function public.broadcast_candidate_calendar_display_change();

create or replace function public.broadcast_vacancy_calendar_display_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_company_id uuid;
begin
  for changed_company_id in
    select distinct i.company_id
    from public.interviews i
    where i.vacancy_id = coalesce(new.id, old.id)
  loop
    perform public.broadcast_calendar_company_change(changed_company_id);
  end loop;

  return null;
end;
$$;

drop trigger if exists vacancies_calendar_display_realtime_broadcast on public.vacancies;
create trigger vacancies_calendar_display_realtime_broadcast
  after update of title on public.vacancies
  for each row
  execute function public.broadcast_vacancy_calendar_display_change();

alter table realtime.messages enable row level security;

drop policy if exists "calendar company members can read private calendar broadcasts" on realtime.messages;
create policy "calendar company members can read private calendar broadcasts"
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and realtime.topic() = 'calendar:company:' || p.company_id::text
    )
  );

create or replace function public.cancel_interview_mvp(
  p_interview_id uuid,
  p_company_id uuid,
  p_cancel_note text,
  p_expected_updated_at timestamptz
)
returns public.interviews
language plpgsql
security definer
set search_path = public
as $$
declare
  changed public.interviews;
begin
  update public.interviews
  set status = 'cancelled',
      cancel_note = p_cancel_note,
      cancelled_at = now(),
      updated_at = now()
  where id = p_interview_id
    and company_id = p_company_id
    and status = 'scheduled'
    and updated_at = p_expected_updated_at
  returning * into changed;

  return changed;
end;
$$;

create or replace function public.complete_interview_mvp(
  p_interview_id uuid,
  p_company_id uuid,
  p_completion_note text,
  p_expected_updated_at timestamptz
)
returns public.interviews
language plpgsql
security definer
set search_path = public
as $$
declare
  changed public.interviews;
begin
  update public.interviews
  set status = 'completed',
      completion_note = p_completion_note,
      completed_at = now(),
      updated_at = now()
  where id = p_interview_id
    and company_id = p_company_id
    and status = 'scheduled'
    and updated_at = p_expected_updated_at
  returning * into changed;

  return changed;
end;
$$;

revoke execute on function public.cancel_interview_mvp(uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.complete_interview_mvp(uuid, uuid, text, timestamptz) from public, anon, authenticated;

grant execute on function public.cancel_interview_mvp(uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.complete_interview_mvp(uuid, uuid, text, timestamptz) to service_role;
