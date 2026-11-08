import { NextResponse, type NextRequest } from "next/server";

import { requirePlatformAdmin } from "@/lib/admin/platform-guard";
import {
  ENTERPRISE_AGREEMENT_FIELDS,
  toEnterpriseAgreementResponse,
  type EnterpriseAgreementRow,
} from "@/lib/billing/enterprise-billing";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

type UntypedSupabase = ReturnType<typeof getSupabaseAdminClient> & {
  from(table: string): any;
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string } | null }>;
};

function restoreErrorResponse(error: { message?: string } | null) {
  const message = String(error?.message ?? "");
  const knownReason = [
    "AGREEMENT_NOT_RESTORABLE",
    "AGREEMENT_HAS_PAYABLE_INVOICE",
    "AGREEMENT_STATUS_CHANGED",
  ].find((reason) => message.includes(reason));

  if (knownReason) return NextResponse.json({ error: knownReason }, { status: 409 });
  if (message.includes("AGREEMENT_NOT_FOUND")) {
    return NextResponse.json({ error: "AGREEMENT_NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ error: "AGREEMENT_RESTORE_FAILED" }, { status: 500 });
}

export async function POST(_req: NextRequest, context: RouteContext) {
  try {
    const { isPlatformAdmin } = await requirePlatformAdmin();
    if (!isPlatformAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const params = await Promise.resolve(context.params);
    const agreementId = String(params.id ?? "").trim();
    if (!agreementId) return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });

    const admin = getSupabaseAdminClient() as UntypedSupabase;
    const { error: restoreRpcError } = await admin.rpc("restore_enterprise_agreement_draft", {
      p_agreement_id: agreementId,
    });

    if (restoreRpcError) return restoreErrorResponse(restoreRpcError);

    const { data: restored, error: lookupError } = await admin
      .from("enterprise_agreements")
      .select(ENTERPRISE_AGREEMENT_FIELDS)
      .eq("id", agreementId)
      .maybeSingle();

    if (lookupError) return NextResponse.json({ error: "AGREEMENT_LOOKUP_FAILED" }, { status: 500 });
    if (!restored) return NextResponse.json({ error: "AGREEMENT_NOT_FOUND" }, { status: 404 });

    return NextResponse.json({ agreement: toEnterpriseAgreementResponse(restored as EnterpriseAgreementRow) }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
