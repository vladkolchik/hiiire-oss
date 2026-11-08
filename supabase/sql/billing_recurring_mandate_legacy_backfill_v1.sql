-- Billing recurring mandate legacy backfill v1
--
-- The previous migration introduced `payments.recurring_mandate_activated`.
-- Legacy completed payments do not have this flag, but payments created by
-- checkout while recurring billing was enabled already have
-- `activate_auto_renew=true`; before this flag existed, that was the app-side
-- signal used to send Robokassa checkout with `Recurring=true`.

update public.payments p
set recurring_mandate_activated = true
where p.status = 'completed'
  and p.recurring_mandate_activated = false
  and (
    coalesce(p.activate_auto_renew, false) = true
    or p.is_recurring = true
  );

-- Restore only plans that were very likely disabled by the immediately
-- preceding conservative migration. Older user/admin opt-outs keep
-- auto_renew=false, but they can be enabled again through the normal API now
-- that the parent payment has the mandate flag.
update public.company_plans cp
set auto_renew = true,
    updated_at = now()
where cp.auto_renew = false
  and cp.current_plan in ('starter', 'professional')
  and cp.robokassa_inv_id is not null
  and cp.updated_at >= now() - interval '2 hours'
  and exists (
    select 1
    from public.payments p
    where p.company_id = cp.company_id
      and p.inv_id::text = cp.robokassa_inv_id
      and p.status = 'completed'
      and p.recurring_mandate_activated = true
      and coalesce(p.activate_auto_renew, false) = true
  );
