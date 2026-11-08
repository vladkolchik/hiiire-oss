import assert from "node:assert/strict";
import test from "node:test";

import {
  getGraceDaysLeft,
  isAiAllowed,
  resolveBillingStatus,
  resolveTrialDisplay,
  type CompanyPlanSnapshot,
} from "../lib/billing/subscription-status.ts";

const NOW = Date.parse("2026-05-02T12:00:00.000Z");

function snapshot(overrides: Partial<CompanyPlanSnapshot>): CompanyPlanSnapshot {
  return {
    currentPlan: "starter",
    trialExpiresAt: null,
    periodStart: null,
    periodEnd: "2026-05-12T12:00:00.000Z",
    autoRenew: true,
    scheduledPlan: null,
    scheduledPlanEffectiveAt: null,
    scheduledPaymentId: null,
    ...overrides,
  };
}

test("paid plans without period end are inactive and cannot use AI", () => {
  const starter = snapshot({ currentPlan: "starter", periodEnd: null, autoRenew: true });
  const professional = snapshot({ currentPlan: "professional", periodEnd: null, autoRenew: true });

  assert.equal(resolveBillingStatus(starter, NOW), "inactive");
  assert.equal(resolveBillingStatus(professional, NOW), "inactive");
  assert.equal(isAiAllowed(starter, NOW), false);
  assert.equal(isAiAllowed(professional, NOW), false);
  assert.equal(getGraceDaysLeft(starter, NOW), null);
});

test("trial and enterprise billing semantics stay unchanged", () => {
  assert.equal(
    resolveBillingStatus(snapshot({ currentPlan: "trial", trialExpiresAt: "2026-05-03T12:00:00.000Z", periodEnd: null }), NOW),
    "active",
  );
  assert.equal(
    resolveBillingStatus(snapshot({ currentPlan: "trial", trialExpiresAt: "2026-05-01T12:00:00.000Z", periodEnd: null }), NOW),
    "inactive",
  );
  assert.equal(resolveBillingStatus(snapshot({ currentPlan: "enterprise", periodEnd: null }), NOW), "active");
});

test("paid plan grace still depends on auto renew and current period end", () => {
  const expiredWithAutoRenew = snapshot({
    currentPlan: "professional",
    periodEnd: "2026-05-01T12:00:00.000Z",
    autoRenew: true,
  });
  const expiredWithoutAutoRenew = snapshot({
    currentPlan: "professional",
    periodEnd: "2026-05-01T12:00:00.000Z",
    autoRenew: false,
  });

  assert.equal(resolveBillingStatus(expiredWithAutoRenew, NOW), "grace");
  assert.equal(getGraceDaysLeft(expiredWithAutoRenew, NOW), 2);
  assert.equal(isAiAllowed(expiredWithAutoRenew, NOW), true);
  assert.equal(resolveBillingStatus(expiredWithoutAutoRenew, NOW), "inactive");
});

test("trial display state uses the provided server timestamp", () => {
  const expiresAt = "2026-05-03T12:00:00.000Z";

  assert.deepEqual(
    resolveTrialDisplay(
      snapshot({ currentPlan: "trial", trialExpiresAt: expiresAt, periodEnd: null }),
      Date.parse("2026-04-29T12:00:00.000Z")
    ),
    { trialDaysLeft: 4, trialState: "active" }
  );
  assert.deepEqual(
    resolveTrialDisplay(
      snapshot({ currentPlan: "trial", trialExpiresAt: expiresAt, periodEnd: null }),
      Date.parse("2026-05-01T12:00:00.000Z")
    ),
    { trialDaysLeft: 2, trialState: "expiring" }
  );
  assert.deepEqual(
    resolveTrialDisplay(
      snapshot({ currentPlan: "trial", trialExpiresAt: expiresAt, periodEnd: null }),
      Date.parse("2026-05-02T18:00:00.000Z")
    ),
    { trialDaysLeft: 1, trialState: "expiring" }
  );
  assert.deepEqual(
    resolveTrialDisplay(
      snapshot({ currentPlan: "trial", trialExpiresAt: expiresAt, periodEnd: null }),
      Date.parse("2026-05-03T12:00:01.000Z")
    ),
    { trialDaysLeft: 0, trialState: "expired" }
  );
  assert.deepEqual(
    resolveTrialDisplay(
      snapshot({ currentPlan: "starter", trialExpiresAt: expiresAt }),
      Date.parse("2026-05-01T12:00:00.000Z")
    ),
    { trialDaysLeft: null, trialState: "hidden" }
  );
});
