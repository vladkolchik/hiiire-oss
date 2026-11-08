-- Credit top-up payments v1
--
-- Goals:
-- - Store one-time Robokassa payments for buying credits without changing a plan.
-- - Reuse the normal low-range Robokassa InvId sequence.
-- - Grant paid credits into the common credit_ledger so the visible balance stays unified.

create table if not exists public.credit_topup_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  credits integer not null check (credits >= 1 and credits <= 99999),
  amount integer not null check (amount >= 1500),
  currency text not null default 'RUB',
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed', 'refunded', 'requires_review')),
  provider text not null default 'robokassa',
  provider_id text,
  fiscal_receipt jsonb,
  provider_payload jsonb,
  inv_id integer not null default nextval('public.payments_inv_id_seq'),
  checkout_expires_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  failed_at timestamptz,
  fail_reason text
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'credit_topup_payments'
      and c.conname = 'credit_topup_payments_amount_matches_credits'
  ) then
    alter table public.credit_topup_payments
      add constraint credit_topup_payments_amount_matches_credits
      check (amount = credits * 1500);
  end if;
end $$;

create unique index if not exists idx_credit_topup_payments_inv_id_unique
  on public.credit_topup_payments(inv_id);

create unique index if not exists idx_credit_topup_payments_provider_provider_id_unique
  on public.credit_topup_payments(provider, provider_id)
  where provider_id is not null;

create index if not exists idx_credit_topup_payments_company_created_at
  on public.credit_topup_payments(company_id, created_at desc);

create index if not exists idx_credit_topup_payments_pending_reuse
  on public.credit_topup_payments(company_id, credits, amount, currency, created_at desc)
  where status = 'pending' and checkout_expires_at is not null;

create unique index if not exists idx_credit_ledger_credit_topup_payment_once
  on public.credit_ledger(reference_type, reference_id, reason)
  where reason = 'grant' and reference_type = 'credit_topup_payment';

alter table public.credit_topup_payments enable row level security;

drop policy if exists credit_topup_payments_select_company
  on public.credit_topup_payments;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='credit_topup_payments'
      and policyname='credit_topup_payments_deny_browser_select'
  ) then
    create policy credit_topup_payments_deny_browser_select
      on public.credit_topup_payments
      for select
      using (false);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='credit_topup_payments'
      and policyname='credit_topup_payments_deny_writes'
  ) then
    create policy credit_topup_payments_deny_writes
      on public.credit_topup_payments
      for insert
      with check (false);
  end if;
end $$;

create or replace function public.create_or_reuse_credit_topup_payment(
  p_company_id uuid,
  p_credits integer,
  p_amount integer,
  p_currency text default 'RUB',
  p_fiscal_receipt jsonb default null,
  p_checkout_expires_at timestamptz default (now() + interval '15 minutes'),
  p_now timestamptz default now()
)
returns table (
  id uuid,
  company_id uuid,
  inv_id integer,
  credits integer,
  amount integer,
  currency text,
  status text,
  checkout_expires_at timestamptz,
  fiscal_receipt jsonb,
  reused boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.credit_topup_payments;
begin
  if p_company_id is null then
    raise exception 'CREDIT_TOPUP_COMPANY_REQUIRED';
  end if;

  if p_credits < 1 or p_credits > 99999 then
    raise exception 'CREDIT_TOPUP_CREDITS_INVALID';
  end if;

  if p_amount <> p_credits * 1500 then
    raise exception 'CREDIT_TOPUP_AMOUNT_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':credit_topup', 0));

  select *
    into v_payment
  from public.credit_topup_payments ctp
  where ctp.company_id = p_company_id
    and ctp.provider = 'robokassa'
    and ctp.credits = p_credits
    and ctp.amount = p_amount
    and ctp.currency = coalesce(nullif(trim(p_currency), ''), 'RUB')
    and ctp.status = 'pending'
    and ctp.checkout_expires_at is not null
    and ctp.checkout_expires_at > coalesce(p_now, now())
  order by ctp.created_at desc
  limit 1
  for update;

  if found then
    return query
    select
      v_payment.id,
      v_payment.company_id,
      v_payment.inv_id,
      v_payment.credits,
      v_payment.amount,
      v_payment.currency,
      v_payment.status,
      v_payment.checkout_expires_at,
      v_payment.fiscal_receipt,
      true;
    return;
  end if;

  insert into public.credit_topup_payments (
    company_id,
    credits,
    amount,
    currency,
    status,
    provider,
    fiscal_receipt,
    checkout_expires_at
  )
  values (
    p_company_id,
    p_credits,
    p_amount,
    coalesce(nullif(trim(p_currency), ''), 'RUB'),
    'pending',
    'robokassa',
    p_fiscal_receipt,
    p_checkout_expires_at
  )
  returning *
    into v_payment;

  return query
  select
    v_payment.id,
    v_payment.company_id,
    v_payment.inv_id,
    v_payment.credits,
    v_payment.amount,
    v_payment.currency,
    v_payment.status,
    v_payment.checkout_expires_at,
    v_payment.fiscal_receipt,
    false;
end;
$$;

revoke all on function public.create_or_reuse_credit_topup_payment(uuid, integer, integer, text, jsonb, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.create_or_reuse_credit_topup_payment(uuid, integer, integer, text, jsonb, timestamptz, timestamptz) to service_role;

create or replace function public.finalize_credit_topup_payment(
  p_inv_id integer,
  p_provider_id text,
  p_completed_at timestamptz default now(),
  p_provider_payload jsonb default null
)
returns table (
  payment_id uuid,
  company_id uuid,
  credits_granted integer,
  already_completed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.credit_topup_payments;
  v_completed_at timestamptz;
begin
  select *
    into v_payment
  from public.credit_topup_payments
  where inv_id = p_inv_id
  for update;

  if not found then
    raise exception 'CREDIT_TOPUP_PAYMENT_NOT_FOUND';
  end if;

  if v_payment.status = 'completed' then
    return query
    select v_payment.id, v_payment.company_id, v_payment.credits, true;
    return;
  end if;

  if v_payment.status = 'requires_review' then
    return query
    select v_payment.id, v_payment.company_id, 0, true;
    return;
  end if;

  if v_payment.status <> 'pending' then
    raise exception 'CREDIT_TOPUP_PAYMENT_NOT_PENDING';
  end if;

  v_completed_at := coalesce(p_completed_at, now());

  update public.credit_topup_payments
    set status = 'completed',
        completed_at = v_completed_at,
        provider_id = coalesce(nullif(trim(p_provider_id), ''), provider_id, p_inv_id::text),
        provider_payload = coalesce(p_provider_payload, provider_payload),
        failed_at = null,
        fail_reason = null
  where id = v_payment.id;

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
    v_payment.credits,
    'grant',
    'credit_topup_payment',
    v_payment.id,
    format('Credit top-up inv_id=%s credits=%s', p_inv_id, v_payment.credits)
  )
  on conflict do nothing;

  return query
  select v_payment.id, v_payment.company_id, v_payment.credits, false;
end;
$$;

revoke all on function public.finalize_credit_topup_payment(integer, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_credit_topup_payment(integer, text, timestamptz, jsonb) to service_role;
