-- Enterprise request drawer guards v1
--
-- Adds atomic agreement creation from an approved request and tightens
-- Enterprise exit so UI snapshots cannot apply stale approved requests.

create or replace function public.create_enterprise_agreement_from_request(
  p_source_request_id uuid,
  p_source_request_updated_at timestamptz,
  p_actor_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_is_open_ended boolean,
  p_credits_limit integer,
  p_terms_summary text,
  p_internal_note text,
  p_replaces_agreement_id uuid
)
returns public.enterprise_agreements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.billing_plan_change_requests;
  v_replaced_agreement public.enterprise_agreements;
  v_created public.enterprise_agreements;
  v_now timestamptz := now();
begin
  select *
    into v_request
  from public.billing_plan_change_requests bpr
  where bpr.id = p_source_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  if v_request.updated_at <> p_source_request_updated_at then
    raise exception 'REQUEST_STATUS_CHANGED';
  end if;

  if p_replaces_agreement_id is not null then
    select *
      into v_replaced_agreement
    from public.enterprise_agreements ea
    where ea.id = p_replaces_agreement_id
    for update;

    if not found then
      raise exception 'REPLACED_AGREEMENT_NOT_FOUND';
    end if;

    if v_replaced_agreement.company_id <> v_request.company_id
       or v_replaced_agreement.status <> 'active' then
      raise exception 'REPLACED_AGREEMENT_NOT_ACTIVE';
    end if;
  end if;

  insert into public.enterprise_agreements (
    company_id,
    source_request_id,
    replaces_agreement_id,
    status,
    starts_at,
    ends_at,
    is_open_ended,
    credits_limit,
    terms_summary,
    internal_note,
    created_by,
    updated_at
  )
  values (
    v_request.company_id,
    p_source_request_id,
    p_replaces_agreement_id,
    'draft',
    p_starts_at,
    p_ends_at,
    p_is_open_ended,
    p_credits_limit,
    p_terms_summary,
    nullif(trim(coalesce(p_internal_note, '')), ''),
    p_actor_id,
    v_now
  )
  returning * into v_created;

  update public.billing_plan_change_requests bpr
    set updated_at = v_now
  where bpr.id = p_source_request_id;

  return v_created;
end;
$$;

revoke all on function public.create_enterprise_agreement_from_request(
  uuid,
  timestamptz,
  uuid,
  timestamptz,
  timestamptz,
  boolean,
  integer,
  text,
  text,
  uuid
) from public, anon, authenticated;

grant execute on function public.create_enterprise_agreement_from_request(
  uuid,
  timestamptz,
  uuid,
  timestamptz,
  timestamptz,
  boolean,
  integer,
  text,
  text,
  uuid
) to service_role;

drop function if exists public.end_enterprise_agreement(uuid, uuid, text, text, uuid);

create or replace function public.end_enterprise_agreement(
  p_agreement_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_target_plan text,
  p_request_id uuid,
  p_source_request_updated_at timestamptz
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
  v_request public.billing_plan_change_requests;
  v_company_plan public.company_plans;
  v_has_plan boolean := false;
  v_request_applied_count integer := 0;
  v_target_plan text := nullif(trim(coalesce(p_target_plan, '')), '');
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_now timestamptz := now();
begin
  if v_reason is null then
    raise exception 'END_REASON_REQUIRED';
  end if;

  if v_target_plan not in ('starter', 'professional') then
    raise exception 'TARGET_PLAN_INVALID';
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

  if v_agreement.status <> 'active' then
    raise exception 'AGREEMENT_NOT_ACTIVE';
  end if;

  if p_request_id is null then
    raise exception 'REQUEST_REQUIRED';
  end if;

  select *
    into v_request
  from public.billing_plan_change_requests bpr
  where bpr.id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  if v_request.updated_at <> p_source_request_updated_at then
    raise exception 'REQUEST_STATUS_CHANGED';
  end if;

  if v_request.company_id <> v_agreement.company_id then
    raise exception 'REQUEST_COMPANY_MISMATCH';
  end if;

  if v_request.request_kind <> 'enterprise_exit' then
    raise exception 'REQUEST_KIND_INVALID';
  end if;

  if v_request.status <> 'approved' then
    raise exception 'REQUEST_STATUS_INVALID';
  end if;

  if v_request.current_plan <> 'enterprise' then
    raise exception 'REQUEST_CURRENT_PLAN_INVALID';
  end if;

  if v_request.target_plan not in ('starter', 'professional') then
    raise exception 'REQUEST_TARGET_PLAN_INVALID';
  end if;

  if v_target_plan is null then
    v_target_plan := v_request.target_plan;
  elsif v_request.target_plan <> v_target_plan then
    raise exception 'TARGET_PLAN_MISMATCH';
  end if;

  if v_target_plan not in ('starter', 'professional') then
    raise exception 'TARGET_PLAN_INVALID';
  end if;

  select *
    into v_company_plan
  from public.company_plans cp
  where cp.company_id = v_agreement.company_id
  for update;
  v_has_plan := found;

  if not v_has_plan or v_company_plan.current_plan <> 'enterprise' then
    raise exception 'COMPANY_PLAN_ENTERPRISE_REQUIRED';
  end if;

  update public.enterprise_agreements ea
    set status = 'ended',
        ended_at = v_now,
        ended_by = p_actor_id,
        ended_by_request_id = p_request_id,
        ended_reason = v_reason,
        updated_at = v_now
  where ea.id = v_agreement.id
    and ea.status = 'active';

  if v_company_plan.scheduled_payment_id is not null then
    update public.payments p
      set status = 'requires_review',
          failed_at = coalesce(p.failed_at, v_now),
          fail_reason = coalesce(p.fail_reason, 'ENTERPRISE_AGREEMENT_ENDED')
    where p.id = v_company_plan.scheduled_payment_id
      and p.status in ('pending', 'completed', 'requires_review');
  end if;

  update public.company_plans cp
    set current_plan = v_target_plan,
        intended_plan = v_target_plan,
        trial_expires_at = null,
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

  update public.billing_plan_change_requests bpr
    set status = 'applied',
        handled_by = p_actor_id,
        handled_at = v_now,
        applied_at = v_now,
        updated_at = v_now
  where bpr.id = p_request_id
    and bpr.status = 'approved';

  get diagnostics v_request_applied_count = row_count;
  if v_request_applied_count <> 1 then
    raise exception 'REQUEST_APPLY_FAILED';
  end if;

  return query
    select v_agreement.id, v_agreement.company_id, 'ended'::text;
end;
$$;

revoke all on function public.end_enterprise_agreement(uuid, uuid, text, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.end_enterprise_agreement(uuid, uuid, text, text, uuid, timestamptz) to service_role;
