import type { AnalyticsFilters, AnalyticsRole } from "./types.ts";
import { loadAllSupabaseRows, loadAllSupabaseRowsForValues } from "../supabase/pagination.ts";

export type AnalyticsCompanyContext = {
  userId: string;
  companyId: string;
  role: AnalyticsRole;
};

export type AnalyticsRoleScope = {
  role: AnalyticsRole;
  userId: string;
  companyId: string;
  filters: AnalyticsFilters;
  vacancyIds: string[] | null;
  ownedCandidateIds: string[] | null;
  candidateIds: string[] | null;
};

type BuildAnalyticsRoleScopeInput = {
  ctx: AnalyticsCompanyContext;
  filters: AnalyticsFilters;
  ownedVacancyIds: string[];
  ownedCandidateIds: string[];
  candidateIdsFromOwnedVacancies: string[];
};

function uniqueIds(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function mapIds(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];
  return uniqueIds(rows.map((row) => (row && typeof row === "object" && "id" in row ? String(row.id) : null)));
}

function mapCandidateVacancyRows(rows: unknown): Array<{ id: string; vacancyId: string }> {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object" || !("id" in row) || !("vacancy_id" in row)) return [];
    const id = String(row.id);
    const vacancyId = String(row.vacancy_id);
    return id.trim() && vacancyId.trim() ? [{ id, vacancyId }] : [];
  });
}

export function normalizeAnalyticsScopeFilters(filters: AnalyticsFilters, role: AnalyticsRole): AnalyticsFilters {
  return role === "admin" ? filters : { ...filters, ownerId: null };
}

export function buildAnalyticsRoleScope(input: BuildAnalyticsRoleScopeInput): AnalyticsRoleScope {
  const filters = normalizeAnalyticsScopeFilters(input.filters, input.ctx.role);

  if (input.ctx.role === "admin") {
    return {
      role: "admin",
      userId: input.ctx.userId,
      companyId: input.ctx.companyId,
      filters,
      vacancyIds: null,
      ownedCandidateIds: null,
      candidateIds: null,
    };
  }

  const ownedVacancyIds = uniqueIds(input.ownedVacancyIds);
  const ownedCandidateIds = uniqueIds(input.ownedCandidateIds);

  return {
    role: input.ctx.role,
    userId: input.ctx.userId,
    companyId: input.ctx.companyId,
    filters,
    vacancyIds: ownedVacancyIds,
    ownedCandidateIds,
    candidateIds: uniqueIds([...input.candidateIdsFromOwnedVacancies, ...ownedCandidateIds]),
  };
}

export function isEmptyNonAdminAnalyticsScope(scope: AnalyticsRoleScope): boolean {
  return scope.role !== "admin" && (scope.vacancyIds?.length ?? 0) === 0 && (scope.ownedCandidateIds?.length ?? 0) === 0;
}

export async function resolveAnalyticsScope(admin: any, ctx: AnalyticsCompanyContext, filters: AnalyticsFilters): Promise<AnalyticsRoleScope> {
  if (ctx.role === "admin") {
    return buildAnalyticsRoleScope({
      ctx,
      filters,
      ownedVacancyIds: [],
      ownedCandidateIds: [],
      candidateIdsFromOwnedVacancies: [],
    });
  }

  const ownedVacancyRows = await loadAllSupabaseRows({
    runPageQuery: (from, to) =>
      admin
        .from("vacancies")
        .select("id")
        .eq("company_id", ctx.companyId)
        .eq("created_by", ctx.userId)
        .order("id", { ascending: true })
        .range(from, to),
  });

  const companyVacancyRows = await loadAllSupabaseRows({
    runPageQuery: (from, to) =>
      admin.from("vacancies").select("id").eq("company_id", ctx.companyId).order("id", { ascending: true }).range(from, to),
  });
  const companyVacancyIds = mapIds(companyVacancyRows);
  const ownedCandidateScopedRows =
    companyVacancyIds.length > 0
      ? await loadAllSupabaseRowsForValues({
          values: companyVacancyIds,
          runChunkPageQuery: (vacancyIdChunk, from, to) =>
            admin
              .from("candidates")
              .select("id,vacancy_id")
              .eq("created_by", ctx.userId)
              .in("vacancy_id", vacancyIdChunk)
              .order("id", { ascending: true })
              .range(from, to),
        })
      : [];

  const ownedVacancyIds = mapIds(ownedVacancyRows);
  const ownedCandidateRows = mapCandidateVacancyRows(ownedCandidateScopedRows);
  const ownedCandidateVacancyIds = uniqueIds(ownedCandidateRows.map((row) => row.vacancyId));
  let companyOwnedCandidateVacancyIds: string[] = [];
  let candidateIdsFromOwnedVacancies: string[] = [];

  if (ownedVacancyIds.length > 0) {
    const candidatesFromVacanciesRows = await loadAllSupabaseRowsForValues({
      values: ownedVacancyIds,
      runChunkPageQuery: (vacancyIdChunk, from, to) =>
        admin.from("candidates").select("id").in("vacancy_id", vacancyIdChunk).order("id", { ascending: true }).range(from, to),
    });
    candidateIdsFromOwnedVacancies = mapIds(candidatesFromVacanciesRows);
  }

  if (ownedCandidateVacancyIds.length > 0) {
    const ownedCandidateVacancyRows = await loadAllSupabaseRowsForValues({
      values: ownedCandidateVacancyIds,
      runChunkPageQuery: (vacancyIdChunk, from, to) =>
        admin
          .from("vacancies")
          .select("id")
          .eq("company_id", ctx.companyId)
          .in("id", vacancyIdChunk)
          .order("id", { ascending: true })
          .range(from, to),
    });
    companyOwnedCandidateVacancyIds = mapIds(ownedCandidateVacancyRows);
  }

  const companyOwnedCandidateVacancyIdSet = new Set(companyOwnedCandidateVacancyIds);

  return buildAnalyticsRoleScope({
    ctx,
    filters,
    ownedVacancyIds,
    ownedCandidateIds: ownedCandidateRows.filter((row) => companyOwnedCandidateVacancyIdSet.has(row.vacancyId)).map((row) => row.id),
    candidateIdsFromOwnedVacancies,
  });
}
