import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/admin/platform-guard";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

const ResolveReviewSchema = z.object({
  action: z.enum(["mark_paid", "reject"]),
});

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { isPlatformAdmin } = await requirePlatformAdmin();
    if (!isPlatformAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const params = await Promise.resolve(context.params);
    const invoiceId = String(params.id ?? "").trim();
    if (!invoiceId) return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });

    const body = await req.json().catch(() => null);
    const parsed = ResolveReviewSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

    const admin = getSupabaseAdminClient() as any;
    const { data: invoice, error: lookupError } = await admin
      .from("billing_manual_invoices")
      .select("id,agreement_id,status,provider_invoice_url,provider_status,created_at")
      .eq("id", invoiceId)
      .maybeSingle();

    if (lookupError) return NextResponse.json({ error: "INVOICE_LOOKUP_FAILED" }, { status: 500 });
    if (!invoice) return NextResponse.json({ error: "INVOICE_NOT_FOUND" }, { status: 404 });
    if (invoice.status !== "requires_review") {
      return NextResponse.json({ error: "INVOICE_NOT_REVIEWABLE" }, { status: 409 });
    }

    let isCurrentInvoice = true;
    if (invoice.agreement_id) {
      const { data: latestInvoice, error: latestInvoiceError } = await admin
        .from("billing_manual_invoices")
        .select("id")
        .eq("agreement_id", invoice.agreement_id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestInvoiceError) return NextResponse.json({ error: "INVOICE_LOOKUP_FAILED" }, { status: 500 });
      isCurrentInvoice = Boolean(latestInvoice && latestInvoice.id === invoice.id);
    }

    const hasPaymentEvidence = Boolean(invoice.provider_invoice_url) || invoice.provider_status === "paid_requires_review";
    if (parsed.data.action === "mark_paid") {
      if (!hasPaymentEvidence) {
        return NextResponse.json({ error: "INVOICE_PAYMENT_EVIDENCE_REQUIRED" }, { status: 409 });
      }
      if (!invoice.agreement_id) return NextResponse.json({ error: "INVOICE_AGREEMENT_REQUIRED" }, { status: 409 });

      const { data: agreement, error: agreementError } = await admin
        .from("enterprise_agreements")
        .select("id,status")
        .eq("id", invoice.agreement_id)
        .maybeSingle();

      if (agreementError) return NextResponse.json({ error: "AGREEMENT_LOOKUP_FAILED" }, { status: 500 });
      if (!agreement) return NextResponse.json({ error: "AGREEMENT_NOT_FOUND" }, { status: 404 });
      if (agreement.status !== "pending_payment") {
        return NextResponse.json({ error: "AGREEMENT_NOT_PENDING_PAYMENT" }, { status: 409 });
      }
      if (!isCurrentInvoice) {
        return NextResponse.json({ error: "INVOICE_NOT_CURRENT" }, { status: 409 });
      }
    }
    if (parsed.data.action === "reject" && (invoice.provider_invoice_url || (invoice.provider_status === "paid_requires_review" && isCurrentInvoice))) {
      return NextResponse.json({ error: "INVOICE_PROVIDER_LINK_ACTIVE" }, { status: 409 });
    }

    const reviewedAt = new Date().toISOString();
    const patch =
      parsed.data.action === "mark_paid"
        ? {
            status: "paid",
            paid_at: reviewedAt,
            provider_status: "paid_manual_review",
            updated_at: reviewedAt,
          }
        : {
            status: "canceled",
            canceled_at: reviewedAt,
            provider_status:
              invoice.provider_status === "paid_requires_review" && !isCurrentInvoice
                ? "not_applied_manual_review"
                : "canceled_manual_review",
            updated_at: reviewedAt,
          };

    const { data: updated, error: updateError } = await admin
      .from("billing_manual_invoices")
      .update(patch)
      .eq("id", invoice.id)
      .eq("status", "requires_review")
      .select("id,status,paid_at,canceled_at,provider_status")
      .maybeSingle();

    if (updateError) return NextResponse.json({ error: "INVOICE_REVIEW_RESOLVE_FAILED" }, { status: 500 });
    if (!updated) return NextResponse.json({ error: "INVOICE_REVIEW_CONFLICT" }, { status: 409 });

    return NextResponse.json({ invoice: updated }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
