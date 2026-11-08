import { NextResponse, type NextRequest } from "next/server";

import { requirePlatformAdmin } from "@/lib/admin/platform-guard";
import { buildManualInvoiceReceipt, validateManualInvoiceDraft } from "@/lib/billing/manual-invoices";
import { createRobokassaInvoice } from "@/lib/billing/robokassa-invoices";
import { getRequestOrigin } from "@/lib/http/request-origin";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RobokassaInvoiceResult = Awaited<ReturnType<typeof createRobokassaInvoice>>;
type RouteContext = { params: Promise<{ id: string }> | { id: string } };
type DraftInvoiceRpcRow = {
  invoice_id: string;
  provider_invoice_id: string | null;
  agreement_id: string;
  company_id: string;
  source_request_id: string | null;
  agreement_status: string;
};

type IssueInvoiceBody = {
  amountKopecks?: unknown;
  description?: unknown;
  payerEmail?: unknown;
  servicePeriodStart?: unknown;
  servicePeriodEnd?: unknown;
  fiscalItemName?: unknown;
  tax?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() : null;
}

function getAmountKopecks(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return 0;
}

function providerNotConfigured(error: unknown): boolean {
  return error instanceof Error && error.message === "ROBOKASSA_INVOICE_API_NOT_CONFIGURED";
}

async function restoreDraftAgreement(admin: any, agreementId: string) {
  const { data, error } = await admin.rpc("restore_enterprise_agreement_draft", {
    p_agreement_id: agreementId,
  });
  return !error && (Array.isArray(data) ? data.length > 0 : Boolean(data));
}

async function markDraftInvoiceCanceled(admin: any, invoiceId: string) {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("billing_manual_invoices")
    .update({ status: "canceled", canceled_at: nowIso, updated_at: nowIso })
    .eq("id", invoiceId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  return !error && Boolean(data);
}

async function markDraftInvoiceRequiresReview(admin: any, invoiceId: string, providerPayload: unknown = null) {
  const { data, error } = await admin
    .from("billing_manual_invoices")
    .update({ status: "requires_review", provider_payload: providerPayload, updated_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  return !error && Boolean(data);
}

async function markInvoiceProviderSuccessRequiresReview(admin: any, invoiceId: string, providerInvoice: RobokassaInvoiceResult) {
  const { data, error } = await admin
    .from("billing_manual_invoices")
    .update({
      status: "requires_review",
      provider_invoice_id: providerInvoice.providerInvoiceId,
      provider_invoice_url: providerInvoice.invoiceUrl,
      provider_payload: providerInvoice.raw,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId)
    .not("status", "in", "(\"issued\",\"paid\")")
    .select("id")
    .maybeSingle();
  return !error && Boolean(data);
}

async function getManualInvoiceForRepair(admin: any, invoiceId: string) {
  const { data, error } = await admin
    .from("billing_manual_invoices")
    .select("id,status,provider_invoice_url")
    .eq("id", invoiceId)
    .maybeSingle();
  return error ? null : data;
}

function rpcErrorResponse(error: { message?: string } | null) {
  const message = String(error?.message ?? "");
  const knownReason = [
    "INVOICE_AMOUNT_INVALID",
    "INVOICE_DESCRIPTION_REQUIRED",
    "INVOICE_PAYER_EMAIL_REQUIRED",
    "AGREEMENT_NOT_INVOICEABLE",
    "AGREEMENT_STATUS_CHANGED",
    "SOURCE_REQUEST_REQUIRED",
    "SOURCE_REQUEST_NOT_FOUND",
    "SOURCE_REQUEST_COMPANY_MISMATCH",
    "SOURCE_REQUEST_STATUS_INVALID",
    "SOURCE_REQUEST_TARGET_PLAN_INVALID",
    "SOURCE_REQUEST_KIND_INVALID",
  ].find((reason) => message.includes(reason));

  if (knownReason) return NextResponse.json({ error: knownReason }, { status: 409 });
  if (message.includes("AGREEMENT_NOT_FOUND")) {
    return NextResponse.json({ error: "AGREEMENT_NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json({ error: "INVOICE_CREATE_FAILED" }, { status: 500 });
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { user, isPlatformAdmin } = await requirePlatformAdmin();
    if (!isPlatformAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const params = await Promise.resolve(context.params);
    const agreementId = String(params.id ?? "").trim();
    if (!agreementId) return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });

    const rawBody = await req.json().catch(() => null);
    if (!isRecord(rawBody)) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    const body = rawBody as IssueInvoiceBody;

    const amountKopecks = getAmountKopecks(body.amountKopecks);
    const description = getString(body.description) ?? "";
    const fiscalItemName = getString(body.fiscalItemName) ?? description;
    const payerEmail = getString(body.payerEmail);
    const validation = validateManualInvoiceDraft({ amountKopecks, description, payerEmail, fiscalItemName });
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

    const admin = getSupabaseAdminClient() as any;
    const { data: agreement, error: agreementError } = await admin
      .from("enterprise_agreements")
      .select("id,company_id,source_request_id,status")
      .eq("id", agreementId)
      .maybeSingle();

    if (agreementError) return NextResponse.json({ error: "AGREEMENT_LOOKUP_FAILED" }, { status: 500 });
    if (!agreement) return NextResponse.json({ error: "AGREEMENT_NOT_FOUND" }, { status: 404 });
    if (!agreement.source_request_id) return NextResponse.json({ error: "SOURCE_REQUEST_REQUIRED" }, { status: 409 });
    if (agreement.status !== "draft") {
      return NextResponse.json({ error: "AGREEMENT_NOT_INVOICEABLE" }, { status: 409 });
    }

    const { data: sourceRequest, error: sourceRequestError } = await admin
      .from("billing_plan_change_requests")
      .select("id,company_id,status,target_plan,request_kind")
      .eq("id", agreement.source_request_id)
      .maybeSingle();

    if (sourceRequestError) return NextResponse.json({ error: "SOURCE_REQUEST_LOOKUP_FAILED" }, { status: 500 });
    if (!sourceRequest) return NextResponse.json({ error: "SOURCE_REQUEST_NOT_FOUND" }, { status: 409 });
    if (sourceRequest.company_id !== agreement.company_id) {
      return NextResponse.json({ error: "SOURCE_REQUEST_COMPANY_MISMATCH" }, { status: 409 });
    }
    if (sourceRequest.status !== "approved") {
      return NextResponse.json({ error: "SOURCE_REQUEST_STATUS_INVALID" }, { status: 409 });
    }
    if (sourceRequest.target_plan !== "enterprise") {
      return NextResponse.json({ error: "SOURCE_REQUEST_TARGET_PLAN_INVALID" }, { status: 409 });
    }
    if (sourceRequest.request_kind !== "upgrade_to_enterprise" && sourceRequest.request_kind !== "enterprise_terms_change") {
      return NextResponse.json({ error: "SOURCE_REQUEST_KIND_INVALID" }, { status: 409 });
    }

    const fiscalReceipt = buildManualInvoiceReceipt({
      itemName: fiscalItemName,
      amountKopecks,
      quantity: 1,
      tax: getString(body.tax) ?? "none",
    });

    const { data: invoiceRows, error: invoiceError } = await admin.rpc("create_enterprise_manual_invoice_draft", {
      p_agreement_id: agreement.id,
      p_actor_id: user.id,
      p_amount: amountKopecks,
      p_description: description,
      p_payer_email: payerEmail,
      p_service_period_start: getString(body.servicePeriodStart),
      p_service_period_end: getString(body.servicePeriodEnd),
      p_fiscal_receipt: fiscalReceipt,
    });
    const invoice = (Array.isArray(invoiceRows) ? invoiceRows[0] : invoiceRows) as DraftInvoiceRpcRow | null;

    if (invoiceError) return rpcErrorResponse(invoiceError);
    if (!invoice) return NextResponse.json({ error: "INVOICE_CREATE_FAILED" }, { status: 500 });

    const invoiceId = invoice.invoice_id;
    const providerInvId = Number(invoice.provider_invoice_id);
    if (!Number.isSafeInteger(providerInvId) || providerInvId <= 0) {
      const canceled = await markDraftInvoiceCanceled(admin, invoiceId);
      if (!canceled) return NextResponse.json({ error: "INVOICE_STATE_REPAIR_FAILED" }, { status: 500 });
      return NextResponse.json({ error: "INVOICE_INV_ID_INVALID" }, { status: 500 });
    }

    const origin = getRequestOrigin(req);
    let providerInvoice: RobokassaInvoiceResult;
    try {
      providerInvoice = await createRobokassaInvoice({
        invId: providerInvId,
        amountKopecks,
        description,
        manualInvoiceId: invoiceId,
        payerEmail,
        receipt: fiscalReceipt,
        successUrl: `${origin}/admin/billing?tab=manual-invoices&invoice=success`,
        failUrl: `${origin}/admin/billing?tab=manual-invoices&invoice=failed`,
      });
    } catch (error) {
      if (providerNotConfigured(error)) {
        const canceled = await markDraftInvoiceCanceled(admin, invoiceId);
        if (!canceled) return NextResponse.json({ error: "INVOICE_STATE_REPAIR_FAILED" }, { status: 500 });
        const restored = await restoreDraftAgreement(admin, invoice.agreement_id);
        if (!restored) return NextResponse.json({ error: "INVOICE_STATE_REPAIR_FAILED" }, { status: 500 });
        return NextResponse.json({ error: "INVOICE_PROVIDER_NOT_CONFIGURED" }, { status: 503 });
      }
      const markedForReview = await markDraftInvoiceRequiresReview(admin, invoiceId);
      if (!markedForReview) return NextResponse.json({ error: "INVOICE_REVIEW_MARK_FAILED" }, { status: 500 });
      return NextResponse.json({ error: "INVOICE_PROVIDER_FAILED" }, { status: 502 });
    }

    const issuedAt = new Date().toISOString();
    const { data: issuedInvoice, error: updateInvoiceError } = await admin
      .from("billing_manual_invoices")
      .update({
        status: "issued",
        provider_invoice_id: providerInvoice.providerInvoiceId,
        provider_invoice_url: providerInvoice.invoiceUrl,
        provider_payload: providerInvoice.raw,
        issued_at: issuedAt,
        updated_at: issuedAt,
      })
      .eq("id", invoiceId)
      .eq("status", "draft")
      .select("id,status,provider_invoice_url")
      .maybeSingle();

    if (updateInvoiceError) {
      const currentInvoice = await getManualInvoiceForRepair(admin, invoiceId);
      if (currentInvoice?.status === "paid" || currentInvoice?.status === "issued") {
        return NextResponse.json({ invoice: currentInvoice }, { status: 200 });
      }
      const markedForReview = await markInvoiceProviderSuccessRequiresReview(admin, invoiceId, providerInvoice);
      if (!markedForReview) return NextResponse.json({ error: "INVOICE_REVIEW_MARK_FAILED" }, { status: 500 });
      return NextResponse.json({ error: "INVOICE_ISSUE_UPDATE_FAILED" }, { status: 500 });
    }
    if (!issuedInvoice) {
      const currentInvoice = await getManualInvoiceForRepair(admin, invoiceId);
      if (currentInvoice?.status === "paid" || currentInvoice?.status === "issued") {
        return NextResponse.json({ invoice: currentInvoice }, { status: 200 });
      }
      const markedForReview = await markInvoiceProviderSuccessRequiresReview(admin, invoiceId, providerInvoice);
      if (!markedForReview) return NextResponse.json({ error: "INVOICE_REVIEW_MARK_FAILED" }, { status: 500 });
      return NextResponse.json({ error: "INVOICE_STATUS_CHANGED" }, { status: 409 });
    }

    return NextResponse.json({ invoice: issuedInvoice }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
