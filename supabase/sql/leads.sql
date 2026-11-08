-- Leads (marketing request access form)
--
-- IMPORTANT:
-- - Inserts should happen server-side using service_role (defense-in-depth).
-- - Browser roles should not be able to read or write leads directly.

create extension if not exists "pgcrypto";

-- Create the table if it doesn't exist (canonical schema)
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text not null,
  company text not null,
  company_size text,
  message text,
  requested_plan text not null default 'enterprise' check (requested_plan in ('starter','professional','enterprise')),
  status text not null check (status in ('new','contacted','qualified','rejected')) default 'new',
  handled_by uuid references public.profiles(id) on delete set null,
  handled_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);

-- Backward/forward compatibility:
-- If an older environment created `name` instead of `full_name`, migrate it safely.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'name'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'full_name'
  ) then
    alter table public.leads add column full_name text;
    update public.leads set full_name = name where full_name is null;
    alter table public.leads alter column full_name set not null;
  end if;
end $$;

-- Enterprise request workflow fields (for existing environments)
alter table public.leads add column if not exists requested_plan text;
alter table public.leads add column if not exists handled_by uuid references public.profiles(id) on delete set null;
alter table public.leads add column if not exists handled_at timestamptz;
alter table public.leads add column if not exists decision_note text;

update public.leads
set requested_plan = 'enterprise'
where requested_plan is null;

alter table public.leads alter column requested_plan set default 'enterprise';
alter table public.leads alter column requested_plan set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_requested_plan_check'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_requested_plan_check
      check (requested_plan in ('starter', 'professional', 'enterprise'));
  end if;
end $$;

-- Prevent duplicate submissions by email (case-insensitive)
create unique index if not exists idx_leads_email_unique
  on public.leads (lower(email));

create index if not exists idx_leads_created_at
  on public.leads (created_at desc);

create index if not exists idx_leads_requested_plan_status_created_at
  on public.leads (requested_plan, status, created_at desc);

alter table public.leads enable row level security;

-- No policies: default deny for browser roles (service_role bypasses RLS).
