import { z } from "zod";

const CURRENCY_CODES = [
  "AED",
  "AFN",
  "ALL",
  "AMD",
  "ANG",
  "AOA",
  "ARS",
  "AUD",
  "AWG",
  "AZN",
  "BAM",
  "BBD",
  "BDT",
  "BGN",
  "BHD",
  "BIF",
  "BMD",
  "BND",
  "BOB",
  "BRL",
  "BSD",
  "BTN",
  "BWP",
  "BYN",
  "BZD",
  "CAD",
  "CDF",
  "CHF",
  "CLP",
  "CNY",
  "COP",
  "CRC",
  "CUC",
  "CUP",
  "CVE",
  "CZK",
  "DJF",
  "DKK",
  "DOP",
  "DZD",
  "EGP",
  "ERN",
  "ETB",
  "EUR",
  "FJD",
  "FKP",
  "GBP",
  "GEL",
  "GHS",
  "GIP",
  "GMD",
  "GNF",
  "GTQ",
  "GYD",
  "HKD",
  "HNL",
  "HRK",
  "HTG",
  "HUF",
  "IDR",
  "ILS",
  "INR",
  "IQD",
  "IRR",
  "ISK",
  "JMD",
  "JOD",
  "JPY",
  "KES",
  "KGS",
  "KHR",
  "KMF",
  "KPW",
  "KRW",
  "KWD",
  "KYD",
  "KZT",
  "LAK",
  "LBP",
  "LKR",
  "LRD",
  "LSL",
  "LYD",
  "MAD",
  "MDL",
  "MGA",
  "MKD",
  "MMK",
  "MNT",
  "MOP",
  "MRU",
  "MUR",
  "MVR",
  "MWK",
  "MXN",
  "MYR",
  "MZN",
  "NAD",
  "NGN",
  "NIO",
  "NOK",
  "NPR",
  "NZD",
  "OMR",
  "PAB",
  "PEN",
  "PGK",
  "PHP",
  "PKR",
  "PLN",
  "PYG",
  "QAR",
  "RON",
  "RSD",
  "RUB",
  "RWF",
  "SAR",
  "SBD",
  "SCR",
  "SDG",
  "SEK",
  "SGD",
  "SHP",
  "SLE",
  "SLL",
  "SOS",
  "SRD",
  "SSP",
  "STN",
  "SVC",
  "SYP",
  "SZL",
  "THB",
  "TJS",
  "TMT",
  "TND",
  "TOP",
  "TRY",
  "TTD",
  "TWD",
  "TZS",
  "UAH",
  "UGX",
  "USD",
  "UYU",
  "UZS",
  "VES",
  "VND",
  "VUV",
  "WST",
  "XAF",
  "XCD",
  "XCG",
  "XDR",
  "XOF",
  "XPF",
  "XSU",
  "YER",
  "ZAR",
  "ZMW",
  "ZWG",
  "ZWL",
] as const;

export const DEFAULT_CURRENCY_CODE = "RUB";

export type SupportedCurrencyCode = (typeof CURRENCY_CODES)[number];

export type CurrencyOption = {
  code: SupportedCurrencyCode;
  name: string;
  englishName: string;
};

const currencyCodeSet = new Set<string>(CURRENCY_CODES);

function getDisplayName(code: string, locale: "ru" | "en"): string {
  try {
    const displayNames = new Intl.DisplayNames([locale], { type: "currency" });
    const label = displayNames.of(code);
    if (typeof label === "string" && label.trim()) return label;
  } catch {
    // Fallback to code below.
  }
  return code;
}

export const currencyOptions: CurrencyOption[] = CURRENCY_CODES.map((code) => ({
  code,
  name: getDisplayName(code, "ru"),
  englishName: getDisplayName(code, "en"),
}));

export function normalizeCurrencyCode(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toUpperCase();
  if (normalized === "RUR") return "RUB";
  return normalized;
}

export function isSupportedCurrencyCode(value: unknown): value is SupportedCurrencyCode {
  return currencyCodeSet.has(normalizeCurrencyCode(value));
}

export function getCurrencyOption(value: unknown): CurrencyOption | null {
  const normalized = normalizeCurrencyCode(value);
  return currencyOptions.find((option) => option.code === normalized) ?? null;
}

export function toSupportedCurrencyCode(
  value: unknown,
  fallback?: SupportedCurrencyCode,
): SupportedCurrencyCode | null {
  const normalized = normalizeCurrencyCode(value);
  if (isSupportedCurrencyCode(normalized)) return normalized;
  return fallback ?? null;
}

export function toSupportedCurrencyCodeOrThrow(value: unknown): SupportedCurrencyCode {
  const normalized = toSupportedCurrencyCode(value);
  if (!normalized) throw new Error("Некорректная валюта");
  return normalized;
}

export function currencyCodeSchema(message = "Выберите валюту из списка") {
  return z
    .string()
    .trim()
    .transform((value) => normalizeCurrencyCode(value))
    .refine((value): value is SupportedCurrencyCode => isSupportedCurrencyCode(value), {
      message,
    });
}
