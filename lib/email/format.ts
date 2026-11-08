export type EmailContent = {
  subject: string;
  text: string;
  html: string;
};

type PlanKey = "starter" | "professional" | "enterprise";

const planLabel = (p: PlanKey) => (p === "starter" ? "Starter" : p === "professional" ? "Professional" : "Enterprise");

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function textToHtmlParagraphs(text: string): string {
  const safe = escapeHtml(text);
  // Preserve newlines without forcing <pre> (better mobile readability).
  return safe.split("\n").map((line) => (line.trim().length ? `<p style="margin:0 0 10px 0">${line}</p>` : `<div style="height:10px"></div>`)).join("");
}

export function renderEmailLayout(input: { title: string; bodyText: string; footerText?: string }): EmailContent {
  const title = input.title.trim();
  const bodyText = input.bodyText.trim();
  const footerText = (input.footerText ?? "hiiire").trim();

  const subject = title;
  const text = `${title}\n\n${bodyText}\n\n—\n${footerText}`.trim();

  const html = [
    `<div style="background:#fafafa;padding:32px 12px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#09090b">`,
    `<div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7">`,
    `<div style="padding:24px 24px 18px 24px;border-bottom:1px solid #e4e4e7">`,
    `<div style="font-size:15px;font-weight:700;line-height:1;color:#09090b">hiiire</div>`,
    `<div style="font-size:22px;font-weight:700;margin-top:18px;line-height:1.25;color:#09090b">${escapeHtml(title)}</div>`,
    `</div>`,
    `<div style="padding:22px 24px 24px 24px;color:#27272a;font-size:14px;line-height:1.65">`,
    textToHtmlParagraphs(bodyText),
    `</div>`,
    `<div style="padding:16px 24px;background:#f4f4f5;color:#71717a;font-size:12px;line-height:1.45">`,
    `<div>${escapeHtml(footerText)}</div>`,
    `</div>`,
    `</div>`,
    `</div>`,
  ].join("");

  return { subject, text, html };
}

export function formatOwnerPlanChangeRequestEmail(input: {
  companyName: string;
  requestedByEmail?: string | null;
  fromPlan: PlanKey;
  toPlan: PlanKey;
  message?: string | null;
}): EmailContent {
  const lines = [
    `Компания: ${input.companyName}`,
    input.requestedByEmail ? `От: ${input.requestedByEmail}` : null,
    `Тариф: ${planLabel(input.fromPlan)} → ${planLabel(input.toPlan)}`,
    input.message ? "" : null,
    input.message ? `Комментарий: ${input.message}` : null,
  ].filter(Boolean) as string[];

  return renderEmailLayout({
    title: "Запрос на смену тарифа",
    bodyText: lines.join("\n"),
    footerText: "Это служебное уведомление для команды hiiire.",
  });
}

export function formatClientPlanDecisionEmail(input: {
  companyName: string;
  decision: "approved" | "rejected";
  toPlan: PlanKey;
  decisionNote?: string | null;
}): EmailContent {
  const title = input.decision === "approved" ? "Тариф обновлён" : "Запрос на смену тарифа отклонён";
  const lines = [
    `Компания: ${input.companyName}`,
    input.decision === "approved" ? `Новый тариф: ${planLabel(input.toPlan)}` : null,
    input.decisionNote ? "" : null,
    input.decisionNote ? `Комментарий: ${input.decisionNote}` : null,
  ].filter(Boolean) as string[];

  return renderEmailLayout({
    title,
    bodyText: lines.join("\n"),
    footerText: "Если у вас есть вопросы — ответьте на это письмо или напишите в поддержку.",
  });
}

export function formatClientCreditsGrantedEmail(input: { companyName: string; delta: number; reason: string }): EmailContent {
  const lines = [`Компания: ${input.companyName}`, `Начислено: +${input.delta}`, `Причина: ${input.reason}`];
  return renderEmailLayout({
    title: "Начислены кредиты",
    bodyText: lines.join("\n"),
    footerText: "Откройте «Настройки → Тариф», чтобы увидеть актуальный баланс.",
  });
}

export function formatClientCreditTopupPaidEmail(input: { companyName: string; credits: number; amountKopecks: number }): EmailContent {
  const amountRub = (input.amountKopecks / 100).toLocaleString("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  });
  const lines = [
    `Компания: ${input.companyName}`,
    `Кредиты: +${input.credits}`,
    `Сумма: ${amountRub}`,
    "",
    "Кредиты уже добавлены в общий баланс.",
  ];

  return renderEmailLayout({
    title: "Пополнение баланса оплачено",
    bodyText: lines.join("\n"),
    footerText: "Откройте «Настройки → Тариф», чтобы увидеть актуальный баланс.",
  });
}

export function formatClientPlanExpiryEmail(input: {
  companyName: string;
  kind: "expires_7d" | "expires_1d" | "expired";
  expiresAtIso: string;
}): EmailContent {
  const dt = new Date(input.expiresAtIso);
  const date = Number.isFinite(dt.getTime()) ? dt.toLocaleString("ru-RU") : input.expiresAtIso;
  const title =
    input.kind === "expires_7d"
      ? "Тариф истекает через 7 дней"
      : input.kind === "expires_1d"
      ? "Тариф истекает завтра"
      : "Тариф истёк";

  const lines = [
    `Компания: ${input.companyName}`,
    `Дата/время: ${date}`,
    "",
    "Откройте «Настройки → Тариф», чтобы отправить запрос на продление/смену.",
  ];

  return renderEmailLayout({
    title,
    bodyText: lines.join("\n"),
    footerText: "Это автоматическое уведомление от hiiire.",
  });
}

export function formatAdminBroadcastEmail(input: { subject: string; body: string }): EmailContent {
  return renderEmailLayout({
    title: input.subject,
    bodyText: input.body,
    footerText: "Сообщение отправлено администратором платформы hiiire.",
  });
}

