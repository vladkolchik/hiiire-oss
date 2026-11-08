-- Signup provisioning: company + profile + trial + credits
--
-- Goals:
-- - Enforce one trial per email (anti-abuse baseline)
-- - Auto-create company/profile on auth signup
-- - Auto-start trial (7 days) with intended_plan from signup metadata
-- - Grant 50 trial credits through credit_ledger (idempotent)

-- Ensure trial is a valid plan value.
alter table public.company_plans
  drop constraint if exists company_plans_current_plan_check;

alter table public.company_plans
  add constraint company_plans_current_plan_check
  check (current_plan in ('trial', 'starter', 'professional', 'enterprise'));

-- Idempotency guard for trial signup grants.
create unique index if not exists idx_credit_ledger_trial_signup_once
  on public.credit_ledger(reference_type, reference_id, reason)
  where reason = 'grant' and reference_type = 'trial_signup';

-- ============================================================================
-- NOTE: The handle_new_user() function body has been REMOVED from this file.
--
-- The CANONICAL definition lives in:
--   handle_new_user_platform_admin_company_member_v1.sql
-- which MUST be applied AFTER this file in migration order.
--
-- This file retains only schema changes (constraints, indexes). The trigger
-- is created in the canonical file.
-- ============================================================================
