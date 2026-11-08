import { NextResponse, type NextRequest } from "next/server";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseInvId(raw: string | null): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

export async function GET(req: NextRequest) {
  try {
    const invId = parseInvId(req.nextUrl.searchParams.get("invId"));
    if (invId === null) {
      return NextResponse.json({ error: "INVALID_INV_ID" }, { status: 400 });
    }

    const expectedPaymentIdRaw = req.nextUrl.searchParams.get("paymentId");
    const expectedPaymentId = typeof expectedPaymentIdRaw === "string" && expectedPaymentIdRaw.trim().length > 0
      ? expectedPaymentIdRaw.trim()
      : null;

    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const { data: payment, error: paymentError } = await admin
      .from("payments")
      .select("id,inv_id,status,plan,amount,period_start,period_end,completed_at,failed_at,fail_reason")
      .eq("company_id", ctx.companyId)
      .eq("inv_id", invId)
      .maybeSingle();

    if (paymentError || !payment) {
      return NextResponse.json({ error: "PAYMENT_NOT_FOUND" }, { status: 404 });
    }

    if (expectedPaymentId && expectedPaymentId !== String(payment.id)) {
      return NextResponse.json({ error: "PAYMENT_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json(
      {
        invId: payment.inv_id,
        paymentId: String(payment.id),
        status: payment.status,
        plan: payment.plan,
        amount: Number(payment.amount ?? 0),
        periodStart: payment.period_start,
        periodEnd: payment.period_end,
        completedAt: payment.completed_at,
        failedAt: payment.failed_at,
        failReason: payment.fail_reason,
      },
      {
        status: 200,
        headers: { "cache-control": "no-store" },
      }
    );
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
