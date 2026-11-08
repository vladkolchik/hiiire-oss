-- Enterprise current invoice cycle RPC v1
--
-- Keeps the issue-invoice database transition atomic and ensures activation
-- can only use the newest linked manual invoice for the current
-- pending-payment cycle.

create or replace function public.create_enterprise_manual_invoice_draft(
  p_agreement_id uuid,
  p_actor_id uuid,
  p_amount integer,
  p_description text,
  p_payer_email text,
  p_service_period_start timestamptz default null,
  p_service_period_end timestamptz default null,
  p_fiscal_receipt jsonb default null
)
returns table (
  invoice_id uuid,
  provider_invoice_id text,
  agreement_id uuid,
  company_id uuid,
  source_request_id uuid,
  agreement_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agreement public.enterprise_agreements;
  v_source_request public.billing_plan_change_requests;
  v_invoice public.billing_manual_invoices;
  v_now timestamptz := now();
  v_claimed_count integer := 0;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVOICE_AMOUNT_INVALID';
  end if;

  if nullif(trim(coalesce(p_description, '')), '') is null then
    raise exception 'INVOICE_DESCRIPTION_REQUIRED';
  end if;

  if nullif(trim(coalesce(p_payer_email, '')), '') is null then
    raise exception 'INVOICE_PAYER_EMAIL_REQUIRED';
  end if;

  select *
    into v_agreement
  from public.enterprise_agreements ea
  where ea.id = p_agreement_id
  for update;

  if not found then
    raise exception 'AGREEMENT_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_agreement.company_id::text, 0));

  if v_agreement.source_request_id is null then
    raise exception 'SOURCE_REQUEST_REQUIRED';
  end if;

  if v_agreement.status <> 'draft' then
    raise exception 'AGREEMENT_NOT_INVOICEABLE';
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

  if v_source_request.request_kind not in ('upgrade_to_enterprise', 'enterprise_terms_change') then
    raise exception 'SOURCE_REQUEST_KIND_INVALID';
  end if;

  insert into public.billing_manual_invoices (
    company_id,
    request_id,
    agreement_id,
    amount,
    currency,
    description,
    payer_email,
    service_period_start,
    service_period_end,
    status,
    fiscal_receipt,
    created_by,
    updated_at
  )
  values (
    v_agreement.company_id,
    v_agreement.source_request_id,
    v_agreement.id,
    p_amount,
    'RUB',
    trim(p_description),
    trim(p_payer_email),
    p_service_period_start,
    p_service_period_end,
    'draft',
    p_fiscal_receipt,
    p_actor_id,
    v_now
  )
  returning *
    into v_invoice;

  update public.enterprise_agreements ea
    set status = 'pending_payment',
        updated_at = v_now
  where ea.id = v_agreement.id
    and ea.status = 'draft';

  get diagnostics v_claimed_count = row_count;
  if v_claimed_count <> 1 then
    raise exception 'AGREEMENT_STATUS_CHANGED';
  end if;

  return query
    select
      v_invoice.id,
      v_invoice.provider_invoice_id,
      v_agreement.id,
      v_agreement.company_id,
      v_agreement.source_request_id,
      'pending_payment'::text;
end;
$$;

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

revoke all on function public.create_enterprise_manual_invoice_draft(uuid, uuid, integer, text, text, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.create_enterprise_manual_invoice_draft(uuid, uuid, integer, text, text, timestamptz, timestamptz, jsonb) to service_role;

revoke all on function public.activate_enterprise_agreement(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.activate_enterprise_agreement(uuid, uuid, text) to service_role;
