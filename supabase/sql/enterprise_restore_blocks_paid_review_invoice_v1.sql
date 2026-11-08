-- Enterprise restore blocks paid review invoice v1
--
-- A paid webhook review is payment evidence even when Robokassa did not
-- provide a payable URL. Keep the agreement in pending_payment so the review
-- invoice can be manually confirmed or investigated instead of becoming an
-- orphan after restore/re-issue.

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
  v_latest_invoice public.billing_manual_invoices;
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
      and bmi.provider_invoice_url is not null
  ) then
    raise exception 'AGREEMENT_HAS_PAYABLE_INVOICE';
  end if;

  select *
    into v_latest_invoice
  from public.billing_manual_invoices bmi
  where bmi.agreement_id = p_agreement_id
  order by bmi.created_at desc, bmi.id desc
  limit 1;

  if found and (
    v_latest_invoice.status in ('issued', 'paid')
    or v_latest_invoice.provider_status = 'paid_requires_review'
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
