-- Verification email resend hardening
--
-- Goals:
-- - Keep resend cooldown and hourly resend limit on the server
-- - Share the limit across tabs, windows, incognito sessions, and app instances
-- - Allow only service role to consume the limiter

create table if not exists public.verification_email_resend_limits (
  email text primary key,
  last_resend_at timestamptz,
  resend_window_started_at timestamptz not null,
  resend_count_in_window integer not null default 0 check (resend_count_in_window >= 0),
  updated_at timestamptz not null default now()
);

alter table public.verification_email_resend_limits enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'verification_email_resend_limits'
      and policyname = 'verification_email_resend_limits_deny_select'
  ) then
    create policy verification_email_resend_limits_deny_select
      on public.verification_email_resend_limits
      for select
      using (false);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'verification_email_resend_limits'
      and policyname = 'verification_email_resend_limits_deny_insert'
  ) then
    create policy verification_email_resend_limits_deny_insert
      on public.verification_email_resend_limits
      for insert
      with check (false);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'verification_email_resend_limits'
      and policyname = 'verification_email_resend_limits_deny_update'
  ) then
    create policy verification_email_resend_limits_deny_update
      on public.verification_email_resend_limits
      for update
      using (false)
      with check (false);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'verification_email_resend_limits'
      and policyname = 'verification_email_resend_limits_deny_delete'
  ) then
    create policy verification_email_resend_limits_deny_delete
      on public.verification_email_resend_limits
      for delete
      using (false);
  end if;
end $$;

create index if not exists idx_verification_email_resend_limits_updated_at
  on public.verification_email_resend_limits(updated_at desc);

create or replace function public.consume_verification_email_resend_limit(
  p_email text,
  p_cooldown_seconds integer default 60,
  p_window_seconds integer default 3600,
  p_max_resends integer default 5,
  p_now timestamptz default now()
)
returns table (
  allowed boolean,
  reason text,
  cooldown_left_seconds integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(coalesce(p_email, '')));
  effective_now timestamptz := coalesce(p_now, now());
  current_record public.verification_email_resend_limits%rowtype;
  effective_window_started_at timestamptz;
  effective_count integer;
  cooldown_left integer;
  retry_after integer;
begin
  if normalized_email = '' then
    raise exception 'p_email is required';
  end if;

  if coalesce(p_cooldown_seconds, 0) < 0 or coalesce(p_window_seconds, 0) <= 0 or coalesce(p_max_resends, 0) <= 0 then
    raise exception 'Invalid verification resend limiter parameters';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(normalized_email, 0));

  select *
  into current_record
  from public.verification_email_resend_limits
  where email = normalized_email
  for update;

  if not found then
    insert into public.verification_email_resend_limits (
      email,
      last_resend_at,
      resend_window_started_at,
      resend_count_in_window,
      updated_at
    )
    values (
      normalized_email,
      effective_now,
      effective_now,
      1,
      now()
    );

    return query
    select true, null::text, null::integer, null::integer;
    return;
  end if;

  effective_window_started_at := case
    when extract(epoch from (effective_now - current_record.resend_window_started_at)) >= p_window_seconds then effective_now
    else current_record.resend_window_started_at
  end;

  effective_count := case
    when effective_window_started_at = effective_now then 0
    else current_record.resend_count_in_window
  end;

  if current_record.last_resend_at is not null then
    cooldown_left := ceil(
      p_cooldown_seconds - extract(epoch from (effective_now - current_record.last_resend_at))
    );

    if cooldown_left > 0 then
      return query
      select false, 'cooldown'::text, cooldown_left, null::integer;
      return;
    end if;
  end if;

  if effective_count >= p_max_resends then
    retry_after := greatest(
      1,
      ceil(p_window_seconds - extract(epoch from (effective_now - effective_window_started_at)))
    );

    update public.verification_email_resend_limits
    set
      resend_window_started_at = effective_window_started_at,
      resend_count_in_window = effective_count,
      updated_at = now()
    where email = normalized_email;

    return query
    select false, 'rate_limit'::text, null::integer, retry_after;
    return;
  end if;

  update public.verification_email_resend_limits
  set
    last_resend_at = effective_now,
    resend_window_started_at = effective_window_started_at,
    resend_count_in_window = effective_count + 1,
    updated_at = now()
  where email = normalized_email;

  return query
  select true, null::text, null::integer, null::integer;
end;
$$;

revoke all on table public.verification_email_resend_limits from public;
revoke all on table public.verification_email_resend_limits from anon;
revoke all on table public.verification_email_resend_limits from authenticated;
grant all on table public.verification_email_resend_limits to service_role;

revoke all on function public.consume_verification_email_resend_limit(text, integer, integer, integer, timestamptz) from public;
revoke all on function public.consume_verification_email_resend_limit(text, integer, integer, integer, timestamptz) from anon;
revoke all on function public.consume_verification_email_resend_limit(text, integer, integer, integer, timestamptz) from authenticated;
grant execute on function public.consume_verification_email_resend_limit(text, integer, integer, integer, timestamptz) to service_role;
