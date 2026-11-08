import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { captureBusinessEvent } from "@/lib/analytics/business-events";
import type { PlanKey } from "@/lib/billing/plans";
import { loadCompanyPlanSnapshot } from "@/lib/billing/subscription";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  toPlan: z.enum(["starter", "professional"]),
});

const PLAN_WEIGHT: Record<PlanKey, number> = {
  trial: 0,
  starter: 1,
  professional: 2,
  enterprise: 3,
};

function isDowngrade(from: PlanKey, to: PlanKey): boolean {
  return PLAN_WEIGHT[to] < PLAN_WEIGHT[from];
}

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
    const toPlan = parsed.data.toPlan;

    const snapshot = await loadCompanyPlanSnapshot(admin, ctx.companyId);
    const currentPlan = snapshot.currentPlan;
    if (snapshot.scheduledPaymentId) {
      return NextResponse.json({ error: "PAID_SCHEDULE_EXISTS" }, { status: 409 });
    }
    if (!isDowngrade(currentPlan, toPlan)) {
      return NextResponse.json({ error: "NOT_DOWNGRADE" }, { status: 400 });
    }

    const canSchedule = currentPlan === "professional"
      && toPlan === "starter"
      && snapshot.autoRenew
      && typeof snapshot.periodEnd === "string"
      && snapshot.periodEnd.length > 0;
    if (!canSchedule) {
      return NextResponse.json({ error: "SCHEDULE_NOT_AVAILABLE" }, { status: 409 });
    }

    const effectiveAt = snapshot.periodEnd as string;

    const { error: updateError } = await admin
      .from("company_plans")
      .update({
        scheduled_plan: toPlan,
        scheduled_plan_effective_at: effectiveAt,
        scheduled_payment_id: null,
      })
      .eq("company_id", ctx.companyId);
    if (updateError) {
      return NextResponse.json({ error: "SCHEDULE_UPDATE_FAILED" }, { status: 500 });
    }

    await captureBusinessEvent({
      event: "downgrade_scheduled",
      userId: ctx.userId,
      companyId: ctx.companyId,
      role: ctx.role,
      properties: {
        from_plan: currentPlan,
        to_plan: toPlan,
        scheduled_change: true,
      },
    });

    return NextResponse.json(
      {
        currentPlan,
        autoRenew: snapshot.autoRenew,
        periodEnd: snapshot.periodEnd,
        scheduledPlan: toPlan,
        scheduledPlanEffectiveAt: effectiveAt,
        scheduledChangePaid: false,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    if (ctx.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const snapshotBeforeClear = await loadCompanyPlanSnapshot(admin, ctx.companyId);
    if (snapshotBeforeClear.scheduledPaymentId) {
      return NextResponse.json({ error: "PAID_SCHEDULE_CANNOT_CANCEL" }, { status: 409 });
    }

    const { error: updateError } = await admin
      .from("company_plans")
      .update({
        scheduled_plan: null,
        scheduled_plan_effective_at: null,
        scheduled_payment_id: null,
      })
      .eq("company_id", ctx.companyId);
    if (updateError) {
      return NextResponse.json({ error: "SCHEDULE_CLEAR_FAILED" }, { status: 500 });
    }

    const snapshot = await loadCompanyPlanSnapshot(admin, ctx.companyId);
    return NextResponse.json(
      {
        currentPlan: snapshot.currentPlan,
        autoRenew: snapshot.autoRenew,
        periodEnd: snapshot.periodEnd,
        scheduledPlan: snapshot.scheduledPlan,
        scheduledPlanEffectiveAt: snapshot.scheduledPlanEffectiveAt,
        scheduledChangePaid: Boolean(snapshot.scheduledPaymentId),
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
