create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  vacancy_id uuid not null references public.vacancies(id) on delete cascade,
  scheduled_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 15 and 480),
  type text not null check (type in ('phone', 'video', 'in-person', 'technical')),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  interviewer_ids uuid[] not null check (cardinality(interviewer_ids) >= 1),
  meeting_url text check (meeting_url is null or char_length(meeting_url) <= 500),
  location text check (location is null or char_length(location) <= 250),
  notes text check (notes is null or char_length(notes) <= 2000),
  completion_note text check (completion_note is null or char_length(completion_note) <= 2000),
  cancel_note text check (cancel_note is null or char_length(cancel_note) <= 2000),
  completed_at timestamptz,
  cancelled_at timestamptz,
  external_provider text check (external_provider is null or external_provider in ('google_calendar')),
  external_event_id text,
  sync_status text not null default 'not_connected' check (sync_status in ('not_connected', 'pending', 'synced', 'failed')),
  sync_error text,
  last_synced_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'interviews'
      and column_name = 'duration'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'interviews'
      and column_name = 'duration_minutes'
  ) then
    alter table public.interviews rename column duration to duration_minutes;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'interviews'
      and column_name = 'interviewers'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'interviews'
      and column_name = 'interviewer_ids'
  ) then
    alter table public.interviews rename column interviewers to interviewer_ids;
  end if;
end;
$$;

alter table public.interviews
  add column if not exists company_id uuid references public.companies(id) on delete cascade,
  add column if not exists completion_note text,
  add column if not exists cancel_note text,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists external_provider text,
  add column if not exists external_event_id text,
  add column if not exists sync_status text default 'not_connected',
  add column if not exists sync_error text,
  add column if not exists last_synced_at timestamptz,
  add column if not exists created_by uuid references public.profiles(id);

update public.interviews i
set company_id = v.company_id
from public.vacancies v
where i.company_id is null
  and v.id = i.vacancy_id;

update public.interviews i
set created_by = coalesce(c.created_by, v.created_by)
from public.candidates c
join public.vacancies v on v.id = c.vacancy_id
where i.created_by is null
  and c.id = i.candidate_id;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'interviews'
      and column_name = 'feedback'
  ) then
    if exists (select 1 from public.interviews) then
      raise exception 'INTERVIEWS_LEGACY_FEEDBACK_REVIEW_REQUIRED';
    end if;

    alter table public.interviews drop column feedback;
  end if;

  if exists (
    select 1
    from public.interviews
    where company_id is null
      or candidate_id is null
      or vacancy_id is null
      or scheduled_at is null
      or duration_minutes is null
      or duration_minutes < 15
      or duration_minutes > 480
      or type is null
      or type not in ('phone', 'video', 'in-person', 'technical')
      or status is null
      or status not in ('scheduled', 'completed', 'cancelled')
      or interviewer_ids is null
      or cardinality(interviewer_ids) < 1
      or created_by is null
      or external_provider is not null and external_provider not in ('google_calendar')
      or sync_status is null
      or sync_status not in ('not_connected', 'pending', 'synced', 'failed')
      or char_length(coalesce(completion_note, '')) > 2000
      or char_length(coalesce(cancel_note, '')) > 2000
      or char_length(coalesce(meeting_url, '')) > 500
      or char_length(coalesce(location, '')) > 250
      or char_length(coalesce(notes, '')) > 2000
      or not exists (
        select 1
        from public.companies c
        where c.id = interviews.company_id
      )
      or not exists (
        select 1
        from public.candidates c
        where c.id = interviews.candidate_id
      )
      or not exists (
        select 1
        from public.vacancies v
        where v.id = interviews.vacancy_id
      )
      or not exists (
        select 1
        from public.profiles p
        where p.id = interviews.created_by
      )
  ) then
    raise exception 'INTERVIEWS_LEGACY_DATA_REVIEW_REQUIRED';
  end if;
end;
$$;

alter table public.interviews
  alter column company_id set not null,
  alter column candidate_id set not null,
  alter column vacancy_id set not null,
  alter column scheduled_at set not null,
  alter column duration_minutes set not null,
  alter column type set not null,
  alter column status set not null,
  alter column status set default 'scheduled',
  alter column interviewer_ids set not null,
  alter column sync_status set not null,
  alter column sync_status set default 'not_connected',
  alter column created_by set not null,
  alter column created_at set not null,
  alter column created_at set default now(),
  alter column updated_at set not null,
  alter column updated_at set default now();

do $$
begin
  alter table public.interviews drop constraint if exists interviews_duration_check;
  alter table public.interviews drop constraint if exists interviews_duration_minutes_check;
  alter table public.interviews drop constraint if exists interviews_type_check;
  alter table public.interviews drop constraint if exists interviews_type_check_mvp;
  alter table public.interviews drop constraint if exists interviews_status_check;
  alter table public.interviews drop constraint if exists interviews_status_check_mvp;
  alter table public.interviews drop constraint if exists interviews_interviewer_ids_check;
  alter table public.interviews drop constraint if exists interviews_meeting_url_check;
  alter table public.interviews drop constraint if exists interviews_meeting_url_length_check;
  alter table public.interviews drop constraint if exists interviews_location_check;
  alter table public.interviews drop constraint if exists interviews_location_length_check;
  alter table public.interviews drop constraint if exists interviews_notes_check;
  alter table public.interviews drop constraint if exists interviews_notes_length_check;
  alter table public.interviews drop constraint if exists interviews_completion_note_check;
  alter table public.interviews drop constraint if exists interviews_completion_note_length_check;
  alter table public.interviews drop constraint if exists interviews_cancel_note_check;
  alter table public.interviews drop constraint if exists interviews_cancel_note_length_check;
  alter table public.interviews drop constraint if exists interviews_external_provider_check;
  alter table public.interviews drop constraint if exists interviews_sync_status_check;

  alter table public.interviews add constraint interviews_duration_minutes_check check (duration_minutes between 15 and 480);
  alter table public.interviews add constraint interviews_type_check check (type in ('phone', 'video', 'in-person', 'technical'));
  alter table public.interviews add constraint interviews_status_check check (status in ('scheduled', 'completed', 'cancelled'));
  alter table public.interviews add constraint interviews_interviewer_ids_check check (cardinality(interviewer_ids) >= 1);
  alter table public.interviews add constraint interviews_meeting_url_length_check check (meeting_url is null or char_length(meeting_url) <= 500);
  alter table public.interviews add constraint interviews_location_length_check check (location is null or char_length(location) <= 250);
  alter table public.interviews add constraint interviews_notes_length_check check (notes is null or char_length(notes) <= 2000);
  alter table public.interviews add constraint interviews_completion_note_length_check check (completion_note is null or char_length(completion_note) <= 2000);
  alter table public.interviews add constraint interviews_cancel_note_length_check check (cancel_note is null or char_length(cancel_note) <= 2000);
  alter table public.interviews add constraint interviews_external_provider_check check (external_provider is null or external_provider in ('google_calendar'));
  alter table public.interviews add constraint interviews_sync_status_check check (sync_status in ('not_connected', 'pending', 'synced', 'failed'));
end;
$$;

create index if not exists idx_interviews_company_scheduled_at on public.interviews(company_id, scheduled_at);
create index if not exists idx_interviews_candidate_id on public.interviews(candidate_id);
create index if not exists idx_interviews_vacancy_id on public.interviews(vacancy_id);
create index if not exists idx_interviews_created_by on public.interviews(created_by);
create index if not exists idx_interviews_scheduled_at on public.interviews(scheduled_at);
create index if not exists idx_interviews_interviewer_ids on public.interviews using gin(interviewer_ids);

drop trigger if exists update_interviews_updated_at on public.interviews;
create trigger update_interviews_updated_at
  before update on public.interviews
  for each row
  execute function public.update_updated_at_column();

alter table public.interviews enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'interviews'
  loop
    execute format('drop policy if exists %I on public.interviews', policy_record.policyname);
  end loop;
end;
$$;

create policy "interviews_select_manageable"
  on public.interviews
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.company_id = interviews.company_id
        and (
          p.role = 'admin'
          or (
            exists (
              select 1
              from public.candidates c
              where c.id = interviews.candidate_id
                and c.created_by = auth.uid()
            )
            and exists (
              select 1
              from public.vacancies v
              where v.id = interviews.vacancy_id
                and v.created_by = auth.uid()
            )
          )
        )
    )
  );

-- Calendar mutations must go through guarded API routes using the service role.
-- Interviewer-only visibility is exposed only through the sanitized API DTO, not direct table select.

create or replace function public.create_interview_mvp(
  p_company_id uuid,
  p_candidate_id uuid,
  p_vacancy_id uuid,
  p_scheduled_at timestamptz,
  p_duration_minutes integer,
  p_type text,
  p_interviewer_ids uuid[],
  p_meeting_url text,
  p_location text,
  p_notes text,
  p_created_by uuid,
  p_allow_conflicts boolean default false
)
returns public.interviews
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.interviews;
  lock_interviewer_id uuid;
begin
  for lock_interviewer_id in
    select id from unnest(p_interviewer_ids) as id order by id
  loop
    perform pg_advisory_xact_lock(hashtext(p_company_id::text), hashtext(lock_interviewer_id::text));
  end loop;

  if not p_allow_conflicts and exists (
    select 1
    from public.interviews existing
    where existing.company_id = p_company_id
      and existing.status = 'scheduled'
      and existing.interviewer_ids && p_interviewer_ids
      and existing.scheduled_at < p_scheduled_at + (p_duration_minutes || ' minutes')::interval
      and p_scheduled_at < existing.scheduled_at + (existing.duration_minutes || ' minutes')::interval
  ) then
    raise exception 'INTERVIEW_CONFLICTS' using errcode = 'P0001';
  end if;

  insert into public.interviews (
    company_id,
    candidate_id,
    vacancy_id,
    scheduled_at,
    duration_minutes,
    type,
    interviewer_ids,
    meeting_url,
    location,
    notes,
    created_by
  )
  values (
    p_company_id,
    p_candidate_id,
    p_vacancy_id,
    p_scheduled_at,
    p_duration_minutes,
    p_type,
    p_interviewer_ids,
    p_meeting_url,
    p_location,
    p_notes,
    p_created_by
  )
  returning * into created;

  update public.candidates
  set status = 'interview-scheduled',
      updated_at = now()
  where id = p_candidate_id
    and status in ('new', 'reviewing', 'security-check', 'interview-scheduled');

  return created;
end;
$$;

create or replace function public.update_interview_mvp(
  p_interview_id uuid,
  p_company_id uuid,
  p_scheduled_at timestamptz,
  p_duration_minutes integer,
  p_type text,
  p_interviewer_ids uuid[],
  p_meeting_url text,
  p_location text,
  p_notes text,
  p_expected_updated_at timestamptz,
  p_allow_conflicts boolean default false
)
returns public.interviews
language plpgsql
security definer
set search_path = public
as $$
declare
  changed public.interviews;
  lock_interviewer_id uuid;
begin
  for lock_interviewer_id in
    select id from unnest(p_interviewer_ids) as id order by id
  loop
    perform pg_advisory_xact_lock(hashtext(p_company_id::text), hashtext(lock_interviewer_id::text));
  end loop;

  if not p_allow_conflicts and exists (
    select 1
    from public.interviews existing
    where existing.company_id = p_company_id
      and existing.id <> p_interview_id
      and existing.status = 'scheduled'
      and existing.interviewer_ids && p_interviewer_ids
      and existing.scheduled_at < p_scheduled_at + (p_duration_minutes || ' minutes')::interval
      and p_scheduled_at < existing.scheduled_at + (existing.duration_minutes || ' minutes')::interval
  ) then
    raise exception 'INTERVIEW_CONFLICTS' using errcode = 'P0001';
  end if;

  update public.interviews
  set scheduled_at = p_scheduled_at,
      duration_minutes = p_duration_minutes,
      type = p_type,
      interviewer_ids = p_interviewer_ids,
      meeting_url = p_meeting_url,
      location = p_location,
      notes = p_notes,
      updated_at = now()
  where id = p_interview_id
    and company_id = p_company_id
    and status = 'scheduled'
    and updated_at = p_expected_updated_at
  returning * into changed;

  return changed;
end;
$$;

create or replace function public.cancel_interview_mvp(
  p_interview_id uuid,
  p_company_id uuid,
  p_cancel_note text
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
  returning * into changed;

  return changed;
end;
$$;

create or replace function public.complete_interview_mvp(
  p_interview_id uuid,
  p_company_id uuid,
  p_completion_note text
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
  returning * into changed;

  return changed;
end;
$$;

revoke execute on function public.create_interview_mvp(uuid, uuid, uuid, timestamptz, integer, text, uuid[], text, text, text, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.update_interview_mvp(uuid, uuid, timestamptz, integer, text, uuid[], text, text, text, timestamptz, boolean) from public, anon, authenticated;
revoke execute on function public.cancel_interview_mvp(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.complete_interview_mvp(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.create_interview_mvp(uuid, uuid, uuid, timestamptz, integer, text, uuid[], text, text, text, uuid, boolean) to service_role;
grant execute on function public.update_interview_mvp(uuid, uuid, timestamptz, integer, text, uuid[], text, text, text, timestamptz, boolean) to service_role;
grant execute on function public.cancel_interview_mvp(uuid, uuid, text) to service_role;
grant execute on function public.complete_interview_mvp(uuid, uuid, text) to service_role;
