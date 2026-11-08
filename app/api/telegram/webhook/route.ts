import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendTelegramMessage } from "@/lib/telegram/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    date?: number;
    text?: string;
    chat?: { id: number; type?: string };
    from?: { id: number; username?: string; first_name?: string; last_name?: string };
  };
};

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parseStartToken(text: string): string | null {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  const [command, token] = parts;
  if (command !== "/start") return null;
  if (parts.length === 2) return token;
  return null;
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const expected = String(process.env.TELEGRAM_WEBHOOK_SECRET ?? "");
  if (!expected || secret !== expected) {
    // Telegram expects 200 even on ignored updates (avoid retries storms).
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  const msg = update?.message;
  const chatId = msg?.chat?.id;
  const chatType = msg?.chat?.type;
  if (!msg || typeof chatId !== "number" || !Number.isSafeInteger(chatId)) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const text = safeTrim(msg.text);
  const admin = getSupabaseAdminClient();

  // Best-effort "seen"
  await admin.from("telegram_user_links").update({ last_seen_at: new Date().toISOString() }).eq("chat_id", chatId);

  if (text === "/unlink" || text === "/stop") {
    const { error: deleteErr } = await admin.from("telegram_user_links").delete().eq("chat_id", chatId);
    if (deleteErr) {
      await sendTelegramMessage({
        chatId,
        text: "Не удалось отключить уведомления. Попробуйте ещё раз через пару минут или отключите Telegram в hiiire: Настройки → Уведомления.",
      }).catch(() => null);
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    await sendTelegramMessage({
      chatId,
      text: "Ок, отключил уведомления для этого чата.\n\nЕсли захотите подключить снова — зайдите в hiiire: Настройки → Уведомления → Telegram.",
    }).catch(() => null);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const token = parseStartToken(text);
  if (!token) {
    // Ignore other messages for now (no bot UX yet).
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (chatType !== "private") {
    await sendTelegramMessage({
      chatId,
      text: "Подключение доступно только в личном чате с ботом.\n\nОткройте hiiire: Настройки → Уведомления → Telegram и нажмите «Подключить Telegram» ещё раз.",
    }).catch(() => null);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const nowIso = new Date().toISOString();
  const { data: tokenRow, error: tokenErr } = await admin
    .from("telegram_connect_tokens")
    .select("token,user_id,expires_at,used_at")
    .eq("token", token)
    .maybeSingle();

  if (tokenErr) {
    await sendTelegramMessage({
      chatId,
      text: "Сейчас не удалось проверить ссылку Telegram. Попробуйте ещё раз через пару минут.",
    }).catch(() => null);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (!tokenRow) {
    await sendTelegramMessage({
      chatId,
      text: "Не удалось подключить: ссылка недействительна.\n\nОткройте hiiire: Настройки → Уведомления → Telegram и сгенерируйте новую ссылку.",
    }).catch(() => null);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const expiresAt = new Date(String(tokenRow.expires_at));
  const isExpired = !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < Date.now();
  if (tokenRow.used_at || isExpired) {
    await sendTelegramMessage({
      chatId,
      text: "Не удалось подключить: ссылка уже использована или истекла.\n\nОткройте hiiire: Настройки → Уведомления → Telegram и сгенерируйте новую ссылку.",
    }).catch(() => null);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Prevent linking one chat to a different user.
  const { data: existingByChat, error: existingErr } = await admin
    .from("telegram_user_links")
    .select("user_id,chat_id")
    .eq("chat_id", chatId)
    .maybeSingle();
  if (existingErr) {
    await sendTelegramMessage({
      chatId,
      text: "Сейчас не удалось проверить подключение Telegram-чата. Попробуйте ещё раз через пару минут.",
    }).catch(() => null);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (existingByChat?.user_id && existingByChat.user_id !== tokenRow.user_id) {
    await sendTelegramMessage({
      chatId,
      text: "Этот Telegram-чат уже подключён к другому аккаунту hiiire.\n\nЕсли это ошибка — сначала выполните /unlink, затем повторите подключение из нужного аккаунта.",
    }).catch(() => null);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const { data: claimedToken, error: claimErr } = await admin
    .from("telegram_connect_tokens")
    .update({ used_at: nowIso })
    .eq("token", token)
    .is("used_at", null)
    .gt("expires_at", nowIso)
    .select("token,user_id,expires_at,used_at")
    .maybeSingle();

  if (claimErr || !claimedToken) {
    await sendTelegramMessage({
      chatId,
      text: "Не удалось подключить: ссылка уже использована или истекла.\n\nОткройте hiiire: Настройки → Уведомления → Telegram и сгенерируйте новую ссылку.",
    }).catch(() => null);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Upsert link for this user
  const { error: upsertErr } = await admin.from("telegram_user_links").upsert(
    {
      user_id: claimedToken.user_id,
      chat_id: chatId,
      connected_at: nowIso,
      last_seen_at: nowIso,
    },
    { onConflict: "user_id" }
  );
  if (upsertErr) {
    await sendTelegramMessage({
      chatId,
      text: "Не удалось подключить уведомления.\n\nОткройте hiiire: Настройки → Уведомления → Telegram и сгенерируйте новую ссылку.",
    }).catch(() => null);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  await sendTelegramMessage({
    chatId,
    text: "Готово! Telegram уведомления подключены.\n\nЧтобы отключить — отправьте /unlink или сделайте это в hiiire: Настройки → Уведомления → Telegram.",
  }).catch(() => null);

  return NextResponse.json({ ok: true }, { status: 200 });
}

