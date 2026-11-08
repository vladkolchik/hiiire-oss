-- Billing paid scheduled downgrade review fixes v1
--
-- Goals:
-- - Persist immutable checkout intent for paid scheduled downgrades.
-- - Finalize Robokassa callbacks from payment intent, not mutable company state.
-- - Keep current auto-renew and future scheduled-payment auto-renew in one DB transaction.
-- - Put stale captured payments into manual review without changing the active plan.

alter table public.payments
  add column if not exists scheduled_change_kind text null,
  add column if not exists scheduled_source_plan text null,
  add column if not exists scheduled_source_period_end timestamptz null,
  add column if not exists scheduled_activation_at timestamptz null;

alter table public.payments
  drop constraint if exists payments_status_check;

alter table public.payments
  add constraint payments_status_check
  check (status in ('pending', 'completed', 'failed', 'refunded', 'requires_review'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'payments'
      and c.conname = 'payments_scheduled_change_kind_check'
  ) then
    alter table public.payments
      add constraint payments_scheduled_change_kind_check
      check (scheduled_change_kind is null or scheduled_change_kind in ('paid_downgrade'));
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'payments'
      and c.conname = 'payments_scheduled_source_plan_check'
  ) then
    alter table public.payments
      add constraint payments_scheduled_source_plan_check
      check (scheduled_source_plan is null or scheduled_source_plan in ('starter', 'professional', 'enterprise'));
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'payments'
      and c.conname = 'payments_scheduled_change_consistency_check'
  ) then
    alter table public.payments
      add constraint payments_scheduled_change_consistency_check
      check (
        (
          scheduled_change_kind is null
          and scheduled_source_plan is null
          and scheduled_source_period_end is null
          and scheduled_activation_at is null
        )
        or (
          scheduled_change_kind = 'paid_downgrade'
          and scheduled_source_plan is not null
          and scheduled_source_period_end is not null
          and scheduled_activation_at is not null
        )
      );
  end if;
end $$;

drop index if exists public.idx_payments_self_service_active_period_once;
create unique index if not exists idx_payments_self_service_active_period_once
  on public.payments (company_id, plan, period_start)
  where status in ('pending', 'completed', 'requires_review')
    and is_recurring = false
    and period_start is not null;

create or replace function public.set_company_plan_auto_renew(
  p_company_id uuid,
  p_enabled boolean
)
returns table (
  company_id uuid,
  current_plan text,
  auto_renew boolean,
  scheduled_plan text,
  scheduled_plan_effective_at timestamptz,
  scheduled_payment_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.company_plans;
begin
  select *
    into v_plan
  from public.company_plans cp
  where cp.company_id = p_company_id
  for update;

  if not found then
    raise exception 'COMPANY_PLAN_NOT_FOUND';
  end if;

  if p_enabled then
    update public.company_plans cp
      set auto_renew = true,
          updated_at = now()
    where cp.company_id = p_company_id;
  else
    update public.company_plans cp
      set auto_renew = false,
          scheduled_plan = case when v_plan.scheduled_payment_id is null then null else cp.scheduled_plan end,
          scheduled_plan_effective_at = case when v_plan.scheduled_payment_id is null then null else cp.scheduled_plan_effective_at end,
          scheduled_payment_id = case when v_plan.scheduled_payment_id is null then null else cp.scheduled_payment_id end,
          updated_at = now()
    where cp.company_id = p_company_id;
  end if;

  update public.payments p
    set activate_auto_renew = p_enabled
  where p.company_id = p_company_id
    and p.is_recurring = false
    and p.scheduled_change_kind = 'paid_downgrade'
    and (
      p.status = 'pending'
      or p.id = v_plan.scheduled_payment_id
    );

  return query
  select
    cp.company_id,
    cp.current_plan,
    cp.auto_renew,
    cp.scheduled_plan,
    cp.scheduled_plan_effective_at,
    cp.scheduled_payment_id
  from public.company_plans cp
  where cp.company_id = p_company_id;
end;
$$;

revoke all on function public.set_company_plan_auto_renew(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_company_plan_auto_renew(uuid, boolean) to service_role;

create or replace function public.finalize_robokassa_payment(
  p_inv_id integer,
  p_provider_id text,
  p_completed_at timestamptz default now()
)
returns table (
  payment_id uuid,
  company_id uuid,
  plan text,
  credits_granted integer,
  already_completed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
  v_company_plan public.company_plans;
  v_completed_at timestamptz;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_credits integer;
  v_existing_scheduled_plan text;
  v_existing_scheduled_effective_at timestamptz;
  v_clear_scheduled boolean := false;
  v_company_plan_found boolean := false;
  v_is_paid_scheduled_downgrade boolean := false;
  v_defer_plan_activation boolean := false;
  v_granted_credits integer := 0;
begin
  select *
    into v_payment
  from public.payments
  where inv_id = p_inv_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  if v_payment.status = 'completed' then
    return query
    select
      v_payment.id,
      v_payment.company_id,
      v_payment.plan,
      coalesce(v_payment.credits_granted, 0),
      true;
    return;
  end if;

  if v_payment.status = 'requires_review' then
    return query
    select
      v_payment.id,
      v_payment.company_id,
      v_payment.plan,
      0,
      true;
    return;
  end if;

  if v_payment.status <> 'pending' then
    raise exception 'PAYMENT_NOT_PENDING';
  end if;

  v_completed_at := coalesce(p_completed_at, now());
  v_credits := case
    when v_payment.plan = 'starter' then 300
    when v_payment.plan = 'professional' then 1200
    else 0
  end;

  v_period_start := coalesce(v_payment.period_start, v_payment.scheduled_activation_at, now());
  v_period_end := coalesce(v_payment.period_end, v_period_start + interval '1 month');
  v_is_paid_scheduled_downgrade := v_payment.scheduled_change_kind = 'paid_downgrade';

  select *
    into v_company_plan
  from public.company_plans cp
  where cp.company_id = v_payment.company_id
  for update;
  v_company_plan_found := found;

  if v_is_paid_scheduled_downgrade then
    if not v_company_plan_found
      or v_payment.plan <> 'starter'
      or v_payment.scheduled_source_plan <> 'professional'
      or v_payment.scheduled_source_period_end is null
      or v_payment.scheduled_activation_at is null
      or v_company_plan.current_plan is distinct from v_payment.scheduled_source_plan
      or v_company_plan.period_end is distinct from v_payment.scheduled_source_period_end
    then
      update public.payments
        set status = 'requires_review',
            completed_at = v_completed_at,
            provider_id = coalesce(nullif(trim(p_provider_id), ''), provider_id, p_inv_id::text),
            credits_granted = 0,
            failed_at = v_completed_at,
            fail_reason = 'STALE_SCHEDULED_PAYMENT_REQUIRES_REVIEW'
      where id = v_payment.id;

      return query
      select
        v_payment.id,
        v_payment.company_id,
        v_payment.plan,
        0,
        false;
      return;
    end if;

    v_period_start := v_payment.scheduled_activation_at;
    v_period_end := coalesce(v_payment.period_end, v_period_start + interval '1 month');

    if v_completed_at < v_payment.scheduled_source_period_end
      and v_payment.scheduled_activation_at > v_completed_at
    then
      v_defer_plan_activation := true;
    elsif v_completed_at >= v_payment.scheduled_source_period_end then
      v_period_start := v_completed_at;
      v_period_end := v_period_start + interval '1 month';
    end if;
  end if;

  if v_defer_plan_activation
    and v_company_plan.scheduled_payment_id is not null
    and v_company_plan.scheduled_payment_id <> v_payment.id
  then
    raise exception 'PAID_SCHEDULE_EXISTS';
  end if;

  v_granted_credits := case when v_defer_plan_activation then 0 else v_credits end;

  update public.payments
    set status = 'completed',
        completed_at = v_completed_at,
        provider_id = coalesce(nullif(trim(p_provider_id), ''), provider_id, p_inv_id::text),
        credits_granted = coalesce(v_payment.credits_granted, v_granted_credits),
        period_start = v_period_start,
        period_end = v_period_end,
        failed_at = null,
        fail_reason = null
  where id = v_payment.id;

  if v_defer_plan_activation then
    update public.company_plans cp
      set scheduled_plan = v_payment.plan,
          scheduled_plan_effective_at = v_period_start,
          scheduled_payment_id = v_payment.id,
          updated_at = now()
    where cp.company_id = v_payment.company_id;

    return query
    select
      v_payment.id,
      v_payment.company_id,
      v_payment.plan,
      0,
      false;
    return;
  end if;

  if v_company_plan_found then
    v_existing_scheduled_plan := v_company_plan.scheduled_plan;
    v_existing_scheduled_effective_at := v_company_plan.scheduled_plan_effective_at;
    v_clear_scheduled := v_existing_scheduled_plan is not null
      and (
        v_existing_scheduled_plan = v_payment.plan
        or (
          v_existing_scheduled_effective_at is not null
          and v_existing_scheduled_effective_at <= v_period_start
        )
      );

    update public.company_plans cp
      set current_plan = v_payment.plan,
          trial_expires_at = null,
          period_start = v_period_start,
          period_end = v_period_end,
          expires_at = v_period_end,
          robokassa_inv_id = p_inv_id::text,
          auto_renew = coalesce(v_payment.activate_auto_renew, true),
          scheduled_plan = case when v_clear_scheduled then null else cp.scheduled_plan end,
          scheduled_plan_effective_at = case when v_clear_scheduled then null else cp.scheduled_plan_effective_at end,
          scheduled_payment_id = case when v_clear_scheduled then null else cp.scheduled_payment_id end,
          updated_at = now()
    where cp.company_id = v_payment.company_id;
  else
    insert into public.company_plans (
      company_id,
      current_plan,
      period_start,
      period_end,
      expires_at,
      robokassa_inv_id,
      auto_renew,
      scheduled_plan,
      scheduled_plan_effective_at,
      scheduled_payment_id
    )
    values (
      v_payment.company_id,
      v_payment.plan,
      v_period_start,
      v_period_end,
      v_period_end,
      p_inv_id::text,
      coalesce(v_payment.activate_auto_renew, true),
      null,
      null,
      null
    )
    on conflict (company_id) do update
      set current_plan = excluded.current_plan,
          period_start = excluded.period_start,
          period_end = excluded.period_end,
          expires_at = excluded.expires_at,
          robokassa_inv_id = excluded.robokassa_inv_id,
          auto_renew = excluded.auto_renew,
          scheduled_plan = null,
          scheduled_plan_effective_at = null,
          scheduled_payment_id = null,
          updated_at = now();
  end if;

  if v_credits > 0 then
    insert into public.credit_ledger (
      company_id,
      delta,
      reason,
      reference_type,
      reference_id,
      notes
    )
    values (
      v_payment.company_id,
      v_credits,
      'grant',
      'plan_payment',
      v_payment.id,
      format('Plan payment inv_id=%s plan=%s', p_inv_id, v_payment.plan)
    )
    on conflict do nothing;
  end if;

  return query
  select
    v_payment.id,
    v_payment.company_id,
    v_payment.plan,
    v_credits,
    false;
end;
$$;

create or replace function public.prevent_paid_schedule_overwrite()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.scheduled_payment_id is not null
    and not (
      new.scheduled_payment_id is null
      and new.scheduled_plan is null
      and new.scheduled_plan_effective_at is null
      and new.current_plan = old.scheduled_plan
    )
    and not (
      new.scheduled_payment_id is null
      and new.scheduled_plan is null
      and new.scheduled_plan_effective_at is null
      and exists (
        select 1
        from public.payments p
        where p.id = old.scheduled_payment_id
          and p.status in ('requires_review', 'refunded')
      )
    )
    and (
      old.scheduled_payment_id is distinct from new.scheduled_payment_id
      or old.scheduled_plan is distinct from new.scheduled_plan
      or old.scheduled_plan_effective_at is distinct from new.scheduled_plan_effective_at
    )
  then
    raise exception 'PAID_SCHEDULE_CANNOT_OVERWRITE';
  end if;

  return new;
end;
$$;

drop trigger if exists company_plans_prevent_paid_schedule_overwrite on public.company_plans;
create trigger company_plans_prevent_paid_schedule_overwrite
  before update on public.company_plans
  for each row
  execute function public.prevent_paid_schedule_overwrite();

create or replace function public.mark_paid_scheduled_downgrade_requires_review(
  p_company_id uuid,
  p_reason text default 'MANUAL_REVIEW'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.company_plans;
  v_payment_id uuid;
begin
  select *
    into v_plan
  from public.company_plans cp
  where cp.company_id = p_company_id
  for update;

  if not found or v_plan.scheduled_payment_id is null then
    raise exception 'PAID_SCHEDULE_NOT_FOUND';
  end if;

  v_payment_id := v_plan.scheduled_payment_id;

  update public.payments p
    set status = 'requires_review',
        failed_at = coalesce(p.failed_at, now()),
        fail_reason = coalesce(nullif(trim(p_reason), ''), 'MANUAL_REVIEW')
  where p.id = v_payment_id
    and p.status in ('pending', 'completed', 'requires_review');

  update public.company_plans cp
    set scheduled_plan = null,
        scheduled_plan_effective_at = null,
        scheduled_payment_id = null,
        updated_at = now()
  where cp.company_id = p_company_id;

  return v_payment_id;
end;
$$;

revoke all on function public.mark_paid_scheduled_downgrade_requires_review(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_paid_scheduled_downgrade_requires_review(uuid, text) to service_role;
