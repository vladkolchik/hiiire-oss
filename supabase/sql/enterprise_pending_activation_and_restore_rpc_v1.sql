-- Enterprise pending activation and restore hardening v1
--
-- Narrows Enterprise activation to the visible pending-payment lifecycle
-- state and adds an atomic recovery RPC for pending agreements whose invoice
-- is no longer payable.

create or replace function public.activate_enterprise_agreement(
  p_agreement_id uuid,
  p_actor_id uuid,
  p_reason text default 'ENTERPRISE_AGREEMENT_ACTIVATED'
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
  v_replaced_agreement public.enterprise_agreements;
  v_source_request public.billing_plan_change_requests;
  v_plan public.company_plans;
  v_has_plan boolean := false;
  v_source_request_applied_count integer := 0;
  v_now timestamptz := now();
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'ENTERPRISE_AGREEMENT_ACTIVATED');
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
    raise exception 'AGREEMENT_NOT_ACTIVATABLE';
  end if;

  if v_agreement.starts_at is null then
    raise exception 'STARTS_AT_INVALID';
  end if;

  if not v_agreement.is_open_ended and v_agreement.ends_at is null then
    raise exception 'ENDS_AT_REQUIRED';
  end if;

  if not v_agreement.is_open_ended and v_agreement.ends_at <= v_agreement.starts_at then
    raise exception 'ENDS_AT_MUST_BE_AFTER_STARTS_AT';
  end if;

  if v_agreement.credits_limit is not null and v_agreement.credits_limit < 0 then
    raise exception 'CREDITS_LIMIT_INVALID';
  end if;

  if nullif(trim(coalesce(v_agreement.terms_summary, '')), '') is null then
    raise exception 'TERMS_SUMMARY_REQUIRED';
  end if;

  if v_agreement.source_request_id is null then
    raise exception 'SOURCE_REQUEST_REQUIRED';
  end if;

  if v_agreement.replaces_agreement_id is not null then
    select *
      into v_replaced_agreement
    from public.enterprise_agreements ea
    where ea.id = v_agreement.replaces_agreement_id
    for update;

    if not found then
      raise exception 'REPLACED_AGREEMENT_NOT_FOUND';
    end if;

    if v_replaced_agreement.company_id <> v_agreement.company_id then
      raise exception 'REPLACED_AGREEMENT_COMPANY_MISMATCH';
    end if;

    if v_replaced_agreement.status <> 'active' then
      raise exception 'REPLACED_AGREEMENT_NOT_ACTIVE';
    end if;
  end if;

  if exists (
    select 1
    from public.enterprise_agreements ea
    where ea.company_id = v_agreement.company_id
      and ea.status = 'active'
      and ea.id <> v_agreement.id
      and (
        v_agreement.replaces_agreement_id is null
        or ea.id <> v_agreement.replaces_agreement_id
      )
  ) then
    raise exception 'ACTIVE_AGREEMENT_EXISTS';
  end if;

  select *
    into v_source_request
  from public.billing_plan_change_requests bpr
  where bpr.id = v_agreement.source_request_id
  for update;

  if not found then
    raise exception 'SOURCE_REQUEST_NOT_FOUND';
  end if;

  if v_source_request.company_id <> v_agreement.company_id then
    raise exception 'SOURCE_REQUEST_COMPANY_MISMATCH';
  end if;

  if v_source_request.status <> 'approved' then
    raise exception 'SOURCE_REQUEST_STATUS_INVALID';
  end if;

  if v_source_request.target_plan <> 'enterprise' then
    raise exception 'SOURCE_REQUEST_TARGET_PLAN_INVALID';
  end if;

  if v_agreement.replaces_agreement_id is null then
    if v_source_request.request_kind <> 'upgrade_to_enterprise' then
      raise exception 'SOURCE_REQUEST_KIND_INVALID';
    end if;

    if v_source_request.current_plan = 'enterprise' then
      raise exception 'SOURCE_REQUEST_CURRENT_PLAN_INVALID';
    end if;
  else
    if v_source_request.request_kind <> 'enterprise_terms_change' then
      raise exception 'SOURCE_REQUEST_KIND_INVALID';
    end if;

    if v_source_request.current_plan <> 'enterprise' then
      raise exception 'SOURCE_REQUEST_CURRENT_PLAN_INVALID';
    end if;
  end if;

  if not exists (
    select 1
    from public.billing_manual_invoices bmi
    where bmi.agreement_id = v_agreement.id
      and bmi.status = 'paid'
      and not exists (
        select 1
        from public.billing_manual_invoices newer
        where newer.agreement_id = bmi.agreement_id
          and (
            newer.created_at > bmi.created_at
            or (newer.created_at = bmi.created_at and newer.id::text > bmi.id::text)
          )
      )
  ) then
    raise exception 'PAID_INVOICE_REQUIRED';
  end if;

  select *
    into v_plan
  from public.company_plans cp
  where cp.company_id = v_agreement.company_id
  for update;
  v_has_plan := found;

  if v_has_plan and v_plan.scheduled_payment_id is not null then
    update public.payments p
      set status = 'requires_review',
          failed_at = coalesce(p.failed_at, v_now),
          fail_reason = coalesce(nullif(trim(v_reason), ''), 'ENTERPRISE_AGREEMENT_ACTIVATED')
    where p.id = v_plan.scheduled_payment_id
      and p.status in ('pending', 'completed', 'requires_review');
  end if;

  if v_agreement.replaces_agreement_id is not null then
    update public.enterprise_agreements ea
      set status = 'ended',
          ended_by = p_actor_id,
          ended_at = v_now,
          ended_reason = v_reason,
          updated_at = v_now
    where ea.id = v_replaced_agreement.id
      and ea.status = 'active';
  end if;

  if v_has_plan then
    update public.company_plans cp
      set current_plan = 'enterprise',
          trial_expires_at = null,
          intended_plan = null,
          expires_at = null,
          period_start = null,
          period_end = null,
          robokassa_inv_id = null,
          recurring_mandate_inv_id = null,
          auto_renew = false,
          scheduled_plan = null,
          scheduled_plan_effective_at = null,
          scheduled_payment_id = null,
          updated_at = v_now
    where cp.company_id = v_agreement.company_id;
  else
    insert into public.company_plans (
      company_id,
      current_plan,
      trial_expires_at,
      intended_plan,
      expires_at,
      period_start,
      period_end,
      robokassa_inv_id,
      recurring_mandate_inv_id,
      auto_renew,
      scheduled_plan,
      scheduled_plan_effective_at,
      scheduled_payment_id,
      updated_at
    )
    values (
      v_agreement.company_id,
      'enterprise',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      false,
      null,
      null,
      null,
      v_now
    );
  end if;

  update public.enterprise_agreements ea
    set status = 'active',
        activated_by = p_actor_id,
        activated_at = v_now,
        updated_at = v_now
  where ea.id = v_agreement.id;

  update public.billing_plan_change_requests bpr
    set status = 'applied',
        handled_by = p_actor_id,
        handled_at = v_now,
        applied_at = v_now,
        updated_at = v_now
  where bpr.id = v_agreement.source_request_id
    and bpr.status = 'approved';

  get diagnostics v_source_request_applied_count = row_count;
  if v_source_request_applied_count <> 1 then
    raise exception 'SOURCE_REQUEST_APPLY_FAILED';
  end if;

  return query
    select v_agreement.id, v_agreement.company_id, 'active'::text;
end;
$$;

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

revoke all on function public.activate_enterprise_agreement(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.activate_enterprise_agreement(uuid, uuid, text) to service_role;

revoke all on function public.restore_enterprise_agreement_draft(uuid) from public, anon, authenticated;
grant execute on function public.restore_enterprise_agreement_draft(uuid) to service_role;
