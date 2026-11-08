import type { PlanKey } from "@/lib/billing/plans";

export type BillingStatus = "active" | "grace" | "inactive";
export type TrialState = "hidden" | "active" | "expiring" | "expired";

export const BILLING_GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CompanyPlanSnapshot = {
  currentPlan: PlanKey;
  trialExpiresAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  autoRenew: boolean;
  scheduledPlan: PlanKey | null;
  scheduledPlanEffectiveAt: string | null;
  scheduledPaymentId: string | null;
};

function toMs(iso: string | null): number | null {
  if (!iso) return null;
  const parsed = new Date(iso).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveBillingStatus(snapshot: CompanyPlanSnapshot, nowMs = Date.now()): BillingStatus {
  if (snapshot.currentPlan === "enterprise") return "active";

  if (snapshot.currentPlan === "trial") {
    const trialExpiresAtMs = toMs(snapshot.trialExpiresAt);
    if (trialExpiresAtMs === null) return "inactive";
    return nowMs <= trialExpiresAtMs ? "active" : "inactive";
  }

  const periodEndMs = toMs(snapshot.periodEnd);
  if (periodEndMs === null) return "inactive";
  if (nowMs <= periodEndMs) return "active";

  const graceEndMs = periodEndMs + BILLING_GRACE_DAYS * DAY_MS;
  if (snapshot.autoRenew && nowMs <= graceEndMs) return "grace";

  return "inactive";
}

export function getGraceDaysLeft(snapshot: CompanyPlanSnapshot, nowMs = Date.now()): number | null {
  const status = resolveBillingStatus(snapshot, nowMs);
  if (status !== "grace") return null;

  const periodEndMs = toMs(snapshot.periodEnd);
  if (periodEndMs === null) return null;

  const graceEndMs = periodEndMs + BILLING_GRACE_DAYS * DAY_MS;
  return Math.max(0, Math.ceil((graceEndMs - nowMs) / DAY_MS));
}

export function getTrialDaysLeft(snapshot: CompanyPlanSnapshot, nowMs = Date.now()): number | null {
  if (snapshot.currentPlan !== "trial") return null;

  const trialExpiresAtMs = toMs(snapshot.trialExpiresAt);
  if (trialExpiresAtMs === null) return null;

  return Math.max(0, Math.ceil((trialExpiresAtMs - nowMs) / DAY_MS));
}

export function resolveTrialDisplay(
  snapshot: CompanyPlanSnapshot,
  nowMs = Date.now()
): { trialDaysLeft: number | null; trialState: TrialState } {
  const trialDaysLeft = getTrialDaysLeft(snapshot, nowMs);
  if (trialDaysLeft === null) return { trialDaysLeft: null, trialState: "hidden" };
  if (trialDaysLeft === 0) return { trialDaysLeft, trialState: "expired" };
  if (trialDaysLeft <= 3) return { trialDaysLeft, trialState: "expiring" };
  return { trialDaysLeft, trialState: "active" };
}

export function isAiAllowed(snapshot: CompanyPlanSnapshot, nowMs = Date.now()): boolean {
  const status = resolveBillingStatus(snapshot, nowMs);
  return status === "active" || status === "grace";
}
