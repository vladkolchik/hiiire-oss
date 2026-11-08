-- Robokassa billing rollout v1
--
-- Goals:
-- - Add payment fields required for checkout/webhook/recurring
-- - Add idempotency guards for provider callbacks and ledger grants
-- - Add atomic finalize RPC for successful Robokassa payment

create sequence if not exists public.payments_inv_id_seq
  as integer
  minvalue 1
  maxvalue 2147483647
  start with 100000
  increment by 1
  cache 1;

alter table public.payments
  add column if not exists inv_id integer,
  add column if not exists period_start timestamptz,
  add column if not exists period_end timestamptz,
  add column if not exists is_recurring boolean not null default false,
  add column if not exists parent_inv_id integer null,
  add column if not exists failed_at timestamptz null,
  add column if not exists fail_reason text null;

alter table public.payments
  alter column inv_id set default nextval('public.payments_inv_id_seq');

update public.payments
set inv_id = nextval('public.payments_inv_id_seq')
where inv_id is null;

alter table public.payments
  alter column inv_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'payments'
      and c.conname = 'payments_inv_id_range_check'
  ) then
    alter table public.payments
      add constraint payments_inv_id_range_check
      check (inv_id > 0 and inv_id <= 2147483647);
  end if;
end $$;

create unique index if not exists idx_payments_inv_id_unique
  on public.payments(inv_id);

create unique index if not exists idx_payments_provider_provider_id_unique
  on public.payments(provider, provider_id)
  where provider_id is not null;

create unique index if not exists idx_credit_ledger_plan_payment_once
  on public.credit_ledger(reference_type, reference_id, reason)
  where reason = 'grant' and reference_type = 'plan_payment';

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

  update public.company_plans
    set current_plan = v_payment.plan,
        trial_expires_at = null,
        period_start = v_period_start,
        period_end = v_period_end,
        expires_at = v_period_end,
        robokassa_inv_id = p_inv_id::text,
        auto_renew = true,
        updated_at = now()
  where company_id = v_payment.company_id;

  if not found then
    insert into public.company_plans (
      company_id,
      current_plan,
      period_start,
      period_end,
      expires_at,
      robokassa_inv_id,
      auto_renew
    )
    values (
      v_payment.company_id,
      v_payment.plan,
      v_period_start,
      v_period_end,
      v_period_end,
      p_inv_id::text,
      true
    )
    on conflict (company_id) do update
      set current_plan = excluded.current_plan,
          period_start = excluded.period_start,
          period_end = excluded.period_end,
          expires_at = excluded.expires_at,
          robokassa_inv_id = excluded.robokassa_inv_id,
          auto_renew = excluded.auto_renew,
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
