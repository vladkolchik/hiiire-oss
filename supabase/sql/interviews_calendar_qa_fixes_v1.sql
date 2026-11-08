-- Calendar QA fixes: editable candidate/vacancy, candidate conflicts, schedulable vacancies, and 5-minute minimum duration.

do $$
begin
  alter table public.interviews drop constraint if exists interviews_duration_minutes_check;
  alter table public.interviews add constraint interviews_duration_minutes_check check (duration_minutes between 5 and 480);
end;
$$;

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
  if not exists (
    select 1
    from public.vacancies v
    where v.id = p_vacancy_id
      and v.company_id = p_company_id
      and v.status in ('active', 'paused')
  ) then
    raise exception 'VACANCY_NOT_SCHEDULABLE' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.candidates c
    where c.id = p_candidate_id
      and c.vacancy_id = p_vacancy_id
  ) then
    raise exception 'CANDIDATE_VACANCY_MISMATCH' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_company_id::text), hashtext(p_candidate_id::text));

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
      and (
        existing.interviewer_ids && p_interviewer_ids
        or existing.candidate_id = p_candidate_id
      )
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

drop function if exists public.update_interview_mvp(uuid, uuid, timestamptz, integer, text, uuid[], text, text, text, timestamptz, boolean);

create or replace function public.update_interview_mvp(
  p_interview_id uuid,
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
  if not exists (
    select 1
    from public.vacancies v
    where v.id = p_vacancy_id
      and v.company_id = p_company_id
      and v.status in ('active', 'paused')
  ) then
    raise exception 'VACANCY_NOT_SCHEDULABLE' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.candidates c
    where c.id = p_candidate_id
      and c.vacancy_id = p_vacancy_id
  ) then
    raise exception 'CANDIDATE_VACANCY_MISMATCH' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_company_id::text), hashtext(p_candidate_id::text));

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
      and (
        existing.interviewer_ids && p_interviewer_ids
        or existing.candidate_id = p_candidate_id
      )
      and existing.scheduled_at < p_scheduled_at + (p_duration_minutes || ' minutes')::interval
      and p_scheduled_at < existing.scheduled_at + (existing.duration_minutes || ' minutes')::interval
  ) then
    raise exception 'INTERVIEW_CONFLICTS' using errcode = 'P0001';
  end if;

  update public.interviews
  set candidate_id = p_candidate_id,
      vacancy_id = p_vacancy_id,
      scheduled_at = p_scheduled_at,
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

revoke execute on function public.create_interview_mvp(uuid, uuid, uuid, timestamptz, integer, text, uuid[], text, text, text, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.update_interview_mvp(uuid, uuid, uuid, uuid, timestamptz, integer, text, uuid[], text, text, text, timestamptz, boolean) from public, anon, authenticated;

grant execute on function public.create_interview_mvp(uuid, uuid, uuid, timestamptz, integer, text, uuid[], text, text, text, uuid, boolean) to service_role;
grant execute on function public.update_interview_mvp(uuid, uuid, uuid, uuid, timestamptz, integer, text, uuid[], text, text, text, timestamptz, boolean) to service_role;
