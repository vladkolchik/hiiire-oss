import type { BillingStatus } from "@/lib/billing/subscription";
import type { BillablePlan, PlanKey } from "@/lib/billing/plans";

const PLAN_WEIGHT: Record<PlanKey, number> = {
  trial: 0,
  starter: 1,
  professional: 2,
  enterprise: 3,
};

export type CheckoutPeriodStartInput = {
  targetPlan: BillablePlan;
  currentPlan: PlanKey;
  billingStatus: BillingStatus;
  autoRenew: boolean;
  periodEnd: string | null;
  now: Date;
};

export type CheckoutPeriodStartResult = {
  periodStart: Date;
  isScheduledChange: boolean;
  kind:
    | "immediate"
    | "paid_scheduled_downgrade"
    | "unpaid_scheduled_downgrade"
    | "blocked_active_downgrade_missing_period_end"
    | "enterprise_change_requires_support";
};

function parseFutureDate(iso: string | null, now: Date): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  return date.getTime() > now.getTime() ? date : null;
}

export const CHECKOUT_REUSE_WINDOW_MS = 15 * 60 * 1000;

export type ImmediateCheckoutCandidate = {
  company_id?: unknown;
  plan?: unknown;
  amount?: unknown;
  currency?: unknown;
  status?: unknown;
  is_recurring?: unknown;
  activate_auto_renew?: unknown;
  scheduled_change_kind?: unknown;
  checkout_expires_at?: unknown;
  created_at?: unknown;
};

export type ImmediateCheckoutIntent = {
  companyId: string;
  plan: BillablePlan;
  amount: number;
  currency: string;
  activateAutoRenew: boolean;
  now: Date;
};

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function shouldReuseImmediateCheckout(
  candidate: ImmediateCheckoutCandidate | null | undefined,
  intent: ImmediateCheckoutIntent,
): boolean {
  if (!candidate) return false;
  if (candidate.company_id !== intent.companyId) return false;
  if (candidate.plan !== intent.plan) return false;
  if (Number(candidate.amount) !== intent.amount) return false;
  if (candidate.currency !== intent.currency) return false;
  if (candidate.status !== "pending") return false;
  if (candidate.is_recurring !== false) return false;
  if (candidate.scheduled_change_kind !== null) return false;
  if (Boolean(candidate.activate_auto_renew) !== intent.activateAutoRenew) return false;

  const expiresAt = parseDate(candidate.checkout_expires_at);
  if (!expiresAt || expiresAt.getTime() <= intent.now.getTime()) return false;

  const createdAt = parseDate(candidate.created_at);
  if (createdAt && intent.now.getTime() - createdAt.getTime() > CHECKOUT_REUSE_WINDOW_MS) {
    return false;
  }

  return true;
}

export function resolveCheckoutLifecycle(input: CheckoutPeriodStartInput): CheckoutPeriodStartResult {
  const isDowngrade = PLAN_WEIGHT[input.targetPlan] < PLAN_WEIGHT[input.currentPlan];
  const periodEnd = parseFutureDate(input.periodEnd, input.now);

  if (input.currentPlan === "enterprise") {
    return {
      periodStart: input.now,
      isScheduledChange: false,
      kind: "enterprise_change_requires_support",
    };
  }

  const isActiveProfessionalToStarterDowngradeBase = input.currentPlan === "professional"
    && input.targetPlan === "starter"
    && isDowngrade
    && input.billingStatus === "active";
  if (isActiveProfessionalToStarterDowngradeBase && periodEnd === null) {
    return {
      periodStart: input.now,
      isScheduledChange: false,
      kind: "blocked_active_downgrade_missing_period_end",
    };
  }

  const isActiveProfessionalToStarterDowngrade = input.currentPlan === "professional"
    && input.targetPlan === "starter"
    && isDowngrade
    && input.billingStatus === "active"
    && periodEnd !== null;

  if (isActiveProfessionalToStarterDowngrade && input.autoRenew) {
    return {
      periodStart: periodEnd,
      isScheduledChange: false,
      kind: "unpaid_scheduled_downgrade",
    };
  }

  const shouldSchedulePaidDowngrade = input.currentPlan === "professional"
    && input.targetPlan === "starter"
    && isDowngrade
    && input.billingStatus === "active"
    && !input.autoRenew
    && periodEnd !== null;

  if (shouldSchedulePaidDowngrade) {
    return {
      periodStart: periodEnd,
      isScheduledChange: true,
      kind: "paid_scheduled_downgrade",
    };
  }

  return {
    periodStart: input.now,
    isScheduledChange: false,
    kind: "immediate",
  };
}

export const resolveCheckoutPeriodStart = resolveCheckoutLifecycle;

export type ImmediateFinalizePayment = {
  plan: BillablePlan;
  checkout_expires_at?: unknown;
  scheduled_change_kind?: unknown;
  is_recurring?: unknown;
};

export type ImmediateFinalizeCompanyPlan = {
  current_plan?: unknown;
  period_end?: unknown;
};

export type ImmediateFinalizePolicy =
  | {
      action: "complete";
      periodStart: Date;
      periodEnd: Date;
    }
  | {
      action: "requires_review";
      reason: "CHECKOUT_EXPIRED" | "ACTIVE_DOWNGRADE_REQUIRES_REVIEW" | "ENTERPRISE_REQUIRES_REVIEW";
    };

function addCalendarMonth(from: Date): Date {
  const next = new Date(from.getTime());
  next.setMonth(next.getMonth() + 1);
  return next;
}

export function resolveImmediateFinalizePolicy(input: {
  payment: ImmediateFinalizePayment;
  companyPlan: ImmediateFinalizeCompanyPlan | null;
  completedAt: Date;
}): ImmediateFinalizePolicy {
  const expiresAt = parseDate(input.payment.checkout_expires_at);
  if (expiresAt && input.completedAt.getTime() > expiresAt.getTime()) {
    return { action: "requires_review", reason: "CHECKOUT_EXPIRED" };
  }

  const currentPlan = input.companyPlan?.current_plan;
  if (currentPlan === "enterprise") {
    return { action: "requires_review", reason: "ENTERPRISE_REQUIRES_REVIEW" };
  }

  const isActiveProfessionalDowngrade = currentPlan === "professional"
    && input.payment.plan === "starter"
    && parseFutureDate(
      typeof input.companyPlan?.period_end === "string" ? input.companyPlan.period_end : null,
      input.completedAt,
    ) !== null;
  if (isActiveProfessionalDowngrade) {
    return { action: "requires_review", reason: "ACTIVE_DOWNGRADE_REQUIRES_REVIEW" };
  }

  return {
    action: "complete",
    periodStart: input.completedAt,
    periodEnd: addCalendarMonth(input.completedAt),
  };
}
