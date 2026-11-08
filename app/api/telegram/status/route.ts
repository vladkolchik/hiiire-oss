import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCompanyContext } from "@/lib/access/company-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const [{ data: link, error: linkErr }, { data: prefs, error: prefsErr }] = await Promise.all([
      supabase.from("telegram_user_links").select("chat_id,connected_at").eq("user_id", ctx.userId).maybeSingle(),
      supabase.from("telegram_notification_settings").select("telegram_enabled").eq("user_id", ctx.userId).maybeSingle(),
    ]);
    if (linkErr || prefsErr) return NextResponse.json({ error: "LOOKUP_FAILED" }, { status: 500 });

    if (!link) {
      return NextResponse.json({ connected: false, telegramEnabled: (prefs?.telegram_enabled ?? true) === true }, { status: 200 });
    }

    return NextResponse.json(
      { connected: true, chatId: link.chat_id, connectedAt: link.connected_at, telegramEnabled: (prefs?.telegram_enabled ?? true) === true },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

