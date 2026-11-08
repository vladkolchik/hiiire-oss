import { NextResponse, type NextRequest } from "next/server";

import { requirePlatformAdmin } from "@/lib/admin/platform-guard";
import { mapRobokassaInvoiceStatus } from "@/lib/billing/manual-invoices";
import { getRobokassaInvoiceStatus } from "@/lib/billing/robokassa-invoices";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> | { id: string } };

export async function POST(_req: NextRequest, context: RouteContext) {
  try {
    const { isPlatformAdmin } = await requirePlatformAdmin();
    if (!isPlatformAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const params = await Promise.resolve(context.params);
    const invoiceId = String(params.id ?? "").trim();
    if (!invoiceId) return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });

    const admin = getSupabaseAdminClient() as any;
    const { data: invoice, error } = await admin
      .from("billing_manual_invoices")
      .select("id,status,provider_invoice_id,provider_invoice_url,created_at")
      .eq("id", invoiceId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: "INVOICE_LOOKUP_FAILED" }, { status: 500 });
    if (!invoice) return NextResponse.json({ error: "INVOICE_NOT_FOUND" }, { status: 404 });
    const canRefreshProviderInvoice =
      (invoice.status === "issued" || invoice.status === "requires_review") && Boolean(invoice.provider_invoice_url);
    if (!canRefreshProviderInvoice) {
      return NextResponse.json({ error: "INVOICE_REFRESH_NOT_ALLOWED" }, { status: 409 });
    }
    if (!invoice.provider_invoice_id && !invoice.provider_invoice_url) {
      return NextResponse.json({ error: "INVOICE_PROVIDER_NOT_CONFIGURED" }, { status: 409 });
    }

    const invId = Number(invoice.provider_invoice_id ?? "");
    if (!Number.isSafeInteger(invId) || invId <= 0) {
      return NextResponse.json({ error: "INVOICE_PROVIDER_NOT_CONFIGURED" }, { status: 409 });
    }

    let providerResult;
    try {
      providerResult = await getRobokassaInvoiceStatus({
        invId,
        providerInvoiceId: invoice.provider_invoice_id,
        invoiceUrl: invoice.provider_invoice_url,
        createdAt: invoice.created_at,
      });
    } catch {
      return NextResponse.json({ error: "INVOICE_PROVIDER_REFRESH_FAILED" }, { status: 502 });
    }

    const nextStatus = mapRobokassaInvoiceStatus(providerResult.providerStatus);
    const refreshedAt = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status: nextStatus,
      provider_status: providerResult.providerStatus,
      provider_payload: providerResult.raw,
      updated_at: refreshedAt,
    };

    if (nextStatus === "paid") patch.paid_at = refreshedAt;
    if (nextStatus === "canceled") patch.canceled_at = refreshedAt;
    if (nextStatus === "expired" || nextStatus === "canceled" || nextStatus === "refunded") {
      patch.provider_invoice_url = null;
    }

    const { data: updated, error: updateError } = await admin
      .from("billing_manual_invoices")
      .update(patch)
      .eq("id", invoice.id)
      .eq("status", invoice.status)
      .select("id,status,provider_status,provider_payload,provider_invoice_url,paid_at,canceled_at")
      .maybeSingle();

    if (updateError) return NextResponse.json({ error: "INVOICE_REFRESH_UPDATE_FAILED" }, { status: 500 });
    if (!updated) return NextResponse.json({ error: "INVOICE_REFRESH_CONFLICT" }, { status: 409 });
    return NextResponse.json({ invoice: updated }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
