import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCompanyContext } from "@/lib/access/company-guards";

export async function POST(_req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const nowIso = new Date().toISOString();
    const { error } = await admin
      .from("integrations_accounts")
      .update({
        is_active: false,
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
        updated_at: nowIso,
      })
      .eq("company_id", ctx.companyId)
      .eq("user_id", ctx.userId)
      .eq("provider", "hh.ru");

    if (error) return NextResponse.json({ error: "DISCONNECT_FAILED" }, { status: 500 });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

