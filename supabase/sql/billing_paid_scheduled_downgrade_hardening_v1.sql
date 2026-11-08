-- Billing paid scheduled downgrade hardening v1
--
-- Goals:
-- - Scope due scheduled payment activation to a single company when needed.
-- - Prevent accidental paid schedule overwrites at the database layer.

create or replace function public.activate_due_scheduled_plan_payments(
  p_now timestamptz default now(),
  p_company_id uuid default null
)
returns table (
  company_id uuid,
  payment_id uuid,
  plan text,
  credits_granted integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_credits integer;
begin
  for v_row in
    select
      cp.company_id,
      cp.scheduled_plan,
      cp.scheduled_plan_effective_at,
      p.id as payment_id,
      p.plan as payment_plan,
      p.inv_id,
      p.period_start,
      p.period_end,
      p.activate_auto_renew
    from public.company_plans cp
    join public.payments p on p.id = cp.scheduled_payment_id
    where cp.scheduled_payment_id is not null
      and (p_company_id is null or cp.company_id = p_company_id)
      and cp.scheduled_plan is not null
      and cp.scheduled_plan_effective_at is not null
      and cp.scheduled_plan_effective_at <= p_now
      and p.status = 'completed'
      and p.plan = cp.scheduled_plan
    for update of cp, p
  loop
    v_period_start := coalesce(v_row.period_start, v_row.scheduled_plan_effective_at);
    v_period_end := coalesce(v_row.period_end, v_period_start + interval '1 month');
    v_credits := case
      when v_row.payment_plan = 'starter' then 500
      when v_row.payment_plan = 'professional' then 2000
      else 0
    end;

    update public.company_plans cp
      set current_plan = v_row.payment_plan,
          trial_expires_at = null,
          period_start = v_period_start,
          period_end = v_period_end,
          expires_at = v_period_end,
          robokassa_inv_id = v_row.inv_id::text,
          auto_renew = coalesce(v_row.activate_auto_renew, true),
          scheduled_plan = null,
          scheduled_plan_effective_at = null,
          scheduled_payment_id = null,
          updated_at = now()
    where cp.company_id = v_row.company_id;

    update public.payments p
      set credits_granted = v_credits
    where p.id = v_row.payment_id
      and coalesce(p.credits_granted, 0) = 0;

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
        v_row.company_id,
        v_credits,
        'grant',
        'plan_payment',
        v_row.payment_id,
        format('Plan payment inv_id=%s plan=%s', v_row.inv_id, v_row.payment_plan)
      )
      on conflict do nothing;
    end if;

    return query
    select
      v_row.company_id,
      v_row.payment_id,
      v_row.payment_plan,
      v_credits;
  end loop;
end;
$$;

create or replace function public.prevent_paid_schedule_overwrite()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.scheduled_payment_id is not null
    and old.scheduled_payment_id is distinct from new.scheduled_payment_id
    and not (
      new.scheduled_payment_id is null
      and new.scheduled_plan is null
      and new.scheduled_plan_effective_at is null
      and new.current_plan = old.scheduled_plan
    )
    and (
      new.scheduled_payment_id is null
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
