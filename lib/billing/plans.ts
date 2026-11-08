import "server-only";

export type BillablePlan = "starter" | "professional";
export type PlanKey = "trial" | "starter" | "professional" | "enterprise";

export type BillingPlanConfig = {
  key: BillablePlan;
  label: string;
  amountKopecks: number;
  creditsPerPeriod: number;
};

const BILLING_PLANS: Record<BillablePlan, BillingPlanConfig> = {
  starter: {
    key: "starter",
    label: "Starter",
    amountKopecks: 4990 * 100,
    creditsPerPeriod: 500,
  },
  professional: {
    key: "professional",
    label: "Professional",
    amountKopecks: 9990 * 100,
    creditsPerPeriod: 2000,
  },
};

export function isBillablePlan(value: string): value is BillablePlan {
  return value === "starter" || value === "professional";
}

export function getBillingPlan(plan: BillablePlan): BillingPlanConfig {
  return BILLING_PLANS[plan];
}

export function formatOutSum(amountKopecks: number): string {
  return (amountKopecks / 100).toFixed(2);
}

export function parseOutSumToKopecks(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,6})?$/.test(normalized)) return null;

  const [intPart, fracPartRaw = ""] = normalized.split(".");
  const intValue = Number(intPart);
  if (!Number.isSafeInteger(intValue) || intValue < 0) return null;

  const fracPart = fracPartRaw.padEnd(2, "0").slice(0, 2);
  const fracValue = Number(fracPart);
  if (!Number.isSafeInteger(fracValue) || fracValue < 0 || fracValue > 99) return null;

  const kopecks = intValue * 100 + fracValue;
  return Number.isSafeInteger(kopecks) ? kopecks : null;
}

export function addCalendarMonth(from: Date): Date {
  const next = new Date(from.getTime());
  next.setMonth(next.getMonth() + 1);
  return next;
}
