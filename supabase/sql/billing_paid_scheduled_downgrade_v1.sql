-- Billing paid scheduled downgrade v1
--
-- Goals:
-- - Allow a user with auto_renew=false to pay for a downgrade now.
-- - Keep the current higher plan active until the already-paid period ends.
-- - Activate the paid lower plan later via cron without charging again.

alter table public.payments
  add column if not exists activate_auto_renew boolean not null default true;

alter table public.company_plans
  add column if not exists scheduled_payment_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'company_plans'
      and c.conname = 'company_plans_scheduled_payment_id_fkey'
  ) then
    alter table public.company_plans
      add constraint company_plans_scheduled_payment_id_fkey
      foreign key (scheduled_payment_id)
      references public.payments(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'company_plans'
      and c.conname = 'company_plans_scheduled_payment_consistency_check'
  ) then
    alter table public.company_plans
      add constraint company_plans_scheduled_payment_consistency_check
      check (
        scheduled_payment_id is null
        or (scheduled_plan is not null and scheduled_plan_effective_at is not null)
      );
  end if;
end $$;

create index if not exists idx_company_plans_scheduled_payment_due
  on public.company_plans (scheduled_plan_effective_at)
  where scheduled_payment_id is not null;

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
    v_defer_plan_activation := v_company_plan.current_plan = 'professional'
      and v_payment.plan = 'starter'
      and coalesce(v_company_plan.auto_renew, false) = false
      and v_company_plan.period_end is not null
      and v_company_plan.period_end >= v_completed_at
      and v_period_start >= v_company_plan.period_end
      and v_period_start > v_completed_at;
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

create or replace function public.activate_due_scheduled_plan_payments(
  p_now timestamptz default now()
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
      when v_row.payment_plan = 'starter' then 300
      when v_row.payment_plan = 'professional' then 1200
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
