-- Trial + onboarding fields (free trial flow)
--
-- Goals:
-- - Add trial expiry and intended plan to company_plans
-- - Add onboarding_completed flag to profiles
-- - Create payments table for Robokassa integration
--
-- Notes:
-- - All fields are optional / nullable for backwards compatibility
-- - service_role handles writes; browser cannot directly mutate these fields

-- 1) Extend company_plans with trial fields
alter table public.company_plans
  add column if not exists trial_expires_at  timestamptz,
  add column if not exists intended_plan      text,
  add column if not exists period_start       timestamptz,
  add column if not exists period_end         timestamptz,
  add column if not exists robokassa_inv_id   text,
  add column if not exists auto_renew         boolean default true;

-- Allow 'trial' as a plan value (non-breaking: extend check constraint)
-- Note: we drop and recreate the check to add 'trial'
alter table public.company_plans
  drop constraint if exists company_plans_current_plan_check;

alter table public.company_plans
  add constraint company_plans_current_plan_check
  check (current_plan in ('trial', 'starter', 'professional', 'enterprise'));

-- 2) Add onboarding flag to profiles
alter table public.profiles
  add column if not exists onboarding_completed boolean default false;

-- 3) Payments table
create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  plan            text not null check (plan in ('starter', 'professional', 'enterprise')),
  amount          integer not null,           -- in kopecks
  currency        text not null default 'RUB',
  status          text not null default 'pending'
                    check (status in ('pending', 'completed', 'failed', 'refunded')),
  provider        text not null default 'robokassa',
  provider_id     text,
  credits_granted integer,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index if not exists idx_payments_company_created_at
  on public.payments(company_id, created_at desc);

create index if not exists idx_payments_provider_id
  on public.payments(provider_id);

alter table public.payments enable row level security;

-- Company members can read their own payments
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='payments'
      and policyname='payments_select_company'
  ) then
    create policy payments_select_company
      on public.payments
      for select
      using (company_id = private.current_user_company_id());
  end if;
end $$;

-- Deny all browser writes (service_role bypasses RLS)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='payments'
      and policyname='payments_deny_writes'
  ) then
    create policy payments_deny_writes
      on public.payments
      for insert
      with check (false);
  end if;
end $$;
