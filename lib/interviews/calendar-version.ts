import { createHash } from "node:crypto";

type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike };

function stableCanonicalize(value: unknown): JsonLike {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableCanonicalize);

  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, JsonLike> = {};
    for (const key of Object.keys(source).sort()) {
      const item = source[key];
      if (typeof item === "undefined") continue;
      sorted[key] = stableCanonicalize(item);
    }
    return sorted;
  }

  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

function normalizeInterviewers(value: unknown): JsonLike {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return stableCanonicalize({
      id: row.id,
      name: row.name,
      email: row.email,
      avatar_url: row.avatar_url ?? row.avatar,
    });
  });
}

function visibleVersionShape(row: Record<string, unknown>): JsonLike {
  if (row.accessLevel === "interviewer_only") {
    return stableCanonicalize({
      id: row.id,
      accessLevel: row.accessLevel,
      scheduledAt: row.scheduledAt,
      durationMinutes: row.durationMinutes,
      type: row.type,
      status: row.status,
      displayTitle: row.displayTitle,
      displaySubtitle: row.displaySubtitle,
      meetingUrl: row.meetingUrl,
      location: row.location,
      interviewers: normalizeInterviewers(row.interviewers),
    });
  }

  return stableCanonicalize(row);
}

function sortKey(value: JsonLike): string {
  if (value && typeof value === "object" && !Array.isArray(value) && typeof value.id === "string") return value.id;
  return JSON.stringify(value);
}

export function buildCalendarVersion(interviews: Array<Record<string, unknown>>): string {
  const visibleRows = interviews.map(visibleVersionShape).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const digest = createHash("sha256").update(JSON.stringify(visibleRows)).digest("hex");
  return `v1:${digest}`;
}
