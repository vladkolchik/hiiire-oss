-- Backfill for fallback mode when Robokassa recurring service is not enabled.
-- Safe to run multiple times.

update public.company_plans
set auto_renew = false,
    updated_at = now()
where auto_renew = true
  and current_plan in ('starter', 'professional');

-- Post-check:
-- select current_plan, auto_renew, count(*)
-- from public.company_plans
-- where current_plan in ('starter', 'professional')
-- group by current_plan, auto_renew
-- order by current_plan, auto_renew;
