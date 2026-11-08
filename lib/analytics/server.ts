import { calculateAnalyticsDashboard } from "./calculations.ts";
import type {
  AnalyticsCandidate,
  AnalyticsCandidateStatus,
  AnalyticsDashboard,
  AnalyticsExportRows,
  AnalyticsFilters,
  AnalyticsPipelineEvent,
  AnalyticsRole,
  AnalyticsSourceRow,
  AnalyticsVacancy,
  AnalyticsVacancyStatus,
  HiringTarget,
  HiringTargetScopeType,
} from "./types.ts";
import {
  isEmptyNonAdminAnalyticsScope,
  resolveAnalyticsScope,
  type AnalyticsCompanyContext,
  type AnalyticsRoleScope,
} from "./scope.ts";
import { loadAllSupabaseRows, loadAllSupabaseRowsForValues } from "../supabase/pagination.ts";

type SavedViewDto = {
  id: string;
  name: string;
  visibility: "private" | "company";
  filters: Record<string, unknown>;
};

type KpiDto = {
  id: string;
  label: string;
  value: string;
  detail: string;
  formula: string;
  tone?: "default" | "warning" | "good";
};

type CompanyAiUsageDto = {
  used: number;
  quota: number;
  credits: number;
};

type BuildAnalyticsDashboardDtoInput = {
  role: AnalyticsRole;
  generatedAt: string;
  filters: AnalyticsFilters;
  savedViews: SavedViewDto[];
  vacancies: AnalyticsVacancy[];
  candidatesForMetrics: AnalyticsCandidate[];
  visibleCandidates: AnalyticsCandidate[];
  pipelineEvents: AnalyticsPipelineEvent[];
  hiringTargets: HiringTarget[];
  companyAiUsage: CompanyAiUsageDto | null;
};

type LoadAnalyticsDashboardInput = {
  admin: any;
  ctx: AnalyticsCompanyContext;
  filters: AnalyticsFilters;
  generatedAt?: string;
  supabase?: unknown;
  output?: "ui" | "raw";
};

const terminalCandidateStatuses = new Set<AnalyticsCandidateStatus>(["hired", "rejected"]);

function buildLatestCandidateEventMap(events: AnalyticsPipelineEvent[]) {
  const latestByCandidateId = new Map<string, string>();

  for (const event of events) {
    const previous = latestByCandidateId.get(event.candidateId);
    if (!previous || event.occurredAt > previous) {
      latestByCandidateId.set(event.candidateId, event.occurredAt);
    }
  }

  return latestByCandidateId;
}

function isStaleCandidate(candidate: AnalyticsCandidate, latestEventByCandidateId: Map<string, string>, generatedAt: string) {
  if (terminalCandidateStatuses.has(candidate.status)) return false;
  const lastEventAt = latestEventByCandidateId.get(candidate.id);
  const lastMovementAt = lastEventAt ?? candidate.updatedAt ?? candidate.createdAt;
  const start = new Date(lastMovementAt).getTime();
  const end = new Date(generatedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return Math.max(0, Math.round((end - start) / 3_600_000)) >= 48;
}

function applyStaleOnlyAnalyticsScope(input: {
  filters: AnalyticsFilters;
  generatedAt: string;
  vacancies: AnalyticsVacancy[];
  candidates: AnalyticsCandidate[];
  pipelineEvents: AnalyticsPipelineEvent[];
}) {
  if (!input.filters.staleOnly) {
    return {
      vacancies: input.vacancies,
      candidates: input.candidates,
      pipelineEvents: input.pipelineEvents,
    };
  }

  const latestEventByCandidateId = buildLatestCandidateEventMap(input.pipelineEvents);
  const candidates = input.candidates.filter((candidate) => isStaleCandidate(candidate, latestEventByCandidateId, input.generatedAt));
  const candidateIdSet = new Set(candidates.map((candidate) => candidate.id));
  const vacancyIdSet = new Set(candidates.map((candidate) => candidate.vacancyId));

  return {
    vacancies: input.vacancies.filter((vacancy) => vacancyIdSet.has(vacancy.id)),
    candidates,
    pipelineEvents: input.pipelineEvents.filter((event) => candidateIdSet.has(event.candidateId)),
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asVisibility(value: unknown): "private" | "company" {
  return value === "company" ? "company" : "private";
}

function asTargetScopeType(value: unknown): HiringTargetScopeType {
  return value === "department" || value === "vacancy" || value === "recruiter" ? value : "company";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function percent(value: number | null | undefined) {
  return value === null || value === undefined ? 0 : Math.round(value * 100);
}

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? "Нет данных" : `${percent(value)}%`;
}

function formatDays(averageDays: number | null, medianDays: number | null) {
  if (averageDays === null && medianDays === null) return "Нет данных";
  if (medianDays !== null) return `${medianDays} дн.`;
  return `${averageDays} дн.`;
}

function dashboardUiFilters(filters: AnalyticsFilters) {
  return {
    periodStart: filters.periodStart,
    periodEnd: filters.periodEnd,
    periodMode: filters.periodMode === "as_of_snapshot" ? "asOf" : "period",
    vacancy: filters.vacancyId ?? "all",
    vacancyStatus: filters.vacancyStatus,
    owner: filters.ownerId ?? "all",
    department: filters.department ?? "all",
    location: filters.location ?? "all",
    source: filters.source ?? "all",
    status: filters.candidateStatus ?? "all",
    scoreThreshold: filters.aiScoreMin ?? filters.aiShortlistThreshold,
    riskyOnly: filters.riskyOnly,
    staleOnly: filters.staleOnly,
  };
}

function stringifyUiFilters(filters: ReturnType<typeof dashboardUiFilters>) {
  const params = new URLSearchParams();
  params.set("periodStart", filters.periodStart);
  params.set("periodEnd", filters.periodEnd);
  params.set("periodMode", filters.periodMode);
  params.set("vacancy", filters.vacancy);
  params.set("vacancyStatus", filters.vacancyStatus);
  params.set("owner", filters.owner);
  params.set("department", filters.department);
  params.set("location", filters.location);
  params.set("source", filters.source);
  params.set("status", filters.status);
  params.set("scoreThreshold", String(filters.scoreThreshold));
  if (filters.riskyOnly) params.set("riskyOnly", "1");
  if (filters.staleOnly) params.set("staleOnly", "1");
  return params;
}

function drilldownHref(
  targetPath: "/dashboard/candidates" | "/dashboard/vacancies",
  filters: ReturnType<typeof dashboardUiFilters>,
  overrides: Partial<Record<"vacancy" | "source" | "status" | "scoreThreshold" | "scoreMin" | "scoreMax" | "scoreBucket" | "periodMode", string>> = {},
) {
  const params = new URLSearchParams();
  params.set("periodStart", filters.periodStart);
  params.set("periodEnd", filters.periodEnd);
  params.set("periodMode", overrides.periodMode ?? filters.periodMode);
  params.set("vacancy", overrides.vacancy ?? filters.vacancy);
  if (targetPath === "/dashboard/candidates") {
    params.set("source", overrides.source ?? filters.source);
    params.set("status", overrides.status ?? filters.status);
    params.set("scoreThreshold", overrides.scoreThreshold ?? String(filters.scoreThreshold));
    if (overrides.scoreMin) params.set("scoreMin", overrides.scoreMin);
    if (overrides.scoreMax) params.set("scoreMax", overrides.scoreMax);
    if (overrides.scoreBucket) params.set("scoreBucket", overrides.scoreBucket);
    params.set("score", overrides.scoreBucket === "unscored" ? "unscored" : "all");
  }
  params.set("returnTo", `/dashboard/stats?${stringifyUiFilters(filters).toString()}`);
  return `${targetPath}?${params.toString()}`;
}

function mapVacancy(row: any): AnalyticsVacancy {
  return {
    id: String(row.id),
    title: String(row.title ?? "Вакансия"),
    status: (row.status ?? "draft") as AnalyticsVacancyStatus,
    createdAt: String(row.created_at ?? new Date(0).toISOString()),
    updatedAt: asString(row.updated_at),
    closedAt: asString(row.closed_at),
    deadlineAt: null,
    department: asString(row.department),
    location: asString(row.location),
    ownerId: asString(row.created_by),
    ownerName: asString(row.hiring_manager),
  };
}

function mapCandidate(row: any): AnalyticsCandidate {
  return {
    id: String(row.id),
    name: String(row.name ?? "Кандидат"),
    vacancyId: String(row.vacancy_id),
    status: (row.status ?? "new") as AnalyticsCandidateStatus,
    source: String(row.source ?? "other"),
    matchPercentage: asNumber(row.match_percentage),
    appliedAt: String(row.applied_at ?? row.created_at ?? new Date(0).toISOString()),
    createdAt: String(row.created_at ?? row.applied_at ?? new Date(0).toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? row.applied_at ?? new Date(0).toISOString()),
    ownerId: asString(row.created_by),
    ownerName: null,
  };
}

function mapPipelineEvent(row: any): AnalyticsPipelineEvent {
  const metadata = asRecord(row.metadata);

  return {
    id: String(row.id),
    candidateId: String(row.candidate_id),
    vacancyId: String(row.vacancy_id),
    actorId: asString(row.actor_id),
    fromStatus: (asString(row.from_status) as AnalyticsCandidateStatus | null) ?? null,
    toStatus: (row.to_status ?? "new") as AnalyticsCandidateStatus,
    eventType: String(row.event_type ?? "status_changed"),
    occurredAt: String(row.occurred_at ?? row.created_at ?? new Date(0).toISOString()),
    rejectionReasonId: asString(row.rejection_reason_id),
    rejectionReason: asString(row.rejection_reason),
    rejectionComment: asString(metadata?.rejection_comment),
  };
}

function mapHiringTarget(row: any): HiringTarget {
  return {
    id: String(row.id),
    scopeType: asTargetScopeType(row.scope_type),
    scopeId: asString(row.scope_id),
    metricName: asString(row.metric_name) ?? "hires",
    targetHires: asNumber(row.target_hires),
    targetTimeToFillDays: asNumber(row.target_time_to_fill_days),
    targetTimeToHireDays: asNumber(row.target_time_to_hire_days),
    slaFeedbackHours: asNumber(row.sla_feedback_hours),
    minimumPipelineSize: asNumber(row.minimum_pipeline_size),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
  };
}

function applyVacancyFilters(vacancies: AnalyticsVacancy[], filters: AnalyticsFilters) {
  return vacancies.filter((vacancy) => {
    if (filters.vacancyId && vacancy.id !== filters.vacancyId) return false;
    if (filters.vacancyStatus !== "all" && vacancy.status !== filters.vacancyStatus) return false;
    if (filters.ownerId && vacancy.ownerId !== filters.ownerId) return false;
    if (filters.department && vacancy.department !== filters.department) return false;
    if (filters.location && vacancy.location !== filters.location) return false;
    return true;
  });
}

function applyCandidateFilters(candidates: AnalyticsCandidate[], filters: AnalyticsFilters, options: { includeAiScore: boolean }) {
  return candidates.filter((candidate) => {
    if (filters.source && candidate.source !== filters.source) return false;
    if (filters.candidateStatus && candidate.status !== filters.candidateStatus) return false;
    if (options.includeAiScore && filters.aiScoreMin !== null && (candidate.matchPercentage ?? -1) < filters.aiScoreMin) return false;
    return true;
  });
}

function ids(values: Array<{ id: string }>) {
  return [...new Set(values.map((value) => value.id))];
}

function candidateIds(values: AnalyticsCandidate[]) {
  return [...new Set(values.map((value) => value.id))];
}

function vacancyIdsFromCandidates(values: AnalyticsCandidate[]) {
  return [...new Set(values.map((value) => value.vacancyId))];
}

const unsafeAiExportFieldPattern = /raw.*prompt|prompt_text|provider_payload|provider_response|resume_text|cv_text/i;

function sanitizeAiExportValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAiExportValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !unsafeAiExportFieldPattern.test(key))
      .map(([key, item]) => [key, sanitizeAiExportValue(item)]),
  );
}

function safeJsonString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const sanitized = sanitizeAiExportValue(value);
  if (sanitized === null || sanitized === undefined) return null;
  return JSON.stringify(sanitized);
}

function compactRecord(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null && item !== undefined));
}

function filterAiExportRowsByCandidateIds(
  rows: Pick<AnalyticsExportRows, "aiScores" | "aiAudit">,
  candidateIds: Set<string>,
): Pick<AnalyticsExportRows, "aiScores" | "aiAudit"> {
  return {
    aiScores: rows.aiScores.filter((row) => candidateIds.has(row.candidateId)),
    aiAudit: rows.aiAudit.filter((row) => candidateIds.has(row.candidateId)),
  };
}

async function readAll<T>(runPageQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  return loadAllSupabaseRows({
    runPageQuery: (from, to) => runPageQuery(from, to),
  });
}

async function readAllByValues<T, Value>(
  values: readonly Value[],
  runChunkPageQuery: (values: readonly Value[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  return loadAllSupabaseRowsForValues({
    values,
    runChunkPageQuery: (valueChunk, from, to) => runChunkPageQuery(valueChunk, from, to),
  });
}

async function loadSavedViews(admin: any, ctx: AnalyticsCompanyContext): Promise<SavedViewDto[]> {
  let rows: any[];
  try {
    rows = await readAll<any>((from, to) =>
      admin
        .from("analytics_filter_views")
        .select("id,name,visibility,owner_id,filters")
        .eq("company_id", ctx.companyId)
        .or(`visibility.eq.company,and(visibility.eq.private,owner_id.eq.${ctx.userId})`)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to),
    );
  } catch {
    return [];
  }

  return rows.map((row: any) => ({
    id: String(row.id),
    name: String(row.name ?? "Сохранённый вид"),
    visibility: asVisibility(row.visibility),
    filters: row.filters && typeof row.filters === "object" && !Array.isArray(row.filters) ? row.filters : {},
  }));
}

async function loadCompanyAiUsage(admin: any, ctx: AnalyticsCompanyContext): Promise<CompanyAiUsageDto | null> {
  if (ctx.role !== "admin") return null;

  const [creditsRes, agreementRes] = await Promise.all([
    admin.from("company_credits").select("balance,reserved").eq("company_id", ctx.companyId).maybeSingle(),
    admin
      .from("enterprise_agreements")
      .select("credits_limit")
      .eq("company_id", ctx.companyId)
      .eq("status", "active")
      .order("activated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (creditsRes.error || agreementRes.error) return null;
  const quota = asNumber(agreementRes.data?.credits_limit);
  if (quota === null) return null;

  const balance = asNumber(creditsRes.data?.balance) ?? 0;
  const reserved = asNumber(creditsRes.data?.reserved) ?? 0;
  const credits = Math.max(0, balance - reserved);

  return {
    used: Math.max(0, quota - credits),
    quota,
    credits,
  };
}

async function loadAnalyticsRows(input: LoadAnalyticsDashboardInput) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const scope = await resolveAnalyticsScope(input.admin, input.ctx, input.filters);
  const savedViews = await loadSavedViews(input.admin, input.ctx);

  if (isEmptyNonAdminAnalyticsScope(scope)) {
    return {
      generatedAt,
      scope,
      savedViews,
      vacancies: [] as AnalyticsVacancy[],
      candidatesForMetrics: [] as AnalyticsCandidate[],
      visibleCandidates: [] as AnalyticsCandidate[],
      pipelineEvents: [] as AnalyticsPipelineEvent[],
      hiringTargets: [] as HiringTarget[],
      aiExportRows: { aiScores: [], aiAudit: [] } as Pick<AnalyticsExportRows, "aiScores" | "aiAudit">,
      companyAiUsage: null as CompanyAiUsageDto | null,
    };
  }

  const rawCandidates = await loadCandidates(input.admin, input.ctx, scope);
  const vacancies = await loadVacancies(input.admin, input.ctx, scope, rawCandidates);
  const visibleVacancyIdSet = new Set(ids(vacancies));
  const vacancyFilteredCandidates = rawCandidates.filter((candidate) => visibleVacancyIdSet.has(candidate.vacancyId));
  const candidatesForMetrics = applyCandidateFilters(vacancyFilteredCandidates, scope.filters, { includeAiScore: false });
  const visibleCandidates = applyCandidateFilters(candidatesForMetrics, scope.filters, { includeAiScore: true });
  const [pipelineEvents, hiringTargets, aiExportRows, companyAiUsage] = await Promise.all([
    loadPipelineEvents(input.admin, input.ctx, candidatesForMetrics),
    loadHiringTargets(input.admin, input.ctx, scope.filters),
    input.output === "raw"
      ? loadAiAnalysisExportRows(input.admin, input.ctx, visibleCandidates)
      : ({ aiScores: [], aiAudit: [] } as Pick<AnalyticsExportRows, "aiScores" | "aiAudit">),
    loadCompanyAiUsage(input.admin, input.ctx),
  ]);

  return {
    generatedAt,
    scope,
    savedViews,
    vacancies,
    candidatesForMetrics,
    visibleCandidates,
    pipelineEvents,
    hiringTargets,
    aiExportRows,
    companyAiUsage,
  };
}

function buildRawAnalyticsDashboard(input: Awaited<ReturnType<typeof loadAnalyticsRows>>): AnalyticsDashboard {
  const rawScope = applyStaleOnlyAnalyticsScope({
    filters: input.scope.filters,
    generatedAt: input.generatedAt,
    vacancies: input.vacancies,
    candidates: input.visibleCandidates,
    pipelineEvents: input.pipelineEvents,
  });
  const rawCandidateIds = new Set(rawScope.candidates.map((candidate) => candidate.id));

  return calculateAnalyticsDashboard({
    role: input.scope.role,
    generatedAt: input.generatedAt,
    filters: input.scope.filters,
    vacancies: rawScope.vacancies,
    candidates: rawScope.candidates,
    pipelineEvents: rawScope.pipelineEvents,
    hiringTargets: input.hiringTargets,
    exportRows: filterAiExportRowsByCandidateIds(input.aiExportRows, rawCandidateIds),
  });
}

async function loadVacancies(admin: any, ctx: AnalyticsCompanyContext, scope: AnalyticsRoleScope, candidates: AnalyticsCandidate[]) {
  if (scope.role === "admin") {
    const rows = await readAll<any>((from, to) =>
      admin
        .from("vacancies")
        .select("id,title,status,department,location,hiring_manager,company_id,created_by,created_at,updated_at,closed_at")
        .eq("company_id", ctx.companyId)
        .order("id", { ascending: true })
        .range(from, to),
    );
    return applyVacancyFilters(rows.map(mapVacancy), scope.filters);
  }

  const allowedVacancyIds = [...new Set([...(scope.vacancyIds ?? []), ...vacancyIdsFromCandidates(candidates)])];
  if (allowedVacancyIds.length === 0) return [];

  const rows = await readAllByValues<any, string>(allowedVacancyIds, (vacancyIdChunk, from, to) =>
    admin
      .from("vacancies")
      .select("id,title,status,department,location,hiring_manager,company_id,created_by,created_at,updated_at,closed_at")
      .eq("company_id", ctx.companyId)
      .in("id", vacancyIdChunk)
      .order("id", { ascending: true })
      .range(from, to),
  );
  return applyVacancyFilters(rows.map(mapVacancy), scope.filters);
}

async function loadCandidates(admin: any, ctx: AnalyticsCompanyContext, scope: AnalyticsRoleScope) {
  if (isEmptyNonAdminAnalyticsScope(scope)) return [];

  if (scope.role !== "admin") {
    if ((scope.candidateIds?.length ?? 0) === 0) return [];
    const rows = await readAllByValues<any, string>(scope.candidateIds ?? [], (candidateIdChunk, from, to) =>
      admin
        .from("candidates")
        .select("id,name,status,vacancy_id,match_percentage,source,created_by,applied_at,created_at,updated_at")
        .in("id", candidateIdChunk)
        .order("id", { ascending: true })
        .range(from, to),
    );
    return rows.map(mapCandidate);
  }

  const vacancyRows = await readAll<any>((from, to) =>
    admin.from("vacancies").select("id").eq("company_id", ctx.companyId).order("id", { ascending: true }).range(from, to),
  );
  const companyVacancyIds = vacancyRows.map((row) => String(row.id));
  if (companyVacancyIds.length === 0) return [];

  const rows = await readAllByValues<any, string>(companyVacancyIds, (vacancyIdChunk, from, to) =>
    admin
      .from("candidates")
      .select("id,name,status,vacancy_id,match_percentage,source,created_by,applied_at,created_at,updated_at")
      .in("vacancy_id", vacancyIdChunk)
      .order("id", { ascending: true })
      .range(from, to),
  );
  return rows.map(mapCandidate);
}

async function loadPipelineEvents(admin: any, ctx: AnalyticsCompanyContext, candidates: AnalyticsCandidate[]) {
  const scopedCandidateIds = candidateIds(candidates);
  if (scopedCandidateIds.length === 0) return [];

  const rows = await readAllByValues<any, string>(scopedCandidateIds, (candidateIdChunk, from, to) =>
    admin
      .from("pipeline_events")
      .select("id,candidate_id,vacancy_id,actor_id,from_status,to_status,event_type,occurred_at,rejection_reason_id,rejection_reason,metadata,created_at")
      .eq("company_id", ctx.companyId)
      .in("candidate_id", candidateIdChunk)
      .order("id", { ascending: true })
      .range(from, to),
  );
  return rows.map(mapPipelineEvent);
}

async function loadHiringTargets(admin: any, ctx: AnalyticsCompanyContext, filters: AnalyticsFilters) {
  const rows = await readAll<any>((from, to) =>
    admin
      .from("hiring_targets")
      .select(
        "id,scope_type,scope_id,metric_name,target_hires,target_time_to_fill_days,target_time_to_hire_days,sla_feedback_hours,minimum_pipeline_size,period_start,period_end",
      )
      .eq("company_id", ctx.companyId)
      .lte("period_start", filters.periodEnd)
      .gte("period_end", filters.periodStart)
      .order("id", { ascending: true })
      .range(from, to),
  );
  return rows.map(mapHiringTarget);
}

async function loadAiAnalysisExportRows(
  admin: any,
  ctx: AnalyticsCompanyContext,
  candidates: AnalyticsCandidate[],
): Promise<Pick<AnalyticsExportRows, "aiScores" | "aiAudit">> {
  const scopedCandidateIds = candidateIds(candidates);
  if (scopedCandidateIds.length === 0) return { aiScores: [], aiAudit: [] };

  const rows = await readAllByValues<any, string>(scopedCandidateIds, (candidateIdChunk, from, to) =>
    admin
      .from("ai_analyses")
      .select(
        "id,candidate_id,overall_score,category_scores,reasons,ai_provider,provider_model,model_version,prompt_version,score_version,score_explanation,audit_event_id,analyzed_at,created_at",
      )
      .in("candidate_id", candidateIdChunk)
      .order("id", { ascending: true })
      .range(from, to),
  );
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  const aiScores = rows.flatMap((row) => {
    const candidate = candidateById.get(String(row.candidate_id));
    if (!candidate) return [];
    const scoreBreakdown = compactRecord({
      categoryScores: row.category_scores ?? null,
      reasons: row.reasons ?? null,
    });

    return [
      {
        aiAnalysisId: String(row.id),
        candidateId: candidate.id,
        vacancyId: candidate.vacancyId,
        scoreTotal: asNumber(row.overall_score) ?? candidate.matchPercentage,
        scoreBreakdown: Object.keys(scoreBreakdown).length > 0 ? safeJsonString(scoreBreakdown) : null,
        modelVersion: asString(row.model_version) ?? asString(row.provider_model) ?? asString(row.ai_provider),
        promptVersion: asString(row.prompt_version),
        createdAt: String(row.analyzed_at ?? row.created_at ?? candidate.updatedAt),
        finalCandidateStatus: candidate.status,
      },
    ];
  });

  const aiAudit =
    ctx.role === "admin"
      ? rows.flatMap((row) => {
          const candidate = candidateById.get(String(row.candidate_id));
          if (!candidate) return [];

          return [
            {
              auditEventId: asString(row.audit_event_id) ?? String(row.id),
              candidateId: candidate.id,
              vacancyId: candidate.vacancyId,
              modelVersion: asString(row.model_version) ?? asString(row.provider_model) ?? asString(row.ai_provider),
              promptVersion: asString(row.prompt_version),
              scoreVersion: asString(row.score_version),
              scoreExplanation: safeJsonString(row.score_explanation),
              analysisTimestamp: String(row.analyzed_at ?? row.created_at ?? candidate.updatedAt),
            },
          ];
        })
      : [];

  return { aiScores, aiAudit };
}

function sourceHref(row: AnalyticsSourceRow, filters: ReturnType<typeof dashboardUiFilters>) {
  return drilldownHref("/dashboard/candidates", filters, { source: row.source, scoreMin: String(filters.scoreThreshold) });
}

export function buildAnalyticsDashboardDto(input: BuildAnalyticsDashboardDtoInput) {
  const visibleScope = applyStaleOnlyAnalyticsScope({
    filters: input.filters,
    generatedAt: input.generatedAt,
    vacancies: input.vacancies,
    candidates: input.visibleCandidates,
    pipelineEvents: input.pipelineEvents,
  });

  const metricDashboard = calculateAnalyticsDashboard({
    role: input.role,
    generatedAt: input.generatedAt,
    filters: input.filters,
    vacancies: input.vacancies,
    candidates: input.candidatesForMetrics,
    pipelineEvents: input.pipelineEvents,
    hiringTargets: input.hiringTargets,
  });
  const visibleDashboard = calculateAnalyticsDashboard({
    role: input.role,
    generatedAt: input.generatedAt,
    filters: input.filters,
    vacancies: visibleScope.vacancies,
    candidates: visibleScope.candidates,
    pipelineEvents: visibleScope.pipelineEvents,
    hiringTargets: input.hiringTargets,
  });
  const uiFilters = dashboardUiFilters(input.filters);

  const kpis: KpiDto[] = [
    {
      id: "plan",
      label: "План найма",
      value:
        metricDashboard.kpis.planFactHires.target === null
          ? `${metricDashboard.kpis.planFactHires.actual}`
          : `${metricDashboard.kpis.planFactHires.actual}/${metricDashboard.kpis.planFactHires.target}`,
      detail:
        metricDashboard.kpis.planFactHires.target === null
          ? "Цель на период пока не настроена"
          : `Выполнение ${formatPercent(metricDashboard.kpis.planFactHires.completion)}`,
      formula: "Наймы за выбранный период сравниваются с настроенной целью.",
      tone: metricDashboard.kpis.planFactHires.completion !== null && metricDashboard.kpis.planFactHires.completion >= 1 ? "good" : "default",
    },
    {
      id: "active",
      label: "Открытые вакансии",
      value: String(metricDashboard.kpis.activeVacancies.value),
      detail: "Текущий снимок доступных вакансий",
      formula: "Активные вакансии на момент формирования отчёта.",
    },
    {
      id: "closed",
      label: "Закрытые вакансии",
      value: String(metricDashboard.kpis.closedVacancies.value),
      detail: "Закрытия с надёжной датой в периоде",
      formula: "Вакансии со статусом закрыто и датой закрытия внутри периода.",
    },
    {
      id: "risky",
      label: "Вакансии под риском",
      value: String(metricDashboard.kpis.riskyVacancies.value),
      detail: "Настроенные цели и процессные сигналы считаются отдельно",
      formula: "SLA считается только по настроенным правилам; без SLA показываются мягкие процессные подсказки.",
      tone: metricDashboard.kpis.riskyVacancies.value > 0 ? "warning" : "default",
    },
    {
      id: "time-to-fill",
      label: "Time-to-fill",
      value: formatDays(metricDashboard.kpis.timeToFill.averageDays, metricDashboard.kpis.timeToFill.medianDays),
      detail: `${metricDashboard.kpis.timeToFill.count} закрытых вакансий с датами`,
      formula: "Дни от открытия вакансии до закрытия, если обе даты известны.",
    },
    {
      id: "time-to-hire",
      label: "Time-to-hire",
      value: formatDays(metricDashboard.kpis.timeToHire.averageDays, metricDashboard.kpis.timeToHire.medianDays),
      detail: `${metricDashboard.kpis.timeToHire.count} наймов с историей`,
      formula: "Дни от отклика кандидата до события найма в выбранном периоде.",
    },
    {
      id: "funnel",
      label: "Конверсия воронки",
      value: formatPercent(metricDashboard.kpis.funnelConversion.value),
      detail: "Доля кандидатов, дошедших до найма",
      formula: "Наймы за период / кандидаты в доступном срезе.",
    },
    {
      id: "offer",
      label: "Offer acceptance",
      value: formatPercent(metricDashboard.kpis.offerAcceptance.value),
      detail: "Принятые офферы в выбранном периоде",
      formula: "Наймы после оффера / кандидаты с оффером за период.",
    },
    {
      id: "ai",
      label: "AI-покрытие",
      value: formatPercent(metricDashboard.kpis.aiCoverage.value),
      detail: `${metricDashboard.kpis.aiCoverage.analyzed} из ${metricDashboard.kpis.aiCoverage.total} кандидатов с оценкой`,
      formula: "Кандидаты с AI-оценкой / все кандидаты в доступном срезе.",
    },
  ];

  return {
    role: input.role,
    filters: uiFilters,
    savedViews: input.savedViews,
    kpis,
    needsAttention: visibleDashboard.needsAttention.map((item, index) => ({
      id: `${item.type}-${item.vacancyId ?? item.candidateId ?? item.ownerId ?? index}`,
      title: item.title,
      detail: item.reason,
      severity: item.severity,
      href: item.vacancyId
        ? drilldownHref("/dashboard/vacancies", uiFilters, { vacancy: item.vacancyId })
        : drilldownHref("/dashboard/candidates", uiFilters, { scoreMin: String(uiFilters.scoreThreshold) }),
    })),
    funnel: metricDashboard.funnel.map((row) => ({
      stage: row.label,
      count: row.count,
      conversion: percent(row.conversionFromPrevious),
      href: drilldownHref("/dashboard/candidates", uiFilters, { status: row.stage, periodMode: "period" }),
    })),
    vacancies: visibleDashboard.vacancies
      .filter((row) => !input.filters.riskyOnly || row.riskStatus !== "low")
      .map((row) => ({
        id: row.vacancyId,
        title: row.vacancyName,
        owner: row.ownerRecruiter ?? row.ownerHr ?? "Не указан",
        status: row.status,
        daysOpen: row.daysOpen,
        candidatesTotal: row.candidatesTotal,
        ai70: row.candidatesAi70Plus,
        ai80: row.candidatesAi80Plus,
        interviews: row.interviews,
        offers: row.offers,
        hires: row.hires,
        conversion: percent(row.funnelConversion),
        risk: row.riskStatus,
        riskReason: row.riskReason,
        nextAction: row.nextAction ?? "Проверьте вакансию",
        href: drilldownHref("/dashboard/vacancies", uiFilters, { vacancy: row.vacancyId }),
      })),
    sources: visibleDashboard.sources.map((row) => ({
      source: row.source,
      candidates: row.candidateCount,
      interviewConversion: percent(row.interviewConversion),
      offerConversion: percent(row.offerConversion),
      hireConversion: percent(row.hireConversion),
      avgScore: row.averageAiScore ?? 0,
      highScoreShare: percent(row.highScoreShare),
      href: sourceHref(row, uiFilters),
    })),
    team:
      input.role === "admin"
        ? visibleDashboard.team.map((row) => ({
            owner: row.ownerName,
            activeVacancies: row.activeVacancies,
            candidatesInWork: row.candidatesInProcess,
            staleCandidates: row.staleCandidates,
            aiShortlistWithoutMovement: row.aiShortlistWithoutMovement,
            hires: row.hires,
          }))
        : [],
    aiBuckets: metricDashboard.ai.scoreBuckets.map((bucket) => ({
      label: bucket.bucket,
      count: bucket.count,
      href: drilldownHref(
        "/dashboard/candidates",
        uiFilters,
        bucket.bucket === "80-100"
          ? { scoreMin: "80", scoreMax: "100" }
          : bucket.bucket === "70-79"
            ? { scoreMin: "70", scoreMax: "79" }
            : bucket.bucket === "50-69"
              ? { scoreMin: "50", scoreMax: "69" }
              : bucket.bucket === "0-49"
                ? { scoreMin: "0", scoreMax: "49" }
                : { scoreBucket: "unscored" },
      ),
    })),
    aiShortlistConversion: {
      interview: percent(metricDashboard.ai.shortlistToInterview),
      offer: percent(metricDashboard.ai.shortlistToOffer),
      hire: percent(metricDashboard.ai.shortlistToHire),
    },
    companyAiUsage: input.role === "admin" ? input.companyAiUsage : null,
    configuredSlaBreaches: metricDashboard.exportRows.slaBreaches.length,
    dataQualityNotes: metricDashboard.dataQuality.map((state) => state.message),
  };
}

export type AnalyticsDashboardDto = ReturnType<typeof buildAnalyticsDashboardDto>;

export async function loadAnalyticsDashboard(input: LoadAnalyticsDashboardInput & { output: "raw" }): Promise<AnalyticsDashboard>;
export async function loadAnalyticsDashboard(input: LoadAnalyticsDashboardInput & { output?: "ui" }): Promise<AnalyticsDashboardDto>;
export async function loadAnalyticsDashboard(input: LoadAnalyticsDashboardInput): Promise<AnalyticsDashboard | AnalyticsDashboardDto> {
  const rows = await loadAnalyticsRows(input);
  if (input.output === "raw") return buildRawAnalyticsDashboard(rows);
  return buildAnalyticsDashboardDto({
    role: input.ctx.role,
    generatedAt: rows.generatedAt,
    filters: rows.scope.filters,
    savedViews: rows.savedViews,
    vacancies: rows.vacancies,
    candidatesForMetrics: rows.candidatesForMetrics,
    visibleCandidates: rows.visibleCandidates,
    pipelineEvents: rows.pipelineEvents,
    hiringTargets: rows.hiringTargets,
    companyAiUsage: rows.companyAiUsage,
  });
}

export { normalizeAnalyticsScopeFilters } from "./scope.ts";
