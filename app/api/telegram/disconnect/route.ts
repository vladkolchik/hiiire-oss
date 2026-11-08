import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCompanyContext } from "@/lib/access/company-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TELEGRAM_DISCONNECT_ERROR_MESSAGE = "Не удалось отключить Telegram. Попробуйте ещё раз.";

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const { error } = await supabase.from("telegram_user_links").delete().eq("user_id", ctx.userId);
    if (error) return NextResponse.json({ error: "DELETE_FAILED", message: TELEGRAM_DISCONNECT_ERROR_MESSAGE }, { status: 500 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: TELEGRAM_DISCONNECT_ERROR_MESSAGE }, { status: 500 });
  }
}

