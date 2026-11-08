import "server-only";

import type { CompanyPlanSnapshot } from "@/lib/billing/subscription-status";

export {
  BILLING_GRACE_DAYS,
  getGraceDaysLeft,
  getTrialDaysLeft,
  isAiAllowed,
  resolveBillingStatus,
  resolveTrialDisplay,
  type BillingStatus,
  type CompanyPlanSnapshot,
  type TrialState,
} from "@/lib/billing/subscription-status";

export async function activateDueScheduledPlanPayments(admin: any, companyId?: string): Promise<number> {
  if (typeof admin?.rpc !== "function") return 0;

  const args: { p_now: string; p_company_id?: string } = {
    p_now: new Date().toISOString(),
  };
  if (companyId) args.p_company_id = companyId;

  const { data, error } = await admin.rpc("activate_due_scheduled_plan_payments", args);
  if (error) {
    throw error;
  }
  return Array.isArray(data) ? data.length : 0;
}

export async function loadCompanyPlanSnapshot(admin: any, companyId: string): Promise<CompanyPlanSnapshot> {
  await activateDueScheduledPlanPayments(admin, companyId);

  const { data: row, error } = await admin
    .from("company_plans")
    .select("current_plan,trial_expires_at,period_start,period_end,auto_renew,scheduled_plan,scheduled_plan_effective_at,scheduled_payment_id")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) {
    throw error;
  }

  const currentPlan = (() => {
    const raw = String((row as { current_plan?: unknown } | null)?.current_plan ?? "starter");
    if (raw === "trial" || raw === "starter" || raw === "professional" || raw === "enterprise") return raw;
    return "starter";
  })();

  return {
    currentPlan,
    trialExpiresAt: (row as { trial_expires_at?: string | null } | null)?.trial_expires_at ?? null,
    periodStart: (row as { period_start?: string | null } | null)?.period_start ?? null,
    periodEnd: (row as { period_end?: string | null } | null)?.period_end ?? null,
    autoRenew: Boolean((row as { auto_renew?: boolean | null } | null)?.auto_renew ?? true),
    scheduledPlan: (() => {
      const raw = String((row as { scheduled_plan?: unknown } | null)?.scheduled_plan ?? "");
      if (raw === "trial" || raw === "starter" || raw === "professional" || raw === "enterprise") return raw;
      return null;
    })(),
    scheduledPlanEffectiveAt: (row as { scheduled_plan_effective_at?: string | null } | null)?.scheduled_plan_effective_at ?? null,
    scheduledPaymentId: (row as { scheduled_payment_id?: string | null } | null)?.scheduled_payment_id ?? null,
  };
}
