-- HH sync optimization v1
--
-- Purpose:
-- - reduce steady-state DB traffic from worker HH sync
-- - make integration claiming safe for multiple workers
-- - persist HH source fingerprints to skip unchanged entities

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'candidates'
      and column_name = 'hh_source_fingerprint'
  ) then
    alter table public.candidates add column hh_source_fingerprint text;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vacancies'
      and column_name = 'hh_source_fingerprint'
  ) then
    alter table public.vacancies add column hh_source_fingerprint text;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'integrations_accounts'
      and column_name = 'sync_started_at'
  ) then
    alter table public.integrations_accounts add column sync_started_at timestamptz;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'integrations_accounts'
      and column_name = 'sync_lock_expires_at'
  ) then
    alter table public.integrations_accounts add column sync_lock_expires_at timestamptz;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'integrations_accounts'
      and column_name = 'last_sync_error'
  ) then
    alter table public.integrations_accounts add column last_sync_error text;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'integrations_accounts'
      and column_name = 'last_sync_error_at'
  ) then
    alter table public.integrations_accounts add column last_sync_error_at timestamptz;
  end if;
end $$;

create index if not exists idx_integrations_accounts_hh_due
  on public.integrations_accounts(provider, is_active, last_synced_at, sync_lock_expires_at)
  where provider = 'hh.ru' and is_active = true;

create or replace function public.claim_due_hh_integration(
  worker_id text,
  cutoff timestamptz,
  lease_seconds integer default 900
)
returns public.integrations_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.integrations_accounts;
  ttl interval := make_interval(secs => greatest(30, coalesce(lease_seconds, 900)));
begin
  update public.integrations_accounts ia
  set
    sync_started_at = now(),
    sync_lock_expires_at = now() + ttl,
    updated_at = now()
  where ia.id = (
    select id
    from public.integrations_accounts
    where provider = 'hh.ru'
      and is_active = true
      and (last_synced_at is null or last_synced_at <= cutoff)
      and (sync_lock_expires_at is null or sync_lock_expires_at < now())
    order by
      coalesce(last_synced_at, to_timestamp(0)) asc,
      updated_at asc
    for update skip locked
    limit 1
  )
  returning * into claimed;

  return claimed;
end;
$$;
