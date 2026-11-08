-- Billing paid scheduled downgrade enterprise supersede v1
--
-- Goals:
-- - Let platform-admin Enterprise qualification supersede a paid scheduled downgrade safely.
-- - Keep the active plan switch and payment review marker in one database transaction.

create or replace function public.qualify_company_enterprise_plan(
  p_company_id uuid,
  p_reason text default 'ENTERPRISE_SUPERSEDE'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.company_plans;
begin
  select *
    into v_plan
  from public.company_plans cp
  where cp.company_id = p_company_id
  for update;

  if not found then
    insert into public.company_plans (
      company_id,
      current_plan,
      trial_expires_at,
      intended_plan,
      expires_at,
      period_start,
      period_end,
      robokassa_inv_id,
      auto_renew,
      scheduled_plan,
      scheduled_plan_effective_at,
      scheduled_payment_id
    )
    values (
      p_company_id,
      'enterprise',
      null,
      null,
      null,
      null,
      null,
      null,
      false,
      null,
      null,
      null
    );
    return true;
  end if;

  if v_plan.scheduled_payment_id is not null then
    update public.payments p
      set status = 'requires_review',
          failed_at = coalesce(p.failed_at, now()),
          fail_reason = coalesce(nullif(trim(p_reason), ''), 'ENTERPRISE_SUPERSEDE')
    where p.id = v_plan.scheduled_payment_id
      and p.status in ('pending', 'completed', 'requires_review');
  end if;

  update public.company_plans cp
    set current_plan = 'enterprise',
        trial_expires_at = null,
        intended_plan = null,
        expires_at = null,
        period_start = null,
        period_end = null,
        robokassa_inv_id = null,
        auto_renew = false,
        scheduled_plan = null,
        scheduled_plan_effective_at = null,
        scheduled_payment_id = null,
        updated_at = now()
  where cp.company_id = p_company_id;

  return true;
end;
$$;

revoke all on function public.qualify_company_enterprise_plan(uuid, text) from public, anon, authenticated;
grant execute on function public.qualify_company_enterprise_plan(uuid, text) to service_role;
