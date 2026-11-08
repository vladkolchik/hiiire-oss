-- Enterprise agreement activation/end RPC v1
--
-- Keep Enterprise agreement lifecycle and company_plans changes atomic.
-- Apply through Supabase MCP after verifying the hiiire project.

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
  v_plan public.company_plans;
  v_has_plan boolean := false;
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

  if v_agreement.status in ('draft', 'pending_payment') then
    null;
  else
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

  -- The partial unique index idx_enterprise_agreements_one_active_per_company
  -- also protects this invariant; the explicit check keeps API errors stable.
  if exists (
    select 1
    from public.enterprise_agreements ea
    where ea.company_id = v_agreement.company_id
      and ea.status = 'active'
      and ea.id <> v_agreement.id
  ) then
    raise exception 'ACTIVE_AGREEMENT_EXISTS';
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

  if v_agreement.source_request_id is not null then
    update public.billing_plan_change_requests bpr
      set status = 'applied',
          handled_by = p_actor_id,
          handled_at = v_now,
          applied_at = v_now,
          updated_at = v_now
    where bpr.id = v_agreement.source_request_id
      and bpr.status in ('submitted', 'in_review', 'contacted', 'approved');
  end if;

  return query
    select v_agreement.id, v_agreement.company_id, 'active'::text;
end;
$$;

create or replace function public.end_enterprise_agreement(
  p_agreement_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_target_plan text default null
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
  v_plan public.company_plans;
  v_has_plan boolean := false;
  v_now timestamptz := now();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_target_plan text := nullif(trim(coalesce(p_target_plan, '')), '');
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

  if v_agreement.status <> 'active' then
    raise exception 'AGREEMENT_NOT_ACTIVE';
  end if;

  if v_reason is null then
    raise exception 'END_REASON_REQUIRED';
  end if;

  if v_target_plan is not null and v_target_plan not in ('starter', 'professional') then
    raise exception 'TARGET_PLAN_INVALID';
  end if;

  update public.enterprise_agreements ea
    set status = 'ended',
        ended_by = p_actor_id,
        ended_at = v_now,
        ended_reason = v_reason,
        updated_at = v_now
  where ea.id = v_agreement.id
    and ea.status = 'active';

  if v_target_plan is not null then
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
            fail_reason = coalesce(p.fail_reason, 'ENTERPRISE_AGREEMENT_ENDED')
      where p.id = v_plan.scheduled_payment_id
        and p.status in ('pending', 'completed', 'requires_review');
    end if;

    if v_has_plan then
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
    else
      insert into public.company_plans (
        company_id,
        current_plan,
        intended_plan,
        trial_expires_at,
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
        v_target_plan,
        v_target_plan,
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
  end if;

  return query
    select v_agreement.id, v_agreement.company_id, 'ended'::text;
end;
$$;

revoke all on function public.activate_enterprise_agreement(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.activate_enterprise_agreement(uuid, uuid, text) to service_role;

revoke all on function public.end_enterprise_agreement(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.end_enterprise_agreement(uuid, uuid, text, text) to service_role;
