import { NextResponse, type NextRequest } from "next/server";

import { requirePlatformAdmin } from "@/lib/admin/platform-guard";
import {
  ENTERPRISE_AGREEMENT_CANCEL_BLOCKING_INVOICE_STATUSES,
  ENTERPRISE_AGREEMENT_FIELDS,
  canCancelEnterpriseAgreement,
  toEnterpriseAgreementResponse,
  type EnterpriseAgreementRow,
} from "@/lib/billing/enterprise-billing";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

type UntypedSupabase = ReturnType<typeof getSupabaseAdminClient> & {
  from(table: string): any;
};

export async function POST(_req: NextRequest, context: RouteContext) {
  try {
    const { isPlatformAdmin } = await requirePlatformAdmin();
    if (!isPlatformAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const params = await Promise.resolve(context.params);
    const agreementId = String(params.id ?? "").trim();
    if (!agreementId) return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });

    const admin = getSupabaseAdminClient() as UntypedSupabase;
    const { data: agreement, error: lookupError } = await admin
      .from("enterprise_agreements")
      .select("id,company_id,status")
      .eq("id", agreementId)
      .maybeSingle();

    if (lookupError) return NextResponse.json({ error: "AGREEMENT_LOOKUP_FAILED" }, { status: 500 });
    if (!agreement) return NextResponse.json({ error: "AGREEMENT_NOT_FOUND" }, { status: 404 });
    const lifecycleGuard = canCancelEnterpriseAgreement({ status: agreement.status, hasBlockingInvoice: false });
    if (!lifecycleGuard.ok) return NextResponse.json({ error: lifecycleGuard.reason }, { status: 409 });

    const { data: openInvoice, error: invoiceLookupError } = await admin
      .from("billing_manual_invoices")
      .select("id")
      .eq("agreement_id", agreementId)
      .in("status", ENTERPRISE_AGREEMENT_CANCEL_BLOCKING_INVOICE_STATUSES)
      .limit(1)
      .maybeSingle();

    if (invoiceLookupError) return NextResponse.json({ error: "INVOICE_LOOKUP_FAILED" }, { status: 500 });
    const invoiceGuard = canCancelEnterpriseAgreement({ status: agreement.status, hasBlockingInvoice: Boolean(openInvoice) });
    if (!invoiceGuard.ok) return NextResponse.json({ error: invoiceGuard.reason }, { status: 409 });

    const nowIso = new Date().toISOString();
    const { data: canceled, error: cancelError } = await admin
      .from("enterprise_agreements")
      .update({
        status: "canceled",
        updated_at: nowIso,
      })
      .eq("id", agreementId)
      .eq("status", "draft")
      .select(ENTERPRISE_AGREEMENT_FIELDS)
      .maybeSingle();

    if (cancelError) return NextResponse.json({ error: "AGREEMENT_CANCEL_FAILED" }, { status: 500 });
    if (!canceled) return NextResponse.json({ error: "AGREEMENT_CANCEL_CONFLICT" }, { status: 409 });

    return NextResponse.json({ agreement: toEnterpriseAgreementResponse(canceled as EnterpriseAgreementRow) }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
