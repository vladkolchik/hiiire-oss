-- Enterprise exit request and terminal billing requests v1
--
-- Adds the exit-request audit link and makes Enterprise exit require an approved
-- enterprise_exit request. Create/apply through Supabase MCP after verifying the
-- hiiire project.

alter table public.enterprise_agreements
  add column if not exists ended_by_request_id uuid
    references public.billing_plan_change_requests(id) on delete set null;

create index if not exists idx_enterprise_agreements_ended_by_request_id
  on public.enterprise_agreements(ended_by_request_id)
  where ended_by_request_id is not null;

create or replace function public.prevent_billing_plan_change_request_terminal_reopen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status in ('applied', 'rejected', 'canceled')
     and new.status <> old.status then
    raise exception 'TERMINAL_REQUEST_STATUS_IMMUTABLE';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_billing_plan_change_requests_terminal_reopen
  on public.billing_plan_change_requests;

create trigger trg_billing_plan_change_requests_terminal_reopen
  before update of status on public.billing_plan_change_requests
  for each row
  execute function public.prevent_billing_plan_change_request_terminal_reopen();

drop function if exists public.end_enterprise_agreement(uuid, uuid, text, text, uuid);

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

  if v_has_plan and v_plan.current_plan <> 'enterprise' then
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
