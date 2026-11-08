import type { Interview } from "@/types";

export type InterviewListScope = "upcoming" | "all";
export type InterviewStatusFilter = Interview["status"] | "all";

const INTERVIEW_LIST_SCOPES: ReadonlyArray<InterviewListScope> = ["upcoming", "all"];
const INTERVIEW_STATUS_FILTERS: ReadonlyArray<InterviewStatusFilter> = ["all", "scheduled", "completed", "cancelled"];
const MAX_INTERVIEW_SEARCH_LENGTH = 120;

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, Math.trunc(v)));
}

export function parseInterviewListScope(value: string | null | undefined): InterviewListScope {
  const normalized = String(value ?? "");
  return INTERVIEW_LIST_SCOPES.includes(normalized as InterviewListScope) ? (normalized as InterviewListScope) : "upcoming";
}

export function isInterviewStatusFilter(value: string): value is InterviewStatusFilter {
  return INTERVIEW_STATUS_FILTERS.includes(value as InterviewStatusFilter);
}

export function parseInterviewStatusFilter(value: string | null | undefined): InterviewStatusFilter {
  const normalized = String(value ?? "");
  return isInterviewStatusFilter(normalized) ? normalized : "all";
}

export function limitInterviewSearchInput(value: string | null | undefined): string {
  return String(value ?? "").slice(0, MAX_INTERVIEW_SEARCH_LENGTH);
}

export function normalizeInterviewSearch(value: string | null | undefined): string {
  return limitInterviewSearchInput(value).trim().replace(/\s+/g, " ");
}

export function getInterviewListRange(input: { page: number; pageSize: number }): {
  page: number;
  pageSize: number;
  from: number;
  to: number;
} {
  const page = clampInt(input.page, 1, 10_000);
  const pageSize = clampInt(input.pageSize, 1, 200);
  const from = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    from,
    to: from + pageSize - 1,
  };
}
