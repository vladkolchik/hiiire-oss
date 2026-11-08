import type { ManualInvoiceStatus } from "./enterprise-billing.ts";

export type ManualInvoiceDraftValidationError =
  | "AMOUNT_REQUIRED"
  | "AMOUNT_TOO_LARGE"
  | "DESCRIPTION_REQUIRED"
  | "DESCRIPTION_TOO_LONG"
  | "FISCAL_ITEM_NAME_TOO_LONG"
  | "PAYER_EMAIL_REQUIRED"
  | "PAYER_EMAIL_TOO_LONG"
  | "PAYER_EMAIL_INVALID";

export type ManualInvoiceWebhookParseError = "INVALID_PARAMS" | "INVALID_INV_ID";

export type ManualInvoicePaidWebhookAction = "mark_paid" | "mark_review" | "already_paid";

export type ManualInvoiceWebhookPayload =
  | {
      ok: true;
      outSum: string;
      invId: number;
      providerInvoiceId: string;
      signatureValue: string;
      providerPayload: Record<string, string>;
    }
  | { ok: false; error: ManualInvoiceWebhookParseError };

export const MAX_MANUAL_INVOICE_AMOUNT_KOPECKS = 2_147_483_647;
export const MANUAL_INVOICE_DESCRIPTION_MAX_LENGTH = 5000;
export const MANUAL_INVOICE_FISCAL_ITEM_NAME_MAX_LENGTH = 5000;
export const MANUAL_INVOICE_PAYER_EMAIL_MAX_LENGTH = 320;

function formatInvoiceOutSum(amountKopecks: number): string {
  return (amountKopecks / 100).toFixed(2);
}

function getParam(params: URLSearchParams, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = params.get(key);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function paramsToPayload(params: URLSearchParams): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    payload[key] = value;
  }
  return payload;
}

export function validateManualInvoiceDraft(input: {
  amountKopecks: number;
  description: string;
  payerEmail: string | null;
  fiscalItemName?: string | null;
}): { ok: true } | { ok: false; error: ManualInvoiceDraftValidationError } {
  if (!Number.isSafeInteger(input.amountKopecks) || input.amountKopecks <= 0) {
    return { ok: false, error: "AMOUNT_REQUIRED" };
  }
  if (input.amountKopecks > MAX_MANUAL_INVOICE_AMOUNT_KOPECKS) {
    return { ok: false, error: "AMOUNT_TOO_LARGE" };
  }

  if (!input.description.trim()) {
    return { ok: false, error: "DESCRIPTION_REQUIRED" };
  }
  if (input.description.length > MANUAL_INVOICE_DESCRIPTION_MAX_LENGTH) {
    return { ok: false, error: "DESCRIPTION_TOO_LONG" };
  }

  if ((input.fiscalItemName ?? "").length > MANUAL_INVOICE_FISCAL_ITEM_NAME_MAX_LENGTH) {
    return { ok: false, error: "FISCAL_ITEM_NAME_TOO_LONG" };
  }

  const payerEmail = input.payerEmail?.trim();
  if (!payerEmail) {
    return { ok: false, error: "PAYER_EMAIL_REQUIRED" };
  }
  if (payerEmail.length > MANUAL_INVOICE_PAYER_EMAIL_MAX_LENGTH) {
    return { ok: false, error: "PAYER_EMAIL_TOO_LONG" };
  }

  if (payerEmail && !/^[^\s@]+@[^\s@]+$/.test(payerEmail)) {
    return { ok: false, error: "PAYER_EMAIL_INVALID" };
  }

  return { ok: true };
}

export function shouldMarkManualInvoicePaid(status: ManualInvoiceStatus): boolean {
  return status === "issued";
}

export function getManualInvoicePaidWebhookAction(status: ManualInvoiceStatus): ManualInvoicePaidWebhookAction {
  if (shouldMarkManualInvoicePaid(status)) return "mark_paid";
  if (status === "paid") return "already_paid";
  if (status === "draft" || status === "canceled" || status === "expired" || status === "refunded" || status === "requires_review") {
    return "mark_review";
  }
  return "mark_review";
}

export function parseRobokassaManualInvoiceWebhookParams(params: URLSearchParams): ManualInvoiceWebhookPayload {
  const outSum = getParam(params, "OutSum", "outsum");
  const invIdRaw = getParam(params, "InvId", "InvID", "invId", "InvoiceID", "InvoiceId", "invid");
  const signatureValue = getParam(params, "SignatureValue", "signaturevalue");

  if (!outSum || !invIdRaw || !signatureValue) {
    return { ok: false, error: "INVALID_PARAMS" };
  }

  const invId = Number(invIdRaw);
  if (!Number.isSafeInteger(invId) || invId <= 0) {
    return { ok: false, error: "INVALID_INV_ID" };
  }

  return {
    ok: true,
    outSum,
    invId,
    providerInvoiceId: String(invId),
    signatureValue,
    providerPayload: paramsToPayload(params),
  };
}

export function mapRobokassaInvoiceStatus(providerStatus: string): ManualInvoiceStatus {
  const normalized = providerStatus.trim().toLowerCase();

  if (normalized === "paid" || normalized === "success") return "paid";
  if (normalized === "expired") return "expired";
  if (normalized === "cancelled" || normalized === "canceled") return "canceled";
  if (normalized === "refunded") return "refunded";
  if (normalized === "created" || normalized === "issued" || normalized === "new" || normalized === "notpaid") return "issued";

  return "requires_review";
}

export function buildManualInvoiceReceipt(input: {
  itemName: string;
  amountKopecks: number;
  quantity: number;
  tax: string;
}) {
  return {
    sno: "osn",
    items: [
      {
        name: input.itemName,
        quantity: input.quantity,
        sum: formatInvoiceOutSum(input.amountKopecks),
        tax: input.tax,
      },
    ],
  };
}
