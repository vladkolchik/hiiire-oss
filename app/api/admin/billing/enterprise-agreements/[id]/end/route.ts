import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/admin/platform-guard";
import {
  ENTERPRISE_AGREEMENT_FIELDS,
  toEnterpriseAgreementResponse,
  type EnterpriseAgreementRow,
} from "@/lib/billing/enterprise-billing";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EndAgreementSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
  targetPlan: z.enum(["starter", "professional"]).nullable().optional(),
  requestId: z.string().uuid(),
  sourceRequestUpdatedAt: z.string().datetime({ offset: true }),
});

type UntypedSupabase = ReturnType<typeof getSupabaseAdminClient> & {
  from(table: string): any;
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string } | null }>;
};

async function requirePlatformAdminForApi() {
  const { user, isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }),
    };
  }
  return { ok: true as const, user };
}

function getUntypedAdmin(): UntypedSupabase {
  return getSupabaseAdminClient() as UntypedSupabase;
}

function validationError(reason: string) {
  return NextResponse.json({ error: reason }, { status: 400 });
}

function rpcErrorResponse(error: { message?: string } | null) {
  const message = String(error?.message ?? "");
  const knownReason = [
    "AGREEMENT_NOT_ACTIVE",
    "END_REASON_REQUIRED",
    "TARGET_PLAN_INVALID",
    "REQUEST_NOT_FOUND",
    "REQUEST_STATUS_CHANGED",
    "REQUEST_COMPANY_MISMATCH",
    "REQUEST_KIND_INVALID",
    "REQUEST_STATUS_INVALID",
    "REQUEST_CURRENT_PLAN_INVALID",
    "REQUEST_TARGET_PLAN_INVALID",
    "TARGET_PLAN_MISMATCH",
    "REQUEST_REQUIRED",
    "COMPANY_PLAN_ENTERPRISE_REQUIRED",
    "REQUEST_APPLY_FAILED",
  ].find((reason) => message.includes(reason));

  if (knownReason) return validationError(knownReason);
  if (message.includes("AGREEMENT_NOT_FOUND")) {
    return NextResponse.json({ error: "AGREEMENT_NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ error: "AGREEMENT_END_FAILED" }, { status: 500 });
}

async function agreementIdFromContext(context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await Promise.resolve(context.params);
  return String(params.id ?? "").trim();
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const adminRes = await requirePlatformAdminForApi();
    if (!adminRes.ok) return adminRes.response;

    const agreementId = await agreementIdFromContext(context);
    if (!agreementId) return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });

    const body = await req.json().catch(() => null);
    const parsed = EndAgreementSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

    const admin = getUntypedAdmin();
    const { error: endError } = await admin.rpc("end_enterprise_agreement", {
      p_agreement_id: agreementId,
      p_actor_id: adminRes.user.id,
      p_reason: parsed.data.reason,
      p_target_plan: parsed.data.targetPlan ?? null,
      p_request_id: parsed.data.requestId,
      p_source_request_updated_at: parsed.data.sourceRequestUpdatedAt,
    });

    if (endError) return rpcErrorResponse(endError);

    const { data: ended, error: lookupError } = await admin
      .from("enterprise_agreements")
      .select(ENTERPRISE_AGREEMENT_FIELDS)
      .eq("id", agreementId)
      .maybeSingle();

    if (lookupError) return NextResponse.json({ error: "AGREEMENT_LOOKUP_FAILED" }, { status: 500 });
    if (!ended) return NextResponse.json({ error: "AGREEMENT_NOT_FOUND" }, { status: 404 });

    return NextResponse.json({ agreement: toEnterpriseAgreementResponse(ended as EnterpriseAgreementRow) }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
