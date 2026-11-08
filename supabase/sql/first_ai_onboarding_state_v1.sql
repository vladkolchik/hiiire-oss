-- First AI analysis onboarding state.
-- User-scoped so each team member can independently complete or hide onboarding.

create table if not exists public.first_ai_onboarding_states (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  started_path text null check (started_path in ('manual', 'hh')),
  completed_at timestamptz null,
  dismissed_at timestamptz null,
  result_opened_at timestamptz null,
  result_acknowledged_at timestamptz null,
  hh_oauth_error_at timestamptz null,
  hh_started_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint first_ai_onboarding_single_terminal_state check (
    num_nonnulls(completed_at, dismissed_at) <= 1
  )
);

create index if not exists idx_first_ai_onboarding_states_updated_at
  on public.first_ai_onboarding_states (updated_at desc);

create or replace function public.record_first_ai_onboarding_open_result(
  p_user_id uuid,
  p_now timestamptz
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.first_ai_onboarding_states (user_id, result_opened_at, updated_at)
  values (p_user_id, p_now, p_now)
  on conflict (user_id) do update
  set
    result_opened_at = coalesce(public.first_ai_onboarding_states.result_opened_at, excluded.result_opened_at),
    updated_at = case
      when public.first_ai_onboarding_states.result_opened_at is null then excluded.updated_at
      else public.first_ai_onboarding_states.updated_at
    end
  where public.first_ai_onboarding_states.completed_at is null
    and public.first_ai_onboarding_states.dismissed_at is null;
$$;

revoke execute on function public.record_first_ai_onboarding_open_result(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.record_first_ai_onboarding_open_result(uuid, timestamptz) to service_role;

create or replace function public.record_first_ai_onboarding_acknowledge_result(
  p_user_id uuid,
  p_now timestamptz
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.first_ai_onboarding_states (
    user_id,
    completed_at,
    result_opened_at,
    result_acknowledged_at,
    updated_at
  )
  values (p_user_id, p_now, p_now, p_now, p_now)
  on conflict (user_id) do update
  set
    completed_at = coalesce(public.first_ai_onboarding_states.completed_at, excluded.completed_at),
    result_opened_at = coalesce(public.first_ai_onboarding_states.result_opened_at, excluded.result_opened_at),
    result_acknowledged_at = coalesce(public.first_ai_onboarding_states.result_acknowledged_at, excluded.result_acknowledged_at),
    updated_at = case
      when public.first_ai_onboarding_states.completed_at is null then excluded.updated_at
      else public.first_ai_onboarding_states.updated_at
    end
  where public.first_ai_onboarding_states.dismissed_at is null;
$$;

revoke execute on function public.record_first_ai_onboarding_acknowledge_result(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.record_first_ai_onboarding_acknowledge_result(uuid, timestamptz) to service_role;

insert into public.first_ai_onboarding_states (user_id, completed_at, updated_at)
select p.id, now(), now()
from public.profiles p
where p.created_at <= now()
on conflict (user_id) do nothing;

alter table public.first_ai_onboarding_states enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'first_ai_onboarding_states'
      and policyname = 'first_ai_onboarding_select_own'
  ) then
    create policy first_ai_onboarding_select_own
      on public.first_ai_onboarding_states
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'update_first_ai_onboarding_states_updated_at'
  ) then
    create trigger update_first_ai_onboarding_states_updated_at
      before update on public.first_ai_onboarding_states
      for each row
      execute function public.update_updated_at_column();
  end if;
end $$;
