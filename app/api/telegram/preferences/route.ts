import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCompanyContext } from "@/lib/access/company-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  telegramEnabled: z.boolean(),
});

const INVALID_BODY_MESSAGE = "Проверьте настройку уведомлений и попробуйте ещё раз.";
const SAVE_FAILED_MESSAGE = "Не удалось сохранить настройку уведомлений. Попробуйте ещё раз.";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const body = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "INVALID_BODY", message: INVALID_BODY_MESSAGE }, { status: 400 });

    const { error } = await supabase
      .from("telegram_notification_settings")
      .upsert({ user_id: ctx.userId, telegram_enabled: parsed.data.telegramEnabled }, { onConflict: "user_id" });
    if (error) return NextResponse.json({ error: "UPSERT_FAILED", message: SAVE_FAILED_MESSAGE }, { status: 500 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: SAVE_FAILED_MESSAGE }, { status: 500 });
  }
}

