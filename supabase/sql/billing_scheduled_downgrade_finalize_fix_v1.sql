-- Fix ambiguity in finalize_robokassa_payment introduced by
-- billing_scheduled_downgrade_v1.
-- Output argument "company_id" in RETURNS TABLE shadowed unqualified column
-- in UPDATE company_plans WHERE clause.

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
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_credits integer;
  v_existing_scheduled_plan text;
  v_existing_scheduled_effective_at timestamptz;
  v_clear_scheduled boolean := false;
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

  v_credits := case
    when v_payment.plan = 'starter' then 300
    when v_payment.plan = 'professional' then 1200
    else 0
  end;

  v_period_start := coalesce(v_payment.period_start, now());
  v_period_end := coalesce(v_payment.period_end, v_period_start + interval '1 month');

  update public.payments
    set status = 'completed',
        completed_at = coalesce(p_completed_at, now()),
        provider_id = coalesce(nullif(trim(p_provider_id), ''), provider_id, p_inv_id::text),
        credits_granted = coalesce(v_payment.credits_granted, v_credits),
        period_start = v_period_start,
        period_end = v_period_end,
        failed_at = null,
        fail_reason = null
  where id = v_payment.id;

  select cp.scheduled_plan, cp.scheduled_plan_effective_at
    into v_existing_scheduled_plan, v_existing_scheduled_effective_at
  from public.company_plans cp
  where cp.company_id = v_payment.company_id
  for update;

  if found then
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
          auto_renew = true,
          scheduled_plan = case when v_clear_scheduled then null else cp.scheduled_plan end,
          scheduled_plan_effective_at = case when v_clear_scheduled then null else cp.scheduled_plan_effective_at end,
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
      scheduled_plan_effective_at
    )
    values (
      v_payment.company_id,
      v_payment.plan,
      v_period_start,
      v_period_end,
      v_period_end,
      p_inv_id::text,
      true,
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
