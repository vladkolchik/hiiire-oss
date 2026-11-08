-- Company plans + tariff change requests (MVP)
--
-- Goals:
-- - Store current plan per company (starter/professional/enterprise)
-- - Allow company members to read current plan + their requests
-- - Allow only company admin to create a change request (from browser)
-- - Apply/approve/reject only server-side (service_role) via platform admin actions
--
-- Notes:
-- - RLS is enabled for defense-in-depth; all privileged writes should still happen server-side.
-- - We rely on helper functions from `company_team_isolation.sql`:
--   - private.current_user_company_id()
--   - private.is_company_admin_or_lead()

-- 0) Ensure private schema exists (in case this script is run standalone)
create schema if not exists private;

-- 0b) Ensure `public.update_updated_at_column()` exists (used by multiple scripts).
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'update_updated_at_column'
  ) then
    create or replace function public.update_updated_at_column()
    returns trigger
    language plpgsql
    as $fn$
    begin
      new.updated_at = now();
      return new;
    end;
    $fn$;
  end if;
end $$;

-- 1) Current plan per company
create table if not exists public.company_plans (
  company_id uuid primary key references public.companies(id) on delete cascade,
  current_plan text not null check (current_plan in ('starter','professional','enterprise')) default 'starter',
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh (best-effort; function is defined in schema docs/migrations)
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'update_company_plans_updated_at'
  ) then
    create trigger update_company_plans_updated_at
      before update on public.company_plans
      for each row execute function public.update_updated_at_column();
  end if;
end $$;

alter table public.company_plans enable row level security;

-- Company members can read their company plan.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='company_plans' and policyname='company_plans_select_company'
  ) then
    create policy company_plans_select_company
      on public.company_plans
      for select
      using (company_id = private.current_user_company_id());
  end if;
end $$;

-- Deny direct writes from browser; service_role bypasses RLS for server-side updates.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='company_plans' and policyname='company_plans_deny_all_writes'
  ) then
    create policy company_plans_deny_all_writes
      on public.company_plans
      for insert
      with check (false);
    create policy company_plans_deny_all_writes_update
      on public.company_plans
      for update
      using (false)
      with check (false);
    create policy company_plans_deny_all_writes_delete
      on public.company_plans
      for delete
      using (false);
  end if;
end $$;

-- 2) Tariff change requests
create table if not exists public.tariff_change_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,

  from_plan text not null check (from_plan in ('starter','professional','enterprise')),
  to_plan text not null check (to_plan in ('starter','professional','enterprise')),

  status text not null check (status in ('pending','approved','rejected','cancelled')) default 'pending',
  message text,

  decision_note text,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists idx_tariff_change_requests_company_created_at
  on public.tariff_change_requests(company_id, created_at desc);
create index if not exists idx_tariff_change_requests_status_created_at
  on public.tariff_change_requests(status, created_at desc);
create index if not exists idx_tariff_change_requests_requested_by
  on public.tariff_change_requests(requested_by, created_at desc);

-- Enforce at most one pending request per company (simplifies UX).
create unique index if not exists idx_tariff_change_requests_company_pending_unique
  on public.tariff_change_requests(company_id)
  where status = 'pending';

alter table public.tariff_change_requests enable row level security;

-- Company members can read their requests.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='tariff_change_requests' and policyname='tariff_change_requests_select_company'
  ) then
    create policy tariff_change_requests_select_company
      on public.tariff_change_requests
      for select
      using (company_id = private.current_user_company_id());
  end if;
end $$;

-- Only company admin can create a request for own company, with requested_by = auth.uid().
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='tariff_change_requests' and policyname='tariff_change_requests_insert_company_admin'
  ) then
    create policy tariff_change_requests_insert_company_admin
      on public.tariff_change_requests
      for insert
      with check (
        company_id = private.current_user_company_id()
        and private.is_company_admin_or_lead()
        and requested_by = auth.uid()
        and status = 'pending'
      );
  end if;
end $$;

-- Deny direct updates/deletes from browser; approvals happen server-side (service_role).
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='tariff_change_requests' and policyname='tariff_change_requests_deny_updates'
  ) then
    create policy tariff_change_requests_deny_updates
      on public.tariff_change_requests
      for update
      using (false)
      with check (false);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='tariff_change_requests' and policyname='tariff_change_requests_deny_deletes'
  ) then
    create policy tariff_change_requests_deny_deletes
      on public.tariff_change_requests
      for delete
      using (false);
  end if;
end $$;

