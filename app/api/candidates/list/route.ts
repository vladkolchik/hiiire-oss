import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCompanyContext, type CompanyContext } from "@/lib/access/company-guards";
import { buildCandidateNameIlikePatterns } from "@/lib/candidates/name-search";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { loadAllSupabaseRows, loadPagedSupabaseRows } from "@/lib/supabase/pagination";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };
const MAX_PAGE_SIZE = 200;
// All-mode is used by reference selectors. Keep it bounded so one wide company cannot produce an unbounded response.
const MAX_ALL_CANDIDATES = 20_000;
const MAX_COMPANY_VACANCIES = 20_000;
const MAX_EVENT_ROWS = 100_000;
const CHUNK_SIZE = 200;

type CandidateRow = Database["public"]["Tables"]["candidates"]["Row"];
type AiAnalysisRow = Database["public"]["Tables"]["ai_analyses"]["Row"];
type CandidateContactRow = Database["public"]["Tables"]["candidate_contacts"]["Row"];
type CandidateStatus = CandidateRow["status"];
type CandidateSource = CandidateRow["source"];
type ScoreFilter = "all" | "high" | "medium" | "low" | "unscored";
type SortMode = "date_desc" | "date_asc" | "score_desc" | "score_asc";

type QueryInput = {
  page: number;
  pageSize: number;
  vacancyId: string | "all";
  scoreFilter: ScoreFilter;
  source: CandidateSource | null;
  status: CandidateStatus | null;
  eventStatus: CandidateStatus | null;
  eventPeriodStart: string | null;
  eventPeriodEnd: string | null;
  aiScoreMin: number | null;
  aiScoreMax: number | null;
  sort: SortMode;
  nameQuery: string;
  all: boolean;
};

const UuidSchema = z.string().uuid();
const ScoreFilterSchema = z.enum(["all", "high", "medium", "low", "unscored"]);
const SortSchema = z.enum(["date_desc", "date_asc", "score_desc", "score_asc"]);
const SourceSchema = z.enum(["hh.ru", "manual", "referral", "other"]);
const StatusSchema = z.enum(["new", "reviewing", "security-check", "interview-scheduled", "interviewed", "offer", "hired", "rejected"]);
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function invalidQueryResponse() {
  return NextResponse.json(
    { error: "INVALID_QUERY", message: "Проверьте параметры списка кандидатов." },
    { status: 400, headers: noStoreHeaders }
  );
}

function failedLookupResponse() {
  return NextResponse.json(
    { error: "CANDIDATES_LOOKUP_FAILED", message: "Не удалось загрузить кандидатов." },
    { status: 500, headers: noStoreHeaders }
  );
}

function emptyListResponse() {
  return NextResponse.json({ items: [], analyses: [], contacts: [], total: 0 }, { status: 200, headers: noStoreHeaders });
}

function chunk<T>(arr: readonly T[], size = CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < arr.length; start += size) {
    out.push(arr.slice(start, start + size));
  }
  return out;
}

function parseClampedInt(value: string | null, fallback: number, min: number, max: number): number | null {
  if (value === null || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function parseNullableNumber(value: string | null): number | null | undefined {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

function parseNullableEnum<T extends z.ZodTypeAny>(value: string | null, schema: T): z.infer<T> | null | undefined {
  if (value === null || value.trim() === "" || value === "all") return null;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function parseNullableDate(value: string | null): string | null | undefined {
  if (value === null || value.trim() === "") return null;
  const parsed = DateSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const date = new Date(`${parsed.data}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : parsed.data;
}

function parseQuery(searchParams: URLSearchParams): QueryInput | null {
  const page = parseClampedInt(searchParams.get("page"), 1, 1, 10_000);
  const pageSize = parseClampedInt(searchParams.get("pageSize"), 25, 1, MAX_PAGE_SIZE);
  const rawVacancyId = searchParams.get("vacancyId")?.trim() || "all";
  const rawScoreFilter = searchParams.get("scoreFilter") ?? "all";
  const source = parseNullableEnum(searchParams.get("source"), SourceSchema);
  const status = parseNullableEnum(searchParams.get("status"), StatusSchema);
  const eventStatus = parseNullableEnum(searchParams.get("eventStatus"), StatusSchema);
  const eventPeriodStart = parseNullableDate(searchParams.get("eventPeriodStart"));
  const eventPeriodEnd = parseNullableDate(searchParams.get("eventPeriodEnd"));
  const aiScoreMin = parseNullableNumber(searchParams.get("aiScoreMin"));
  const aiScoreMax = parseNullableNumber(searchParams.get("aiScoreMax"));
  const rawSort = searchParams.get("sort") ?? "date_desc";
  const nameQuery = searchParams.get("nameQuery") ?? "";
  const all = searchParams.get("all") === "true";

  const scoreFilter = ScoreFilterSchema.safeParse(rawScoreFilter);
  const sort = SortSchema.safeParse(rawSort);
  const vacancyId = rawVacancyId === "all" ? "all" : UuidSchema.safeParse(rawVacancyId).success ? rawVacancyId : null;

  if (
    page === null ||
    pageSize === null ||
    !scoreFilter.success ||
    !sort.success ||
    vacancyId === null ||
    source === undefined ||
    status === undefined ||
    eventStatus === undefined ||
    eventPeriodStart === undefined ||
    eventPeriodEnd === undefined ||
    aiScoreMin === undefined ||
    aiScoreMax === undefined
  ) {
    return null;
  }

  return {
    page,
    pageSize,
    vacancyId,
    scoreFilter: scoreFilter.data,
    source,
    status,
    eventStatus,
    eventPeriodStart,
    eventPeriodEnd,
    aiScoreMin,
    aiScoreMax,
    sort: sort.data,
    nameQuery,
    all,
  };
}

function applyScoreFilterToQuery(query: any, scoreFilter: ScoreFilter) {
  if (scoreFilter === "unscored") return query.is("match_percentage", null);
  if (scoreFilter === "high") return query.gte("match_percentage", 85);
  if (scoreFilter === "medium") return query.gte("match_percentage", 70).lt("match_percentage", 85);
  if (scoreFilter === "low") return query.not("match_percentage", "is", null).lt("match_percentage", 70);
  return query;
}

function applyCandidateFilters(query: any, input: QueryInput) {
  if (input.source) query = query.eq("source", input.source);
  if (input.status) query = query.eq("status", input.status);
  if (input.aiScoreMin !== null) query = query.gte("match_percentage", input.aiScoreMin);
  if (input.aiScoreMax !== null) query = query.lte("match_percentage", input.aiScoreMax);
  for (const namePattern of buildCandidateNameIlikePatterns(input.nameQuery)) query = query.ilike("name", namePattern);
  return applyScoreFilterToQuery(query, input.scoreFilter);
}

function applyCandidateScope(query: any, ctx: CompanyContext, input: QueryInput) {
  if (input.vacancyId === "all") {
    query = query.eq("vacancies.company_id", ctx.companyId);
  } else {
    query = query.eq("vacancy_id", input.vacancyId);
  }
  if (ctx.role !== "admin") query = query.eq("created_by", ctx.userId);
  return query;
}

function applyCandidateSort(query: any, input: QueryInput) {
  if (input.sort === "date_desc" || input.sort === "date_asc") {
    return query.order("applied_at", { ascending: input.sort === "date_asc" });
  }
  return query
    .order("match_percentage", { ascending: input.sort === "score_asc", nullsFirst: false })
    .order("applied_at", { ascending: false });
}

function buildCandidateRowsQuery(admin: any, ctx: CompanyContext, input: QueryInput, eventCandidateIds: string[] | null = null) {
  let query = admin
    .from("candidates")
    .select(input.vacancyId === "all" ? "*,vacancies!inner(id)" : "*", { count: "exact" });
  query = applyCandidateScope(query, ctx, input);
  if (eventCandidateIds) query = query.in("id", eventCandidateIds);
  query = applyCandidateFilters(query, input);
  return applyCandidateSort(query, input);
}

function buildCandidateCountQuery(admin: any, ctx: CompanyContext, input: QueryInput, eventCandidateIds: string[] | null = null) {
  let query = admin
    .from("candidates")
    .select(input.vacancyId === "all" ? "*,vacancies!inner(id)" : "*", { count: "exact", head: true });
  query = applyCandidateScope(query, ctx, input);
  if (eventCandidateIds) query = query.in("id", eventCandidateIds);
  return applyCandidateFilters(query, input);
}

function stripEmbeddedVacancy(rows: unknown[] | null): CandidateRow[] {
  return (rows ?? []).map((row) => {
    const { vacancies: _vacancies, ...candidate } = row as CandidateRow & { vacancies?: unknown };
    return candidate as CandidateRow;
  });
}

async function loadCompanyVacancyIds(admin: any, ctx: CompanyContext): Promise<string[]> {
  const rows = await loadAllSupabaseRows<{ id: string }>({
    maxRows: MAX_COMPANY_VACANCIES,
    runPageQuery: (from, to) => admin.from("vacancies").select("id").eq("company_id", ctx.companyId).range(from, to),
  });
  return rows.map((row) => row.id);
}

async function vacancyBelongsToCompany(admin: any, ctx: CompanyContext, vacancyId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("vacancies")
    .select("id")
    .eq("company_id", ctx.companyId)
    .eq("id", vacancyId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function listCandidateIdsFromPipelineEvents(admin: any, input: QueryInput, vacancyIds: string[]): Promise<string[] | null> {
  if (!input.eventStatus) return null;
  if (vacancyIds.length === 0) return [];

  const candidateIds = new Set<string>();
  for (let start = 0; start < vacancyIds.length; start += CHUNK_SIZE) {
    const vacancyIdChunk = vacancyIds.slice(start, start + CHUNK_SIZE);
    const rows = await loadAllSupabaseRows<{ candidate_id: string | null }>({
      maxRows: MAX_EVENT_ROWS,
      runPageQuery: (from, to) => {
        let query = admin
          .from("pipeline_events")
          .select("candidate_id")
          .eq("to_status", input.eventStatus)
          .in("vacancy_id", vacancyIdChunk);
        if (input.eventPeriodStart) query = query.gte("occurred_at", `${input.eventPeriodStart}T00:00:00.000Z`);
        if (input.eventPeriodEnd) query = query.lte("occurred_at", `${input.eventPeriodEnd}T23:59:59.999Z`);
        return query.range(from, to);
      },
    });
    for (const row of rows) {
      if (row.candidate_id) candidateIds.add(row.candidate_id);
    }
  }

  return [...candidateIds];
}

function compareCandidateRows(input: QueryInput, a: CandidateRow, b: CandidateRow): number {
  if (input.sort === "date_asc" || input.sort === "date_desc") {
    const diff = new Date(a.applied_at).getTime() - new Date(b.applied_at).getTime();
    return input.sort === "date_asc" ? diff : -diff;
  }

  const aScore = a.match_percentage;
  const bScore = b.match_percentage;
  if (aScore === null && bScore !== null) return 1;
  if (aScore !== null && bScore === null) return -1;
  if (aScore !== null && bScore !== null && aScore !== bScore) {
    return input.sort === "score_asc" ? aScore - bScore : bScore - aScore;
  }
  return new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime();
}

async function loadCandidatesByChunkedEventIds(admin: any, ctx: CompanyContext, input: QueryInput, eventCandidateIds: string[]) {
  const byId = new Map<string, CandidateRow>();
  for (const eventCandidateIdsChunk of chunk(eventCandidateIds)) {
    const rows = await loadAllSupabaseRows<CandidateRow>({
      maxRows: MAX_ALL_CANDIDATES,
      runPageQuery: async (from, to) => {
        const { data, error } = await buildCandidateRowsQuery(admin, ctx, input, eventCandidateIdsChunk).range(from, to);
        return { data: stripEmbeddedVacancy(data), error };
      },
    });
    for (const row of rows) byId.set(row.id, row);
    if (byId.size > MAX_ALL_CANDIDATES) throw new Error(`Supabase query exceeded ${MAX_ALL_CANDIDATES} rows`);
  }

  const sorted = [...byId.values()].sort((a, b) => compareCandidateRows(input, a, b));
  const from = (input.page - 1) * input.pageSize;
  const to = from + input.pageSize;
  return {
    rows: input.all ? sorted : sorted.slice(from, to),
    total: sorted.length,
  };
}

async function loadCandidateRows(admin: any, ctx: CompanyContext, input: QueryInput, eventCandidateIds: string[] | null) {
  if (eventCandidateIds?.length === 0) return { rows: [], total: 0 };

  if (eventCandidateIds && eventCandidateIds.length > CHUNK_SIZE) {
    return loadCandidatesByChunkedEventIds(admin, ctx, input, eventCandidateIds);
  }

  if (input.all) {
    const rows = await loadAllSupabaseRows<CandidateRow>({
      maxRows: MAX_ALL_CANDIDATES,
      runPageQuery: async (from, to) => {
        const { data, error } = await buildCandidateRowsQuery(admin, ctx, input, eventCandidateIds).range(from, to);
        return { data: stripEmbeddedVacancy(data), error };
      },
    });
    return { rows, total: rows.length };
  }

  const from = (input.page - 1) * input.pageSize;
  const to = from + input.pageSize - 1;
  const { rows, total } = await loadPagedSupabaseRows<CandidateRow>({
    runPageQuery: async () => {
      const { data, error, count } = await buildCandidateRowsQuery(admin, ctx, input, eventCandidateIds).range(from, to);
      return { data: stripEmbeddedVacancy(data), error, count };
    },
    runCountQuery: async () => buildCandidateCountQuery(admin, ctx, input, eventCandidateIds),
  });
  return { rows, total };
}

async function loadAnalysesForCandidates(admin: any, candidateIds: string[]): Promise<AiAnalysisRow[]> {
  const rows: AiAnalysisRow[] = [];
  for (const candidateIdsChunk of chunk(candidateIds)) {
    const { data, error } = await admin
      .from("ai_analyses")
      .select("*")
      .in("candidate_id", candidateIdsChunk)
      .order("analyzed_at", { ascending: false });
    if (error) throw error;
    rows.push(...((data ?? []) as AiAnalysisRow[]));
  }
  return rows;
}

async function loadContactsForCandidates(admin: any, candidateIds: string[]): Promise<CandidateContactRow[]> {
  const rows: CandidateContactRow[] = [];
  for (const candidateIdsChunk of chunk(candidateIds)) {
    const { data, error } = await admin
      .from("candidate_contacts")
      .select("*")
      .in("candidate_id", candidateIdsChunk)
      .order("created_at", { ascending: true });
    if (error) throw error;
    rows.push(...((data ?? []) as CandidateContactRow[]));
  }
  return rows;
}

export async function GET(req: NextRequest) {
  try {
    const input = parseQuery(req.nextUrl.searchParams);
    if (!input) return invalidQueryResponse();

    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();
    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) {
      ctxRes.response.headers.set("Cache-Control", "no-store");
      return ctxRes.response;
    }
    const ctx = ctxRes.data;

    let eventVacancyIds: string[] = [];
    if (input.vacancyId === "all") {
      eventVacancyIds = input.eventStatus ? await loadCompanyVacancyIds(admin, ctx) : [];
    } else {
      const ok = await vacancyBelongsToCompany(admin, ctx, input.vacancyId);
      if (!ok) return emptyListResponse();
      eventVacancyIds = input.eventStatus ? [input.vacancyId] : [];
    }

    const eventCandidateIds = await listCandidateIdsFromPipelineEvents(admin, input, eventVacancyIds);
    const { rows: items, total } = await loadCandidateRows(admin, ctx, input, eventCandidateIds);
    const candidateIds = items.map((item) => item.id);
    const [analyses, contacts] = candidateIds.length
      ? await Promise.all([loadAnalysesForCandidates(admin, candidateIds), loadContactsForCandidates(admin, candidateIds)])
      : [[], []];

    return NextResponse.json({ items, analyses, contacts, total }, { status: 200, headers: noStoreHeaders });
  } catch {
    return failedLookupResponse();
  }
}
