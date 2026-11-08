-- AI Jobs Queue + RPC helpers (Supabase SQL Editor)
--
-- Purpose:
-- - Async resume analysis that continues even if user closes browser
-- - Atomic "claim" for worker (skip locked)
-- - Atomic finalize (write ai_analyses + update candidates + charge credits once + mark job done)
--
-- IMPORTANT:
-- Run this in Supabase SQL Editor for your project.

-- 1) Jobs table
create table if not exists public.jobs_ai (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  requested_by uuid references public.profiles(id),

  status text not null check (status in ('queued','processing','done','failed','canceled')) default 'queued',
  attempt integer not null default 0,
  max_attempts integer not null default 3,

  available_at timestamptz not null default now(),
  started_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  last_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_jobs_ai_company on public.jobs_ai(company_id);
create index if not exists idx_jobs_ai_status_available on public.jobs_ai(status, available_at);
create index if not exists idx_jobs_ai_created_at on public.jobs_ai(created_at);
create index if not exists idx_jobs_ai_started_at on public.jobs_ai(started_at);

-- Backward-compatible migration: add started_at if the table existed without it.
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'jobs_ai'
      and column_name = 'started_at'
  ) then
    alter table public.jobs_ai add column started_at timestamptz;
  end if;
end $$;

-- 2) Keep updated_at fresh (reuse function from schema docs if exists)
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'update_jobs_ai_updated_at'
  ) then
    create trigger update_jobs_ai_updated_at
      before update on public.jobs_ai
      for each row execute function public.update_updated_at_column();
  end if;
end $$;

-- 3) RLS (optional; service_role bypasses anyway)
alter table public.jobs_ai enable row level security;

-- Company members can view their jobs
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='jobs_ai' and policyname='jobs_ai_select_company'
  ) then
    create policy jobs_ai_select_company
      on public.jobs_ai for select
      using (
        -- Perf: avoid per-row auth.uid() evaluation
        company_id = (select private.current_user_company_id())
      );
  end if;
end $$;

-- 4) Ledger idempotency guard (charge once per job)
create unique index if not exists idx_credit_ledger_ai_job_once
  on public.credit_ledger(reference_type, reference_id, reason)
  where reason = 'resume_analysis' and reference_type = 'ai_job';

-- 4d) Credits reserve (prevents queue overbooking)
-- Rationale:
-- - Without reserve, UI can enqueue more jobs than credits, and workers will later fail some jobs.
-- - With reserve, we "hold" credits at enqueue/processing time, then capture on success or release on failure.
do $$
begin
  -- Add `reserved` column to company_credits (if missing)
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'company_credits'
      and column_name = 'reserved'
  ) then
    alter table public.company_credits
      add column reserved integer not null default 0;
  end if;

  -- Ensure basic invariants:
  -- - reserved >= 0
  -- - reserved <= balance (can't reserve more than total credits)
  if not exists (
    select 1 from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'company_credits'
      and con.conname = 'company_credits_reserved_nonnegative'
  ) then
    alter table public.company_credits
      add constraint company_credits_reserved_nonnegative check (reserved >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'company_credits'
      and con.conname = 'company_credits_reserved_le_balance'
  ) then
    alter table public.company_credits
      add constraint company_credits_reserved_le_balance check (reserved <= balance);
  end if;
end $$;

create table if not exists public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  amount integer not null check (amount > 0),
  reference_type text not null,
  reference_id uuid not null,
  status text not null check (status in ('reserved','captured','released')) default 'reserved',
  reserved_at timestamptz not null default now(),
  captured_at timestamptz,
  released_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_credit_reservations_reference_unique
  on public.credit_reservations(reference_type, reference_id);
create index if not exists idx_credit_reservations_company
  on public.credit_reservations(company_id, created_at desc);

-- RLS: this table must not be directly accessible from the browser.
-- Enable RLS and keep it "deny by default" (no policies). service_role bypasses RLS.
alter table public.credit_reservations enable row level security;

-- Supabase Advisor prefers having explicit policies when RLS is enabled.
-- We add a deny-all policy to keep client access fully blocked while satisfying the linter.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'credit_reservations'
      and policyname = 'credit_reservations_deny_all'
  ) then
    create policy credit_reservations_deny_all
      on public.credit_reservations
      for all
      using (false)
      with check (false);
  end if;
end $$;

-- Index for FK `created_by` (performance; also satisfies Advisor "unindexed foreign keys").
create index if not exists idx_credit_reservations_created_by
  on public.credit_reservations(created_by);

-- Atomically reserve credits for a job if not reserved yet.
-- Returns true if reservation exists/was created; false if insufficient credits.
create or replace function public.ensure_ai_job_reservation(
  p_job_id uuid,
  p_company_id uuid,
  p_requested_by uuid,
  p_credits_to_reserve integer default 1
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.credit_reservations;
  cc public.company_credits;
begin
  -- Fast path: already have a reservation (or already captured/released).
  select * into existing
  from public.credit_reservations
  where reference_type = 'ai_job'
    and reference_id = p_job_id
  limit 1;

  if found then
    -- If already reserved/captured, treat as ok. If released, treat as not ok (job should fail).
    if existing.status in ('reserved','captured') then
      return true;
    end if;
    return false;
  end if;

  -- Ensure row exists for locking; idempotent.
  insert into public.company_credits (company_id, balance, reserved, updated_at)
  values (p_company_id, 0, 0, now())
  on conflict (company_id) do nothing;

  -- Lock company credits row to prevent races.
  select * into cc
  from public.company_credits
  where company_id = p_company_id
  for update;

  if not found then
    raise exception 'company_credits row missing for company %', p_company_id;
  end if;

  if (cc.balance - coalesce(cc.reserved, 0)) < p_credits_to_reserve then
    return false;
  end if;

  update public.company_credits
    set reserved = reserved + p_credits_to_reserve,
        updated_at = now()
  where company_id = p_company_id;

  insert into public.credit_reservations (
    company_id,
    amount,
    reference_type,
    reference_id,
    status,
    reserved_at,
    notes,
    created_by
  ) values (
    p_company_id,
    p_credits_to_reserve,
    'ai_job',
    p_job_id,
    'reserved',
    now(),
    format('AI job reserve %s', p_job_id),
    p_requested_by
  );

  return true;
end;
$$;

-- Release reservation for a job (best-effort; idempotent).
create or replace function public.release_ai_job_reservation(
  p_job_id uuid,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.credit_reservations;
begin
  select * into r
  from public.credit_reservations
  where reference_type = 'ai_job'
    and reference_id = p_job_id
  for update;

  if not found then
    return;
  end if;

  if r.status <> 'reserved' then
    return;
  end if;

  update public.credit_reservations
    set status = 'released',
        released_at = now(),
        notes = left(coalesce(r.notes, '') || case when reason is null then '' else E'\nRELEASE_REASON: ' || reason end, 2000)
  where id = r.id;

  update public.company_credits
    set reserved = greatest(0, reserved - r.amount),
        updated_at = now()
  where company_id = r.company_id;
end;
$$;

-- Create AI job with credit reserve in a single transaction.
-- If credits are insufficient, returns a job in `failed` status (so UI can show it immediately and worker won't spend tokens).
create or replace function public.enqueue_ai_job_with_credit_reserve(
  p_company_id uuid,
  p_candidate_id uuid,
  p_requested_by uuid,
  p_credits_to_reserve integer default 1
)
returns public.jobs_ai
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.jobs_ai;
  new_job_id uuid := gen_random_uuid();
  ok boolean;
begin
  -- Idempotency / anti-duplicate guard:
  -- Users may click "Retry" multiple times while the page is loading.
  -- Also, concurrent clients can enqueue the same candidate in parallel.
  --
  -- We serialize per-candidate using a row lock on `candidates`,
  -- then reuse an existing active job if one already exists.
  perform 1
  from public.candidates
  where id = p_candidate_id
  for update;

  select *
  into job
  from public.jobs_ai
  where company_id = p_company_id
    and candidate_id = p_candidate_id
    and status in ('queued','processing')
  order by updated_at desc
  limit 1;

  if found then
    return job;
  end if;

  ok := public.ensure_ai_job_reservation(new_job_id, p_company_id, p_requested_by, p_credits_to_reserve);

  if ok then
    insert into public.jobs_ai (
      id,
      company_id,
      candidate_id,
      requested_by,
      status,
      attempt,
      max_attempts,
      available_at,
      created_at,
      updated_at
    ) values (
      new_job_id,
      p_company_id,
      p_candidate_id,
      p_requested_by,
      'queued',
      0,
      3,
      now(),
      now(),
      now()
    )
    returning * into job;

    return job;
  end if;

  -- Insufficient credits: do NOT reserve, and mark job failed.
  insert into public.jobs_ai (
    id,
    company_id,
    candidate_id,
    requested_by,
    status,
    attempt,
    max_attempts,
    available_at,
    last_error,
    created_at,
    updated_at,
    finished_at
  ) values (
    new_job_id,
    p_company_id,
    p_candidate_id,
    p_requested_by,
    'failed',
    3,
    3,
    now(),
    format('INSUFFICIENT_CREDITS: company=%s', p_company_id),
    now(),
    now(),
    now()
  )
  returning * into job;

  return job;
end;
$$;

-- 4b) Ensure ai_analyses upsert key exists (required for finalize_ai_job)
do $$
begin
  if not exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
      and rel.relname = 'ai_analyses'
      and con.conname = 'ai_analyses_candidate_id_key'
  ) then
    alter table public.ai_analyses
      add constraint ai_analyses_candidate_id_key unique (candidate_id);
  end if;
end $$;

-- 4c) Rich AI fields (optional) for detailed candidate card
-- These columns are nullable for backward compatibility and gradual rollout.
do $$
begin
  -- Summary: short resume summary for UI.
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_analyses'
      and column_name = 'summary'
  ) then
    alter table public.ai_analyses add column summary text;
  end if;

  -- Verdict: final conclusion / next step recommendation.
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_analyses'
      and column_name = 'verdict'
  ) then
    alter table public.ai_analyses add column verdict text;
  end if;

  -- Reasons: 3 bullet points explaining the score.
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_analyses'
      and column_name = 'reasons'
  ) then
    alter table public.ai_analyses add column reasons text[];
  end if;

  -- Prospects: optional notes about potential/risks.
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_analyses'
      and column_name = 'prospects'
  ) then
    alter table public.ai_analyses add column prospects text;
  end if;

  -- Provider token usage for AI cost analytics.
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_analyses'
      and column_name = 'tokens_in'
  ) then
    alter table public.ai_analyses add column tokens_in integer;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_analyses'
      and column_name = 'tokens_out'
  ) then
    alter table public.ai_analyses add column tokens_out integer;
  end if;
end $$;

-- 5) Atomic claim (worker)
create or replace function public.claim_next_ai_job(worker_id text)
returns public.jobs_ai
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.jobs_ai;
begin
  -- IMPORTANT:
  -- Jobs can get "stuck" in `processing` if the worker loses network after the claim
  -- (e.g. connect timeout to Supabase) and can't mark them `queued/failed/done`.
  --
  -- To make the queue self-healing we treat `locked_at` as a LEASE timestamp:
  -- - if `processing` but `locked_at` is too old → consider it stale and reclaimable
  -- - a healthy worker should refresh `locked_at` periodically (heartbeat)
  --
  -- Choose a conservative TTL: it must be > typical AI analysis time.
  -- If you see premature reclaims for slow providers/models, increase this value.
  -- NOTE: keep it static here to avoid breaking RPC signature/types.
  perform 1;

  update public.jobs_ai j
  set
    status = 'processing',
    started_at = coalesce(j.started_at, now()),
    locked_at = now(),
    locked_by = worker_id,
    updated_at = now(),
    -- If we are reclaiming a stale `processing` job, count it as a retry attempt
    -- (the previous worker likely died or got disconnected mid-flight).
    attempt = case
      when j.status = 'processing' and j.locked_at is not null and j.locked_at < (now() - interval '10 minutes')
        then least(j.attempt + 1, j.max_attempts)
      else j.attempt
    end,
    -- Keep a short hint for debugging; do not overwrite meaningful errors.
    last_error = case
      when j.status = 'processing' and j.locked_at is not null and j.locked_at < (now() - interval '10 minutes') then
        left(
          coalesce(j.last_error || E'\n', '') ||
          format('STALE_LOCK_RECLAIMED: prev_locked_by=%s prev_locked_at=%s', coalesce(j.locked_by, '?'), j.locked_at),
          2000
        )
      else j.last_error
    end
  where j.id = (
    select id
    from public.jobs_ai
    where
      (status = 'queued' and available_at <= now())
      or (
        status = 'processing'
        and locked_at is not null
        and locked_at < (now() - interval '10 minutes')
      )
    order by
      case when status = 'queued' then 0 else 1 end,
      coalesce(locked_at, created_at) asc
    for update skip locked
    limit 1
  )
  returning * into job;

  return job;
end;
$$;

-- 6) Atomic finalize (write result + charge credits only on success)
-- IMPORTANT: drop legacy signature to avoid ambiguous RPC resolution in PostgREST.
drop function if exists public.finalize_ai_job(
  uuid, uuid, uuid, integer, integer, jsonb, text[], text[], text[], text, text, integer
);
drop function if exists public.finalize_ai_job(
  uuid, uuid, uuid, integer, integer, jsonb, text[], text[], text[], text, text, text, text, text[], text, integer
);

-- 6.1) Worker heartbeats (visibility even when queue is empty)
create table if not exists public.worker_heartbeats (
  worker_id text primary key,
  last_seen_at timestamptz not null,
  concurrency integer not null,
  provider text,
  version text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_worker_heartbeats_last_seen on public.worker_heartbeats(last_seen_at desc);

-- RLS: deny-all (only service_role / security definer RPC should access).
alter table public.worker_heartbeats enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'worker_heartbeats'
      and policyname = 'worker_heartbeats_deny_all'
  ) then
    create policy worker_heartbeats_deny_all
      on public.worker_heartbeats
      for all
      using (false)
      with check (false);
  end if;
end $$;

-- 6.2) AI queue metrics RPC (for platform admin dashboard)
--
-- Returns a compact JSON payload to avoid transferring large tables to Next.js.
-- NOTE: security definer + service_role usage on server-side only.
drop function if exists public.get_ai_queue_metrics(integer);
create or replace function public.get_ai_queue_metrics(p_hours integer default 168)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hours integer := greatest(1, least(coalesce(p_hours, 168), 720));
  v_since timestamptz := now() - make_interval(hours => v_hours);
  v_ttl interval := interval '10 minutes';

  queued_count integer;
  processing_count integer;
  done_24h integer;
  failed_24h integer;
  stuck_processing_count integer;
  oldest_queued_age_seconds integer;

  alive_workers integer;
  total_concurrency integer;
  avg_process_seconds numeric;
  est_drain_minutes integer;

  p50_queue_wait_seconds numeric;
  p95_queue_wait_seconds numeric;
  p50_process_seconds numeric;
  p95_process_seconds numeric;

  hourly jsonb;
  workers jsonb;
begin
  -- Snapshot counts
  select count(*) into queued_count from public.jobs_ai where status = 'queued';
  select count(*) into processing_count from public.jobs_ai where status = 'processing';

  select count(*) into done_24h
  from public.jobs_ai
  where status = 'done' and finished_at >= (now() - interval '24 hours');

  select count(*) into failed_24h
  from public.jobs_ai
  where status = 'failed' and finished_at >= (now() - interval '24 hours');

  select count(*) into stuck_processing_count
  from public.jobs_ai
  where status = 'processing'
    and locked_at is not null
    and locked_at < (now() - v_ttl);

  select coalesce(extract(epoch from (now() - min(available_at)))::int, 0)
  into oldest_queued_age_seconds
  from public.jobs_ai
  where status = 'queued';

  -- Workers (alive = last_seen within 2 minutes)
  select
    count(*)::int,
    coalesce(sum(concurrency), 0)::int
  into alive_workers, total_concurrency
  from public.worker_heartbeats
  where last_seen_at >= (now() - interval '2 minutes');

  -- Processing time estimate (use last N hours; fallback to 60s)
  select
    coalesce(
      avg(extract(epoch from (finished_at - coalesce(started_at, locked_at)))) filter (where finished_at is not null and started_at is not null),
      avg(extract(epoch from (finished_at - locked_at))) filter (where finished_at is not null and locked_at is not null),
      60
    )
  into avg_process_seconds
  from public.jobs_ai
  where status = 'done'
    and finished_at >= v_since;

  if total_concurrency > 0 then
    est_drain_minutes := ceil((queued_count * avg_process_seconds) / (total_concurrency * 60.0))::int;
  else
    est_drain_minutes := null;
  end if;

  -- Percentiles (overall, for the window)
  select
    percentile_cont(0.5) within group (order by extract(epoch from (started_at - available_at))),
    percentile_cont(0.95) within group (order by extract(epoch from (started_at - available_at)))
  into p50_queue_wait_seconds, p95_queue_wait_seconds
  from public.jobs_ai
  where started_at is not null
    and available_at is not null
    and created_at >= v_since;

  select
    percentile_cont(0.5) within group (order by extract(epoch from (finished_at - coalesce(started_at, locked_at)))),
    percentile_cont(0.95) within group (order by extract(epoch from (finished_at - coalesce(started_at, locked_at))))
  into p50_process_seconds, p95_process_seconds
  from public.jobs_ai
  where finished_at is not null
    and created_at >= v_since;

  -- Hourly buckets (enqueued/done/failed)
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'hour', bucket,
        'enqueued', enqueued,
        'done', done,
        'failed', failed
      )
      order by bucket
    ),
    '[]'::jsonb
  )
  into hourly
  from (
    with hours as (
      select generate_series(date_trunc('hour', v_since), date_trunc('hour', now()), interval '1 hour') as bucket
    ),
    enq as (
      select date_trunc('hour', created_at) as bucket, count(*)::int as c
      from public.jobs_ai
      where created_at >= v_since
      group by 1
    ),
    dn as (
      select date_trunc('hour', finished_at) as bucket, count(*)::int as c
      from public.jobs_ai
      where finished_at is not null and finished_at >= v_since and status = 'done'
      group by 1
    ),
    fl as (
      select date_trunc('hour', finished_at) as bucket, count(*)::int as c
      from public.jobs_ai
      where finished_at is not null and finished_at >= v_since and status = 'failed'
      group by 1
    )
    select
      h.bucket,
      coalesce(enq.c, 0) as enqueued,
      coalesce(dn.c, 0) as done,
      coalesce(fl.c, 0) as failed
    from hours h
    left join enq on enq.bucket = h.bucket
    left join dn on dn.bucket = h.bucket
    left join fl on fl.bucket = h.bucket
  ) t;

  -- Worker list + active jobs per worker (best-effort)
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'worker_id', w.worker_id,
        'last_seen_at', w.last_seen_at,
        'concurrency', w.concurrency,
        'provider', w.provider,
        'version', w.version,
        'active_jobs', coalesce(a.active_jobs, 0)
      )
      order by w.last_seen_at desc
    ),
    '[]'::jsonb
  )
  into workers
  from public.worker_heartbeats w
  left join (
    select locked_by as worker_id, count(*)::int as active_jobs
    from public.jobs_ai
    where status = 'processing'
      and locked_by is not null
      and locked_at is not null
      and locked_at >= (now() - interval '2 minutes')
    group by locked_by
  ) a on a.worker_id = w.worker_id
  where w.last_seen_at >= (now() - interval '24 hours');

  return jsonb_build_object(
    'window_hours', v_hours,
    'snapshot', jsonb_build_object(
      'queued', queued_count,
      'processing', processing_count,
      'done_24h', done_24h,
      'failed_24h', failed_24h,
      'stuck_processing', stuck_processing_count,
      'oldest_queued_age_seconds', oldest_queued_age_seconds,
      'alive_workers', alive_workers,
      'total_concurrency', total_concurrency,
      'avg_process_seconds', avg_process_seconds,
      'est_drain_minutes', est_drain_minutes,
      'p50_queue_wait_seconds', p50_queue_wait_seconds,
      'p95_queue_wait_seconds', p95_queue_wait_seconds,
      'p50_process_seconds', p50_process_seconds,
      'p95_process_seconds', p95_process_seconds
    ),
    'hourly', hourly,
    'workers', workers
  );
end;
$$;

create or replace function public.finalize_ai_job(
  job_id uuid,
  candidate_id uuid,
  requested_by uuid,
  overall_score integer,
  match_percentage integer,
  category_scores jsonb,
  strengths text[],
  weaknesses text[],
  recommendations text[],
  provider text,
  provider_model text,
  summary text default null,
  verdict text default null,
  reasons text[] default null,
  prospects text default null,
  credits_to_charge integer default 1,
  tokens_in integer default null,
  tokens_out integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
declare
  j public.jobs_ai;
  charge_amount integer := credits_to_charge;
begin
  select * into j from public.jobs_ai where id = job_id;
  if not found then
    raise exception 'job not found';
  end if;

  -- Only allow finalize if not already done/canceled
  if j.status in ('done','canceled') then
    return;
  end if;

  -- 1) Upsert analysis (unique by candidate_id)
  insert into public.ai_analyses (
    candidate_id,
    overall_score,
    category_scores,
    strengths,
    weaknesses,
    recommendations,
    ai_provider,
    analyzed_at,
    credits_charged,
    provider_model,
    tokens_in,
    tokens_out,
    summary,
    verdict,
    reasons,
    prospects
  ) values (
    candidate_id,
    overall_score,
    category_scores,
    strengths,
    weaknesses,
    recommendations,
    provider,
    now(),
    credits_to_charge,
    provider_model,
    tokens_in,
    tokens_out,
    summary,
    verdict,
    reasons,
    prospects
  )
  -- NOTE: because we use `#variable_conflict use_variable`, avoid ambiguous column names here.
  -- Using ON CONSTRAINT guarantees Postgres matches the real UNIQUE(candidate_id) constraint.
  on conflict on constraint ai_analyses_candidate_id_key do update set
    overall_score = excluded.overall_score,
    category_scores = excluded.category_scores,
    strengths = excluded.strengths,
    weaknesses = excluded.weaknesses,
    recommendations = excluded.recommendations,
    ai_provider = excluded.ai_provider,
    analyzed_at = excluded.analyzed_at,
    credits_charged = excluded.credits_charged,
    provider_model = excluded.provider_model,
    tokens_in = excluded.tokens_in,
    tokens_out = excluded.tokens_out,
    summary = excluded.summary,
    verdict = excluded.verdict,
    reasons = excluded.reasons,
    prospects = excluded.prospects;

  -- 2) Update candidate scores
  update public.candidates
    set match_percentage = match_percentage,
        updated_at = now(),
        status = case when status = 'new' then 'reviewing' else status end
  where id = candidate_id;

  -- 3) Capture reserve (if exists) and charge credits exactly once per job
  -- If the job was enqueued with credit reserve, release the hold and then charge the ledger.
  -- NOTE: capture is idempotent via reservation.status + ledger unique index.
  <<capture_reserve>>
  declare
    r public.credit_reservations;
  begin
    select * into r
    from public.credit_reservations
    where reference_type = 'ai_job'
      and reference_id = job_id
    for update;

    if found then
      charge_amount := r.amount;
      if r.status = 'reserved' then
        update public.credit_reservations
          set status = 'captured',
              captured_at = now()
        where id = r.id;

        update public.company_credits
          set reserved = greatest(0, reserved - r.amount),
              updated_at = now()
        where company_id = r.company_id;
      end if;
    end if;
  end capture_reserve;

  insert into public.credit_ledger (
    company_id,
    delta,
    reason,
    reference_type,
    reference_id,
    notes,
    created_by
  ) values (
    j.company_id,
    -charge_amount,
    'resume_analysis',
    'ai_job',
    job_id,
    format('AI analysis job %s', job_id),
    requested_by
  )
  on conflict do nothing;

  -- 4) Activity (optional, if table exists)
  insert into public.activities (
    type,
    user_id,
    entity_type,
    entity_id,
    description,
    metadata
  ) values (
    'ai_analysis_completed',
    requested_by,
    'candidate',
    candidate_id,
    format('AI анализ завершен (соответствие: %s%%)', match_percentage),
    jsonb_build_object('job_id', job_id, 'provider', provider, 'model', provider_model)
  );

  -- 5) Mark job done
  update public.jobs_ai
    set status = 'done',
        finished_at = now(),
        last_error = null,
        updated_at = now()
  where id = job_id;
end;
$$;

