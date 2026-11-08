import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/admin/platform-guard";
import { ACTIVE_PLAN_CHANGE_REQUEST_STATUSES } from "@/lib/billing/enterprise-billing";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateAdminPlanChangeRequestSchema = z.object({
  companyId: z.string().uuid(),
  targetPlan: z.enum(["starter", "professional"]),
  userMessage: z.string().trim().max(4000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user, isPlatformAdmin } = await requirePlatformAdmin();
    if (!isPlatformAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const body = await req.json().catch(() => null);
    const parsed = CreateAdminPlanChangeRequestSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

    const admin = getSupabaseAdminClient() as any;
    const { data: activeAgreement, error: agreementError } = await admin
      .from("enterprise_agreements")
      .select("id,company_id,status")
      .eq("company_id", parsed.data.companyId)
      .eq("status", "active")
      .maybeSingle();

    if (agreementError) return NextResponse.json({ error: "ACTIVE_AGREEMENT_LOOKUP_FAILED" }, { status: 500 });
    if (!activeAgreement) {
      return NextResponse.json({ error: "ACTIVE_ENTERPRISE_AGREEMENT_NOT_FOUND" }, { status: 409 });
    }

    const { data: companyPlan, error: companyPlanError } = await admin
      .from("company_plans")
      .select("company_id,current_plan")
      .eq("company_id", parsed.data.companyId)
      .eq("current_plan", "enterprise")
      .maybeSingle();

    if (companyPlanError) return NextResponse.json({ error: "COMPANY_PLAN_LOOKUP_FAILED" }, { status: 500 });
    if (!companyPlan) return NextResponse.json({ error: "COMPANY_PLAN_ENTERPRISE_REQUIRED" }, { status: 409 });

    const { data: activeRequest, error: activeRequestError } = await admin
      .from("billing_plan_change_requests")
      .select("*")
      .eq("company_id", parsed.data.companyId)
      .in("status", ACTIVE_PLAN_CHANGE_REQUEST_STATUSES)
      .maybeSingle();

    if (activeRequestError) return NextResponse.json({ error: "ACTIVE_REQUEST_LOOKUP_FAILED" }, { status: 500 });
    if (activeRequest) {
      return NextResponse.json({ error: "ACTIVE_REQUEST_EXISTS", request: activeRequest }, { status: 409 });
    }

    const { data: request, error: insertError } = await admin
      .from("billing_plan_change_requests")
      .insert({
        company_id: parsed.data.companyId,
        requested_by: user.id,
        current_plan: "enterprise",
        target_plan: parsed.data.targetPlan,
        request_kind: "enterprise_exit",
        source: "admin",
        status: "submitted",
        user_message: parsed.data.userMessage?.trim() || null,
      })
      .select("*")
      .single();

    if (insertError?.code === "23505") {
      const { data: existing, error: existingError } = await admin
        .from("billing_plan_change_requests")
        .select("*")
        .eq("company_id", parsed.data.companyId)
        .in("status", ACTIVE_PLAN_CHANGE_REQUEST_STATUSES)
        .maybeSingle();

      if (existingError || !existing) {
        return NextResponse.json({ error: "ACTIVE_REQUEST_RELOAD_FAILED" }, { status: 500 });
      }

      return NextResponse.json({ error: "ACTIVE_REQUEST_EXISTS", request: existing }, { status: 409 });
    }

    if (insertError) return NextResponse.json({ error: "REQUEST_CREATE_FAILED" }, { status: 500 });
    return NextResponse.json({ request }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
