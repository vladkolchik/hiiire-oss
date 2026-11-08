-- Billing paid scheduled downgrade production hardening v1
--
-- Goals:
-- - Prevent duplicate active self-service payments for the same future period.
-- - Treat late payment of a future downgrade invoice as a new period from payment completion.
-- - Block any paid scheduled downgrade mutation except normal activation.

create unique index if not exists idx_payments_self_service_active_period_once
  on public.payments (company_id, plan, period_start)
  where status in ('pending', 'completed')
    and is_recurring = false
    and period_start is not null;

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
  v_is_professional_to_starter_without_autorenew boolean := false;
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

  if v_payment.status <> 'pending' then
    raise exception 'PAYMENT_NOT_PENDING';
  end if;

  v_completed_at := coalesce(p_completed_at, now());
  v_credits := case
    when v_payment.plan = 'starter' then 300
    when v_payment.plan = 'professional' then 1200
    else 0
  end;

  v_period_start := coalesce(v_payment.period_start, now());
  v_period_end := coalesce(v_payment.period_end, v_period_start + interval '1 month');

  select *
    into v_company_plan
  from public.company_plans cp
  where cp.company_id = v_payment.company_id
  for update;
  v_company_plan_found := found;

  if v_company_plan_found then
    v_is_professional_to_starter_without_autorenew := v_company_plan.current_plan = 'professional'
      and v_payment.plan = 'starter'
      and coalesce(v_company_plan.auto_renew, false) = false
      and v_company_plan.period_end is not null
      and v_period_start >= v_company_plan.period_end;

    if v_is_professional_to_starter_without_autorenew
      and v_company_plan.period_end >= v_completed_at
      and v_period_start > v_completed_at
    then
      v_defer_plan_activation := true;
    elsif v_is_professional_to_starter_without_autorenew
      and v_completed_at >= v_company_plan.period_end
    then
      -- The invoice was paid after the already-paid Professional period ended.
      -- Do not sell a period that has already partly or fully passed.
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
