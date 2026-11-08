import { NextResponse, type NextRequest } from "next/server";

import { requirePlatformAdmin } from "@/lib/admin/platform-guard";
import { deactivateRobokassaInvoice } from "@/lib/billing/robokassa-invoices";
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
    const { data: invoice, error: lookupError } = await admin
      .from("billing_manual_invoices")
      .select("id,status,provider_invoice_id,provider_invoice_url")
      .eq("id", invoiceId)
      .maybeSingle();

    if (lookupError) return NextResponse.json({ error: "INVOICE_LOOKUP_FAILED" }, { status: 500 });
    if (!invoice) return NextResponse.json({ error: "INVOICE_NOT_FOUND" }, { status: 404 });
    const canDeactivateProviderInvoice =
      (invoice.status === "issued" || invoice.status === "requires_review") && Boolean(invoice.provider_invoice_url);
    if (invoice.status !== "draft" && !canDeactivateProviderInvoice) {
      return NextResponse.json({ error: "INVOICE_CANNOT_BE_CANCELED" }, { status: 409 });
    }

    const canceledAt = new Date().toISOString();
    let providerPayload: unknown;
    if (canDeactivateProviderInvoice) {
      const invId = Number(invoice.provider_invoice_id ?? "");
      if (!Number.isSafeInteger(invId) || invId <= 0) {
        return NextResponse.json({ error: "INVOICE_PROVIDER_NOT_CONFIGURED" }, { status: 409 });
      }

      try {
        providerPayload = (
          await deactivateRobokassaInvoice({
            invId,
            providerInvoiceId: invoice.provider_invoice_id,
            invoiceUrl: invoice.provider_invoice_url,
          })
        ).raw;
      } catch {
        return NextResponse.json({ error: "INVOICE_PROVIDER_CANCEL_FAILED" }, { status: 502 });
      }
    }

    const patch: Record<string, unknown> = {
      status: "canceled",
      canceled_at: canceledAt,
      updated_at: canceledAt,
    };
    if (canDeactivateProviderInvoice) {
      patch.provider_invoice_url = null;
      patch.provider_status = "canceled_provider_deactivated";
      patch.provider_payload = providerPayload ?? null;
    }

    const { data: updated, error: updateError } = await admin
      .from("billing_manual_invoices")
      .update(patch)
      .eq("id", invoice.id)
      .eq("status", invoice.status)
      .select("id,status,canceled_at,provider_invoice_url,provider_status,provider_payload")
      .maybeSingle();

    if (updateError) return NextResponse.json({ error: "INVOICE_CANCEL_FAILED" }, { status: 500 });
    if (!updated) return NextResponse.json({ error: "INVOICE_CANCEL_CONFLICT" }, { status: 409 });
    return NextResponse.json({ invoice: updated }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
