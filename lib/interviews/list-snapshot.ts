import type { CompanyContext } from "@/lib/access/company-guards";
import {
  getInterviewListRange,
  normalizeInterviewSearch,
  parseInterviewListScope,
  parseInterviewStatusFilter,
  type InterviewListScope,
  type InterviewStatusFilter,
} from "@/lib/interviews/list-query";
import { enrichVisibleInterviewRows, loadVisibleInterviewAccessRows, type VisibleInterviewAccessRow } from "@/lib/interviews/calendar-snapshot";

type InterviewListPageInput = {
  scope?: string | null;
  status?: string | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
  now?: Date;
};

const INTERVIEW_LIST_QUERY_BATCH_SIZE = 100;
const INTERVIEW_LIST_MAX_SCAN_ROWS = 1000;

function includesSearchText(interview: any, search: string): boolean {
  if (!search) return true;
  const needle = search.toLowerCase();
  const haystack = [
    interview.displayTitle,
    interview.displaySubtitle,
    interview.location,
    interview.notes,
    ...(interview.interviewers ?? []).map((person: any) => person?.name),
  ]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .toLowerCase();

  return haystack.includes(needle);
}

async function loadAccessCheckedRows(
  admin: any,
  ctx: CompanyContext,
  input: { scope: InterviewListScope; status: InterviewStatusFilter; now: Date; offset: number; limit: number }
): Promise<{ rows: VisibleInterviewAccessRow[]; sourceRowsRead: number; exhausted: boolean }> {
  let query = admin
    .from("interviews")
    .select("*")
    .eq("company_id", ctx.companyId);

  if (input.scope === "upcoming") query = query.gte("scheduled_at", input.now.toISOString());
  if (input.status !== "all") query = query.eq("status", input.status);

  query = query
    .order("scheduled_at", { ascending: input.scope === "upcoming" })
    .range(input.offset, input.offset + input.limit - 1);

  const { data: interviews, error } = await query;
  if (error) throw new Error("INTERVIEW_LOOKUP_FAILED");

  const sourceRows = interviews ?? [];
  // Uses the same read contract as requireInterviewReadAccess, but batches source rows.
  const rows: VisibleInterviewAccessRow[] = await loadVisibleInterviewAccessRows(admin, ctx, sourceRows);

  return {
    rows,
    sourceRowsRead: sourceRows.length,
    exhausted: sourceRows.length < input.limit,
  };
}

export async function loadVisibleInterviewListPage(admin: any, ctx: CompanyContext, input: InterviewListPageInput) {
  const scope = parseInterviewListScope(input.scope);
  const status = parseInterviewStatusFilter(input.status);
  const search = normalizeInterviewSearch(input.search);
  const { from, to, page, pageSize } = getInterviewListRange({
    page: input.page ?? 1,
    pageSize: input.pageSize ?? 25,
  });

  const now = input.now ?? new Date();
  const targetMatchCount = to + 2;
  const matchedInterviews: any[] = [];
  let sourceOffset = 0;
  let scannedRows = 0;
  let exhausted = false;

  while (scannedRows < INTERVIEW_LIST_MAX_SCAN_ROWS && matchedInterviews.length < targetMatchCount && !exhausted) {
    const limit = Math.min(INTERVIEW_LIST_QUERY_BATCH_SIZE, INTERVIEW_LIST_MAX_SCAN_ROWS - scannedRows);
    const batch = await loadAccessCheckedRows(admin, ctx, {
      scope,
      status,
      now,
      offset: sourceOffset,
      limit,
    });

    sourceOffset += limit;
    scannedRows += batch.sourceRowsRead;
    exhausted = batch.exhausted;

    if (batch.rows.length === 0) continue;

    const visibleInterviews = await enrichVisibleInterviewRows(admin, batch.rows);
    for (const interview of visibleInterviews) {
      if (includesSearchText(interview, search)) matchedInterviews.push(interview);
      if (!batch.exhausted && matchedInterviews.length >= targetMatchCount) break;
    }
  }

  const totalIsExact = exhausted;
  const scanLimitReached = !exhausted && scannedRows >= INTERVIEW_LIST_MAX_SCAN_ROWS;
  const hasMore = matchedInterviews.length > to + 1 || (!totalIsExact && matchedInterviews.length >= to + 1);

  return {
    interviews: matchedInterviews.slice(from, to + 1),
    total: matchedInterviews.length,
    hasMore,
    totalIsExact,
    scanLimitReached,
    page,
    pageSize,
    scope,
    status,
    search,
  };
}
