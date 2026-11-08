import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import { getRobokassaHashAlgorithm } from "@/lib/billing/env";
import { buildCheckoutSignatureBase, encodeRobokassaReceipt, sortedShpEntries, withShpSignatureBase } from "@/lib/billing/robokassa-signature";

function hashString(value: string): string {
  const algo = getRobokassaHashAlgorithm();
  return createHash(algo).update(value, "utf8").digest("hex");
}

export function createCheckoutSignature(input: {
  merchantLogin: string;
  outSum: string;
  invId: number;
  password1: string;
  receipt?: string | null;
  shp?: Record<string, string>;
}): string {
  return hashString(buildCheckoutSignatureBase(input));
}

export function createRecurringSignature(input: {
  merchantLogin: string;
  outSum: string;
  invoiceId: number;
  password1: string;
  receipt?: string | null;
}): string {
  const receiptSlot = input.receipt ? `:${input.receipt}` : "";
  return hashString(`${input.merchantLogin}:${input.outSum}:${input.invoiceId}${receiptSlot}:${input.password1}`);
}

export function createResultSignature(input: {
  outSum: string;
  invId: number;
  password2: string;
  shp?: Record<string, string>;
}): string {
  const base = `${input.outSum}:${input.invId}:${input.password2}`;
  return hashString(withShpSignatureBase(base, input.shp ?? {}));
}

export function verifyResultSignature(input: {
  outSum: string;
  invId: number;
  password2: string;
  signatureValue: string;
  shp?: Record<string, string>;
}): boolean {
  const expected = createResultSignature({
    outSum: input.outSum,
    invId: input.invId,
    password2: input.password2,
    shp: input.shp,
  }).trim().toLowerCase();
  const actual = input.signatureValue.trim().toLowerCase();
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(actual, "utf8"));
}

export function normalizeShpParams(params: URLSearchParams | Record<string, string>): Record<string, string> {
  const sourceEntries =
    params instanceof URLSearchParams ? Array.from(params.entries()) : Object.entries(params);

  const result: Record<string, string> = {};
  for (const [rawKey, rawValue] of sourceEntries) {
    if (!/^shp_/i.test(rawKey)) continue;
    const suffix = rawKey.slice(rawKey.indexOf("_") + 1);
    const key = `Shp_${suffix}`;
    result[key] = String(rawValue);
  }
  return result;
}

function formatExpirationDate(value: string): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  // Robokassa payment-interface docs use ISO 8601 without a timezone
  // (`YYYY-MM-DDThh:mm`) for ExpirationDate. Their RU interface treats
  // timezone-less values as Moscow time, so send a Moscow wall-clock value.
  return new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function buildCheckoutUrl(input: {
  paymentUrl: string;
  merchantLogin: string;
  outSum: string;
  invId: number;
  description: string;
  signatureValue: string;
  resultUrl: string;
  successUrl: string;
  failUrl: string;
  isTest: boolean;
  recurring: boolean;
  email?: string | null;
  expirationDate?: string | null;
  receipt?: unknown;
  shp?: Record<string, string>;
}): string {
  const url = new URL(input.paymentUrl);
  url.searchParams.set("MerchantLogin", input.merchantLogin);
  url.searchParams.set("OutSum", input.outSum);
  url.searchParams.set("InvId", String(input.invId));
  url.searchParams.set("Description", input.description);
  url.searchParams.set("SignatureValue", input.signatureValue);
  url.searchParams.set("ResultURL", input.resultUrl);
  url.searchParams.set("SuccessURL", input.successUrl);
  url.searchParams.set("FailURL", input.failUrl);
  const email = input.email?.trim();
  if (email) url.searchParams.set("Email", email);
  if (input.isTest) url.searchParams.set("IsTest", "1");
  if (input.recurring) url.searchParams.set("Recurring", "true");
  if (input.receipt) {
    url.searchParams.set(
      "Receipt",
      typeof input.receipt === "string" ? input.receipt : encodeRobokassaReceipt(input.receipt),
    );
  }
  const expirationDate = input.expirationDate ? formatExpirationDate(input.expirationDate) : null;
  if (expirationDate) url.searchParams.set("ExpirationDate", expirationDate);

  const shp = input.shp ?? {};
  for (const [key, value] of sortedShpEntries(shp)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export function buildRecurringBody(input: {
  merchantLogin: string;
  invoiceId: number;
  previousInvoiceId: number;
  outSum: string;
  description: string;
  signatureValue: string;
  isTest: boolean;
  email?: string | null;
  receipt?: unknown;
}): URLSearchParams {
  const body = new URLSearchParams();
  body.set("MerchantLogin", input.merchantLogin);
  body.set("InvoiceID", String(input.invoiceId));
  body.set("PreviousInvoiceID", String(input.previousInvoiceId));
  body.set("OutSum", input.outSum);
  body.set("Description", input.description);
  body.set("SignatureValue", input.signatureValue);
  const email = input.email?.trim();
  if (email) body.set("Email", email);
  if (input.receipt) {
    body.set(
      "Receipt",
      typeof input.receipt === "string" ? input.receipt : encodeRobokassaReceipt(input.receipt),
    );
  }
  if (input.isTest) body.set("IsTest", "1");
  return body;
}
