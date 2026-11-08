-- credit_ledger is the source of truth for credit balance changes. The
-- self-hosted recovery schema initially missed the INSERT trigger that applies
-- ledger deltas to company_credits, leaving new trial companies at balance=0.

create or replace function public.apply_credit_ledger_delta_to_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.company_credits
    set balance = balance + new.delta,
        updated_at = now()
  where company_id = new.company_id;

  if found then
    return new;
  end if;

  if new.delta < 0 then
    raise exception 'COMPANY_CREDITS_ROW_MISSING';
  end if;

  -- The row should normally be created during company provisioning. The
  -- insert path also handles a concurrent first positive ledger entry.
  insert into public.company_credits (
    company_id,
    balance,
    reserved,
    updated_at
  )
  values (
    new.company_id,
    new.delta,
    0,
    now()
  )
  on conflict (company_id) do update
    set balance = public.company_credits.balance + excluded.balance,
        updated_at = now();

  return new;
end;
$$;

revoke all on function public.apply_credit_ledger_delta_to_balance()
  from public, anon, authenticated;

drop trigger if exists credit_ledger_apply_delta_to_balance
  on public.credit_ledger;

create trigger credit_ledger_apply_delta_to_balance
  after insert on public.credit_ledger
  for each row
  execute function public.apply_credit_ledger_delta_to_balance();

-- Refuse to rewrite a balance when current reservations would become invalid.
-- This keeps the backfill transactional instead of silently breaking
-- company_credits.reserved <= company_credits.balance.
do $$
begin
  if exists (
    select 1
    from (
      select company_id, sum(delta)::integer as ledger_balance
      from public.credit_ledger
      group by company_id
    ) ledger
    left join public.company_credits credits
      on credits.company_id = ledger.company_id
    where ledger.ledger_balance < 0
       or coalesce(credits.reserved, 0) > ledger.ledger_balance
  ) then
    raise exception 'CREDIT_LEDGER_BACKFILL_INVARIANT_FAILED';
  end if;
end;
$$;

-- Repair every company represented in the ledger. Companies without ledger
-- entries are left unchanged.
insert into public.company_credits (
  company_id,
  balance,
  reserved,
  updated_at
)
select
  ledger.company_id,
  ledger.ledger_balance,
  0,
  now()
from (
  select company_id, sum(delta)::integer as ledger_balance
  from public.credit_ledger
  group by company_id
) ledger
on conflict (company_id) do update
  set balance = excluded.balance,
      updated_at = now()
where public.company_credits.balance is distinct from excluded.balance;
