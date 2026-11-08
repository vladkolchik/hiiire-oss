import {
  buildCandidateContactDedupeKey,
  classifyCandidateContactUrlForStorage,
  normalizeCandidateEmailForStorage,
  normalizeCandidatePhoneForStorage,
  normalizeCandidateTelegramHandleForStorage,
  normalizeCandidateTelegramHandleLenientForStorage,
  normalizeCandidateWhatsappForStorage,
} from "../candidates/contact-normalization.ts";

export type CandidateContactType =
  | "email"
  | "phone"
  | "telegram"
  | "whatsapp"
  | "linkedin"
  | "github"
  | "website"
  | "other"
  // Reserved for future use without DB migrations (validated at UI level).
  | "vk"
  | "facebook"
  | "instagram"
  | "hh"
  | "habr_career"
  | "skype"
  | "signal"
  | "viber"
  | "wechat"
  | "discord"
  | "slack"
  | "x"
  | `custom_${1 | 2 | 3 | 4 | 5}`
  | (string & {});

export type ExtractedCandidateContact = {
  type: CandidateContactType;
  value: string;
  label?: string;
};

const MAX_CONTACTS = 30;

/**
 * Extracts candidate contacts from arbitrary resume text.
 *
 * Important:
 * - Best-effort only. Should never throw.
 * - No PII logging here (caller decides).
 */
export function extractCandidateContactsFromText(text: string): ExtractedCandidateContact[] {
  const out: ExtractedCandidateContact[] = [];
  const seen = new Set<string>();

  function push(c: ExtractedCandidateContact | null | undefined) {
    if (!c) return;
    const value = c.value.trim();
    if (!value) return;
    const normalized: ExtractedCandidateContact = { ...c, value };
    const k = buildCandidateContactDedupeKey(normalized);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(normalized);
  }

  const src = String(text ?? "");
  if (!src.trim()) return [];

  // Heuristic: keep "website" links mostly from the header/contact zone to avoid
  // picking up employer/company sites from work history sections.
  const lower = src.toLowerCase();
  let headerLimit = 2500; // chars
  const expIdx = lower.search(/\b(опыт работы|experience|employment|work history|projects|проекты)\b/i);
  if (expIdx >= 0 && expIdx < headerLimit) headerLimit = Math.max(600, expIdx);

  const contactContextRegex =
    /\b(контакт|contacts?|телефон|phone|email|e-mail|почта|telegram|телеграм|\btg\b|github|linkedin|портфолио|portfolio|сайт|site|website|url)\b/i;
  const employerContextRegex =
    /\b(опыт работы|experience|employment|work history|компан|company|работал|работа|должност|employer|llc|inc|ltd|ооо|ао|зао)\b/i;

  // 1) Emails
  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  for (const m of src.matchAll(emailRegex)) {
    const v = normalizeCandidateEmailForStorage(m[0] ?? "");
    if (v) push({ type: "email", value: v });
    if (out.length >= MAX_CONTACTS) return out;
  }

  // 2) URLs (includes linkedin/github/telegram/website/whatsapp)
  const urlRegex =
    /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?:\/[^\s<>()\[\]{}]*)?/gi;
  for (const m of src.matchAll(urlRegex)) {
    const v = String(m[0] ?? "").trim();
    if (!v) continue;

    // Common false positives: plain emails already handled; skip if contains '@'.
    if (v.includes("@")) continue;
    if (typeof m.index === "number" && src[m.index - 1] === "@") continue;

    // Try classify as typed contact.
    const classified = classifyCandidateContactUrlForStorage(v);
    if (!classified) continue;

    // Filter noisy "website" URLs from deep inside resumes (often employer websites).
    if (classified.type === "website") {
      const idx = typeof m.index === "number" ? m.index : -1;
      const inHeaderZone = idx >= 0 && idx <= headerLimit;
      if (!inHeaderZone) {
        const start = Math.max(0, (idx >= 0 ? idx : 0) - 80);
        const end = Math.min(src.length, (idx >= 0 ? idx + v.length : v.length) + 80);
        const context = src.slice(start, end);
        const hasContactHint = contactContextRegex.test(context);
        const looksLikeEmployerContext = employerContextRegex.test(context);
        // Keep only if we have an explicit contact hint nearby and it doesn't look like work history text.
        if (!hasContactHint || looksLikeEmployerContext) continue;
      }
    }

    push(classified);
    if (out.length >= MAX_CONTACTS) return out;
  }

  // 3) Telegram from explicit hints like "Telegram: username" or "TG - @username"
  const tgHintRegex =
    /(telegram|телеграм|\btg\b|тг)\s*[:\-]?\s*(?:@|(?:https?:\/\/)?(?:t\.me|telegram\.me)\/)?([A-Za-z0-9_][A-Za-z0-9_-]{2,31})/gi;
  for (const m of src.matchAll(tgHintRegex)) {
    if (/^https?$/i.test(m[2] ?? "")) continue;
    const raw = normalizeCandidateTelegramHandleLenientForStorage(m[2] ?? "");
    if (!raw) continue;
    const strict = normalizeCandidateTelegramHandleForStorage(raw);
    if (strict) {
      push({ type: "telegram", value: strict });
    } else {
      // Store as link so UI can still open it even if it doesn't match strict username rules.
      push({ type: "telegram", value: `https://t.me/${raw}` });
    }
    if (out.length >= MAX_CONTACTS) return out;
  }

  // 4) Telegram handles (only those without dots, so it won't collide with email domains)
  const tgHandleRegex = /(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{5,32})\b/g;
  for (const m of src.matchAll(tgHandleRegex)) {
    const handle = normalizeCandidateTelegramHandleForStorage(m[2] ?? "");
    if (handle) push({ type: "telegram", value: handle });
    if (out.length >= MAX_CONTACTS) return out;
  }

  // 5) Phones (best-effort; can produce false positives, but we keep strict digit-length bounds)
  const phoneRegex = /(?:\+?\d[\d\s().-]{8,}\d)/g;
  for (const m of src.matchAll(phoneRegex)) {
    const v = normalizeCandidatePhoneForStorage(m[0] ?? "");
    if (v) push({ type: "phone", value: v });
    if (out.length >= MAX_CONTACTS) return out;
  }

  // 6) WhatsApp from phrases like "WhatsApp: +7 ...", even without explicit URL
  const whatsappHintRegex = /(whatsapp|ватсап|вотсап)\s*[:\-]?\s*([+()\-.\s\d]{10,})/gi;
  for (const m of src.matchAll(whatsappHintRegex)) {
    const digits = normalizeCandidateWhatsappForStorage(m[2] ?? "");
    if (digits) push({ type: "whatsapp", value: digits });
    if (out.length >= MAX_CONTACTS) return out;
  }

  return out;
}

