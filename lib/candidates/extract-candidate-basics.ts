export type ExtractedCandidateBasics = {
  name: string;
  position: string;
};

export function extractCandidateBasicsFromText(resumeText: string): ExtractedCandidateBasics {
  const text = resumeText.trim();

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    // We only need the header-ish part; don't scan the full resume.
    .slice(0, 80);

  const clamp = (v: string) => v.trim().slice(0, 120);

  function normalizeSpaces(v: string) {
    return v.replace(/\s+/g, " ").trim();
  }

  function isHeaderNoise(v: string): boolean {
    const t = v.trim();
    if (!t) return true;
    // Common CV headers / UI artifacts from exports.
    if (/^(резюме|curriculum vitae|cv)\b/i.test(t)) return true;
    if (/^обновлено\b/i.test(t)) return true;
    return false;
  }

  function isDemographicLine(v: string): boolean {
    const t = v.trim().toLowerCase();
    if (!t) return false;
    // RU
    if ((t.startsWith("мужчина") || t.startsWith("женщина")) && (t.includes("лет") || t.includes("года") || t.includes("год"))) return true;
    if (t.includes("родился") || t.includes("родилась") || t.includes("дата рождения")) return true;
    // EN
    if ((t.startsWith("male") || t.startsWith("female")) && (t.includes("year") || t.includes("born"))) return true;
    if (t.includes("born on")) return true;
    return false;
  }

  function isContactLike(v: string): boolean {
    const t = v.trim().toLowerCase();
    if (!t) return false;
    if (t.includes("@") && t.includes(".")) return true; // email-ish
    if (t.startsWith("email")) return true;
    if (t.startsWith("телефон") || t.startsWith("phone")) return true;
    if (t.startsWith("telegram") || t.startsWith("tg")) return true;
    return false;
  }

  function isLocationLike(v: string): boolean {
    const t = v.trim().toLowerCase();
    if (!t) return false;
    return t.startsWith("reside in") || t.startsWith("жив") || t.startsWith("город") || t.startsWith("location") || t.startsWith("место");
  }

  function looksLikePersonNameLine(v: string): boolean {
    const t = normalizeSpaces(v);
    if (!t) return false;
    // Too long to be a name.
    if (t.length > 80) return false;
    // Avoid obvious non-names.
    if (t.includes(":")) return false;
    if (isDemographicLine(t) || isContactLike(t) || isLocationLike(t) || isHeaderNoise(t)) return false;

    // RU full name (2-3 parts) with optional initials.
    // Examples: "Иванов Иван", "Иванов Иван Иванович", "Иван И.", "Иванов И. И."
    const ru =
      /^([А-ЯЁ][а-яё-]{1,})(\s+([А-ЯЁ][а-яё-]{1,}|[А-ЯЁ]\.))(\s+([А-ЯЁ][а-яё-]{1,}|[А-ЯЁ]\.))?$/u;
    if (ru.test(t)) return true;

    // EN full name (2+ parts) with optional initials.
    // Examples: "John Smith", "John A. Smith", "J. Smith"
    const en =
      /^([A-Z][a-z-]{1,}|[A-Z]\.)(\s+([A-Z][a-z-]{1,}|[A-Z]\.))(\s+([A-Z][a-z-]{1,}|[A-Z]\.))?$/;
    if (en.test(t)) return true;

    return false;
  }

  // Name:
  // 1) If text looks like it starts with a name (and not demographics) — keep it
  // 2) Otherwise try to find a "name-like" line near the top
  // 3) Fallback to "Кандидат"
  let name = "Кандидат";
  let nameIdx = -1;

  // Prefer "first line or before Email", but only if it actually looks like a name.
  const nameMatch = text.match(/^(.+?)(?:\r?\n|Email:|Email\s)/);
  const nameFromMatch = clamp(normalizeSpaces(nameMatch?.[1] ?? ""));
  if (nameFromMatch && looksLikePersonNameLine(nameFromMatch)) {
    name = nameFromMatch;
    nameIdx = lines.findIndex((l) => normalizeSpaces(l) === nameFromMatch);
  } else {
    for (let i = 0; i < lines.length; i++) {
      const l = normalizeSpaces(lines[i] ?? "");
      if (!l) continue;
      if (isHeaderNoise(l) || isDemographicLine(l) || isContactLike(l) || isLocationLike(l)) continue;
      if (looksLikePersonNameLine(l)) {
        name = clamp(l) || "Кандидат";
        nameIdx = i;
        break;
      }
    }
  }

  // Position: pick the first "reasonable" line after name.
  let position = "Кандидат";
  const startIdx = nameIdx >= 0 ? nameIdx + 1 : 0;
  for (let i = startIdx; i < lines.length; i++) {
    const l = normalizeSpaces(lines[i] ?? "");
    if (!l) continue;
    if (isHeaderNoise(l) || isContactLike(l) || isLocationLike(l)) continue;
    // HH exports often have demographics first; treat them as not-a-position.
    if (isDemographicLine(l)) continue;
    position = clamp(l) || "Кандидат";
    break;
  }

  // Clean up: remove birth date, keep only age (e.g. "Мужчина, 27 лет, родился 11 ноября 1998" -> "Мужчина, 27 лет")
  position = clamp(cleanupPositionString(position)) || "Кандидат";

  return { name: clamp(name) || "Кандидат", position };
}

/**
 * Removes birth date from position string, keeping only age.
 * Examples:
 *   "Мужчина, 27 лет, родился 11 ноября 1998" -> "Мужчина, 27 лет"
 *   "Женщина, 32 года, родилась 5 марта 1992" -> "Женщина, 32 года"
 */
function cleanupPositionString(position: string): string {
  // Remove ", родился/родилась ..." and everything after
  let cleaned = position.replace(/,?\s*родил(?:ся|ась)\s+.*/i, "");

  // Remove ", дата рождения ..." pattern
  cleaned = cleaned.replace(/,?\s*дата\s+рождения\s*[:\-]?\s*.*/i, "");

  // Remove standalone birth date patterns (DD.MM.YYYY or DD month YYYY)
  cleaned = cleaned.replace(/,?\s*\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{2,4}\s*$/i, "");
  cleaned = cleaned.replace(/,?\s*\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+\d{4}\s*$/i, "");

  return cleaned.trim().replace(/,\s*$/, "").trim() || position;
}
