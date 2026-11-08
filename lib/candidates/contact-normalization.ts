import type { CandidateContactType, ExtractedCandidateContact } from "../contacts/extract-candidate-contacts.ts";

const MAX_CONTACT_VALUE_LENGTH = 500;
const MAX_CONTACT_LABEL_LENGTH = 120;

const ALLOWED_CONTACT_TYPES = new Set<CandidateContactType>([
  "email",
  "phone",
  "telegram",
  "whatsapp",
  "linkedin",
  "github",
  "website",
  "other",
  "vk",
  "facebook",
  "instagram",
  "hh",
  "habr_career",
  "skype",
  "signal",
  "viber",
  "wechat",
  "discord",
  "slack",
  "x",
]);

export type CandidateContactInput = {
  type: string;
  value: string;
  label?: string | null;
};

export function buildCandidateContactDedupeKey(contact: ExtractedCandidateContact): string {
  return `${String(contact.type).toLowerCase()}\u0000${contact.value.trim()}\u0000${contact.label ?? ""}`;
}

export function trimTrailingContactPunctuation(value: string): string {
  return value.replace(/[)\]}>,.;:!?]+$/g, "").trim();
}

export function normalizeCandidateEmailForStorage(raw: string): string | null {
  const value = trimTrailingContactPunctuation(raw).toLowerCase().trim();
  if (!value || value.length > MAX_CONTACT_VALUE_LENGTH) return null;
  // Minimal sanity check (not full RFC).
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value)) return null;
  return value;
}

export function normalizeCandidatePhoneForStorage(raw: string): string | null {
  // Best-effort normalization to +<digits>. We intentionally avoid heavy libs here.
  const original = raw.trim();
  if (!original || original.length > MAX_CONTACT_VALUE_LENGTH) return null;

  const hasPlus = original.includes("+");
  const digits = original.replace(/[^\d]/g, "");
  if (digits.length < 10 || digits.length > 15) return null;

  // RU heuristics: 8XXXXXXXXXX -> +7XXXXXXXXXX, 10 digits -> +7 + digits.
  if (digits.length === 11 && digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `+7${digits}`;
  }

  // Otherwise, keep as international.
  return hasPlus ? `+${digits}` : `+${digits}`;
}

export function normalizeCandidateTelegramHandleForStorage(raw: string): string | null {
  const value = raw.trim();
  if (!value || value.length > MAX_CONTACT_VALUE_LENGTH) return null;
  // Telegram usernames: 5-32 chars, letters/digits/underscore, cannot contain dots.
  const match = value.match(/^@?([A-Za-z0-9_]{5,32})$/);
  if (!match) return null;
  return `@${match[1]}`;
}

export function normalizeCandidateTelegramHandleLenientForStorage(raw: string): string | null {
  // Used only when the surrounding context explicitly mentions Telegram/TG.
  // We allow slightly more to reduce missed detections from messy CV exports.
  const value = raw.trim();
  if (!value || value.length > MAX_CONTACT_VALUE_LENGTH) return null;
  // Allow 3-32 and hyphen (some people paste non-username slugs); we'll store as URL if strict fails.
  const match = value.match(/^@?([A-Za-z0-9_][A-Za-z0-9_-]{2,31})$/);
  if (!match) return null;
  return match[1];
}

export function extractCandidateTelegramFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const host = parsed.hostname.toLowerCase();
    if (host !== "t.me" && host !== "telegram.me") return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    // Common patterns:
    // - /username
    // - /s/username (public preview)
    // - /joinchat/... or /+... (invite links) -> cannot normalize to username
    const first = parts[0] ?? "";
    const username = first === "s" ? parts[1] ?? "" : first;
    if (!username) return null;
    if (username === "joinchat" || username.startsWith("+")) return null;
    return normalizeCandidateTelegramHandleForStorage(username);
  } catch {
    return null;
  }
}

export function normalizeCandidateWhatsappForStorage(raw: string): string | null {
  // We store digits only (no '+') so building wa.me links is straightforward.
  const value = raw.trim();
  if (!value || value.length > MAX_CONTACT_VALUE_LENGTH) return null;
  const digits = value.replace(/[^\d]/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

export function normalizeCandidateUrlForStorage(raw: string): string | null {
  const cleaned = trimTrailingContactPunctuation(raw);
  if (!cleaned || cleaned.length > MAX_CONTACT_VALUE_LENGTH || cleaned.includes("@")) return null;

  try {
    const url = new URL(cleaned.startsWith("http") ? cleaned : `https://${cleaned}`);
    if (!url.hostname || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function urlHostMatchesType(type: CandidateContactType, normalizedUrl: string): boolean {
  try {
    const host = new URL(normalizedUrl).hostname.toLowerCase();
    switch (type) {
      case "linkedin":
        return host === "linkedin.com" || host.endsWith(".linkedin.com");
      case "github":
        return host === "github.com" || host.endsWith(".github.com");
      case "hh":
        return host === "hh.ru" || host.endsWith(".hh.ru");
      case "habr_career":
        return host === "career.habr.com" || host.endsWith(".career.habr.com");
      case "vk":
        return host === "vk.com" || host.endsWith(".vk.com");
      case "facebook":
        return host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.com" || host.endsWith(".fb.com");
      case "instagram":
        return host === "instagram.com" || host.endsWith(".instagram.com");
      case "x":
        return host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com");
      default:
        return true;
    }
  } catch {
    return false;
  }
}

function normalizeCandidateContactType(raw: string): CandidateContactType | null {
  const type = raw.trim().toLowerCase() as CandidateContactType;
  return ALLOWED_CONTACT_TYPES.has(type) ? type : null;
}

export function classifyCandidateContactUrlForStorage(raw: string): ExtractedCandidateContact | null {
  const normalizedUrl = normalizeCandidateUrlForStorage(raw);
  if (!normalizedUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();

  // Telegram
  const telegram = extractCandidateTelegramFromUrl(normalizedUrl);
  if (telegram) return { type: "telegram", value: telegram };
  // Accept other t.me links as telegram contacts (e.g. invite links) so UI can open them.
  if (host === "t.me" || host === "telegram.me") return { type: "telegram", value: parsed.toString() };

  // WhatsApp
  if (host === "wa.me") {
    const digits = normalizeCandidateWhatsappForStorage(parsed.pathname);
    if (digits) return { type: "whatsapp", value: digits };
  }
  if (host.endsWith("whatsapp.com")) {
    const phone = parsed.searchParams.get("phone");
    const digits = normalizeCandidateWhatsappForStorage(phone ?? "");
    if (digits) return { type: "whatsapp", value: digits };
  }

  // Social URLs
  if (urlHostMatchesType("linkedin", normalizedUrl)) return { type: "linkedin", value: parsed.toString() };
  if (urlHostMatchesType("github", normalizedUrl)) return { type: "github", value: parsed.toString() };

  // Default: website
  return { type: "website", value: parsed.toString() };
}

export function normalizeCandidateContactForStorage(input: CandidateContactInput): ExtractedCandidateContact | null {
  const type = normalizeCandidateContactType(String(input.type ?? ""));
  if (!type) return null;

  const valueRaw = String(input.value ?? "").trim();
  if (!valueRaw) return null;

  let value: string | null;
  switch (type) {
    case "email":
      value = normalizeCandidateEmailForStorage(valueRaw);
      break;
    case "phone":
      value = normalizeCandidatePhoneForStorage(valueRaw);
      break;
    case "telegram": {
      const classified = classifyCandidateContactUrlForStorage(valueRaw);
      if (classified?.type === "telegram") {
        value = classified.value;
        break;
      }

      const raw = normalizeCandidateTelegramHandleLenientForStorage(valueRaw);
      if (!raw) {
        value = null;
        break;
      }

      const strict = normalizeCandidateTelegramHandleForStorage(raw);
      value = strict ?? `https://t.me/${raw}`;
      break;
    }
    case "whatsapp": {
      const classified = classifyCandidateContactUrlForStorage(valueRaw);
      value = classified?.type === "whatsapp" ? classified.value : normalizeCandidateWhatsappForStorage(valueRaw);
      break;
    }
    case "linkedin":
    case "github":
    case "website":
    case "hh":
    case "habr_career":
    case "vk":
    case "facebook":
    case "instagram":
    case "x":
      value = normalizeCandidateUrlForStorage(valueRaw);
      if (value && !urlHostMatchesType(type, value)) value = null;
      break;
    default:
      value = valueRaw.length <= MAX_CONTACT_VALUE_LENGTH ? valueRaw : null;
  }

  if (!value) return null;
  const label = input.label ? String(input.label).trim().slice(0, MAX_CONTACT_LABEL_LENGTH) : undefined;
  return label ? { type, value, label } : { type, value };
}

export function dedupeCandidateContacts(contacts: ExtractedCandidateContact[], max = 30): ExtractedCandidateContact[] {
  const seen = new Set<string>();
  const out: ExtractedCandidateContact[] = [];
  for (const contact of contacts) {
    const key = buildCandidateContactDedupeKey(contact);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(contact);
    if (out.length >= max) break;
  }
  return out;
}
