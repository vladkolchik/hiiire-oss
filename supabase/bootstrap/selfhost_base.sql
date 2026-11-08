-- Hiiire self-hosted recovery baseline.
--
-- This file recreates the application-owned objects that predate the SQL
-- scripts in supabase/sql. Later scripts are appended in the order declared
-- in selfhost_manifest.txt.

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  avatar_url text,
  company_id uuid,
  role text not null check (role in ('admin', 'hr', 'recruiter')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  website text,
  logo_url text,
  industry text,
  size text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete set null;

create table public.vacancies (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text not null,
  requirements text[] not null,
  responsibilities text[] not null,
  salary_min integer,
  salary_max integer,
  salary_currency text default 'RUB',
  location text not null,
  employment_type text not null
    check (employment_type in ('full-time', 'part-time', 'contract', 'internship')),
  experience_level text not null
    check (experience_level in ('junior', 'middle', 'senior', 'lead')),
  status text not null
    check (status in ('draft', 'active', 'paused', 'closed'))
    default 'draft',
  company_id uuid not null references public.companies(id),
  created_by uuid not null references public.profiles(id),
  hhru_vacancy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_vacancies_company on public.vacancies(company_id);
create index idx_vacancies_status on public.vacancies(status);
create index idx_vacancies_created_by on public.vacancies(created_by);

create table public.candidates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  position text not null,
  vacancy_id uuid not null references public.vacancies(id),
  resume_url text,
  resume_text text,
  resume_file_name text,
  resume_file_size integer,
  avatar_url text,
  ai_score integer check (ai_score between 0 and 100),
  match_percentage integer check (match_percentage between 0 and 100),
  status text not null
    check (
      status in (
        'new',
        'reviewing',
        'security-check',
        'interview-scheduled',
        'interviewed',
        'offer',
        'hired',
        'rejected'
      )
    )
    default 'new',
  source text not null
    check (source in ('hh.ru', 'manual', 'referral', 'other'))
    default 'manual',
  comment text,
  applied_at timestamptz not null default now(),
  hhru_resume_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_candidates_vacancy on public.candidates(vacancy_id);
create index idx_candidates_status on public.candidates(status);
create index idx_candidates_ai_score on public.candidates(ai_score);
create index idx_candidates_source on public.candidates(source);

create table public.candidate_contacts (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  type text not null,
  value text not null,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_candidate_contacts_candidate_id
  on public.candidate_contacts(candidate_id);
create index idx_candidate_contacts_type
  on public.candidate_contacts(type);

create table public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id),
  overall_score integer not null check (overall_score between 0 and 100),
  category_scores jsonb not null,
  strengths text[] not null,
  weaknesses text[] not null,
  recommendations text[] not null,
  ai_provider text not null default 'mock',
  analyzed_at timestamptz not null default now(),
  credits_charged integer not null default 1 check (credits_charged >= 0),
  used_ocr boolean not null default false,
  provider_model text,
  tokens_in integer,
  tokens_out integer,
  unique (candidate_id)
);

create index idx_ai_analyses_candidate on public.ai_analyses(candidate_id);

create table public.interviews (
  id uuid primary key default uuid_generate_v4(),
  candidate_id uuid not null references public.candidates(id),
  vacancy_id uuid not null references public.vacancies(id),
  scheduled_at timestamptz not null,
  duration integer not null,
  type text not null check (type in ('phone', 'video', 'in-person', 'technical')),
  status text not null
    check (status in ('scheduled', 'completed', 'cancelled', 'rescheduled'))
    default 'scheduled',
  interviewers uuid[] not null,
  location text,
  meeting_url text,
  notes text,
  feedback jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_interviews_candidate on public.interviews(candidate_id);
create index idx_interviews_vacancy on public.interviews(vacancy_id);
create index idx_interviews_scheduled_at on public.interviews(scheduled_at);

create table public.activities (
  id uuid primary key default uuid_generate_v4(),
  type text not null
    check (
      type in (
        'vacancy_created',
        'candidate_added',
        'interview_scheduled',
        'candidate_status_changed',
        'ai_analysis_completed'
      )
    ),
  user_id uuid not null references public.profiles(id),
  entity_type text not null check (entity_type in ('vacancy', 'candidate', 'interview')),
  entity_id uuid not null,
  description text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index idx_activities_user on public.activities(user_id);
create index idx_activities_created_at on public.activities(created_at desc);

create table public.hiring_targets (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references public.companies(id),
  period_type text not null check (period_type in ('month', 'quarter')),
  period_key text not null,
  target integer not null check (target >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, period_type, period_key)
);

create index idx_hiring_targets_company on public.hiring_targets(company_id);

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  provider text not null check (provider in ('hh.ru', 'google_calendar', 'slack')),
  is_active boolean not null default false,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  settings jsonb,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  unique (company_id, provider)
);

create table public.integrations_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  user_id uuid not null references public.profiles(id),
  provider text not null check (provider in ('hh.ru')),
  is_active boolean not null default false,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  settings jsonb,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index idx_integrations_accounts_company_id
  on public.integrations_accounts(company_id);
create index idx_integrations_accounts_user_id
  on public.integrations_accounts(user_id);
create index idx_integrations_accounts_provider
  on public.integrations_accounts(provider);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  page text not null check (page in ('stats')),
  message text not null,
  created_at timestamptz not null default now()
);

create index idx_feedback_company_created_at
  on public.feedback(company_id, created_at desc);
create index idx_feedback_created_at
  on public.feedback(created_at desc);

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.company_credits (
  company_id uuid primary key references public.companies(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  delta integer not null,
  reason text not null
    check (reason in ('grant', 'manual_adjustment', 'resume_analysis', 'refund')),
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger update_profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at_column();
create trigger update_companies_updated_at
  before update on public.companies
  for each row execute function public.update_updated_at_column();
create trigger update_vacancies_updated_at
  before update on public.vacancies
  for each row execute function public.update_updated_at_column();
create trigger update_candidates_updated_at
  before update on public.candidates
  for each row execute function public.update_updated_at_column();
create trigger update_interviews_updated_at
  before update on public.interviews
  for each row execute function public.update_updated_at_column();

-- ai_jobs.sql needs this helper before company_team_isolation.sql installs the
-- complete access contract.
create or replace function private.current_user_company_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  company uuid;
begin
  perform set_config('row_security', 'off', true);
  select profiles.company_id
  into company
  from public.profiles
  where profiles.id = auth.uid()
  limit 1;
  return company;
end;
$$;

revoke all on function private.current_user_company_id() from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.vacancies enable row level security;
alter table public.candidates enable row level security;
alter table public.candidate_contacts enable row level security;
alter table public.ai_analyses enable row level security;
alter table public.interviews enable row level security;
alter table public.activities enable row level security;
alter table public.hiring_targets enable row level security;
alter table public.integrations enable row level security;
alter table public.integrations_accounts enable row level security;
alter table public.feedback enable row level security;
alter table public.platform_admins enable row level security;
alter table public.company_credits enable row level security;
alter table public.credit_ledger enable row level security;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'resumes',
  'resumes',
  false,
  2097152,
  array['application/pdf']
)
on conflict (id) do nothing;
