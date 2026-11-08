import "server-only";

import type { CompanyContext } from "@/lib/access/company-guards";
import { requireVacancyAccess } from "@/lib/access/company-guards";
import { buildVacancyCardHref } from "@/lib/dashboard/deep-links";
import { VACANCY_STATUS_LABELS, formatVacancyStatusLabel } from "@/lib/vacancies/status-labels";

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

export const ASSISTANT_VACANCY_LIST_DEFAULT_LIMIT = 20;
export const ASSISTANT_VACANCY_LIST_MAX_LIMIT = 100;

export const VACANCY_STATUS_VALUES = ["draft", "active", "paused", "closed"] as const;

export type VacancyStatus = (typeof VACANCY_STATUS_VALUES)[number];
export type VacancySort = "updated_desc" | "updated_asc" | "created_desc" | "created_asc";

export type ListAccessibleVacanciesInput = {
  limit?: number;
  cursor?: string | null;
  status?: VacancyStatus | null;
  titleQuery?: string | null;
  sort?: VacancySort;
  includeAggregations?: boolean;
};

type VacancyRow = {
  id: string;
  title: string;
  status: string;
  location: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const VACANCY_SORT_LABELS: Record<VacancySort, string> = {
  updated_desc: "Дата обновления: новые сверху",
  updated_asc: "Дата обновления: старые сверху",
  created_desc: "Дата создания: новые сверху",
  created_asc: "Дата создания: старые сверху",
};

function buildVacancyAppliedFilterLabels(input: { status: VacancyStatus | null; titleQuery: string | null }) {
  return {
    status: input.status ? formatVacancyStatusLabel(input.status) : "Все статусы",
    titleQuery: input.titleQuery ?? "Любое название",
  };
}

function escapeIlikePattern(input: string): string {
  return input.replace(/[\\%_]/g, "\\$&");
}

function toToolSort(sort: VacancySort): HrAssistantToolSort {
  if (sort === "updated_asc") return { key: "updated_at", direction: "asc" };
  if (sort === "created_desc") return { key: "created_at", direction: "desc" };
  if (sort === "created_asc") return { key: "created_at", direction: "asc" };
  return { key: "updated_at", direction: "desc" };
}

function applyVacancyFilters(
  query: any,
  input: { ctx: CompanyContext; status?: VacancyStatus | null; titlePattern: string }
) {
  let nextQuery = query.eq("company_id", input.ctx.companyId);
  if (input.ctx.role !== "admin") nextQuery = nextQuery.eq("created_by", input.ctx.userId);
  if (input.status) nextQuery = nextQuery.eq("status", input.status);
  if (input.titlePattern) nextQuery = nextQuery.ilike("title", input.titlePattern);
  return nextQuery;
}

function applyVacancySort(query: any, sort: VacancySort) {
  const sortInfo = toToolSort(sort);
  return query.order(sortInfo.key, { ascending: sortInfo.direction === "asc" }).order("id", { ascending: true });
}

function applyVacancyCursor(query: any, input: { cursor: string | null | undefined; filtersHash: string; sort: VacancySort }) {
  if (!input.cursor) return { ok: true as const, query };

  try {
    const cursor = decodeCursor(input.cursor);
    if (cursor.entity !== "vacancies" || cursor.filtersHash !== input.filtersHash) {
      return { ok: false as const, reason: "changed" };
    }

    const sortInfo = toToolSort(input.sort);
    const lastId = String(cursor.last.id ?? "");
    const cursorField = sortInfo.key === "created_at" ? "createdAt" : "updatedAt";
    const lastValue = cursor.last[cursorField] ? String(cursor.last[cursorField]) : "";
    if (!lastValue) return { ok: false as const, reason: "invalid" };

    if (sortInfo.direction === "asc") {
      return { ok: true as const, query: query.or(`${sortInfo.key}.gt.${lastValue},and(${sortInfo.key}.eq.${lastValue},id.gt.${lastId})`) };
    }
    return { ok: true as const, query: query.or(`${sortInfo.key}.lt.${lastValue},and(${sortInfo.key}.eq.${lastValue},id.gt.${lastId})`) };
  } catch {
    return { ok: false as const, reason: "invalid" };
  }
}

function toVacancyListItem(row: VacancyRow) {
  return {
    id: row.id,
    href: buildVacancyCardHref(row.id),
    title: row.title,
    status: row.status,
    statusLabel: formatVacancyStatusLabel(row.status),
    location: row.location,
    createdById: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function buildVacancyStatusCounts(
  admin: any,
  ctx: CompanyContext,
  input: { status?: VacancyStatus | null; titlePattern: string }
) {
  const statuses = input.status ? [input.status] : VACANCY_STATUS_VALUES;
  const entries = await Promise.all(
    statuses.map(async (status) => {
      let countQuery = admin.from("vacancies").select("id", { count: "exact", head: true });
      countQuery = applyVacancyFilters(countQuery, { ctx, status, titlePattern: input.titlePattern });
      const { error, count } = await countQuery;
      if (error) return { ok: false as const };
      return { ok: true as const, status, count: count ?? 0 };
    })
  );

  const statusCounts: Record<string, number> = {};
  for (const entry of entries) {
    if (!entry.ok) return { ok: false as const };
    if (entry.count > 0) statusCounts[entry.status] = entry.count;
  }

  return { ok: true as const, statusCounts };
}

export async function listAccessibleVacanciesForAssistant(
  admin: any,
  ctx: CompanyContext,
  input: ListAccessibleVacanciesInput = {}
) {
  const limit = clampToolLimit(input.limit, {
    defaultLimit: ASSISTANT_VACANCY_LIST_DEFAULT_LIMIT,
    maxLimit: ASSISTANT_VACANCY_LIST_MAX_LIMIT,
  });
  const sortKey = input.sort ?? "updated_desc";
  const sort = toToolSort(sortKey);
  const titleQuery = input.titleQuery?.trim() || null;
  const titlePattern = titleQuery ? `%${escapeIlikePattern(titleQuery)}%` : "";
  const includeAggregations = input.includeAggregations ?? true;
  const appliedFilters = { status: input.status ?? null, titleQuery };
  const appliedFilterLabels = buildVacancyAppliedFilterLabels(appliedFilters);
  const availableFilters = { status: VACANCY_STATUS_VALUES };
  const availableFilterLabels = { status: VACANCY_STATUS_LABELS };
  const currentFiltersHash = filtersHash(appliedFilters, sort);

  let query = admin
    .from("vacancies")
    .select("id,title,status,location,created_by,created_at,updated_at", { count: "exact" });
  query = applyVacancyFilters(query, { ctx, status: input.status, titlePattern });

  const cursorResult = applyVacancyCursor(query, { cursor: input.cursor, filtersHash: currentFiltersHash, sort: sortKey });
  if (!cursorResult.ok) {
    return toolFailure(
      "invalid_input",
      cursorResult.reason === "changed" ? "Обновите список вакансий: параметры страницы изменились." : "Обновите список вакансий: страница устарела.",
      false
    );
  }

  const { data, error, count } = await applyVacancySort(cursorResult.query, sortKey).limit(limit + 1);
  if (error) return toolFailure("temporary_failure", "Не удалось загрузить вакансии. Попробуйте еще раз.", true);

  const resultRows = (data ?? []) as VacancyRow[];
  const rows = resultRows.slice(0, limit);
  const hasMore = resultRows.length > limit;
  const last = rows.at(-1);
  const nextCursor =
    hasMore && last
      ? createCursor({
          entity: "vacancies",
          filtersHash: currentFiltersHash,
          sort,
          last: { updatedAt: last.updated_at, createdAt: last.created_at, id: last.id },
        })
      : null;

  let statusCounts: Record<string, number> | undefined;
  if (includeAggregations) {
    const countsResult = await buildVacancyStatusCounts(admin, ctx, { status: input.status, titlePattern });
    if (!countsResult.ok) return toolFailure("temporary_failure", "Не удалось посчитать статусы вакансий. Попробуйте еще раз.", true);
    statusCounts = countsResult.statusCounts;
  }

  return toolListSuccess({
    toolRunId: "",
    items: rows.map(toVacancyListItem),
    pageInfo: { limit, nextCursor, hasMore, total: count ?? null, totalExact: typeof count === "number" },
    appliedFilters,
    appliedFilterLabels: appliedFilterLabels,
    availableFilters,
    availableFilterLabels: availableFilterLabels,
    sort,
    sortLabel: VACANCY_SORT_LABELS[sortKey],
    scope: toHrAssistantScope(ctx, { scopeType: "workspace", scopeId: null }),
    scopeLabel: "Все доступные вакансии",
    aggregations: includeAggregations ? { statusCounts: statusCounts ?? {}, statusLabels: VACANCY_STATUS_LABELS } : undefined,
  });
}

export async function getAccessibleVacancyForAssistant(admin: any, ctx: CompanyContext, vacancyId: string) {
  const access = await requireVacancyAccess(admin, ctx, vacancyId);
  if (!access.ok) return toolFailure("not_found", "Вакансия не найдена или недоступна.", false);

  let query = admin
    .from("vacancies")
    .select("id,title,description,requirements,responsibilities,status,location,created_by,updated_at")
    .eq("id", vacancyId)
    .eq("company_id", ctx.companyId);

  if (ctx.role !== "admin") {
    query = query.eq("created_by", ctx.userId);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return toolFailure("not_found", "Вакансия не найдена или недоступна.", false);

  return toolItemSuccess({
    toolRunId: "",
    item: { ...data, href: buildVacancyCardHref(data.id), statusLabel: formatVacancyStatusLabel(data.status) },
    appliedFilters: { vacancyId },
    appliedFilterLabels: { vacancyId: "Выбранная вакансия" },
    scope: toHrAssistantScope(ctx, { scopeType: "vacancy", scopeId: vacancyId }),
    scopeLabel: "Карточка вакансии",
  });
}
