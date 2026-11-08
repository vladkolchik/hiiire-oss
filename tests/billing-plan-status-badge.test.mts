import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getCurrentPlanStatusBadge, getPaidPlanButtonLabel, isMatchingScheduledPlan } from "../lib/billing/status-display.ts";

const settingsPage = readFileSync(
  new URL("../app/(dashboard)/dashboard/settings/page.tsx", import.meta.url),
  "utf8",
);

test("current plan status badge mirrors paid subscription state", () => {
  assert.deepEqual(getCurrentPlanStatusBadge("active"), {
    label: "Активен",
    className: "shrink-0 bg-primary text-primary-foreground",
  });
  assert.deepEqual(getCurrentPlanStatusBadge("grace"), {
    label: "Ожидает оплату",
    className: "shrink-0 border-amber-500 bg-amber-50 text-amber-700",
  });
  assert.deepEqual(getCurrentPlanStatusBadge("inactive"), {
    label: "Не активен",
    className: "shrink-0 border-destructive/50 bg-destructive/10 text-destructive",
  });
});

test("enterprise exit request labels the target paid plan instead of offering another request", () => {
  assert.equal(
    getPaidPlanButtonLabel({
      targetPlan: "starter",
      currentPlan: "enterprise",
      billingStatus: "active",
      userRole: "admin",
      checkoutLoadingPlan: null,
      activePlanChangeRequestTargetPlan: "starter",
    }),
    "Уже есть заявка",
  );
  assert.equal(
    getPaidPlanButtonLabel({
      targetPlan: "professional",
      currentPlan: "enterprise",
      billingStatus: "active",
      userRole: "admin",
      checkoutLoadingPlan: null,
      activePlanChangeRequestTargetPlan: "starter",
    }),
    "Заявка в работе",
  );
  assert.equal(
    getPaidPlanButtonLabel({
      targetPlan: "professional",
      currentPlan: "enterprise",
      billingStatus: "active",
      userRole: "admin",
      checkoutLoadingPlan: null,
      activePlanChangeRequestTargetPlan: null,
    }),
    "Оставить заявку",
  );
});

test("detects an already scheduled downgrade only when plan and date match", () => {
  assert.equal(
    isMatchingScheduledPlan({
      targetPlan: "starter",
      scheduledPlan: "starter",
      scheduledPlanEffectiveAt: "2026-07-01T00:00:00.000Z",
      expectedEffectiveAt: "2026-07-01T00:00:00.000Z",
    }),
    true,
  );
  assert.equal(
    isMatchingScheduledPlan({
      targetPlan: "starter",
      scheduledPlan: "starter",
      scheduledPlanEffectiveAt: "2026-07-01T00:00:00.000Z",
      expectedEffectiveAt: "2026-08-01T00:00:00.000Z",
    }),
    false,
  );
  assert.equal(
    isMatchingScheduledPlan({
      targetPlan: "professional",
      scheduledPlan: "starter",
      scheduledPlanEffectiveAt: "2026-07-01T00:00:00.000Z",
      expectedEffectiveAt: "2026-07-01T00:00:00.000Z",
    }),
    false,
  );
});

test("settings plan cards render the dynamic status badge for the current paid plan", () => {
  assert.match(settingsPage, /getCurrentPlanStatusBadge\(billingStatus\)/);
  assert.match(settingsPage, /currentPlanStatusBadge\.label/);
  assert.match(settingsPage, /getPaidPlanButtonLabel/);
  assert.match(settingsPage, /Понижение уже запланировано/);
  assert.match(settingsPage, /isMatchingScheduledPlan/);
  assert.match(settingsPage, /activePlanChangeRequestTargetPlan/);
  assert.doesNotMatch(settingsPage, /currentPlan === "starter" \? \([\s\S]{0,180}>Активен<\/Badge>/);
  assert.doesNotMatch(settingsPage, /currentPlan === "professional" \? \([\s\S]{0,180}>Активен<\/Badge>/);
  assert.doesNotMatch(settingsPage, /currentPlan === "enterprise" \? \([\s\S]{0,180}>Активен<\/Badge>/);
  assert.doesNotMatch(settingsPage, /activePlanChangeRequest \? \([\s\S]{0,120}Уже есть заявка/);
});
