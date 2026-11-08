"use server";

import { requirePlatformAdmin } from "@/lib/admin/platform-guard";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { listAllTelegramChatIds } from "@/lib/telegram/notify";
import { sendEmail } from "@/lib/email/client";
import { formatAdminBroadcastEmail } from "@/lib/email/format";
import { listAllEnabledEmails } from "@/lib/email/notify";

type ActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; message: string; attempted: number; sent: number; failed: number };

function asString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function broadcastTelegramAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) return { status: "error", message: "Нет доступа" };

  const text = asString(formData, "text");
  if (!text) return { status: "error", message: "Сообщение пустое" };
  if (text.length > 3500) return { status: "error", message: "Сообщение слишком длинное (макс 3500 символов)" };

  const chatIds = await listAllTelegramChatIds();
  if (!chatIds.length) {
    return { status: "success", message: "Нет подключённых пользователей бота", attempted: 0, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  const batchSize = 10; // keep under Telegram rate limits (best-effort)
  for (let i = 0; i < chatIds.length; i += batchSize) {
    const batch = chatIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map((chatId) => sendTelegramMessage({ chatId, text })));
    for (const r of results) {
      if (r.status === "fulfilled") sent += 1;
      else failed += 1;
    }
    // ~25 msgs/sec: 10 per 400ms
    if (i + batchSize < chatIds.length) await sleep(400);
  }

  return {
    status: "success",
    message: `Рассылка завершена: отправлено ${sent} / ошибок ${failed}`,
    attempted: chatIds.length,
    sent,
    failed,
  };
}

export async function broadcastEmailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) return { status: "error", message: "Нет доступа" };

  const subject = asString(formData, "subject");
  const body = asString(formData, "body");

  if (!subject) return { status: "error", message: "Тема письма пустая" };
  if (subject.length > 120) return { status: "error", message: "Тема слишком длинная (макс 120 символов)" };
  if (!body) return { status: "error", message: "Текст письма пустой" };
  if (body.length > 10_000) return { status: "error", message: "Текст письма слишком длинный (макс 10 000 символов)" };

  const emails = await listAllEnabledEmails();
  if (!emails.length) {
    return { status: "success", message: "Нет получателей (все отключили email или email не заполнен)", attempted: 0, sent: 0, failed: 0 };
  }

  // MVP safety: keep it bounded to avoid serverless timeouts.
  const maxRecipients = 500;
  if (emails.length > maxRecipients) {
    return {
      status: "error",
      message: `Слишком много получателей для синхронной рассылки (${emails.length}). MVP‑лимит: ${maxRecipients}.`,
    };
  }

  const content = formatAdminBroadcastEmail({ subject, body });

  let sent = 0;
  let failed = 0;

  const batchSize = 10; // conservative best-effort rate limiting
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((to) => sendEmail({ to, subject: content.subject, text: content.text, html: content.html }))
    );
    for (const r of results) {
      if (r.status === "fulfilled") sent += 1;
      else failed += 1;
    }
    if (i + batchSize < emails.length) await sleep(400);
  }

  return {
    status: "success",
    message: `Email‑рассылка завершена: отправлено ${sent} / ошибок ${failed}`,
    attempted: emails.length,
    sent,
    failed,
  };
}

