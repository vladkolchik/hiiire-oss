import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(new URL("../app/api/billing/plan/route.ts", import.meta.url), "utf8");
const subscriptionSource = readFileSync(new URL("../lib/billing/subscription.ts", import.meta.url), "utf8");
const plansSource = readFileSync(new URL("../lib/billing/plans.ts", import.meta.url), "utf8");
const expiredImmediateFinalizeSql = readFileSync(
  new URL("../supabase/sql/billing_expired_immediate_checkout_finalize_review_v1.sql", import.meta.url),
  "utf8",
);
const scheduledDowngradeHardeningSql = readFileSync(
  new URL("../supabase/sql/billing_paid_scheduled_downgrade_hardening_v1.sql", import.meta.url),
  "utf8",
);
const recurringRootMandateSql = readFileSync(
  new URL("../supabase/sql/billing_recurring_root_mandate_invoice_v1.sql", import.meta.url),
  "utf8",
);
const billingPlanCreditLimitsSql = readFileSync(
  new URL("../supabase/sql/billing_plan_credit_limits_v1.sql", import.meta.url),
  "utf8",
);

test("billing plan API exposes trial display fields from one server timestamp", () => {
  assert.match(subscriptionSource, /resolveTrialDisplay/);
  assert.match(routeSource, /resolveTrialDisplay/);
  assert.match(routeSource, /const\s+now\s*=\s*Date\.now\(\)/);
  assert.match(routeSource, /resolveBillingStatus\(planSnapshot,\s*now\)/);
  assert.match(routeSource, /resolveTrialDisplay\(planSnapshot,\s*now\)/);
  assert.match(routeSource, /serverNow:\s*new Date\(now\)\.toISOString\(\)/);
  assert.match(routeSource, /trialDaysLeft:\s*trialDisplay\.trialDaysLeft/);
  assert.match(routeSource, /trialState:\s*trialDisplay\.trialState/);
});

test("paid plan credit grants match the current public tariff limits", () => {
  assert.match(plansSource, /starter:[\s\S]*creditsPerPeriod:\s*500/);
  assert.match(plansSource, /professional:[\s\S]*creditsPerPeriod:\s*2000/);
});

test("billing SQL grants paid plan credits with the current tariff limits", () => {
  for (const source of [expiredImmediateFinalizeSql, recurringRootMandateSql]) {
    assert.match(source, /when v_payment\.plan = 'starter' then 500/);
    assert.match(source, /when v_payment\.plan = 'professional' then 2000/);
    assert.doesNotMatch(source, /when v_payment\.plan = 'starter' then 300/);
    assert.doesNotMatch(source, /when v_payment\.plan = 'professional' then 1200/);
  }

  for (const source of [scheduledDowngradeHardeningSql, recurringRootMandateSql]) {
    assert.match(source, /when v_row\.payment_plan = 'starter' then 500/);
    assert.match(source, /when v_row\.payment_plan = 'professional' then 2000/);
    assert.doesNotMatch(source, /when v_row\.payment_plan = 'starter' then 300/);
    assert.doesNotMatch(source, /when v_row\.payment_plan = 'professional' then 1200/);
  }

  assert.match(billingPlanCreditLimitsSql, /when v_payment\.plan = 'starter' then 300[\s\S]*when v_payment\.plan = 'starter' then 500/);
  assert.match(
    billingPlanCreditLimitsSql,
    /when v_payment\.plan = 'professional' then 1200[\s\S]*when v_payment\.plan = 'professional' then 2000/,
  );
  assert.match(
    billingPlanCreditLimitsSql,
    /when v_row\.payment_plan = 'starter' then 300[\s\S]*when v_row\.payment_plan = 'starter' then 500/,
  );
  assert.match(
    billingPlanCreditLimitsSql,
    /when v_row\.payment_plan = 'professional' then 1200[\s\S]*when v_row\.payment_plan = 'professional' then 2000/,
  );
});
