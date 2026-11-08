-- Signup trial hardening
--
-- Goals:
-- - Keep immutable registry of emails that already consumed trial
-- - Make anti-abuse race-safe under concurrent signups
-- - Add basic observability for signup provisioning

-- 1) Immutable trial email registry
create table if not exists public.trial_email_usage (
  email text primary key,
  first_user_id uuid not null references auth.users(id) on delete restrict,
  company_id uuid references public.companies(id) on delete set null,
  first_used_at timestamptz not null default now()
);

-- Service-only table (browser denied).
alter table public.trial_email_usage enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'trial_email_usage'
      and policyname = 'trial_email_usage_deny_select'
  ) then
    create policy trial_email_usage_deny_select
      on public.trial_email_usage
      for select
      using (false);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'trial_email_usage'
      and policyname = 'trial_email_usage_deny_insert'
  ) then
    create policy trial_email_usage_deny_insert
      on public.trial_email_usage
      for insert
      with check (false);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'trial_email_usage'
      and policyname = 'trial_email_usage_deny_update'
  ) then
    create policy trial_email_usage_deny_update
      on public.trial_email_usage
      for update
      using (false)
      with check (false);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'trial_email_usage'
      and policyname = 'trial_email_usage_deny_delete'
  ) then
    create policy trial_email_usage_deny_delete
      on public.trial_email_usage
      for delete
      using (false);
  end if;
end $$;

-- Backfill existing trial users (pick earliest record per email).
insert into public.trial_email_usage (email, first_user_id, company_id, first_used_at)
select distinct on (lower(p.email))
  lower(p.email) as email,
  p.id as first_user_id,
  p.company_id,
  coalesce(cp.period_start, p.created_at, now()) as first_used_at
from public.profiles p
join public.company_plans cp on cp.company_id = p.company_id
where p.email is not null
  and p.company_id is not null
  and cp.trial_expires_at is not null
order by lower(p.email), coalesce(cp.period_start, p.created_at, now()) asc
on conflict (email) do nothing;

-- 2) Provisioning audit (success events)
create table if not exists public.signup_provisioning_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  intended_plan text not null check (intended_plan in ('starter', 'professional')),
  created_at timestamptz not null default now()
);

create index if not exists idx_signup_provisioning_audit_created_at
  on public.signup_provisioning_audit(created_at desc);

alter table public.signup_provisioning_audit enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'signup_provisioning_audit'
      and policyname = 'signup_provisioning_audit_deny_select'
  ) then
    create policy signup_provisioning_audit_deny_select
      on public.signup_provisioning_audit
      for select
      using (false);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'signup_provisioning_audit'
      and policyname = 'signup_provisioning_audit_deny_insert'
  ) then
    create policy signup_provisioning_audit_deny_insert
      on public.signup_provisioning_audit
      for insert
      with check (false);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'signup_provisioning_audit'
      and policyname = 'signup_provisioning_audit_deny_update'
  ) then
    create policy signup_provisioning_audit_deny_update
      on public.signup_provisioning_audit
      for update
      using (false)
      with check (false);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'signup_provisioning_audit'
      and policyname = 'signup_provisioning_audit_deny_delete'
  ) then
    create policy signup_provisioning_audit_deny_delete
      on public.signup_provisioning_audit
      for delete
      using (false);
  end if;
end $$;

-- ============================================================================
-- NOTE: The handle_new_user() function that was originally section 3) of this
-- file has been REMOVED to eliminate competing definitions.
--
-- The CANONICAL definition lives in:
--   handle_new_user_platform_admin_company_member_v1.sql
-- which MUST be applied AFTER this file in migration order.
--
-- The tables and policies above (trial_email_usage, signup_provisioning_audit)
-- are still required -- the canonical function references them.
-- ============================================================================
