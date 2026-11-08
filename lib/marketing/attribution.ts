export type MarketingTouch = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  gclid: string | null;
  fbclid: string | null;
  msclkid: string | null;
};

export type MarketingAttributionPayload = {
  visitor_id: string;
  landing_path: string | null;
  referrer: string | null;
  first_touch: MarketingTouch;
  last_touch: MarketingTouch;
  captured_at: string;
};

const ATTRIBUTION_STORAGE_KEY = "hiiire_marketing_attribution";
const VISITOR_ID_STORAGE_KEY = "hiiire_marketing_visitor_id";

const TRACKING_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "msclkid",
] as const;

function safeStorageGet(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeStorageSet(storage: Storage | undefined, key: string, value: string) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Attribution is best-effort and must not block signup or browsing.
  }
}

function cleanParam(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, 200) : null;
}

function emptyTouch(): MarketingTouch {
  return {
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_term: null,
    utm_content: null,
    gclid: null,
    fbclid: null,
    msclkid: null,
  };
}

function hasTrackingSignal(touch: MarketingTouch) {
  return TRACKING_KEYS.some((key) => Boolean(touch[key]));
}

function resolveFirstTouch(stored: MarketingAttributionPayload | undefined, currentTouch: MarketingTouch) {
  if (stored?.first_touch && hasTrackingSignal(stored.first_touch)) return stored.first_touch;
  if (hasTrackingSignal(currentTouch)) return currentTouch;
  return stored?.first_touch ?? emptyTouch();
}

function parseTouch(url: URL): MarketingTouch {
  return {
    utm_source: cleanParam(url.searchParams.get("utm_source")),
    utm_medium: cleanParam(url.searchParams.get("utm_medium")),
    utm_campaign: cleanParam(url.searchParams.get("utm_campaign")),
    utm_term: cleanParam(url.searchParams.get("utm_term")),
    utm_content: cleanParam(url.searchParams.get("utm_content")),
    gclid: cleanParam(url.searchParams.get("gclid")),
    fbclid: cleanParam(url.searchParams.get("fbclid")),
    msclkid: cleanParam(url.searchParams.get("msclkid")),
  };
}

function createVisitorId() {
  const webCrypto = typeof globalThis.crypto === "undefined" ? undefined : globalThis.crypto;

  if (typeof webCrypto?.randomUUID === "function") {
    return webCrypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof webCrypto?.getRandomValues === "function") {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function safeParseStoredAttribution(raw: string | null): MarketingAttributionPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MarketingAttributionPayload;
    return typeof parsed?.visitor_id === "string" && parsed.visitor_id ? parsed : null;
  } catch {
    return null;
  }
}

function getVisitorId() {
  const existing = safeStorageGet(window.localStorage, VISITOR_ID_STORAGE_KEY);
  if (existing) return existing;
  const next = createVisitorId();
  safeStorageSet(window.localStorage, VISITOR_ID_STORAGE_KEY, next);
  return next;
}

export function readMarketingAttribution(): MarketingAttributionPayload | undefined {
  if (typeof window === "undefined") return undefined;
  return safeParseStoredAttribution(safeStorageGet(window.localStorage, ATTRIBUTION_STORAGE_KEY)) ?? undefined;
}

export function buildMarketingVisitPayload(): MarketingAttributionPayload | undefined {
  if (typeof window === "undefined") return undefined;

  const url = new URL(window.location.href);
  const currentTouch = parseTouch(url);
  const stored = readMarketingAttribution();
  const visitorId = stored?.visitor_id ?? getVisitorId();
  const referrer = cleanParam(document.referrer) ?? stored?.referrer ?? null;
  const landingPath = stored?.landing_path ?? `${url.pathname}${url.search}`;
  const firstTouch = resolveFirstTouch(stored, currentTouch);
  const lastTouch = hasTrackingSignal(currentTouch) ? currentTouch : stored?.last_touch ?? firstTouch;

  const payload: MarketingAttributionPayload = {
    visitor_id: visitorId,
    landing_path: landingPath.slice(0, 500),
    referrer: referrer?.slice(0, 500) ?? null,
    first_touch: firstTouch,
    last_touch: lastTouch,
    captured_at: new Date().toISOString(),
  };

  safeStorageSet(window.localStorage, ATTRIBUTION_STORAGE_KEY, JSON.stringify(payload));
  return payload;
}
