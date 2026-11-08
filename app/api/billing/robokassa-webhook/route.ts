import { NextResponse, type NextRequest } from "next/server";

import { captureBusinessEvent } from "@/lib/analytics/business-events";
import { isRobokassaRecurringEnabled, requireRobokassaPassword2 } from "@/lib/billing/env";
import { formatClientCreditTopupPaidEmail } from "@/lib/email/format";
import { notifyCompanyAdminsByEmail } from "@/lib/email/notify";
import { getManualInvoicePaidWebhookAction } from "@/lib/billing/manual-invoices";
import { parseOutSumToKopecks } from "@/lib/billing/plans";
import { normalizeShpParams, verifyResultSignature } from "@/lib/billing/robokassa";
import { loadCompanyMarketingEventProperties } from "@/lib/marketing/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatClientCreditTopupPaidMessage } from "@/lib/telegram/format";
import { notifyCompanyAdmins } from "@/lib/telegram/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function textResponse(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function getParam(params: URLSearchParams, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = params.get(key);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

async function readParams(req: NextRequest): Promise<URLSearchParams> {
  const params = new URLSearchParams(req.nextUrl.searchParams.toString());
  if (req.method !== "POST") return params;

  // Robokassa callbacks are expected as x-www-form-urlencoded.
  // In practice providers/proxies can omit or alter content-type,
  // so parse body best-effort regardless of headers.
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
    const outSum = getParam(params, "OutSum", "outsum");
    const invIdRaw = getParam(params, "InvId", "InvID", "invId", "InvoiceID", "InvoiceId", "invid");
    const signatureValue = getParam(params, "SignatureValue", "signaturevalue");
    const shp = normalizeShpParams(params);

    if (!outSum || !invIdRaw || !signatureValue) {
      return textResponse("INVALID_PARAMS", 400);
    }

    const invId = Number(invIdRaw);
    if (!Number.isSafeInteger(invId) || invId <= 0) {
      return textResponse("INVALID_INV_ID", 400);
    }

    const password2 = requireRobokassaPassword2();
    const isValidSignature = verifyResultSignature({
      outSum,
      invId,
      password2,
      signatureValue,
      shp,
    });
    if (!isValidSignature) {
      return textResponse("INVALID_SIGNATURE", 400);
    }

    const paidKopecks = parseOutSumToKopecks(outSum);
    const admin = getSupabaseAdminClient();
    const providerPayload = Object.fromEntries(params.entries());

    if (shp.Shp_credit_topup_id) {
      const creditTopupResult = await markCreditTopupPaid({
        admin,
        invId,
        paidKopecks,
        providerPayload,
        creditTopupId: shp.Shp_credit_topup_id,
      });
      return textResponse(creditTopupResult.body, creditTopupResult.status);
    }

    if (shp.Shp_manual_invoice_id) {
      const manualInvoiceResult = await markManualInvoicePaid({
        admin,
        invId,
        paidKopecks,
        providerPayload,
        manualInvoiceId: shp.Shp_manual_invoice_id,
      });
      return textResponse(manualInvoiceResult.body, manualInvoiceResult.status);
    }

    const { data: payment, error: paymentError } = await admin
      .from("payments")
      .select("id,amount,company_id,status,plan,is_recurring")
      .eq("inv_id", invId)
      .maybeSingle();

    if (paymentError) {
      return textResponse("PAYMENT_LOOKUP_FAILED", 500);
    }
    if (!payment) {
      const creditTopupResult = await markCreditTopupPaid({
        admin,
        invId,
        paidKopecks,
        providerPayload,
        creditTopupId: shp.Shp_credit_topup_id,
      });
      if (creditTopupResult.found) {
        return textResponse(creditTopupResult.body, creditTopupResult.status);
      }

      const manualInvoiceResult = await markManualInvoicePaid({
        admin,
        invId,
        paidKopecks,
        providerPayload,
        manualInvoiceId: shp.Shp_manual_invoice_id,
      });
      return textResponse(manualInvoiceResult.body, manualInvoiceResult.status);
    }

    if (paidKopecks === null || paidKopecks !== Number(payment.amount ?? 0)) {
      return textResponse("OUTSUM_MISMATCH", 400);
    }

    const shpPaymentId = shp.Shp_payment_id;
    if (typeof shpPaymentId === "string" && shpPaymentId.length > 0 && shpPaymentId !== String(payment.id)) {
      return textResponse("PAYMENT_MISMATCH", 400);
    }

    const { error: finalizeError } = await admin.rpc("finalize_robokassa_payment", {
      p_inv_id: invId,
      p_provider_id: String(invId),
      p_completed_at: new Date().toISOString(),
    });

    if (finalizeError) {
      console.error("[billing][robokassa-webhook] finalize failed", {
        invId,
        message: finalizeError.message,
      });
      const marketingEventProperties = await loadCompanyMarketingEventProperties(payment.company_id);
      await captureBusinessEvent({
        event: "payment_failed",
        companyId: payment.company_id,
        properties: {
          payment_id: payment.id,
          inv_id: invId,
          amount_kopecks: Number(payment.amount ?? 0),
          currency: "RUB",
          provider: "robokassa",
          plan: String(payment.plan ?? ""),
          failure_stage: "finalize_robokassa_payment",
          ...marketingEventProperties,
        },
      });
      return textResponse("FINALIZE_FAILED", 500);
    }

    const { data: finalizedPayment, error: finalizedPaymentError } = await admin
      .from("payments")
      .select("id,status")
      .eq("id", payment.id)
      .maybeSingle();
    if (finalizedPaymentError || !finalizedPayment) {
      console.error("[billing][robokassa-webhook] finalized payment reload failed", {
        invId,
        companyId: payment.company_id,
        message: finalizedPaymentError?.message,
      });
      return textResponse("PAYMENT_RELOAD_FAILED", 500);
    }

    if (payment.status !== "completed" && finalizedPayment.status === "completed") {
      const marketingProperties = await loadCompanyMarketingEventProperties(payment.company_id);
      await captureBusinessEvent({
        event: "payment_completed",
        companyId: payment.company_id,
        properties: {
          payment_id: payment.id,
          inv_id: invId,
          amount_kopecks: Number(payment.amount ?? 0),
          currency: "RUB",
          provider: "robokassa",
          plan: String(payment.plan ?? ""),
          is_recurring: Boolean(payment.is_recurring),
          ...marketingProperties,
        },
      });

      if (payment.is_recurring) {
        await captureBusinessEvent({
          event: "subscription_renewed",
          companyId: payment.company_id,
          properties: {
            payment_id: payment.id,
            inv_id: invId,
            amount_kopecks: Number(payment.amount ?? 0),
            currency: "RUB",
            provider: "robokassa",
            plan: String(payment.plan ?? ""),
            ...marketingProperties,
          },
        });
      }
    }

    if (!isRobokassaRecurringEnabled() && finalizedPayment.status === "completed") {
      const { error: updatePlanError } = await admin.rpc("set_company_plan_auto_renew", {
        p_company_id: payment.company_id,
        p_enabled: false,
      });

      if (updatePlanError) {
        console.error("[billing][robokassa-webhook] auto_renew update failed", {
          invId,
          companyId: payment.company_id,
          message: updatePlanError.message,
        });
        return textResponse("AUTORENEW_UPDATE_FAILED", 500);
      }
    }

    return textResponse(`OK${invId}`);
  } catch {
    console.error("[billing][robokassa-webhook] internal error");
    return textResponse("INTERNAL_ERROR", 500);
  }
}

async function markCreditTopupPaid(input: {
  admin: ReturnType<typeof getSupabaseAdminClient>;
  invId: number;
  paidKopecks: number | null;
  providerPayload: Record<string, string>;
  creditTopupId?: string;
}): Promise<{ found: boolean; body: string; status: number }> {
  const { admin, invId, paidKopecks, creditTopupId } = input;
  const adminAny = admin as any;

  const { data: payment, error: paymentError } = await adminAny
    .from("credit_topup_payments")
    .select("id,company_id,status,amount,credits")
    .eq("provider", "robokassa")
    .eq("inv_id", invId)
    .maybeSingle();

  if (paymentError) {
    console.error("[billing][robokassa-webhook] credit topup lookup failed", {
      invId,
      message: paymentError.message,
    });
    return { found: true, body: "CREDIT_TOPUP_LOOKUP_FAILED", status: 500 };
  }

  if (!payment) {
    return { found: false, body: "PAYMENT_NOT_FOUND", status: 400 };
  }

  const markReview = async (reason: string) => {
    const now = new Date().toISOString();
    const { error: updateError } = await adminAny
      .from("credit_topup_payments")
      .update({
        status: "requires_review",
        failed_at: now,
        fail_reason: reason,
        completed_at: now,
        provider_id: String(invId),
        provider_payload: input.providerPayload,
      })
      .eq("id", payment.id);

    if (updateError) {
      console.error("[billing][robokassa-webhook] credit topup review update failed", {
        invId,
        paymentId: payment.id,
        message: updateError.message,
      });
      return { found: true, body: "CREDIT_TOPUP_REVIEW_FAILED", status: 500 };
    }

    const marketingEventProperties = await loadCompanyMarketingEventProperties(payment.company_id);
    await captureBusinessEvent({
      event: "payment_failed",
      companyId: payment.company_id,
      properties: {
        payment_id: String(payment.id),
        inv_id: invId,
        amount_kopecks: Number(payment.amount ?? 0),
        credits: Number(payment.credits ?? 0),
        currency: "RUB",
        provider: "robokassa",
        source: "credit_topup",
        failure_stage: reason,
        ...marketingEventProperties,
      },
    });

    return { found: true, body: `OK${invId}`, status: 200 };
  };

  if (payment.status === "completed") {
    return { found: true, body: `OK${invId}`, status: 200 };
  }

  if (payment.status !== "pending") {
    return markReview("CREDIT_TOPUP_STATUS_REQUIRES_REVIEW");
  }

  if (creditTopupId && creditTopupId !== String(payment.id)) {
    return markReview("CREDIT_TOPUP_ID_MISMATCH");
  }

  if (paidKopecks === null || paidKopecks !== Number(payment.amount ?? 0)) {
    return markReview("CREDIT_TOPUP_AMOUNT_MISMATCH");
  }

  const { data: finalizeRows, error: finalizeError } = await admin.rpc("finalize_credit_topup_payment", {
    p_inv_id: invId,
    p_provider_id: String(invId),
    p_completed_at: new Date().toISOString(),
    p_provider_payload: input.providerPayload,
  });

  if (finalizeError) {
    console.error("[billing][robokassa-webhook] credit topup finalize failed", {
      invId,
      paymentId: payment.id,
      message: finalizeError.message,
    });
    const marketingEventProperties = await loadCompanyMarketingEventProperties(payment.company_id);
    await captureBusinessEvent({
      event: "payment_failed",
      companyId: payment.company_id,
      properties: {
        payment_id: String(payment.id),
        inv_id: invId,
        amount_kopecks: Number(payment.amount ?? 0),
        credits: Number(payment.credits ?? 0),
        currency: "RUB",
        provider: "robokassa",
        source: "credit_topup",
        failure_stage: "finalize_credit_topup_payment",
        ...marketingEventProperties,
      },
    });
    return { found: true, body: "CREDIT_TOPUP_FINALIZE_FAILED", status: 500 };
  }

  const finalizeResult = Array.isArray(finalizeRows) ? finalizeRows[0] : null;
  const creditsGranted = Number(finalizeResult?.credits_granted ?? 0);
  if (!finalizeResult) {
    console.error("[billing][robokassa-webhook] credit topup finalize returned no rows", {
      invId,
      paymentId: payment.id,
    });
    return { found: true, body: "CREDIT_TOPUP_FINALIZE_FAILED", status: 500 };
  }

  if (finalizeResult.already_completed || creditsGranted <= 0) {
    return { found: true, body: `OK${invId}`, status: 200 };
  }

  const marketingEventProperties = await loadCompanyMarketingEventProperties(payment.company_id);

  await captureBusinessEvent({
    event: "credit_topup_paid",
    companyId: payment.company_id,
    properties: {
      payment_id: String(payment.id),
      inv_id: invId,
      amount_kopecks: Number(payment.amount ?? 0),
      credits: creditsGranted,
      currency: "RUB",
      provider: "robokassa",
      source: "credit_topup",
      ...marketingEventProperties,
    },
  });

  await captureBusinessEvent({
    event: "credits_granted",
    companyId: payment.company_id,
    properties: {
      payment_id: String(payment.id),
      inv_id: invId,
      credits: creditsGranted,
      source: "credit_topup",
      ...marketingEventProperties,
    },
  });

  await notifyCreditTopupPaid({
    admin,
    companyId: String(payment.company_id),
    credits: creditsGranted,
    amountKopecks: Number(payment.amount ?? 0),
  });

  return { found: true, body: `OK${invId}`, status: 200 };
}

async function notifyCreditTopupPaid(input: {
  admin: ReturnType<typeof getSupabaseAdminClient>;
  companyId: string;
  credits: number;
  amountKopecks: number;
}) {
  const { data: company } = await input.admin
    .from("companies")
    .select("name")
    .eq("id", input.companyId)
    .maybeSingle();
  const companyName = String(company?.name ?? "Компания");

  await Promise.allSettled([
    notifyCompanyAdmins(
      input.companyId,
      formatClientCreditTopupPaidMessage({
        companyName,
        credits: input.credits,
        amountKopecks: input.amountKopecks,
      }),
    ),
    notifyCompanyAdminsByEmail(
      input.companyId,
      formatClientCreditTopupPaidEmail({
        companyName,
        credits: input.credits,
        amountKopecks: input.amountKopecks,
      }),
    ),
  ]);
}

async function markManualInvoicePaid(input: {
  admin: ReturnType<typeof getSupabaseAdminClient>;
  invId: number;
  paidKopecks: number | null;
  providerPayload: Record<string, string>;
  manualInvoiceId?: string;
}): Promise<{ body: string; status: number }> {
  const { admin, invId, paidKopecks, providerPayload, manualInvoiceId } = input;
  if (paidKopecks === null) return { body: "OUTSUM_MISMATCH", status: 400 };

  const { data: invoice, error: invoiceError } = await admin
    .from("billing_manual_invoices")
    .select("id,status,amount")
    .eq("provider", "robokassa")
    .eq("provider_invoice_id", String(invId))
    .maybeSingle();

  if (invoiceError) {
    console.error("[billing][robokassa-webhook] manual invoice lookup failed", {
      providerInvoiceId: String(invId),
      message: invoiceError.message,
    });
    return { body: "INVOICE_LOOKUP_FAILED", status: 500 };
  }

  if (!invoice) {
    return { body: "PAYMENT_NOT_FOUND", status: 400 };
  }

  if (manualInvoiceId && manualInvoiceId !== String(invoice.id)) {
    console.error("[billing][robokassa-webhook] manual invoice id mismatch", {
      invoiceId: invoice.id,
      providerInvoiceId: String(invId),
    });
    return markManualInvoicePaymentRequiresReview({
      admin,
      invoiceId: String(invoice.id),
      invId,
      providerPayload,
      forceReview: true,
    });
  }

  if (paidKopecks !== Number(invoice.amount ?? 0)) {
    console.error("[billing][robokassa-webhook] manual invoice amount mismatch", {
      invoiceId: invoice.id,
      providerInvoiceId: String(invId),
    });
    return markManualInvoicePaymentRequiresReview({
      admin,
      invoiceId: String(invoice.id),
      invId,
      providerPayload,
      forceReview: true,
    });
  }

  const action = getManualInvoicePaidWebhookAction(invoice.status);
  if (action === "already_paid") {
    return { body: `OK${invId}`, status: 200 };
  }
  if (action === "mark_review") {
    return markManualInvoicePaymentRequiresReview({
      admin,
      invoiceId: String(invoice.id),
      invId,
      providerPayload,
    });
  }
  const paidAt = new Date().toISOString();
  const { data: updatedInvoice, error: updateError } = await admin
    .from("billing_manual_invoices")
    .update({
      status: "paid",
      paid_at: paidAt,
      provider_status: "paid",
      provider_payload: providerPayload,
      updated_at: paidAt,
    })
    .eq("id", invoice.id)
    .eq("status", "issued")
    .select("id,status")
    .maybeSingle();

  if (updateError) {
    console.error("[billing][robokassa-webhook] manual invoice update failed", {
      invoiceId: invoice.id,
      providerInvoiceId: String(invId),
      message: updateError.message,
    });
    return { body: "INVOICE_UPDATE_FAILED", status: 500 };
  }

  if (!updatedInvoice) {
    return markManualInvoicePaymentRequiresReview({
      admin,
      invoiceId: String(invoice.id),
      invId,
      providerPayload,
    });
  }

  return { body: `OK${invId}`, status: 200 };
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
    console.error("[billing][robokassa-webhook] manual invoice race reload failed", {
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
    console.error("[billing][robokassa-webhook] manual invoice review update failed", {
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

export async function POST(req: NextRequest) {
  return handleWebhook(req);
}

// Compatibility fallback: some merchants can accidentally set ResultURL method to GET.
export async function GET(req: NextRequest) {
  return handleWebhook(req);
}
