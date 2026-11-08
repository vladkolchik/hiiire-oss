import "server-only";

import { createHmac } from "node:crypto";

import {
  getRobokassaHashAlgorithm,
  getRobokassaInvoiceCreateUrl,
  getRobokassaInvoiceDeactivateUrl,
  getRobokassaInvoiceStatusUrl,
  getRobokassaInvoiceTimeoutMs,
  requireRobokassaMerchantLogin,
  requireRobokassaPassword1,
} from "./env.ts";
import { formatOutSum } from "./plans.ts";

export type CreateRobokassaInvoiceInput = {
  invId: number;
  amountKopecks: number;
  description: string;
  manualInvoiceId: string;
  payerEmail: string | null;
  receipt: unknown;
  successUrl: string;
  failUrl: string;
};

export type CreateRobokassaInvoiceResult = {
  providerInvoiceId: string;
  invoiceUrl: string;
  raw: unknown;
};

export type RobokassaInvoiceStatusResult = {
  providerStatus: string;
  raw: unknown;
};

export type RobokassaInvoiceDeactivateResult = {
  raw: unknown;
};

type RobokassaInvoiceFetch = (
  url: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type CreateRobokassaInvoiceDeps = {
  fetch?: RobokassaInvoiceFetch;
  timeoutMs?: number;
};

type RobokassaInvoiceProviderDeps = CreateRobokassaInvoiceDeps;

type InvoiceApiConfig = {
  endpoint: string;
  merchantLogin: string;
  password1: string;
  timeoutMs: number;
};

type InvoiceItem = {
  Name: string;
  Quantity: number;
  Cost: number;
  Tax: string;
  PaymentMethod: string;
  PaymentObject: string;
  NomenclatureCode?: string;
};

type InvoicePayload = {
  MerchantLogin: string;
  InvoiceType: "OneTime";
  Culture: "ru";
  InvId: number;
  OutSum: number;
  Description: string;
  Email?: string;
  InvoiceItems: InvoiceItem[];
  SuccessUrl2Data: { Url: string; Method: "GET" };
  FailUrl2Data: { Url: string; Method: "GET" };
  UserFields?: Record<string, string>;
};

type StatusPayload = {
  MerchantLogin: string;
  CurrentPage: 1;
  PageSize: 10;
  InvoiceStatuses: ["Paid", "Expired", "Notpaid"];
  DateFrom: string;
  DateTo: string;
  IsAscending: boolean;
  InvoiceTypes: ["OneTime"];
  Keywords?: string;
};

type DeactivatePayload = {
  MerchantLogin: string;
  InvId?: number;
  Id?: string;
  EncodedId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readInvoiceConfig(deps: CreateRobokassaInvoiceDeps): InvoiceApiConfig {
  try {
    const endpoint = getRobokassaInvoiceCreateUrl();
    new URL(endpoint);

    return {
      endpoint,
      merchantLogin: requireRobokassaMerchantLogin(),
      password1: requireRobokassaPassword1(),
      timeoutMs: deps.timeoutMs ?? getRobokassaInvoiceTimeoutMs(),
    };
  } catch {
    throw new Error("ROBOKASSA_INVOICE_API_NOT_CONFIGURED");
  }
}

function readProviderConfig(endpoint: string, deps: RobokassaInvoiceProviderDeps): InvoiceApiConfig {
  try {
    new URL(endpoint);

    return {
      endpoint,
      merchantLogin: requireRobokassaMerchantLogin(),
      password1: requireRobokassaPassword1(),
      timeoutMs: deps.timeoutMs ?? getRobokassaInvoiceTimeoutMs(),
    };
  } catch {
    throw new Error("ROBOKASSA_INVOICE_API_NOT_CONFIGURED");
  }
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function invoiceJwtAlgorithm(): { node: "md5" | "sha1" | "sha256"; header: "MD5" | "SHA1" | "SHA256" } {
  const algorithm = getRobokassaHashAlgorithm();
  if (algorithm === "sha1") return { node: "sha1", header: "SHA1" };
  if (algorithm === "sha256") return { node: "sha256", header: "SHA256" };
  return { node: "md5", header: "MD5" };
}

function createInvoiceJwt(input: {
  merchantLogin: string;
  password1: string;
  payload: unknown;
}): string {
  const algorithm = invoiceJwtAlgorithm();
  const header = base64UrlJson({ typ: "JWT", alg: algorithm.header });
  const payload = base64UrlJson(input.payload);
  const signature = createHmac(algorithm.node, `${input.merchantLogin}:${input.password1}`)
    .update(`${header}.${payload}`, "utf8")
    .digest("base64")
    .replace(/=+$/, "");
  return `${header}.${payload}.${signature}`;
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function readNumberOrString(record: Record<string, unknown>, ...keys: string[]): number | string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function readNumberLike(record: Record<string, unknown>, ...keys: string[]): number | null {
  const value = readNumberOrString(record, ...keys);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatAmountNumber(amountKopecks: number): number {
  return Number(formatOutSum(amountKopecks));
}

function buildInvoiceItems(receipt: unknown): InvoiceItem[] {
  if (!isRecord(receipt) || !Array.isArray(receipt.items)) {
    throw new Error("ROBOKASSA_INVOICE_INVALID_RECEIPT");
  }

  const items: InvoiceItem[] = [];
  for (const rawItem of receipt.items) {
    if (!isRecord(rawItem)) continue;

    const name = readString(rawItem, "Name", "name");
    const quantity = readNumberLike(rawItem, "Quantity", "quantity");
    const cost = readNumberLike(rawItem, "Cost", "cost", "sum");
    if (!name || quantity === null || cost === null) continue;

    const item: InvoiceItem = {
      Name: name,
      Quantity: quantity,
      Cost: cost,
      Tax: readString(rawItem, "Tax", "tax") ?? "none",
      PaymentMethod: readString(rawItem, "PaymentMethod", "payment_method") ?? "full_payment",
      PaymentObject: readString(rawItem, "PaymentObject", "payment_object") ?? "service",
    };

    const nomenclatureCode = readString(rawItem, "NomenclatureCode", "nomenclature_code");
    if (nomenclatureCode) item.NomenclatureCode = nomenclatureCode;
    items.push(item);
  }

  if (items.length === 0) throw new Error("ROBOKASSA_INVOICE_INVALID_RECEIPT");
  return items;
}

function buildInvoicePayload(input: CreateRobokassaInvoiceInput, merchantLogin: string): InvoicePayload {
  if (!Number.isSafeInteger(input.invId) || input.invId <= 0) {
    throw new Error("ROBOKASSA_INVOICE_INVALID_INV_ID");
  }
  if (!Number.isSafeInteger(input.amountKopecks) || input.amountKopecks <= 0) {
    throw new Error("ROBOKASSA_INVOICE_INVALID_AMOUNT");
  }

  const description = input.description.trim();
  if (!description) throw new Error("ROBOKASSA_INVOICE_INVALID_DESCRIPTION");

  const payload: InvoicePayload = {
    MerchantLogin: merchantLogin,
    InvoiceType: "OneTime",
    Culture: "ru",
    InvId: input.invId,
    OutSum: formatAmountNumber(input.amountKopecks),
    Description: description,
    InvoiceItems: buildInvoiceItems(input.receipt),
    SuccessUrl2Data: {
      Url: input.successUrl,
      Method: "GET",
    },
    FailUrl2Data: {
      Url: input.failUrl,
      Method: "GET",
    },
    UserFields: {
      shp_manual_invoice_id: input.manualInvoiceId,
    },
  };

  const payerEmail = input.payerEmail?.trim();
  if (payerEmail) payload.Email = payerEmail;

  return payload;
}

async function readProviderResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text.trim();
  }
}

function readNestedUrl(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (!isRecord(raw)) return null;

  const direct = readString(raw, "Url", "URL", "InvoiceUrl", "InvoiceURL", "PaymentUrl", "PaymentURL", "ShortUrl", "ShortURL", "Link");
  if (direct) return direct;

  for (const key of ["Result", "Data", "Invoice"]) {
    const nested = raw[key];
    const nestedUrl = readNestedUrl(nested);
    if (nestedUrl) return nestedUrl;
  }
  return null;
}

function readNestedInvId(raw: unknown): string | null {
  if (!isRecord(raw)) return null;

  const direct = readNumberOrString(raw, "InvId", "InvID", "InvoiceId", "InvoiceID");
  if (direct !== null) return String(direct);

  for (const key of ["Result", "Data", "Invoice"]) {
    const nested = raw[key];
    const nestedId = readNestedInvId(nested);
    if (nestedId) return nestedId;
  }
  return null;
}

function readBoolean(record: Record<string, unknown>, ...keys: string[]): boolean | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string" && value.trim()) {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes"].includes(normalized)) return true;
      if (["false", "0", "no"].includes(normalized)) return false;
    }
  }
  return null;
}

function readNestedArray(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw.filter(isRecord);
  if (!isRecord(raw)) return [];

  const records: Record<string, unknown>[] = [];
  for (const key of ["Items", "Invoices", "Result", "Data", "List", "Rows"]) {
    const value = raw[key];
    if (Array.isArray(value)) records.push(...value.filter(isRecord));
    else if (isRecord(value)) records.push(...readNestedArray(value));
  }
  return records;
}

function readInvoiceStatus(record: Record<string, unknown>): string | null {
  const status = readString(record, "Status", "InvoiceStatus", "State", "PaymentStatus");
  if (status) return status;

  const isPaid = readBoolean(record, "IsPaid", "Paid");
  if (isPaid === true) return "Paid";
  return null;
}

function readEncodedIdFromUrl(invoiceUrl: string | null | undefined): string | null {
  if (!invoiceUrl) return null;
  try {
    const url = new URL(invoiceUrl);
    const encodedId = url.pathname.split("/").filter(Boolean).at(-1);
    return encodedId?.trim() || null;
  } catch {
    return null;
  }
}

function matchesInvoice(record: Record<string, unknown>, input: { invId?: number; providerInvoiceId?: string | null; invoiceUrl?: string | null }) {
  const expectedInvId = input.invId ? String(input.invId) : null;
  const expectedProviderId = input.providerInvoiceId?.trim() || null;
  const expectedEncodedId = readEncodedIdFromUrl(input.invoiceUrl);

  const recordInvId = readNumberOrString(record, "InvId", "InvID", "InvoiceId", "InvoiceID");
  const recordId = readNumberOrString(record, "Id", "ID");
  const recordEncodedId = readString(record, "EncodedId", "EncodedID");

  return (
    (expectedInvId !== null && recordInvId !== null && String(recordInvId) === expectedInvId) ||
    (expectedProviderId !== null && recordId !== null && String(recordId) === expectedProviderId) ||
    (expectedProviderId !== null && recordInvId !== null && String(recordInvId) === expectedProviderId) ||
    (expectedEncodedId !== null && recordEncodedId === expectedEncodedId)
  );
}

function parseInvoiceStatusResult(
  raw: unknown,
  input: { invId?: number; providerInvoiceId?: string | null; invoiceUrl?: string | null },
): RobokassaInvoiceStatusResult {
  const records = readNestedArray(raw);
  const matched = records.find((record) => matchesInvoice(record, input)) ?? (records.length === 1 ? records[0] : null);
  if (!matched) throw new Error("ROBOKASSA_INVOICE_API_BAD_RESPONSE");

  const providerStatus = readInvoiceStatus(matched);
  if (!providerStatus) throw new Error("ROBOKASSA_INVOICE_API_BAD_RESPONSE");

  return { providerStatus, raw };
}

function readProviderSuccess(raw: unknown): boolean {
  if (!isRecord(raw)) return true;

  const success = readBoolean(raw, "Success", "IsSuccess", "Result", "Status");
  if (success === false) return false;

  const nested = raw.Result ?? raw.Data;
  if (isRecord(nested)) return readProviderSuccess(nested);
  return true;
}

async function postInvoiceApiJwt(config: InvoiceApiConfig, payload: unknown, deps: RobokassaInvoiceProviderDeps) {
  const token = createInvoiceJwt({
    merchantLogin: config.merchantLogin,
    password1: config.password1,
    payload,
  });

  const fetchImpl = deps.fetch ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(token),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw new Error("ROBOKASSA_INVOICE_API_TIMEOUT");
    }
    throw new Error("ROBOKASSA_INVOICE_API_FAILED");
  } finally {
    clearTimeout(timeout);
  }

  const raw = await readProviderResponse(response);
  if (!response.ok) {
    throw new Error("ROBOKASSA_INVOICE_API_FAILED");
  }

  return raw;
}

function parseInvoiceResult(raw: unknown, fallbackInvId: number): CreateRobokassaInvoiceResult {
  const invoiceUrl = readNestedUrl(raw);
  if (!invoiceUrl) throw new Error("ROBOKASSA_INVOICE_API_BAD_RESPONSE");

  return {
    providerInvoiceId: readNestedInvId(raw) ?? String(fallbackInvId),
    invoiceUrl,
    raw,
  };
}

export async function createRobokassaInvoice(
  input: CreateRobokassaInvoiceInput,
  deps: CreateRobokassaInvoiceDeps = {},
): Promise<CreateRobokassaInvoiceResult> {
  const config = readInvoiceConfig(deps);
  const payload = buildInvoicePayload(input, config.merchantLogin);
  const raw = await postInvoiceApiJwt(config, payload, deps);

  return parseInvoiceResult(raw, input.invId);
}

export async function getRobokassaInvoiceStatus(
  input: {
    invId: number;
    providerInvoiceId?: string | null;
    invoiceUrl?: string | null;
    createdAt?: string | null;
  },
  deps: RobokassaInvoiceProviderDeps = {},
): Promise<RobokassaInvoiceStatusResult> {
  if (!Number.isSafeInteger(input.invId) || input.invId <= 0) {
    throw new Error("ROBOKASSA_INVOICE_INVALID_INV_ID");
  }

  const config = readProviderConfig(getRobokassaInvoiceStatusUrl(), deps);
  const createdAt = input.createdAt ? new Date(input.createdAt) : null;
  const createdAtTime = createdAt?.getTime();
  const from = typeof createdAtTime === "number" && Number.isFinite(createdAtTime)
    ? new Date(createdAtTime - 86_400_000)
    : new Date(Date.now() - 31_536_000_000);
  const to = new Date(Date.now() + 86_400_000);
  const payload: StatusPayload = {
    MerchantLogin: config.merchantLogin,
    CurrentPage: 1,
    PageSize: 10,
    InvoiceStatuses: ["Paid", "Expired", "Notpaid"],
    DateFrom: from.toISOString(),
    DateTo: to.toISOString(),
    IsAscending: false,
    InvoiceTypes: ["OneTime"],
    Keywords: String(input.invId),
  };

  const raw = await postInvoiceApiJwt(config, payload, deps);
  return parseInvoiceStatusResult(raw, input);
}

export async function deactivateRobokassaInvoice(
  input: {
    invId: number;
    providerInvoiceId?: string | null;
    invoiceUrl?: string | null;
  },
  deps: RobokassaInvoiceProviderDeps = {},
): Promise<RobokassaInvoiceDeactivateResult> {
  if (!Number.isSafeInteger(input.invId) || input.invId <= 0) {
    throw new Error("ROBOKASSA_INVOICE_INVALID_INV_ID");
  }

  const config = readProviderConfig(getRobokassaInvoiceDeactivateUrl(), deps);
  const encodedId = readEncodedIdFromUrl(input.invoiceUrl);
  const payload: DeactivatePayload = {
    MerchantLogin: config.merchantLogin,
    InvId: input.invId,
  };
  if (input.providerInvoiceId?.trim()) payload.Id = input.providerInvoiceId.trim();
  if (encodedId) payload.EncodedId = encodedId;

  const raw = await postInvoiceApiJwt(config, payload, deps);
  if (!readProviderSuccess(raw)) throw new Error("ROBOKASSA_INVOICE_API_FAILED");
  return { raw };
}
