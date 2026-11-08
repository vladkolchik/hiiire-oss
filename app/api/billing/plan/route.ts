import { NextResponse } from "next/server";

import {
  loadCompanyPlanSnapshot,
  resolveBillingStatus,
  resolveTrialDisplay,
  type BillingStatus,
} from "@/lib/billing/subscription";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCompanyContext } from "@/lib/access/company-guards";

type PlanKey = "trial" | "starter" | "professional" | "enterprise";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const planSnapshot = await loadCompanyPlanSnapshot(admin, ctx.companyId);
    const currentPlan = planSnapshot.currentPlan as PlanKey;
    const now = Date.now();
    const billingStatus = resolveBillingStatus(planSnapshot, now) as BillingStatus;
    const trialDisplay = resolveTrialDisplay(planSnapshot, now);

    const { data: intendedRow, error: intendedErr } = await admin
      .from("company_plans")
      .select("intended_plan")
      .eq("company_id", ctx.companyId)
      .maybeSingle();
    if (intendedErr) return NextResponse.json({ error: "PLAN_LOOKUP_FAILED" }, { status: 500 });

    return NextResponse.json(
        {
          currentPlan,
          trialExpiresAt: planSnapshot.trialExpiresAt,
          intendedPlan: (intendedRow as { intended_plan?: string | null } | null)?.intended_plan ?? null,
          periodStart: planSnapshot.periodStart,
          periodEnd: planSnapshot.periodEnd,
          autoRenew: planSnapshot.autoRenew,
          scheduledPlan: planSnapshot.scheduledPlan,
          scheduledPlanEffectiveAt: planSnapshot.scheduledPlanEffectiveAt,
          scheduledChangePaid: Boolean(planSnapshot.scheduledPaymentId),
          billingStatus,
          serverNow: new Date(now).toISOString(),
          trialDaysLeft: trialDisplay.trialDaysLeft,
          trialState: trialDisplay.trialState,
        },
        { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
