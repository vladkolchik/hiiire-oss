type PlanKey = "starter" | "professional" | "enterprise";

const planLabel = (p: PlanKey) => (p === "starter" ? "Starter" : p === "professional" ? "Professional" : "Enterprise");

type MarketingTouchInput = {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  msclkid?: string | null;
};

type MarketingAttributionInput = {
  visitor_id?: string | null;
  landing_path?: string | null;
  referrer?: string | null;
  captured_at?: string | null;
  first_touch?: MarketingTouchInput | null;
  last_touch?: MarketingTouchInput | null;
};

export type OwnerSignupPlatformSummary = {
  companies: number;
  users: number;
  vacancies: number;
  candidates: number;
  aiRequests: number;
};

export type OwnerSignupMessageInput = {
  userId: string;
  companyId?: string | null;
  name: string;
  email: string;
  phone: string;
  company: string;
  requestedPlan: "starter" | "professional";
  marketingAttribution?: MarketingAttributionInput | null;
  platformSummary?: OwnerSignupPlatformSummary | null;
};

function cleanTelegramValue(value: unknown, fallback = "не указано", maxLength = 240) {
  const normalized = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
    .replace(/[\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const safe = normalized || fallback;
  return safe.length > maxLength ? `${safe.slice(0, maxLength - 1)}…` : safe;
}

function cleanOptionalTelegramValue(value: unknown, maxLength = 240) {
  const normalized = cleanTelegramValue(value, "", maxLength);
  return normalized || null;
}

function formatUtmTriplet(touch: MarketingTouchInput | null | undefined) {
  const source = cleanTelegramValue(touch?.utm_source, "direct", 120);
  const medium = cleanTelegramValue(touch?.utm_medium, "none", 120);
  const campaign = cleanTelegramValue(touch?.utm_campaign, "not set", 160);
  return `${source} / ${medium} / ${campaign}`;
}

function hasTouchValue(touch: MarketingTouchInput | null | undefined) {
  return Boolean(
    touch?.utm_source ||
      touch?.utm_medium ||
      touch?.utm_campaign ||
      touch?.utm_term ||
      touch?.utm_content ||
      touch?.gclid ||
      touch?.fbclid ||
      touch?.msclkid,
  );
}

function normalizedTouchKey(touch: MarketingTouchInput | null | undefined) {
  return [
    touch?.utm_source,
    touch?.utm_medium,
    touch?.utm_campaign,
    touch?.utm_term,
    touch?.utm_content,
    touch?.gclid,
    touch?.fbclid,
    touch?.msclkid,
  ]
    .map((value) => cleanTelegramValue(value, "", 160))
    .join("|");
}

function shouldShowLastTouch(first: MarketingTouchInput | null | undefined, last: MarketingTouchInput | null | undefined) {
  if (!hasTouchValue(last)) return false;
  return normalizedTouchKey(first) !== normalizedTouchKey(last);
}

function formatClickIds(first: MarketingTouchInput | null | undefined, last: MarketingTouchInput | null | undefined) {
  const values: string[] = [];
  for (const key of ["gclid", "fbclid", "msclkid"] as const) {
    const firstValue = cleanOptionalTelegramValue(first?.[key], 160);
    const lastValue = cleanOptionalTelegramValue(last?.[key], 160);
    if (firstValue && lastValue && firstValue !== lastValue) {
      values.push(`first_${key}=${firstValue}`, `last_${key}=${lastValue}`);
      continue;
    }
    const value = firstValue ?? lastValue;
    if (value) values.push(`${key}=${value}`);
  }
  return values.length ? values.join(", ") : null;
}

function formatTouchDetailLines(label: "First" | "Last", touch: MarketingTouchInput | null | undefined) {
  const term = cleanOptionalTelegramValue(touch?.utm_term, 160);
  const content = cleanOptionalTelegramValue(touch?.utm_content, 160);
  return [term ? `${label} utm_term: ${term}` : null, content ? `${label} utm_content: ${content}` : null].filter(
    Boolean,
  ) as string[];
}

function formatSummaryLines(summary: OwnerSignupPlatformSummary | null | undefined) {
  if (!summary) {
    return ["Сводка платформы:", "Не удалось загрузить актуальную сводку."];
  }

  return [
    "Сводка платформы:",
    `Компании: ${summary.companies}`,
    `Пользователи: ${summary.users}`,
    `Вакансии: ${summary.vacancies}`,
    `Кандидаты: ${summary.candidates}`,
    `Запросы к ИИ: ${summary.aiRequests}`,
  ];
}

export function formatOwnerSignupMessage(input: OwnerSignupMessageInput): string {
  const attribution = input.marketingAttribution;
  const firstTouch = attribution?.first_touch ?? null;
  const lastTouch = attribution?.last_touch ?? null;
  const landing = cleanOptionalTelegramValue(attribution?.landing_path, 320);
  const referrer = cleanOptionalTelegramValue(attribution?.referrer, 320);
  const showLastTouch = Boolean(attribution && shouldShowLastTouch(firstTouch, lastTouch));
  const clickIds = formatClickIds(firstTouch, lastTouch);

  const lines = [
    "🆕 Новая регистрация",
    "",
    `Имя: ${cleanTelegramValue(input.name)}`,
    `Email: ${cleanTelegramValue(input.email, "не указан", 320)}`,
    `Телефон: ${cleanTelegramValue(input.phone)}`,
    `Компания: ${cleanTelegramValue(input.company)}`,
    `План: ${planLabel(input.requestedPlan)}`,
    `User ID: ${cleanTelegramValue(input.userId, "не указан", 120)}`,
    input.companyId ? `Company ID: ${cleanTelegramValue(input.companyId, "не указан", 120)}` : null,
    "",
    attribution ? `First-touch UTM: ${formatUtmTriplet(firstTouch)}` : "Атрибуция не получена",
    ...formatTouchDetailLines("First", firstTouch),
    showLastTouch ? `Last-touch UTM: ${formatUtmTriplet(lastTouch)}` : null,
    ...(showLastTouch ? formatTouchDetailLines("Last", lastTouch) : []),
    clickIds ? `Click IDs: ${clickIds}` : null,
    landing ? `Landing: ${landing}` : null,
    referrer ? `Referrer: ${referrer}` : null,
    "",
    ...formatSummaryLines(input.platformSummary),
  ].filter(Boolean) as string[];

  return lines.join("\n");
}

export function formatOwnerLeadMessage(input: {
  fullName: string;
  email: string;
  phone: string;
  company: string;
  companySize?: string | null;
  message?: string | null;
  requestedPlan?: PlanKey;
}): string {
  const lines = [
    "📝 Новая заявка с лендинга",
    "",
    `Имя: ${input.fullName}`,
    `Email: ${input.email}`,
    `Телефон: ${input.phone}`,
    `Компания: ${input.company}`,
    `План: ${planLabel(input.requestedPlan ?? "enterprise")}`,
    input.companySize ? `Размер: ${input.companySize}` : null,
    input.message ? "" : null,
    input.message ? `Сообщение: ${input.message}` : null,
  ].filter(Boolean) as string[];
  return lines.join("\n");
}

export function formatOwnerPlanChangeRequestMessage(input: {
  companyName: string;
  requestedByEmail?: string | null;
  fromPlan: PlanKey;
  toPlan: PlanKey;
  message?: string | null;
}): string {
  const lines = [
    "📨 Запрос на смену тарифа",
    "",
    `Компания: ${input.companyName}`,
    input.requestedByEmail ? `От: ${input.requestedByEmail}` : null,
    `Тариф: ${planLabel(input.fromPlan)} → ${planLabel(input.toPlan)}`,
    input.message ? "" : null,
    input.message ? `Комментарий: ${input.message}` : null,
  ].filter(Boolean) as string[];
  return lines.join("\n");
}

export function formatClientPlanDecisionMessage(input: {
  companyName: string;
  decision: "approved" | "rejected";
  toPlan: PlanKey;
  decisionNote?: string | null;
}): string {
  const title = input.decision === "approved" ? "✅ Тариф обновлён" : "❌ Запрос на смену тарифа отклонён";
  const lines = [
    title,
    "",
    `Компания: ${input.companyName}`,
    input.decision === "approved" ? `Новый тариф: ${planLabel(input.toPlan)}` : null,
    input.decisionNote ? "" : null,
    input.decisionNote ? `Комментарий: ${input.decisionNote}` : null,
  ].filter(Boolean) as string[];
  return lines.join("\n");
}

export function formatClientCreditsGrantedMessage(input: { companyName: string; delta: number; reason: string }): string {
  const lines = ["💳 Начислены кредиты", "", `Компания: ${input.companyName}`, `Начислено: +${input.delta}`, `Причина: ${input.reason}`];
  return lines.join("\n");
}

export function formatClientCreditTopupPaidMessage(input: { companyName: string; credits: number; amountKopecks: number }): string {
  const amountRub = (input.amountKopecks / 100).toLocaleString("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  });
  return [
    "Пополнение баланса оплачено",
    "",
    `Компания: ${input.companyName}`,
    `Кредиты: +${input.credits}`,
    `Сумма: ${amountRub}`,
    "",
    "Кредиты уже добавлены в общий баланс.",
  ].join("\n");
}

export function formatClientPlanExpiryMessage(input: {
  companyName: string;
  kind: "expires_7d" | "expires_1d" | "expired";
  expiresAtIso: string;
}): string {
  const dt = new Date(input.expiresAtIso);
  const date = Number.isFinite(dt.getTime()) ? dt.toLocaleString() : input.expiresAtIso;
  const title =
    input.kind === "expires_7d"
      ? "⏳ Тариф истекает через 7 дней"
      : input.kind === "expires_1d"
      ? "⏳ Тариф истекает завтра"
      : "⛔️ Тариф истёк";
  return [title, "", `Компания: ${input.companyName}`, `Дата/время: ${date}`, "", "Откройте «Настройки → Тариф», чтобы отправить запрос на продление/смену."].join(
    "\n"
  );
}
