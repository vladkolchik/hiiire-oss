export const CREDIT_TOPUP_PRESETS = [50, 100, 300, 600] as const;
export const CREDIT_TOPUP_PRICE_KOPECKS = 15 * 100;
export const CREDIT_TOPUP_MAX_DIGITS = 5;
export const CREDIT_TOPUP_MAX_CREDITS = 99_999;
export const CHECKOUT_TOPUP_REUSE_WINDOW_MS = 15 * 60 * 1000;

export type CreditTopupPaymentCandidate = {
  company_id?: unknown;
  credits?: unknown;
  amount?: unknown;
  currency?: unknown;
  status?: unknown;
  checkout_expires_at?: unknown;
  created_at?: unknown;
};

export type CreditTopupPaymentIntent = {
  companyId: string;
  credits: number;
  amount: number;
  currency: string;
  now: Date;
};

export function parseCreditTopupQuantity(value: string): number | null {
  if (!/^\d{1,5}$/.test(value)) return null;

  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > CREDIT_TOPUP_MAX_CREDITS) {
    return null;
  }
  return quantity;
}

export function calculateCreditTopupAmountKopecks(credits: number): number {
  if (!Number.isSafeInteger(credits) || credits < 1 || credits > CREDIT_TOPUP_MAX_CREDITS) {
    throw new Error("Invalid credit top-up quantity");
  }
  return credits * CREDIT_TOPUP_PRICE_KOPECKS;
}

function formatReceiptOutSum(amountKopecks: number): string {
  return (amountKopecks / 100).toFixed(2);
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function buildCreditTopupReceipt(input: { credits: number; amountKopecks: number }) {
  return {
    sno: "osn",
    items: [
      {
        name: `Пополнение баланса hiiire: ${input.credits} кредитов`,
        quantity: 1,
        sum: formatReceiptOutSum(input.amountKopecks),
        tax: "none",
      },
    ],
  };
}

export function shouldReuseCreditTopupPayment(
  candidate: CreditTopupPaymentCandidate | null | undefined,
  intent: CreditTopupPaymentIntent,
): boolean {
  if (!candidate) return false;
  if (candidate.company_id !== intent.companyId) return false;
  if (Number(candidate.credits) !== intent.credits) return false;
  if (Number(candidate.amount) !== intent.amount) return false;
  if (candidate.currency !== intent.currency) return false;
  if (candidate.status !== "pending") return false;

  const expiresAt = parseDate(candidate.checkout_expires_at);
  if (!expiresAt || expiresAt.getTime() <= intent.now.getTime()) return false;

  const createdAt = parseDate(candidate.created_at);
  if (createdAt && intent.now.getTime() - createdAt.getTime() > CHECKOUT_TOPUP_REUSE_WINDOW_MS) {
    return false;
  }

  return true;
}
