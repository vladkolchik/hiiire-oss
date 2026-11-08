export const CANDIDATE_NAME_SEARCH_MAX_LENGTH = 120;

export function limitCandidateNameSearchInput(input: string | null | undefined): string {
  return String(input ?? "")
    .replace(/\u00A0/g, " ")
    .slice(0, CANDIDATE_NAME_SEARCH_MAX_LENGTH);
}

export function normalizeCandidateNameSearch(input: string | null | undefined): string {
  return limitCandidateNameSearchInput(input).replace(/\s+/g, " ").trim();
}

function escapeIlikePattern(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}

export function buildCandidateNameIlikePattern(input: string | null | undefined): string {
  const normalized = normalizeCandidateNameSearch(input);
  return normalized ? `%${escapeIlikePattern(normalized)}%` : "";
}

export function buildCandidateNameIlikePatterns(input: string | null | undefined): string[] {
  const normalized = normalizeCandidateNameSearch(input);
  if (!normalized) return [];

  const seen = new Set<string>();
  const patterns: string[] = [];

  for (const token of normalized.split(" ")) {
    const escapedToken = escapeIlikePattern(token);
    if (!escapedToken || seen.has(escapedToken)) continue;
    seen.add(escapedToken);
    patterns.push(`%${escapedToken}%`);
  }

  return patterns;
}
