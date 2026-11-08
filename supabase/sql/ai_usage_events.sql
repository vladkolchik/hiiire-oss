create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  candidate_id uuid null references public.candidates(id) on delete set null,
  request_id text not null check (char_length(request_id) between 1 and 120),
  task text not null check (task in ('candidate_profile_parse')),
  provider text not null check (provider in ('deepseek')),
  model text not null check (char_length(model) between 1 and 120),
  status text not null check (status in ('success', 'fallback', 'failed')),
  fallback_reason text null check (fallback_reason is null or char_length(fallback_reason) <= 120),
  attempts integer not null check (attempts >= 0),
  tokens_in integer null check (tokens_in is null or tokens_in >= 0),
  tokens_out integer null check (tokens_out is null or tokens_out >= 0),
  duration_ms integer not null check (duration_ms >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_events_company_created
  on public.ai_usage_events(company_id, created_at desc);

create index if not exists idx_ai_usage_events_task_created
  on public.ai_usage_events(task, created_at desc);

create index if not exists idx_ai_usage_events_request_id
  on public.ai_usage_events(request_id);

alter table public.ai_usage_events enable row level security;

alter table public.ai_usage_events
  drop column if exists idempotency_key_hash;

revoke all on table public.ai_usage_events from anon;
revoke all on table public.ai_usage_events from authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_usage_events'
      and policyname = 'ai_usage_events_deny_all'
  ) then
    create policy ai_usage_events_deny_all
      on public.ai_usage_events
      for all
      using (false)
      with check (false);
  end if;
end $$;
