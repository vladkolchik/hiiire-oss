import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { isRobokassaRecurringEnabled } from "@/lib/billing/env";
import { isCompletedRecurringMandatePayment, resolveRecurringMandateInvId } from "@/lib/billing/recurring-renewals";
import { loadCompanyPlanSnapshot, resolveBillingStatus } from "@/lib/billing/subscription";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  enabled: z.boolean(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    if (ctx.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const bodyJson = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(bodyJson);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    }
    const { enabled } = parsed.data;

    const snapshot = await loadCompanyPlanSnapshot(admin, ctx.companyId);
    const currentPlan = snapshot.currentPlan;

    if (currentPlan !== "starter" && currentPlan !== "professional") {
      return NextResponse.json({ error: "PLAN_NOT_ELIGIBLE" }, { status: 409 });
    }

    if (enabled) {
      /* ── Re-enable auto-renew ── */
      if (!isRobokassaRecurringEnabled()) {
        return NextResponse.json({ error: "RECURRING_DISABLED" }, { status: 409 });
      }

      if (snapshot.autoRenew) {
        return NextResponse.json({ error: "ALREADY_ENABLED" }, { status: 409 });
      }

      const billingStatus = resolveBillingStatus(snapshot);
      if (billingStatus === "inactive") {
        return NextResponse.json({ error: "PLAN_EXPIRED" }, { status: 409 });
      }

      const { data: planRow } = await admin
        .from("company_plans")
        .select("robokassa_inv_id,recurring_mandate_inv_id")
        .eq("company_id", ctx.companyId)
        .maybeSingle();
      const parentInvId = resolveRecurringMandateInvId(planRow as { robokassa_inv_id?: unknown; recurring_mandate_inv_id?: unknown } | null);
      if (parentInvId === null) {
        return NextResponse.json({ error: "NO_RECURRING_PAYMENT" }, { status: 409 });
      }

      const { data: parentPayment, error: parentPaymentError } = await admin
        .from("payments")
        .select("id,status,recurring_mandate_activated")
        .eq("company_id", ctx.companyId)
        .eq("inv_id", parentInvId)
        .maybeSingle();
      if (parentPaymentError) {
        return NextResponse.json({ error: "PAYMENT_LOOKUP_FAILED" }, { status: 500 });
      }
      if (!isCompletedRecurringMandatePayment(parentPayment)) {
        return NextResponse.json({ error: "NO_RECURRING_PAYMENT" }, { status: 409 });
      }

      const { error: updateError } = await admin.rpc("set_company_plan_auto_renew", {
        p_company_id: ctx.companyId,
        p_enabled: true,
      });
      if (updateError) {
        return NextResponse.json({ error: "UPDATE_FAILED" }, { status: 500 });
      }
    } else {
      /* ── Disable auto-renew ── */
      if (!snapshot.autoRenew) {
        return NextResponse.json({ error: "ALREADY_DISABLED" }, { status: 409 });
      }

      const { error: updateError } = await admin.rpc("set_company_plan_auto_renew", {
        p_company_id: ctx.companyId,
        p_enabled: false,
      });
      if (updateError) {
        return NextResponse.json({ error: "UPDATE_FAILED" }, { status: 500 });
      }
    }

    const updated = await loadCompanyPlanSnapshot(admin, ctx.companyId);
    return NextResponse.json(
      {
        currentPlan: updated.currentPlan,
        autoRenew: updated.autoRenew,
        periodEnd: updated.periodEnd,
        scheduledPlan: updated.scheduledPlan,
        scheduledPlanEffectiveAt: updated.scheduledPlanEffectiveAt,
        scheduledChangePaid: Boolean(updated.scheduledPaymentId),
        billingStatus: resolveBillingStatus(updated),
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
