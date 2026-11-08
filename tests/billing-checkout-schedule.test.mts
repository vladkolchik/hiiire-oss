import assert from "node:assert/strict";
import test from "node:test";

import {
  CHECKOUT_REUSE_WINDOW_MS,
  resolveCheckoutLifecycle,
  resolveImmediateFinalizePolicy,
  shouldReuseImmediateCheckout,
} from "../lib/billing/checkout-schedule.ts";

test("starts a paid Professional to Starter downgrade after the current paid period when auto-renew is off", () => {
  const now = new Date("2026-04-29T10:00:00.000Z");
  const periodEnd = "2026-05-12T00:00:00.000Z";

  const result = resolveCheckoutLifecycle({
    targetPlan: "starter",
    currentPlan: "professional",
    billingStatus: "active",
    autoRenew: false,
    periodEnd,
    now,
  });

  assert.equal(result.isScheduledChange, true);
  assert.equal(result.periodStart.toISOString(), periodEnd);
});

test("starts an upgrade immediately", () => {
  const now = new Date("2026-04-29T10:00:00.000Z");

  const result = resolveCheckoutLifecycle({
    targetPlan: "professional",
    currentPlan: "starter",
    billingStatus: "active",
    autoRenew: false,
    periodEnd: "2026-05-12T00:00:00.000Z",
    now,
  });

  assert.equal(result.isScheduledChange, false);
  assert.equal(result.periodStart.toISOString(), now.toISOString());
});

test("reuses an immediate checkout only while the explicit checkout TTL is open", () => {
  const now = new Date("2026-04-29T10:00:00.000Z");
  const candidate = {
    id: "payment-1",
    company_id: "company-1",
    plan: "starter",
    amount: 499000,
    currency: "RUB",
    is_recurring: false,
    activate_auto_renew: true,
    scheduled_change_kind: null,
    status: "pending",
    checkout_expires_at: new Date(now.getTime() + CHECKOUT_REUSE_WINDOW_MS).toISOString(),
  };

  assert.equal(
    shouldReuseImmediateCheckout(candidate, {
      companyId: "company-1",
      plan: "starter",
      amount: 499000,
      currency: "RUB",
      activateAutoRenew: true,
      now,
    }),
    true,
  );

  assert.equal(
    shouldReuseImmediateCheckout(
      { ...candidate, checkout_expires_at: now.toISOString() },
      {
        companyId: "company-1",
        plan: "starter",
        amount: 499000,
        currency: "RUB",
        activateAutoRenew: true,
        now,
      },
    ),
    false,
  );
});

test("does not reuse legacy immediate pending invoices without explicit checkout expiry", () => {
  const now = new Date("2026-04-29T10:00:00.000Z");

  assert.equal(
    shouldReuseImmediateCheckout(
      {
        id: "legacy-payment",
        company_id: "company-1",
        plan: "starter",
        amount: 499000,
        currency: "RUB",
        is_recurring: false,
        activate_auto_renew: true,
        scheduled_change_kind: null,
        status: "pending",
        checkout_expires_at: null,
      },
      {
        companyId: "company-1",
        plan: "starter",
        amount: 499000,
        currency: "RUB",
        activateAutoRenew: true,
        now,
      },
    ),
    false,
  );
});

test("classifies active Professional to Starter checkout as scheduled, never immediate", () => {
  const now = new Date("2026-04-29T10:00:00.000Z");
  const periodEnd = "2026-05-12T00:00:00.000Z";

  const autoRenewOn = resolveCheckoutLifecycle({
    targetPlan: "starter",
    currentPlan: "professional",
    billingStatus: "active",
    autoRenew: true,
    periodEnd,
    now,
  });

  assert.equal(autoRenewOn.kind, "unpaid_scheduled_downgrade");
  assert.equal(autoRenewOn.isScheduledChange, false);

  const autoRenewOff = resolveCheckoutLifecycle({
    targetPlan: "starter",
    currentPlan: "professional",
    billingStatus: "active",
    autoRenew: false,
    periodEnd,
    now,
  });

  assert.equal(autoRenewOff.kind, "paid_scheduled_downgrade");
  assert.equal(autoRenewOff.isScheduledChange, true);
  assert.equal(autoRenewOff.periodStart.toISOString(), periodEnd);
});

test("blocks active Professional to Starter checkout when the active legacy period has no end date", () => {
  const now = new Date("2026-04-29T10:00:00.000Z");

  const result = resolveCheckoutLifecycle({
    targetPlan: "starter",
    currentPlan: "professional",
    billingStatus: "active",
    autoRenew: true,
    periodEnd: null,
    now,
  });

  assert.equal(result.kind, "blocked_active_downgrade_missing_period_end");
  assert.equal(result.isScheduledChange, false);
  assert.equal(result.periodStart.toISOString(), now.toISOString());
});

test("blocks self-service checkout from Enterprise to paid plans", () => {
  const now = new Date("2026-04-29T10:00:00.000Z");

  for (const targetPlan of ["starter", "professional"] as const) {
    const result = resolveCheckoutLifecycle({
      targetPlan,
      currentPlan: "enterprise",
      billingStatus: "active",
      autoRenew: false,
      periodEnd: null,
      now,
    });

    assert.equal(result.kind, "enterprise_change_requires_support");
    assert.equal(result.isScheduledChange, false);
    assert.equal(result.periodStart.toISOString(), now.toISOString());
  }
});

test("finalizes a timely immediate checkout from completion time", () => {
  const completedAt = new Date("2026-04-29T10:10:00.000Z");

  const policy = resolveImmediateFinalizePolicy({
    payment: {
      plan: "starter",
      checkout_expires_at: "2026-04-29T10:15:00.000Z",
      scheduled_change_kind: null,
      is_recurring: false,
    },
    companyPlan: {
      current_plan: "trial",
      period_end: "2026-04-01T00:00:00.000Z",
    },
    completedAt,
  });

  assert.equal(policy.action, "complete");
  assert.equal(policy.periodStart.toISOString(), completedAt.toISOString());
  assert.equal(policy.periodEnd.toISOString(), "2026-05-29T10:10:00.000Z");
});

test("sends late or conflicting immediate checkout to manual review", () => {
  const late = resolveImmediateFinalizePolicy({
    payment: {
      plan: "starter",
      checkout_expires_at: "2026-04-29T10:15:00.000Z",
      scheduled_change_kind: null,
      is_recurring: false,
    },
    companyPlan: {
      current_plan: "trial",
      period_end: null,
    },
    completedAt: new Date("2026-04-29T10:16:00.000Z"),
  });

  assert.equal(late.action, "requires_review");
  assert.equal(late.reason, "CHECKOUT_EXPIRED");

  const conflictingDowngrade = resolveImmediateFinalizePolicy({
    payment: {
      plan: "starter",
      checkout_expires_at: "2026-04-29T10:30:00.000Z",
      scheduled_change_kind: null,
      is_recurring: false,
    },
    companyPlan: {
      current_plan: "professional",
      period_end: "2026-05-12T00:00:00.000Z",
    },
    completedAt: new Date("2026-04-29T10:16:00.000Z"),
  });

  assert.equal(conflictingDowngrade.action, "requires_review");
  assert.equal(conflictingDowngrade.reason, "ACTIVE_DOWNGRADE_REQUIRES_REVIEW");
});
