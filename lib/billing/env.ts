import "server-only";

type HashAlgorithm = "md5" | "sha1" | "sha256";

function readEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function requireEnv(name: string, fallbackNames: string[] = []): string {
  const value = readEnv(name, ...fallbackNames);
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function requireRobokassaMerchantLogin(): string {
  return requireEnv("ROBOKASSA_MERCHANT_LOGIN", ["ROBOKASSA_LOGIN"]);
}

export function requireRobokassaPassword1(): string {
  return requireEnv("ROBOKASSA_PASSWORD1");
}

export function requireRobokassaPassword2(): string {
  return requireEnv("ROBOKASSA_PASSWORD2");
}

export function getRobokassaPaymentUrl(): string {
  return readEnv("ROBOKASSA_PAYMENT_URL") ?? "https://auth.robokassa.ru/Merchant/Index.aspx";
}

export function getRobokassaRecurringUrl(): string {
  return readEnv("ROBOKASSA_RECURRING_URL") ?? "https://auth.robokassa.ru/Merchant/Recurring";
}

export function getRobokassaInvoiceCreateUrl(): string {
  return readEnv("ROBOKASSA_INVOICE_CREATE_URL") ?? "https://services.robokassa.ru/InvoiceServiceWebApi/api/CreateInvoice";
}

function deriveRobokassaInvoiceApiUrl(operation: string): string {
  const createUrl = getRobokassaInvoiceCreateUrl();
  try {
    const url = new URL(createUrl);
    url.pathname = url.pathname.replace(/\/CreateInvoice\/?$/i, `/${operation}`);
    return url.toString();
  } catch {
    return `https://services.robokassa.ru/InvoiceServiceWebApi/api/${operation}`;
  }
}

export function getRobokassaInvoiceStatusUrl(): string {
  return readEnv("ROBOKASSA_INVOICE_STATUS_URL") ?? deriveRobokassaInvoiceApiUrl("GetInvoiceInformationList");
}

export function getRobokassaInvoiceDeactivateUrl(): string {
  return readEnv("ROBOKASSA_INVOICE_DEACTIVATE_URL") ?? deriveRobokassaInvoiceApiUrl("DeactivateInvoice");
}

export function getRobokassaInvoiceTimeoutMs(): number {
  const raw = readEnv("ROBOKASSA_INVOICE_TIMEOUT_MS");
  if (!raw) return 10_000;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) return 10_000;
  return value;
}

export function isRobokassaTestMode(): boolean {
  const raw = readEnv("ROBOKASSA_IS_TEST");
  if (!raw) return true;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export function isRobokassaRecurringEnabled(): boolean {
  const raw = readEnv("ROBOKASSA_RECURRING_ENABLED");
  if (!raw) return false;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export function getRobokassaHashAlgorithm(): HashAlgorithm {
  const raw = (readEnv("ROBOKASSA_HASH_ALGORITHM") ?? "md5").toLowerCase();
  if (raw === "sha1" || raw === "sha256" || raw === "md5") return raw;
  return "md5";
}
