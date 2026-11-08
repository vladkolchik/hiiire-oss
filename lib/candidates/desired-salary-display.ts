const SUPPORTED_DESIRED_SALARY_CURRENCIES = new Set(["RUB", "USD", "EUR", "KZT"]);
const DESIRED_SALARY_AMOUNT_MAX = 999_999_999_999_999;

export type CandidateDesiredSalaryDisplayInput = {
  desiredSalaryText?: string | null;
  desiredSalaryAmount?: number | null;
  desiredSalaryCurrency?: string | null;
};

export function formatCandidateDesiredSalary(input: CandidateDesiredSalaryDisplayInput): string | null {
  const text = normalizeWhitespace(input.desiredSalaryText ?? "");
  if (text) return text;

  const amount = normalizeAmount(input.desiredSalaryAmount);
  const currency = normalizeCurrency(input.desiredSalaryCurrency);
  if (amount === null || currency === null) return null;

  return `${formatAmount(amount)} ${formatCurrency(currency)}`;
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
  return SUPPORTED_DESIRED_SALARY_CURRENCIES.has(normalized) ? normalized : null;
}

function formatCurrency(currency: string): string {
  return currency === "RUB" ? "₽" : currency;
}

function formatAmount(amount: number): string {
  return Math.trunc(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}
