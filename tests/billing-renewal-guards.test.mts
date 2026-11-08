import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveRecurringMandateInvId,
  isCompletedRecurringMandatePayment,
  selectRecurringRenewalAttemptAction,
} from "../lib/billing/recurring-renewals.ts";

test("skips a recurring renewal when an active attempt already exists for the renewal period", () => {
  const now = new Date("2026-05-02T12:00:00.000Z");
  const graceEnd = new Date("2026-05-05T00:00:00.000Z");

  for (const status of ["pending", "completed", "requires_review"] as const) {
    const decision = selectRecurringRenewalAttemptAction({
      attempts: [
        {
          status,
          created_at: "2026-05-01T08:00:00.000Z",
        },
      ],
      now,
      graceEnd,
      maxAttempts: 3,
    });

    assert.deepEqual(decision, { action: "skip", reason: "active_attempt_exists" });
  }
});

test("allows limited recurring renewal retries only after failed attempts are no longer same-day", () => {
  const now = new Date("2026-05-02T12:00:00.000Z");
  const graceEnd = new Date("2026-05-05T00:00:00.000Z");

  assert.deepEqual(
    selectRecurringRenewalAttemptAction({
      attempts: [
        {
          status: "failed",
          created_at: "2026-05-02T08:00:00.000Z",
        },
      ],
      now,
      graceEnd,
      maxAttempts: 3,
    }),
    { action: "skip", reason: "attempted_today" },
  );

  assert.deepEqual(
    selectRecurringRenewalAttemptAction({
      attempts: [
        {
          status: "failed",
          created_at: "2026-05-01T08:00:00.000Z",
        },
        {
          status: "failed",
          created_at: "2026-04-30T08:00:00.000Z",
        },
      ],
      now,
      graceEnd,
      maxAttempts: 3,
    }),
    { action: "create" },
  );
});

test("stops recurring renewal retries after the retry cap and disables after grace", () => {
  const attempts = [
    { status: "failed", created_at: "2026-05-01T08:00:00.000Z" },
    { status: "failed", created_at: "2026-04-30T08:00:00.000Z" },
    { status: "failed", created_at: "2026-04-29T08:00:00.000Z" },
  ];

  assert.deepEqual(
    selectRecurringRenewalAttemptAction({
      attempts,
      now: new Date("2026-05-02T12:00:00.000Z"),
      graceEnd: new Date("2026-05-05T00:00:00.000Z"),
      maxAttempts: 3,
    }),
    { action: "skip", reason: "attempt_limit_reached" },
  );

  assert.deepEqual(
    selectRecurringRenewalAttemptAction({
      attempts,
      now: new Date("2026-05-05T00:00:00.000Z"),
      graceEnd: new Date("2026-05-05T00:00:00.000Z"),
      maxAttempts: 3,
    }),
    { action: "disable_auto_renew", reason: "attempt_limit_reached" },
  );
});

test("accepts only a completed recurring-capable Robokassa parent payment as an auto-renew mandate", () => {
  assert.equal(
    isCompletedRecurringMandatePayment({
      status: "completed",
      recurring_mandate_activated: true,
    }),
    true,
  );

  assert.equal(
    isCompletedRecurringMandatePayment({
      status: "completed",
      recurring_mandate_activated: false,
    }),
    false,
  );

  assert.equal(
    isCompletedRecurringMandatePayment({
      status: "pending",
      recurring_mandate_activated: true,
    }),
    false,
  );

  assert.equal(isCompletedRecurringMandatePayment(null), false);
});

test("keeps using the root mandate invoice after a recurring child becomes the current invoice", () => {
  assert.equal(
    resolveRecurringMandateInvId({
      robokassa_inv_id: "101",
      recurring_mandate_inv_id: "100",
    }),
    100,
  );
});
