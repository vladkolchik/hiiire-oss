import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCompanyContext } from "@/lib/access/company-guards";
import { getTelegramBotUsername } from "@/lib/telegram/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TELEGRAM_CONNECT_LINK_ERROR_MESSAGE = "Не удалось подготовить ссылку Telegram. Попробуйте ещё раз.";

export async function POST(_req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const token = randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { error } = await admin.from("telegram_connect_tokens").insert({
      token,
      user_id: ctx.userId,
      expires_at: expiresAt,
      used_at: null,
    });
    if (error) return NextResponse.json({ error: "TOKEN_INSERT_FAILED", message: TELEGRAM_CONNECT_LINK_ERROR_MESSAGE }, { status: 500 });

    const username = getTelegramBotUsername();
    const url = `https://t.me/${encodeURIComponent(username)}?start=${encodeURIComponent(token)}`;

    return NextResponse.json({ ok: true, url, expiresAt }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: TELEGRAM_CONNECT_LINK_ERROR_MESSAGE }, { status: 500 });
  }
}

