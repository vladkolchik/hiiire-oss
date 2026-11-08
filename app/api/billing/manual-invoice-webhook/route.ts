import { NextResponse, type NextRequest } from "next/server";

import {
  getManualInvoicePaidWebhookAction,
  parseRobokassaManualInvoiceWebhookParams,
} from "@/lib/billing/manual-invoices";
import { parseOutSumToKopecks } from "@/lib/billing/plans";
import { normalizeShpParams, verifyResultSignature } from "@/lib/billing/robokassa";
import { requireRobokassaPassword2 } from "@/lib/billing/env";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function textResponse(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

async function readParams(req: NextRequest): Promise<URLSearchParams> {
  const params = new URLSearchParams(req.nextUrl.searchParams.toString());
  if (req.method !== "POST") return params;

  const raw = await req.text().catch(() => "");
  if (raw.trim().length > 0) {
    const bodyParams = new URLSearchParams(raw);
    for (const [key, value] of bodyParams.entries()) {
      params.set(key, value);
    }
  }
  return params;
}

async function handleWebhook(req: NextRequest) {
  try {
    const params = await readParams(req);
    const parsed = parseRobokassaManualInvoiceWebhookParams(params);
    if (!parsed.ok) {
      return textResponse(parsed.error, 400);
    }

    const password2 = requireRobokassaPassword2();
    const shp = normalizeShpParams(params);
    const isValidSignature = verifyResultSignature({
      outSum: parsed.outSum,
      invId: parsed.invId,
      password2,
      signatureValue: parsed.signatureValue,
      shp,
    });
    if (!isValidSignature) {
      return textResponse("INVALID_SIGNATURE", 400);
    }

    const paidKopecks = parseOutSumToKopecks(parsed.outSum);
    if (paidKopecks === null) {
      return textResponse("OUTSUM_MISMATCH", 400);
    }

    const admin = getSupabaseAdminClient();
    const { data: invoice, error: invoiceError } = await admin
      .from("billing_manual_invoices")
      .select("id,status,amount")
      .eq("provider", "robokassa")
      .eq("provider_invoice_id", parsed.providerInvoiceId)
      .maybeSingle();

    if (invoiceError) {
      console.error("[billing][manual-invoice-webhook] invoice lookup failed", {
        providerInvoiceId: parsed.providerInvoiceId,
        message: invoiceError.message,
      });
      return textResponse("INVOICE_LOOKUP_FAILED", 500);
    }

    if (!invoice) {
      console.error("[billing][manual-invoice-webhook] invoice not found", {
        providerInvoiceId: parsed.providerInvoiceId,
      });
      return textResponse("INVOICE_NOT_FOUND", 400);
    }

    const shpManualInvoiceId = shp.Shp_manual_invoice_id;
    if (typeof shpManualInvoiceId === "string" && shpManualInvoiceId.length > 0 && shpManualInvoiceId !== String(invoice.id)) {
      console.error("[billing][manual-invoice-webhook] invoice id mismatch", {
        invoiceId: invoice.id,
        providerInvoiceId: parsed.providerInvoiceId,
      });
      const reviewResult = await markManualInvoicePaymentRequiresReview({
        admin,
        invoiceId: String(invoice.id),
        invId: parsed.invId,
        providerPayload: parsed.providerPayload,
        forceReview: true,
      });
      return textResponse(reviewResult.body, reviewResult.status);
    }

    if (paidKopecks !== Number(invoice.amount ?? 0)) {
      console.error("[billing][manual-invoice-webhook] amount mismatch", {
        invoiceId: invoice.id,
        providerInvoiceId: parsed.providerInvoiceId,
      });
      const reviewResult = await markManualInvoicePaymentRequiresReview({
        admin,
        invoiceId: String(invoice.id),
        invId: parsed.invId,
        providerPayload: parsed.providerPayload,
        forceReview: true,
      });
      return textResponse(reviewResult.body, reviewResult.status);
    }

    const action = getManualInvoicePaidWebhookAction(invoice.status);
    if (action === "already_paid") {
      return textResponse(`OK${parsed.invId}`);
    }
    if (action === "mark_review") {
      const reviewResult = await markManualInvoicePaymentRequiresReview({
        admin,
        invoiceId: String(invoice.id),
        invId: parsed.invId,
        providerPayload: parsed.providerPayload,
      });
      return textResponse(reviewResult.body, reviewResult.status);
    }
    const paidAt = new Date().toISOString();
    const { data: updatedInvoice, error: updateError } = await admin
      .from("billing_manual_invoices")
      .update({
        status: "paid",
        paid_at: paidAt,
        provider_status: "paid",
        provider_payload: parsed.providerPayload,
        updated_at: paidAt,
      })
      .eq("id", invoice.id)
      .eq("status", "issued")
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error("[billing][manual-invoice-webhook] invoice update failed", {
        invoiceId: invoice.id,
        providerInvoiceId: parsed.providerInvoiceId,
        message: updateError.message,
      });
      return textResponse("INVOICE_UPDATE_FAILED", 500);
    }

    if (!updatedInvoice) {
      console.error("[billing][manual-invoice-webhook] invoice status changed during payment update", {
        invoiceId: invoice.id,
        providerInvoiceId: parsed.providerInvoiceId,
      });
      const reviewResult = await markManualInvoicePaymentRequiresReview({
        admin,
        invoiceId: String(invoice.id),
        invId: parsed.invId,
        providerPayload: parsed.providerPayload,
      });
      return textResponse(reviewResult.body, reviewResult.status);
    }

    return textResponse(`OK${parsed.invId}`);
  } catch {
    console.error("[billing][manual-invoice-webhook] internal error");
    return textResponse("INTERNAL_ERROR", 500);
  }
}

export async function POST(req: NextRequest) {
  return handleWebhook(req);
}

export async function GET(req: NextRequest) {
  return handleWebhook(req);
}

async function markManualInvoicePaymentRequiresReview(input: {
  admin: ReturnType<typeof getSupabaseAdminClient>;
  invoiceId: string;
  invId: number;
  providerPayload: Record<string, string>;
  forceReview?: boolean;
}): Promise<{ body: string; status: number }> {
  const { admin, invoiceId, invId, providerPayload, forceReview = false } = input;
  const { data: currentInvoice, error: reloadError } = await admin
    .from("billing_manual_invoices")
    .select("id,status")
    .eq("id", invoiceId)
    .maybeSingle();

  if (reloadError || !currentInvoice) {
    console.error("[billing][manual-invoice-webhook] invoice race reload failed", {
      invoiceId,
      message: reloadError?.message,
    });
    return { body: "PAYMENT_REQUIRES_REVIEW", status: 500 };
  }

  if (currentInvoice.status === "paid" && !forceReview) {
    return { body: `OK${invId}`, status: 200 };
  }

  const reviewedAt = new Date().toISOString();
  const reviewUpdate = admin
    .from("billing_manual_invoices")
    .update({
      status: "requires_review",
      provider_status: "paid_requires_review",
      provider_payload: providerPayload,
      updated_at: reviewedAt,
    })
    .eq("id", invoiceId);
  const conditionalReviewUpdate = forceReview ? reviewUpdate : reviewUpdate.neq("status", "paid");
  const { data: reviewedInvoice, error: reviewError } = await conditionalReviewUpdate
    .select("id,status")
    .maybeSingle();

  if (reviewError) {
    console.error("[billing][manual-invoice-webhook] invoice review update failed", {
      invoiceId,
      message: reviewError.message,
    });
    return { body: "PAYMENT_REQUIRES_REVIEW", status: 500 };
  }

  if (!reviewedInvoice) {
    const { data: reloadedInvoice, error: conflictReloadError } = await admin
      .from("billing_manual_invoices")
      .select("id,status")
      .eq("id", invoiceId)
      .maybeSingle();

    if (!conflictReloadError && reloadedInvoice?.status === "paid") {
      return { body: `OK${invId}`, status: 200 };
    }

    return { body: "REVIEW_UPDATE_CONFLICT", status: 500 };
  }

  return { body: `OK${invId}`, status: 200 };
}
