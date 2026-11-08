export type CandidateDesiredSalarySource = "hh" | "ai_parser" | "regex";

export type CandidateDesiredSalaryFields = {
  text: string | null;
  amount: number | null;
  currency: string | null;
  source: CandidateDesiredSalarySource | null;
};

export type CandidateDesiredSalaryHhUpdate = {
  shouldWrite: boolean;
  fields: CandidateDesiredSalaryFields;
};

export type CandidateDesiredSalaryDbPatch = {
  desired_salary_text: string | null;
  desired_salary_amount: number | null;
  desired_salary_currency: string | null;
  desired_salary_source: CandidateDesiredSalarySource | null;
};

export const DESIRED_SALARY_TEXT_MAX_LENGTH = 160;
const DESIRED_SALARY_CURRENCY_MAX_LENGTH = 12;
const DESIRED_SALARY_AMOUNT_MAX = 999_999_999_999_999;
const HH_RAW_JSON_MARKER = "Полные данные HH.ru (JSON):";

const EMPTY_DESIRED_SALARY: CandidateDesiredSalaryFields = {
  text: null,
  amount: null,
  currency: null,
  source: null,
};

const KNOWN_CURRENCY_CODES = new Set([
  "AED",
  "AMD",
  "AUD",
  "AZN",
  "BYN",
  "CAD",
  "CHF",
  "CNY",
  "EUR",
  "GBP",
  "GEL",
  "KGS",
  "KZT",
  "RUB",
  "RUR",
  "TRY",
  "UAH",
  "USD",
  "UZS",
]);

const SALARY_LINE_PATTERNS: RegExp[] = [
  /^\s*(?:ожидаемая|желаемая)\s+(?:зарплата|зп|компенсация|оплата)\s*:?\s*(.+)$/i,
  /^\s*(?:зарплатные\s+ожидания|ожидания\s+по\s+зарплате|ожидания\s+по\s+компенсации)\s*:?\s*(.+)$/i,
  /^\s*зп\s*(?:[:\-]\s*)?((?:от|до)\s+.+|\d.+)$/i,
  /^\s*expected\s+salary\s*:\s*(.+)$/i,
  /^\s*salary\s+expectation\s*:\s*(.+)$/i,
];

const NEGATIVE_SALARY_CONTEXT = /\b(?:текущая|текущий|прошл(?:ый|ом|ая|ое)|предыдущ(?:ий|ем|ая|ее)|был[аио]?|доход|оклад)\b/i;

export function normalizeDesiredSalaryFields(input: Partial<CandidateDesiredSalaryFields>): CandidateDesiredSalaryFields {
  const source = normalizeSource(input.source);
  const amount = normalizeAmount(input.amount);
  const currency = normalizeCurrency(input.currency);
  const rawText = normalizeWhitespace(input.text ?? "");
  const text = rawText ? rawText.slice(0, DESIRED_SALARY_TEXT_MAX_LENGTH) : null;

  if (!source) return emptyDesiredSalary();

  if (text) {
    return {
      text,
      amount,
      currency,
      source,
    };
  }

  if (amount === null) return emptyDesiredSalary();

  return {
    text: `${formatAmount(amount)}${currency ? ` ${currency}` : ""}`,
    amount,
    currency,
    source,
  };
}

export function extractDesiredSalaryText(resumeText?: string): string | null {
  const safeText = String(resumeText ?? "").trim();
  if (!safeText) return null;

  const textWithoutRawJson = stripHhRawJson(safeText);
  const lines = textWithoutRawJson.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = normalizeWhitespace(rawLine);
    if (!line || NEGATIVE_SALARY_CONTEXT.test(line)) continue;

    for (const pattern of SALARY_LINE_PATTERNS) {
      const match = line.match(pattern);
      if (!match) continue;
      const value = normalizeWhitespace(match[1] ?? "");
      if (isPlaceholderValue(value)) return null;
      return value;
    }
  }

  return null;
}

export function extractDesiredSalaryFromText(resumeText?: string): CandidateDesiredSalaryFields {
  const text = extractDesiredSalaryText(resumeText);
  if (!text) return emptyDesiredSalary();

  return normalizeDesiredSalaryFields({
    text,
    amount: extractAmount(text),
    currency: extractCurrency(text),
    source: "regex",
  });
}

export function extractDesiredSalaryFromHhResume(resume: unknown): CandidateDesiredSalaryFields {
  const salary = readHhSalary(resume);
  if (!salary.valid) return emptyDesiredSalary();

  return normalizeDesiredSalaryFields({
    amount: salary.amount,
    currency: salary.currency,
    source: "hh",
  });
}

export function extractDesiredSalaryUpdateFromHhResume(resume: unknown): CandidateDesiredSalaryHhUpdate {
  if (!isRecord(resume) || !Object.prototype.hasOwnProperty.call(resume, "salary")) {
    return { shouldWrite: false, fields: emptyDesiredSalary() };
  }

  if (resume.salary === null) {
    return { shouldWrite: true, fields: emptyDesiredSalary() };
  }

  const fields = extractDesiredSalaryFromHhResume(resume);
  if (fields.source !== "hh") {
    return { shouldWrite: false, fields: emptyDesiredSalary() };
  }

  return { shouldWrite: true, fields };
}

export function buildDesiredSalaryDbPatchFromHhResume(resume: unknown): CandidateDesiredSalaryDbPatch | null {
  const update = extractDesiredSalaryUpdateFromHhResume(resume);
  if (!update.shouldWrite) return null;

  return {
    desired_salary_text: update.fields.text,
    desired_salary_amount: update.fields.amount,
    desired_salary_currency: update.fields.currency,
    desired_salary_source: update.fields.source,
  };
}

function readHhSalary(resume: unknown): { valid: true; amount: number; currency: string } | { valid: false } {
  if (!isRecord(resume) || !isRecord(resume.salary)) return { valid: false };

  const amount = normalizeAmount(resume.salary.amount);
  const currency = normalizeCurrency(resume.salary.currency);
  if (amount === null || currency === null) return { valid: false };

  return { valid: true, amount, currency };
}

function normalizeSource(source: unknown): CandidateDesiredSalarySource | null {
  return source === "hh" || source === "ai_parser" || source === "regex" ? source : null;
}

function normalizeAmount(amount: unknown): number | null {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  const normalized = Math.trunc(amount);
  if (normalized < 0 || normalized > DESIRED_SALARY_AMOUNT_MAX) return null;
  return normalized;
}

function normalizeCurrency(currency: unknown): string | null {
  if (typeof currency !== "string") return null;
  const normalized = currency.trim().toUpperCase();
  if (!normalized || normalized.length > DESIRED_SALARY_CURRENCY_MAX_LENGTH) return null;
  if (normalized === "RUR") return "RUB";
  if (normalized === "₽" || normalized === "Р" || normalized === "РУБ") return "RUB";
  if (normalized === "$") return "USD";
  if (normalized === "€") return "EUR";
  return KNOWN_CURRENCY_CODES.has(normalized) ? normalized : null;
}

function extractAmount(text: string): number | null {
  if (hasAmountRange(text)) return null;

  const match = text.match(/(\d+(?:[\s\u00A0]\d{3})+|\d+)(?:\s*(к|k|тыс\.?)(?=$|[\s.,;:)\]]))?/i);
  if (!match) return null;

  const base = Number((match[1] ?? "").replace(/[^\d]/g, ""));
  if (!Number.isFinite(base)) return null;
  const multiplier = match[2] ? 1000 : 1;
  return normalizeAmount(base * multiplier);
}

function hasAmountRange(text: string): boolean {
  const amount = String.raw`\d+(?:[\s\u00A0]\d{3})*`;
  const unit = String.raw`(?:\s*(?:к|k|тыс\.?))?`;
  return new RegExp(`${amount}${unit}\\s*(?:-|–|—|до)\\s*${amount}${unit}`, "i").test(text);
}

function extractCurrency(text: string): string | null {
  if (/[₽]/.test(text)) return "RUB";
  if (/(^|[\s(])(?:руб\.?|rub)(?=$|[\s).,])/i.test(text)) return "RUB";
  if (/(^|[\s(])rur(?=$|[\s).,])/i.test(text)) return "RUB";
  if (/(^|[\s(])(?:usd|\$)(?=$|[\s).,])/i.test(text)) return "USD";
  if (/(^|[\s(])(?:eur|€)(?=$|[\s).,])/i.test(text)) return "EUR";
  for (const match of text.matchAll(/(^|[\s(])([A-Z]{3})(?=$|[\s).,])/gi)) {
    const currency = normalizeCurrency(match[2]);
    if (currency) return currency;
  }
  return null;
}

function formatAmount(amount: number): string {
  return Math.trunc(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

function isPlaceholderValue(input: string): boolean {
  const normalized = normalizeWhitespace(input).toLowerCase();
  return normalized === "" || normalized === "-" || normalized === "—" || normalized === "n/a" || normalized === "не указана" || normalized === "не указано";
}

function stripHhRawJson(input: string): string {
  const markerIndex = input.indexOf(HH_RAW_JSON_MARKER);
  if (markerIndex < 0) return input;
  return input.slice(0, markerIndex);
}

function emptyDesiredSalary(): CandidateDesiredSalaryFields {
  return { ...EMPTY_DESIRED_SALARY };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
