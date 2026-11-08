-- Enterprise restore provider-url invoice guard v1
--
-- Keeps restore blocked while any linked manual invoice still has a provider
-- payable URL, even if an app-level review action changed its local status.

create or replace function public.restore_enterprise_agreement_draft(
  p_agreement_id uuid
)
returns table (
  agreement_id uuid,
  company_id uuid,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.enterprise_agreements;
  v_updated_count integer := 0;
  v_now timestamptz := now();
begin
  select *
    into v_agreement
  from public.enterprise_agreements ea
  where ea.id = p_agreement_id
  for update;

  if not found then
    raise exception 'AGREEMENT_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_agreement.company_id::text, 0));

  if v_agreement.status <> 'pending_payment' then
    raise exception 'AGREEMENT_NOT_RESTORABLE';
  end if;

  perform 1
  from public.billing_manual_invoices bmi
  where bmi.agreement_id = p_agreement_id
  for update;

  if exists (
    select 1
    from public.billing_manual_invoices bmi
    where bmi.agreement_id = p_agreement_id
      and (
        bmi.status in ('issued', 'paid')
        or (
          bmi.status = 'requires_review'
          and bmi.provider_invoice_id is not null
        )
        or bmi.provider_invoice_url is not null
      )
  ) then
    raise exception 'AGREEMENT_HAS_PAYABLE_INVOICE';
  end if;

  update public.enterprise_agreements ea
    set status = 'draft',
        updated_at = v_now
  where ea.id = v_agreement.id
    and ea.status = 'pending_payment';

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'AGREEMENT_STATUS_CHANGED';
  end if;

  return query
    select v_agreement.id, v_agreement.company_id, 'draft'::text;
end;
$$;

revoke all on function public.restore_enterprise_agreement_draft(uuid) from public, anon, authenticated;
grant execute on function public.restore_enterprise_agreement_draft(uuid) to service_role;
