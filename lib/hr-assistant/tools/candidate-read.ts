import "server-only";

import type { CompanyContext } from "@/lib/access/company-guards";
import { requireCandidateAccess } from "@/lib/access/company-guards";
import { buildCandidateNameIlikePatterns } from "@/lib/candidates/name-search";
import { CANDIDATE_STATUS_LABELS, formatCandidateStatusLabel } from "@/lib/candidates/status-labels";
import { buildCandidateCardHref } from "@/lib/dashboard/deep-links";
import { loadAllSupabaseRows } from "@/lib/supabase/pagination";
import { formatVacancyStatusLabel } from "@/lib/vacancies/status-labels";

import {
  clampToolLimit,
  createCursor,
  decodeCursor,
  filtersHash,
  toHrAssistantScope,
  toolFailure,
  toolItemSuccess,
  toolListSuccess,
  type HrAssistantToolSort,
} from "../tool-contracts";
import { CANDIDATE_STATUS_VALUES, type CandidateStatus } from "./crm-write";

export const ASSISTANT_CANDIDATE_LIST_DEFAULT_LIMIT = 20;
export const ASSISTANT_CANDIDATE_LIST_MAX_LIMIT = 100;
export const ASSISTANT_CANDIDATE_LIST_LIMIT = ASSISTANT_CANDIDATE_LIST_DEFAULT_LIMIT;
const ASSISTANT_CANDIDATE_VACANCY_FILTER_CHUNK_SIZE = 200;

export type CandidateScoreFilter = "all" | "high" | "medium" | "low" | "unscored";
export type CandidateSourceFilter = "all" | "manual" | "hh" | "referral" | "other";
export type CandidateSort = "date_desc" | "date_asc" | "score_desc" | "score_asc";
export type CandidateInclude = "vacancy" | "contacts" | "analysis" | "latestJob" | "resumeSummary";

export type ListAccessibleCandidatesInput = {
  limit?: number;
  cursor?: string | null;
  vacancyId?: string | null;
  nameQuery?: string | null;
  status?: CandidateStatus | null;
  scoreFilter?: CandidateScoreFilter;
  source?: CandidateSourceFilter;
  sort?: CandidateSort;
  includeAggregations?: boolean;
};

type CandidateRow = {
  id: string;
  name: string;
  position: string | null;
  status: string;
  vacancy_id: string;
  match_percentage: number | null;
  desired_salary_text: string | null;
  source: string | null;
  created_by: string | null;
  applied_at: string;
};

const SCORE_FILTER_LABELS: Record<CandidateScoreFilter, string> = {
  all: "Все",
  unscored: "Не просчитаны",
  high: "Высокое",
  medium: "Среднее",
  low: "Низкое",
};

const SOURCE_FILTER_LABELS: Record<CandidateSourceFilter | "hh.ru" | "unknown", string> = {
  all: "Все источники",
  manual: "Вручную",
  hh: "HH.ru",
  "hh.ru": "HH.ru",
  referral: "Реферал",
  other: "Другое",
  unknown: "Неизвестно",
};

const CANDIDATE_SORT_LABELS: Record<CandidateSort, string> = {
  date_desc: "Дата добавления: новые сверху",
  date_asc: "Дата добавления: старые сверху",
  score_desc: "Оценка: высокая → низкая",
  score_asc: "Оценка: низкая → высокая",
};

const AI_JOB_STATUS_LABELS: Record<string, string> = {
  queued: "В очереди",
  processing: "Анализируется",
  done: "Готово",
  failed: "Ошибка",
  canceled: "Отменено",
};

const CANDIDATE_INCLUDE_LABELS: Record<CandidateInclude, string> = {
  vacancy: "Вакансия",
  contacts: "Контакты",
  analysis: "AI-анализ",
  latestJob: "Последний AI-анализ",
  resumeSummary: "Краткая информация о резюме",
};

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function formatCandidateSourceLabel(source: string | null | undefined) {
  return SOURCE_FILTER_LABELS[source as keyof typeof SOURCE_FILTER_LABELS] ?? SOURCE_FILTER_LABELS.unknown;
}

function formatAiJobStatusLabel(status: string | null | undefined) {
  return AI_JOB_STATUS_LABELS[status ?? ""] ?? "Неизвестно";
}

function formatCandidateIncludeLabels(include: CandidateInclude[] | undefined) {
  if (!include?.length) return "Без дополнительных блоков";
  return include.map((item) => CANDIDATE_INCLUDE_LABELS[item]).join(", ");
}

function buildCandidateAppliedFilterLabels(input: {
  vacancyId: string | null;
  nameQuery: string | null;
  status: CandidateStatus | null;
  scoreFilter: CandidateScoreFilter;
  source: CandidateSourceFilter;
}) {
  return {
    vacancyId: input.vacancyId ? "Выбранная вакансия" : "Все доступные вакансии",
    nameQuery: input.nameQuery ?? "Любое имя",
    status: input.status ? formatCandidateStatusLabel(input.status) : "Все статусы",
    scoreFilter: SCORE_FILTER_LABELS[input.scoreFilter],
    source: SOURCE_FILTER_LABELS[input.source],
  };
}

function buildCandidateScopeLabel(scopeType: string) {
  return scopeType === "vacancy" ? "Кандидаты по выбранной вакансии" : "Все доступные кандидаты";
}

function toToolSort(sort: CandidateSort): HrAssistantToolSort {
  if (sort === "date_asc") return { key: "applied_at", direction: "asc" };
  if (sort === "score_desc") return { key: "match_percentage", direction: "desc" };
  if (sort === "score_asc") return { key: "match_percentage", direction: "asc" };
  return { key: "applied_at", direction: "desc" };
}

function applyCandidateScoreFilter(query: any, scoreFilter: CandidateScoreFilter) {
  if (scoreFilter === "unscored") return query.is("match_percentage", null);
  if (scoreFilter === "high") return query.gte("match_percentage", 85);
  if (scoreFilter === "medium") return query.gte("match_percentage", 70).lt("match_percentage", 85);
  if (scoreFilter === "low") return query.not("match_percentage", "is", null).lt("match_percentage", 70);
  return query;
}

function applyCandidateSort(query: any, sort: CandidateSort) {
  if (sort === "date_asc") return query.order("applied_at", { ascending: true }).order("id", { ascending: true });
  if (sort === "score_desc") return query.order("match_percentage", { ascending: false, nullsFirst: false }).order("id", { ascending: true });
  if (sort === "score_asc") return query.order("match_percentage", { ascending: true, nullsFirst: false }).order("id", { ascending: true });
  return query.order("applied_at", { ascending: false }).order("id", { ascending: true });
}

function compareNullableScores(left: number | null, right: number | null, direction: "asc" | "desc") {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return direction === "asc" ? left - right : right - left;
}

function compareCandidateRows(left: CandidateRow, right: CandidateRow, sort: CandidateSort) {
  if (sort === "date_asc") {
    const applied = left.applied_at.localeCompare(right.applied_at);
    return applied || left.id.localeCompare(right.id);
  }
  if (sort === "score_desc") {
    const score = compareNullableScores(left.match_percentage, right.match_percentage, "desc");
    return score || left.id.localeCompare(right.id);
  }
  if (sort === "score_asc") {
    const score = compareNullableScores(left.match_percentage, right.match_percentage, "asc");
    return score || left.id.localeCompare(right.id);
  }
  const applied = right.applied_at.localeCompare(left.applied_at);
  return applied || left.id.localeCompare(right.id);
}

function applyCandidateCursor(query: any, input: { cursor: string | null | undefined; filtersHash: string; sort: CandidateSort }) {
  if (!input.cursor) return { ok: true as const, query };

  try {
    const cursor = decodeCursor(input.cursor);
    if (cursor.entity !== "candidates" || cursor.filtersHash !== input.filtersHash) {
      return { ok: false as const, reason: "changed" };
    }

    const lastId = String(cursor.last.id ?? "");
    const lastAppliedAt = cursor.last.appliedAt ? String(cursor.last.appliedAt) : "";
    const lastScore = cursor.last.matchPercentage;

    if ((input.sort === "date_desc" || input.sort === "date_asc") && !lastAppliedAt) {
      return { ok: false as const, reason: "invalid" };
    }

    if (input.sort === "date_desc") {
      return { ok: true as const, query: query.or(`applied_at.lt.${lastAppliedAt},and(applied_at.eq.${lastAppliedAt},id.gt.${lastId})`) };
    }
    if (input.sort === "date_asc") {
      return { ok: true as const, query: query.or(`applied_at.gt.${lastAppliedAt},and(applied_at.eq.${lastAppliedAt},id.gt.${lastId})`) };
    }
    if (input.sort === "score_desc" && typeof lastScore === "number") {
      return { ok: true as const, query: query.or(`match_percentage.lt.${lastScore},and(match_percentage.eq.${lastScore},id.gt.${lastId}),match_percentage.is.null`) };
    }
    if (input.sort === "score_asc" && typeof lastScore === "number") {
      return { ok: true as const, query: query.or(`match_percentage.gt.${lastScore},and(match_percentage.eq.${lastScore},id.gt.${lastId}),match_percentage.is.null`) };
    }
    if ((input.sort === "score_desc" || input.sort === "score_asc") && lastScore === null) {
      return { ok: true as const, query: query.is("match_percentage", null).gt("id", lastId) };
    }

    return { ok: false as const, reason: "invalid" };
  } catch {
    return { ok: false as const, reason: "invalid" };
  }
}

async function getAccessibleVacancyIds(admin: any, ctx: CompanyContext, vacancyId?: string | null) {
  if (vacancyId) {
    const { data: vacancy, error } = await admin.from("vacancies").select("id,company_id").eq("id", vacancyId).maybeSingle();
    if (error) return { ok: false as const, reason: "lookup" };
    if (!vacancy || vacancy.company_id !== ctx.companyId) return { ok: false as const, reason: "access" };
    return { ok: true as const, ids: [vacancyId] };
  }

  try {
    const rows = await loadAllSupabaseRows<{ id: string }>({
      runPageQuery: (from, to) => {
        return admin.from("vacancies").select("id").eq("company_id", ctx.companyId).order("id", { ascending: true }).range(from, to);
      },
    });
    return { ok: true as const, ids: rows.map((row) => row.id) };
  } catch {
    return { ok: false as const, reason: "lookup" };
  }
}

function applyCandidateFilters(
  query: any,
  input: {
    ctx: CompanyContext;
    namePatterns: string[];
    status?: CandidateStatus | null;
    source: CandidateSourceFilter;
    scoreFilter: CandidateScoreFilter;
  }
) {
  let nextQuery = query;
  if (input.ctx.role !== "admin") nextQuery = nextQuery.eq("created_by", input.ctx.userId);
  for (const namePattern of input.namePatterns) nextQuery = nextQuery.ilike("name", namePattern);
  if (input.status) nextQuery = nextQuery.eq("status", input.status);
  if (input.source === "hh") nextQuery = nextQuery.eq("source", "hh.ru");
  if (input.source === "manual") nextQuery = nextQuery.eq("source", "manual");
  if (input.source === "referral") nextQuery = nextQuery.eq("source", "referral");
  if (input.source === "other") nextQuery = nextQuery.eq("source", "other");
  return applyCandidateScoreFilter(nextQuery, input.scoreFilter);
}

async function loadVacancyTitlesById(admin: any, vacancyIds: string[]) {
  if (vacancyIds.length === 0) return { ok: true as const, titlesById: new Map<string, string>() };

  const { data, error } = await admin.from("vacancies").select("id,title").in("id", vacancyIds);
  if (error) return { ok: false as const };

  return {
    ok: true as const,
    titlesById: new Map(((data ?? []) as Array<{ id: string; title: string }>).map((vacancy) => [vacancy.id, vacancy.title])),
  };
}

function toCandidateListItem(row: CandidateRow, vacancyTitlesById: ReadonlyMap<string, string>) {
  return {
    id: row.id,
    href: buildCandidateCardHref(row.id),
    name: row.name,
    position: row.position,
    status: row.status,
    statusLabel: formatCandidateStatusLabel(row.status),
    vacancyId: row.vacancy_id,
    vacancyTitle: vacancyTitlesById.get(row.vacancy_id) ?? null,
    matchPercentage: row.match_percentage,
    desiredSalaryText: row.desired_salary_text ?? null,
    source: row.source === "hh.ru" ? "hh" : row.source ?? "unknown",
    sourceLabel: formatCandidateSourceLabel(row.source),
    appliedAt: row.applied_at,
  };
}

async function buildCandidateStatusCounts(
  admin: any,
  ctx: CompanyContext,
  input: {
    vacancyIds: string[];
    namePatterns: string[];
    status?: CandidateStatus | null;
    source: CandidateSourceFilter;
    scoreFilter: CandidateScoreFilter;
  }
) {
  const statuses = input.status ? [input.status] : CANDIDATE_STATUS_VALUES;
  const vacancyIdChunks = chunk(input.vacancyIds, ASSISTANT_CANDIDATE_VACANCY_FILTER_CHUNK_SIZE);
  const entries = await Promise.all(
    statuses.map(async (status) => {
      let total = 0;
      for (const vacancyIdChunk of vacancyIdChunks) {
        let countQuery = admin.from("candidates").select("id", { count: "exact", head: true }).in("vacancy_id", vacancyIdChunk);
        countQuery = applyCandidateFilters(countQuery, {
          ctx,
          namePatterns: input.namePatterns,
          status,
          source: input.source,
          scoreFilter: input.scoreFilter,
        });
        const { error, count } = await countQuery;
        if (error) return { ok: false as const };
        total += count ?? 0;
      }
      return { ok: true as const, status, count: total };
    })
  );

  const statusCounts: Record<string, number> = {};
  for (const entry of entries) {
    if (!entry.ok) return { ok: false as const };
    if (entry.count > 0) statusCounts[entry.status] = entry.count;
  }

  return { ok: true as const, statusCounts };
}

export async function listAccessibleCandidatesForAssistant(
  admin: any,
  ctx: CompanyContext,
  input: ListAccessibleCandidatesInput = {}
) {
  const limit = clampToolLimit(input.limit, {
    defaultLimit: ASSISTANT_CANDIDATE_LIST_DEFAULT_LIMIT,
    maxLimit: ASSISTANT_CANDIDATE_LIST_MAX_LIMIT,
  });
  const sortKey = input.sort ?? "date_desc";
  const sort = toToolSort(sortKey);
  const scoreFilter = input.scoreFilter ?? "all";
  const source = input.source ?? "all";
  const includeAggregations = input.includeAggregations ?? true;
  const nameQuery = input.nameQuery?.trim() || null;
  const namePatterns = buildCandidateNameIlikePatterns(nameQuery);
  const appliedFilters = {
    vacancyId: input.vacancyId ?? null,
    nameQuery,
    status: input.status ?? null,
    scoreFilter,
    source,
  };
  const appliedFilterLabels = buildCandidateAppliedFilterLabels(appliedFilters);
  const availableFilters = {
    status: CANDIDATE_STATUS_VALUES,
    scoreFilter: ["all", "high", "medium", "low", "unscored"],
    source: ["all", "manual", "hh", "referral", "other"],
  };
  const availableFilterLabels = {
    status: CANDIDATE_STATUS_LABELS,
    scoreFilter: SCORE_FILTER_LABELS,
    source: SOURCE_FILTER_LABELS,
  };
  const currentFiltersHash = filtersHash(appliedFilters, sort);
  const vacancyIdsResult = await getAccessibleVacancyIds(admin, ctx, input.vacancyId ?? null);
  const scope = toHrAssistantScope(ctx, { scopeType: input.vacancyId ? "vacancy" : "workspace", scopeId: input.vacancyId ?? null });
  const scopeLabel = buildCandidateScopeLabel(scope.scopeType);

  if (!vacancyIdsResult.ok) {
    if (vacancyIdsResult.reason === "access") {
      return toolFailure("not_found", "Вакансия не найдена или недоступна.", false);
    }
    return toolFailure("temporary_failure", "Не удалось загрузить доступные вакансии. Попробуйте еще раз.", true);
  }

  if (vacancyIdsResult.ids.length === 0) {
    return toolListSuccess({
      toolRunId: "",
      items: [],
      pageInfo: { limit, nextCursor: null, hasMore: false, total: 0, totalExact: true },
      appliedFilters,
      appliedFilterLabels: appliedFilterLabels,
      availableFilters,
      availableFilterLabels: availableFilterLabels,
      sort,
      sortLabel: CANDIDATE_SORT_LABELS[sortKey],
      scope,
      scopeLabel: scopeLabel,
      aggregations: includeAggregations ? { statusCounts: {}, statusLabels: CANDIDATE_STATUS_LABELS } : undefined,
    });
  }

  const vacancyIdChunks = chunk(vacancyIdsResult.ids, ASSISTANT_CANDIDATE_VACANCY_FILTER_CHUNK_SIZE);
  const resultRows: CandidateRow[] = [];
  let total = 0;

  for (const vacancyIdChunk of vacancyIdChunks) {
    let query = admin
      .from("candidates")
      .select("id,name,position,status,vacancy_id,match_percentage,desired_salary_text,source,created_by,applied_at", { count: "exact" })
      .in("vacancy_id", vacancyIdChunk);

    query = applyCandidateFilters(query, { ctx, namePatterns, status: input.status, source, scoreFilter });
    const cursorResult = applyCandidateCursor(query, { cursor: input.cursor, filtersHash: currentFiltersHash, sort: sortKey });
    if (!cursorResult.ok) {
      return toolFailure(
        "invalid_input",
        cursorResult.reason === "changed" ? "Обновите список кандидатов: параметры страницы изменились." : "Обновите список кандидатов: страница устарела.",
        false
      );
    }

    const { data, error, count } = await applyCandidateSort(cursorResult.query, sortKey).limit(limit + 1);
    if (error) return toolFailure("temporary_failure", "Не удалось загрузить кандидатов. Попробуйте еще раз.", true);
    total += count ?? 0;
    resultRows.push(...((data ?? []) as CandidateRow[]));
  }

  resultRows.sort((left, right) => compareCandidateRows(left, right, sortKey));
  const rows = resultRows.slice(0, limit);
  const vacancyIds = Array.from(new Set(rows.map((row) => row.vacancy_id)));
  const vacancyTitlesResult = await loadVacancyTitlesById(admin, vacancyIds);
  if (!vacancyTitlesResult.ok) return toolFailure("temporary_failure", "Не удалось загрузить названия вакансий. Попробуйте еще раз.", true);

  const hasMore = resultRows.length > limit;
  const last = rows.at(-1);
  const nextCursor =
    hasMore && last
      ? createCursor({
          entity: "candidates",
          filtersHash: currentFiltersHash,
          sort,
          last: { appliedAt: last.applied_at, id: last.id, matchPercentage: last.match_percentage },
        })
      : null;

  let statusCounts: Record<string, number> | undefined;
  if (includeAggregations) {
    const countsResult = await buildCandidateStatusCounts(admin, ctx, {
      vacancyIds: vacancyIdsResult.ids,
      namePatterns,
      status: input.status,
      source,
      scoreFilter,
    });
    if (!countsResult.ok) return toolFailure("temporary_failure", "Не удалось посчитать статусы кандидатов. Попробуйте еще раз.", true);
    statusCounts = countsResult.statusCounts;
  }

  return toolListSuccess({
    toolRunId: "",
    items: rows.map((row) => toCandidateListItem(row, vacancyTitlesResult.titlesById)),
    pageInfo: { limit, nextCursor, hasMore, total, totalExact: true },
    appliedFilters,
    appliedFilterLabels: appliedFilterLabels,
    availableFilters,
    availableFilterLabels: availableFilterLabels,
    sort,
    sortLabel: CANDIDATE_SORT_LABELS[sortKey],
    scope,
    scopeLabel: scopeLabel,
    aggregations: includeAggregations ? { statusCounts: statusCounts ?? {}, statusLabels: CANDIDATE_STATUS_LABELS } : undefined,
  });
}

export async function getAccessibleCandidateForAssistant(
  admin: any,
  ctx: CompanyContext,
  input: { candidateId: string; include?: CandidateInclude[] }
) {
  const access = await requireCandidateAccess(admin, ctx, input.candidateId);
  if (!access.ok) return toolFailure("not_found", "Кандидат не найден или недоступен.", false);

  let query = admin
    .from("candidates")
    .select("id,name,position,status,vacancy_id,match_percentage,desired_salary_text,comment,source,created_by,applied_at")
    .eq("id", input.candidateId)
    .eq("vacancy_id", access.data.candidate.vacancyId);

  if (ctx.role !== "admin") {
    query = query.eq("created_by", ctx.userId);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return toolFailure("not_found", "Кандидат не найден или недоступен.", false);

  const { data: vacancyForTitle, error: vacancyTitleError } = await admin
    .from("vacancies")
    .select("id,title")
    .eq("id", data.vacancy_id)
    .maybeSingle();
  if (vacancyTitleError) return toolFailure("temporary_failure", "Не удалось загрузить вакансию кандидата. Попробуйте еще раз.", true);
  const vacancyTitle = vacancyForTitle?.title ?? null;

  const include = new Set(input.include ?? []);
  const item: Record<string, unknown> = {
    id: data.id,
    href: buildCandidateCardHref(data.id),
    name: data.name,
    position: data.position,
    status: data.status,
    statusLabel: formatCandidateStatusLabel(data.status),
    vacancyId: data.vacancy_id,
    vacancyTitle: vacancyTitle,
    matchPercentage: data.match_percentage,
    desiredSalaryText: data.desired_salary_text ?? null,
    comment: data.comment,
    source: data.source,
    sourceLabel: formatCandidateSourceLabel(data.source),
    appliedAt: data.applied_at,
  };

  if (include.has("vacancy")) {
    const { data: vacancy } = await admin.from("vacancies").select("id,title,status,location").eq("id", data.vacancy_id).maybeSingle();
    item.vacancy = vacancy ? { ...vacancy, statusLabel: formatVacancyStatusLabel(vacancy.status) } : null;
  }
  if (include.has("contacts")) {
    const { data: contacts } = await admin.from("candidate_contacts").select("type,value,label").eq("candidate_id", data.id).order("created_at");
    item.contacts = contacts ?? [];
  }
  if (include.has("analysis")) {
    const { data: analysis } = await admin
      .from("ai_analyses")
      .select("id,overall_score,summary,verdict,reasons,strengths,weaknesses,recommendations,analyzed_at")
      .eq("candidate_id", data.id)
      .order("analyzed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    item.analysis = analysis ?? null;
  }
  if (include.has("latestJob")) {
    const { data: latestJob } = await admin
      .from("jobs_ai")
      .select("id,status,updated_at")
      .eq("company_id", ctx.companyId)
      .eq("candidate_id", data.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    item.latestJob = latestJob ? { ...latestJob, statusLabel: formatAiJobStatusLabel(latestJob.status) } : null;
  }
  if (include.has("resumeSummary")) {
    item.resumeSummary = "Резюме доступно в карточке кандидата. Полный текст не передается ассистенту по умолчанию.";
  }

  return toolItemSuccess({
    toolRunId: "",
    item,
    appliedFilters: { candidateId: input.candidateId, include: input.include ?? [] },
    appliedFilterLabels: { candidateId: "Выбранный кандидат", include: formatCandidateIncludeLabels(input.include) },
    scope: toHrAssistantScope(ctx, { scopeType: "candidate", scopeId: input.candidateId }),
    scopeLabel: "Карточка кандидата",
  });
}
