export const ACTIVE_RECURRING_RENEWAL_STATUSES = ["pending", "completed", "requires_review"] as const;

export type RecurringRenewalStatus =
  | "pending"
  | "completed"
  | "failed"
  | "refunded"
  | "requires_review";

export type RecurringRenewalAttempt = {
  status?: unknown;
  created_at?: unknown;
};

export type RecurringRenewalAttemptDecision =
  | { action: "create" }
  | {
      action: "skip" | "disable_auto_renew";
      reason: "active_attempt_exists" | "attempted_today" | "attempt_limit_reached";
    };

export type RecurringMandatePayment = {
  status?: unknown;
  recurring_mandate_activated?: unknown;
};

export type RecurringMandatePlan = {
  robokassa_inv_id?: unknown;
  recurring_mandate_inv_id?: unknown;
};

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function inSameUtcDay(aIso: unknown, b: Date): boolean {
  if (typeof aIso !== "string") return false;
  const a = new Date(aIso);
  if (!Number.isFinite(a.getTime())) return false;
  return utcDateKey(a) === utcDateKey(b);
}

export function isActiveRecurringRenewalStatus(status: unknown): boolean {
  return ACTIVE_RECURRING_RENEWAL_STATUSES.includes(status as (typeof ACTIVE_RECURRING_RENEWAL_STATUSES)[number]);
}

export function selectRecurringRenewalAttemptAction(input: {
  attempts: RecurringRenewalAttempt[];
  now: Date;
  graceEnd: Date;
  maxAttempts: number;
}): RecurringRenewalAttemptDecision {
  if (input.attempts.some((attempt) => isActiveRecurringRenewalStatus(attempt.status))) {
    return { action: "skip", reason: "active_attempt_exists" };
  }

  if (input.attempts.some((attempt) => inSameUtcDay(attempt.created_at, input.now))) {
    return { action: "skip", reason: "attempted_today" };
  }

  if (input.attempts.length >= input.maxAttempts) {
    if (input.now.getTime() >= input.graceEnd.getTime()) {
      return { action: "disable_auto_renew", reason: "attempt_limit_reached" };
    }
    return { action: "skip", reason: "attempt_limit_reached" };
  }

  return { action: "create" };
}

export function isCompletedRecurringMandatePayment(payment: RecurringMandatePayment | null | undefined): boolean {
  return payment?.status === "completed" && payment.recurring_mandate_activated === true;
}

export function resolveRecurringMandateInvId(plan: RecurringMandatePlan | null | undefined): number | null {
  const raw = plan?.recurring_mandate_inv_id ?? plan?.robokassa_inv_id;
  const value = Number(raw ?? NaN);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
