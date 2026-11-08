-- Enterprise exit company plan guard v1
--
-- Tightens Enterprise exit so an active agreement cannot be ended unless the
-- company has an existing company_plans row with current_plan = enterprise.

create or replace function public.end_enterprise_agreement(
  p_agreement_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_target_plan text,
  p_request_id uuid
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
  v_plan public.company_plans;
  v_has_plan boolean := false;
  v_request_applied_count integer := 0;
  v_now timestamptz := now();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_target_plan text := nullif(trim(coalesce(p_target_plan, '')), '');
begin
  if p_request_id is null then
    raise exception 'REQUEST_REQUIRED';
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

  if v_reason is null then
    raise exception 'END_REASON_REQUIRED';
  end if;

  select *
    into v_request
  from public.billing_plan_change_requests bpr
  where bpr.id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
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
  elsif v_target_plan <> v_request.target_plan then
    raise exception 'TARGET_PLAN_MISMATCH';
  end if;

  if v_target_plan not in ('starter', 'professional') then
    raise exception 'TARGET_PLAN_INVALID';
  end if;

  select *
    into v_plan
  from public.company_plans cp
  where cp.company_id = v_agreement.company_id
  for update;
  v_has_plan := found;

  if not v_has_plan or v_plan.current_plan <> 'enterprise' then
    raise exception 'COMPANY_PLAN_ENTERPRISE_REQUIRED';
  end if;

  update public.enterprise_agreements ea
    set status = 'ended',
        ended_by = p_actor_id,
        ended_by_request_id = p_request_id,
        ended_at = v_now,
        ended_reason = v_reason,
        updated_at = v_now
  where ea.id = v_agreement.id
    and ea.status = 'active';

  if v_plan.scheduled_payment_id is not null then
    update public.payments p
      set status = 'requires_review',
          failed_at = coalesce(p.failed_at, v_now),
          fail_reason = coalesce(p.fail_reason, 'ENTERPRISE_AGREEMENT_ENDED')
    where p.id = v_plan.scheduled_payment_id
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

revoke all on function public.end_enterprise_agreement(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.end_enterprise_agreement(uuid, uuid, text, text, uuid) to service_role;
