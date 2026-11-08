-- Company team isolation (MVP) + extensible access contract
--
-- MVP rules:
-- - company credits remain shared (no changes here)
-- - hr/recruiter: can only see/modify vacancies & candidates they created
-- - company admin (profiles.role='admin'): can see everything inside company
--
-- Extensibility:
-- - All RLS policies are wired through small set of helper functions:
--   private.current_user_company_id(), private.is_company_admin_or_lead(),
--   private.can_access_vacancy(), private.can_access_candidate(), private.can_access_job_ai()
-- - Later, to add roles (e.g. hr_lead) or sharing/memberships, update only private.can_access_*.

-- 0) Private schema
create schema if not exists private;

-- 1) Helper: current company id for auth user
create or replace function private.current_user_company_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  cid uuid;
begin
  -- Avoid RLS recursion when called from other RLS policies/functions.
  perform set_config('row_security', 'off', true);
  select p.company_id into cid
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
  return cid;
end;
$$;

-- 2) Helper: current role for auth user
create or replace function private.current_user_role()
returns text
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  r text;
begin
  -- Avoid RLS recursion when called from other RLS policies/functions.
  perform set_config('row_security', 'off', true);
  select p.role::text into r
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
  return r;
end;
$$;

-- 3) Helper: company admin/lead (MVP: admin only)
create or replace function private.is_company_admin_or_lead()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce(private.current_user_role() in ('admin'), false)
$$;

-- 5) Add candidates.created_by (if missing) + backfill
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'candidates'
      and column_name = 'created_by'
  ) then
    alter table public.candidates
      add column created_by uuid;
  end if;
end $$;

-- 4) Extensible access contract
-- NOTE: must come AFTER candidates.created_by exists.
create or replace function private.can_access_vacancy(p_vacancy_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  perform set_config('row_security', 'off', true);
  return exists (
    select 1
    from public.vacancies v
    where v.id = p_vacancy_id
      and v.company_id = private.current_user_company_id()
      and (
        private.is_company_admin_or_lead()
        or v.created_by = auth.uid()
      )
  );
end
$$;

create or replace function private.can_access_candidate(p_candidate_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  perform set_config('row_security', 'off', true);
  return exists (
    select 1
    from public.candidates c
    join public.vacancies v on v.id = c.vacancy_id
    where c.id = p_candidate_id
      and v.company_id = private.current_user_company_id()
      and (
        private.is_company_admin_or_lead()
        or c.created_by = auth.uid()
      )
  );
end
$$;

create or replace function private.can_access_job_ai(p_job_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  perform set_config('row_security', 'off', true);
  return exists (
    select 1
    from public.jobs_ai j
    where j.id = p_job_id
      and j.company_id = private.current_user_company_id()
      and (
        private.is_company_admin_or_lead()
        or j.requested_by = auth.uid()
      )
  );
end
$$;

-- Backfill from vacancy owner (MVP assumption: candidate owner = vacancy owner)
update public.candidates c
set created_by = v.created_by
from public.vacancies v
where v.id = c.vacancy_id
  and c.created_by is null;

-- FK + index + not-null (only if safe)
do $$
begin
  if not exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'candidates'
      and con.conname = 'candidates_created_by_fkey'
  ) then
    alter table public.candidates
      add constraint candidates_created_by_fkey
      foreign key (created_by) references public.profiles(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'idx_candidates_created_by'
  ) then
    create index idx_candidates_created_by on public.candidates(created_by);
  end if;

  -- Only enforce NOT NULL when there are no NULLs remaining.
  if not exists (select 1 from public.candidates where created_by is null limit 1) then
    alter table public.candidates
      alter column created_by set not null;
  else
    raise notice 'candidates.created_by still has NULLs; NOT NULL constraint was not applied';
  end if;
end $$;

-- 6) Enable RLS
alter table public.profiles enable row level security;
alter table public.vacancies enable row level security;
alter table public.candidates enable row level security;
alter table public.candidate_contacts enable row level security;
alter table public.ai_analyses enable row level security;
alter table public.jobs_ai enable row level security;

-- 7) RLS policies
--
-- IMPORTANT:
-- - Postgres evaluates multiple RLS policies as OR.
-- - If older policies remain (e.g. "view company vacancies"), they may widen access
--   and break per-user isolation.
-- - To make this migration self-contained, we drop all existing policies on the
--   affected tables and then recreate the intended set.
do $$
declare
  r record;
begin
  for r in select policyname from pg_policies where schemaname='public' and tablename='profiles' loop
    execute format('drop policy if exists %I on public.profiles', r.policyname);
  end loop;
  for r in select policyname from pg_policies where schemaname='public' and tablename='vacancies' loop
    execute format('drop policy if exists %I on public.vacancies', r.policyname);
  end loop;
  for r in select policyname from pg_policies where schemaname='public' and tablename='candidates' loop
    execute format('drop policy if exists %I on public.candidates', r.policyname);
  end loop;
  for r in select policyname from pg_policies where schemaname='public' and tablename='candidate_contacts' loop
    execute format('drop policy if exists %I on public.candidate_contacts', r.policyname);
  end loop;
  for r in select policyname from pg_policies where schemaname='public' and tablename='ai_analyses' loop
    execute format('drop policy if exists %I on public.ai_analyses', r.policyname);
  end loop;
  for r in select policyname from pg_policies where schemaname='public' and tablename='jobs_ai' loop
    execute format('drop policy if exists %I on public.jobs_ai', r.policyname);
  end loop;
end $$;

-- PROFILES
drop policy if exists profiles_select_self_or_company_admin on public.profiles;
create policy profiles_select_self_or_company_admin
  on public.profiles
  for select
  using (
    auth.uid() = id
    or (
      private.is_company_admin_or_lead()
      and company_id = private.current_user_company_id()
    )
  );

-- VACANCIES
drop policy if exists vacancies_select_access on public.vacancies;
create policy vacancies_select_access
  on public.vacancies
  for select
  using (
    company_id = private.current_user_company_id()
    and private.can_access_vacancy(id)
  );

drop policy if exists vacancies_insert_access on public.vacancies;
create policy vacancies_insert_access
  on public.vacancies
  for insert
  with check (
    company_id = private.current_user_company_id()
    and created_by = auth.uid()
  );

drop policy if exists vacancies_update_access on public.vacancies;
create policy vacancies_update_access
  on public.vacancies
  for update
  using (
    company_id = private.current_user_company_id()
    and private.can_access_vacancy(id)
  )
  with check (
    company_id = private.current_user_company_id()
    and private.can_access_vacancy(id)
  );

drop policy if exists vacancies_delete_access on public.vacancies;
create policy vacancies_delete_access
  on public.vacancies
  for delete
  using (
    company_id = private.current_user_company_id()
    and private.can_access_vacancy(id)
  );

-- CANDIDATES
drop policy if exists candidates_select_access on public.candidates;
create policy candidates_select_access
  on public.candidates
  for select
  using (
    private.can_access_candidate(id)
  );

drop policy if exists candidates_insert_access on public.candidates;
create policy candidates_insert_access
  on public.candidates
  for insert
  with check (
    created_by = auth.uid()
    and private.can_access_vacancy(vacancy_id)
  );

drop policy if exists candidates_update_access on public.candidates;
create policy candidates_update_access
  on public.candidates
  for update
  using (
    private.can_access_candidate(id)
  )
  with check (
    private.can_access_candidate(id)
  );

drop policy if exists candidates_delete_access on public.candidates;
create policy candidates_delete_access
  on public.candidates
  for delete
  using (
    private.can_access_candidate(id)
  );

-- CANDIDATE_CONTACTS
drop policy if exists candidate_contacts_select_access on public.candidate_contacts;
create policy candidate_contacts_select_access
  on public.candidate_contacts
  for select
  using (
    private.can_access_candidate(candidate_id)
  );

drop policy if exists candidate_contacts_insert_access on public.candidate_contacts;
create policy candidate_contacts_insert_access
  on public.candidate_contacts
  for insert
  with check (
    private.can_access_candidate(candidate_id)
  );

drop policy if exists candidate_contacts_update_access on public.candidate_contacts;
create policy candidate_contacts_update_access
  on public.candidate_contacts
  for update
  using (
    private.can_access_candidate(candidate_id)
  )
  with check (
    private.can_access_candidate(candidate_id)
  );

drop policy if exists candidate_contacts_delete_access on public.candidate_contacts;
create policy candidate_contacts_delete_access
  on public.candidate_contacts
  for delete
  using (
    private.can_access_candidate(candidate_id)
  );

-- AI_ANALYSES (read for UI only; writes happen server-side/service_role)
drop policy if exists ai_analyses_select_access on public.ai_analyses;
create policy ai_analyses_select_access
  on public.ai_analyses
  for select
  using (
    private.can_access_candidate(candidate_id)
  );

-- JOBS_AI (read for UI only; writes happen server-side/service_role/RPC)
drop policy if exists jobs_ai_select_access on public.jobs_ai;
create policy jobs_ai_select_access
  on public.jobs_ai
  for select
  using (
    private.can_access_job_ai(id)
  );

