import { NextResponse } from "next/server";

import { captureBusinessEvent } from "@/lib/analytics/business-events";
import { requirePlatformAdmin } from "@/lib/admin/platform-guard";
import {
  ENTERPRISE_AGREEMENT_FIELDS,
  toEnterpriseAgreementResponse,
  type EnterpriseAgreementRow,
} from "@/lib/billing/enterprise-billing";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    "AGREEMENT_NOT_ACTIVATABLE",
    "ACTIVE_AGREEMENT_EXISTS",
    "REPLACED_AGREEMENT_NOT_FOUND",
    "REPLACED_AGREEMENT_COMPANY_MISMATCH",
    "REPLACED_AGREEMENT_NOT_ACTIVE",
    "SOURCE_REQUEST_REQUIRED",
    "SOURCE_REQUEST_NOT_FOUND",
    "SOURCE_REQUEST_COMPANY_MISMATCH",
    "SOURCE_REQUEST_STATUS_INVALID",
    "SOURCE_REQUEST_TARGET_PLAN_INVALID",
    "SOURCE_REQUEST_KIND_INVALID",
    "SOURCE_REQUEST_CURRENT_PLAN_INVALID",
    "SOURCE_REQUEST_APPLY_FAILED",
    "PAID_INVOICE_REQUIRED",
    "STARTS_AT_INVALID",
    "ENDS_AT_REQUIRED",
    "ENDS_AT_MUST_BE_AFTER_STARTS_AT",
    "CREDITS_LIMIT_INVALID",
    "TERMS_SUMMARY_REQUIRED",
  ].find((reason) => message.includes(reason));

  if (knownReason) return validationError(knownReason);
  if (message.includes("AGREEMENT_NOT_FOUND")) {
    return NextResponse.json({ error: "AGREEMENT_NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ error: "AGREEMENT_ACTIVATE_FAILED" }, { status: 500 });
}

async function agreementIdFromContext(context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await Promise.resolve(context.params);
  return String(params.id ?? "").trim();
}

export async function POST(_req: Request, context: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const adminRes = await requirePlatformAdminForApi();
    if (!adminRes.ok) return adminRes.response;

    const agreementId = await agreementIdFromContext(context);
    if (!agreementId) return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });

    const admin = getUntypedAdmin();
    const { error: activateError } = await admin.rpc("activate_enterprise_agreement", {
      p_agreement_id: agreementId,
      p_actor_id: adminRes.user.id,
      p_reason: "ENTERPRISE_AGREEMENT_ACTIVATED",
    });

    if (activateError) return rpcErrorResponse(activateError);

    const { data: activated, error: lookupError } = await admin
      .from("enterprise_agreements")
      .select(ENTERPRISE_AGREEMENT_FIELDS)
      .eq("id", agreementId)
      .maybeSingle();

    if (lookupError) return NextResponse.json({ error: "AGREEMENT_LOOKUP_FAILED" }, { status: 500 });
    if (!activated) return NextResponse.json({ error: "AGREEMENT_NOT_FOUND" }, { status: 404 });

    const activatedCompanyId =
      typeof (activated as { company_id?: unknown }).company_id === "string"
        ? (activated as { company_id: string }).company_id
        : null;

    await captureBusinessEvent({
      event: "enterprise_agreement_activated",
      userId: adminRes.user.id,
      companyId: activatedCompanyId,
      role: "platform_admin",
      properties: {
        request_id:
          typeof (activated as { source_request_id?: unknown }).source_request_id === "string"
            ? (activated as { source_request_id: string }).source_request_id
            : null,
        plan: "enterprise",
        status: String((activated as { status?: unknown }).status ?? "active"),
      },
    });

    return NextResponse.json({ agreement: toEnterpriseAgreementResponse(activated as EnterpriseAgreementRow) }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
