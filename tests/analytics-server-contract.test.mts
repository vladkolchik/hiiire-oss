import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeAnalyticsFilters } from "../lib/analytics/filters.ts";
import {
  buildAnalyticsRoleScope,
  isEmptyNonAdminAnalyticsScope,
  normalizeAnalyticsScopeFilters,
} from "../lib/analytics/scope.ts";
import { buildAnalyticsDashboardDto, loadAnalyticsDashboard } from "../lib/analytics/server.ts";

const now = new Date("2026-05-19T12:00:00.000Z");

function filtersFrom(query = "", role: "admin" | "hr" | "recruiter" = "admin") {
  return normalizeAnalyticsFilters(new URLSearchParams(query), { role, now });
}

class QueryStub {
  private filters = new Map<string, unknown>();
  private inFilters = new Map<string, unknown[]>();
  private rangeStart: number | null = null;
  private rangeEnd: number | null = null;
  private readonly admin: AdminStub;
  private readonly table: string;

  constructor(admin: AdminStub, table: string) {
    this.admin = admin;
    this.table = table;
  }

  select(columns: string) {
    this.admin.selects.push({ table: this.table, columns });
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.set(column, value);
    return this;
  }

  lte() {
    return this;
  }

  gte() {
    return this;
  }

  or() {
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  range(from: number, to: number) {
    this.rangeStart = from;
    this.rangeEnd = to;
    return this;
  }

  in(column: string, values: unknown[]) {
    this.inFilters.set(column, values);
    return this;
  }

  maybeSingle() {
    const data = this.resolveRows()[0] ?? null;
    return Promise.resolve({ data, error: null });
  }

  then<TResult1 = { data: any[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: any[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({ data: this.resolveRows(), error: null }).then(onfulfilled, onrejected);
  }

  private resolveRows() {
    const rows = [...(this.admin.rows[this.table] ?? [])];
    const filtered = rows.filter((row) => {
      for (const [column, value] of this.filters) {
        if (column in row && row[column] !== value) return false;
      }
      for (const [column, values] of this.inFilters) {
        if (column in row && !values.includes(row[column])) return false;
      }
      return true;
    });
    if (this.rangeStart === null || this.rangeEnd === null) return filtered;
    return filtered.slice(this.rangeStart, this.rangeEnd + 1);
  }
}

class AdminStub {
  readonly selects: Array<{ table: string; columns: string }> = [];
  readonly rows: Record<string, any[]>;

  constructor(rows: Record<string, any[]>) {
    this.rows = rows;
  }

  from(table: string) {
    return new QueryStub(this, table);
  }
}

test("HR/recruiter analytics scope is a union of own vacancies and own candidates", () => {
  const scope = buildAnalyticsRoleScope({
    ctx: { userId: "user-1", companyId: "company-1", role: "hr" },
    filters: filtersFrom("ownerId=other-user", "hr"),
    ownedVacancyIds: ["vacancy-owned"],
    ownedCandidateIds: ["candidate-owned-in-foreign-vacancy"],
    candidateIdsFromOwnedVacancies: ["candidate-in-owned-vacancy", "candidate-owned-in-foreign-vacancy"],
  });

  assert.deepEqual(scope.vacancyIds, ["vacancy-owned"]);
  assert.deepEqual(scope.ownedCandidateIds, ["candidate-owned-in-foreign-vacancy"]);
  assert.deepEqual(scope.candidateIds, ["candidate-in-owned-vacancy", "candidate-owned-in-foreign-vacancy"]);
  assert.equal(scope.filters.ownerId, null, "non-admin owner filter must not survive normalization");
  assert.equal(isEmptyNonAdminAnalyticsScope(scope), false);
});

test("empty HR/recruiter scope stays empty and cannot broaden candidate queries", () => {
  const scope = buildAnalyticsRoleScope({
    ctx: { userId: "user-1", companyId: "company-1", role: "recruiter" },
    filters: filtersFrom("", "recruiter"),
    ownedVacancyIds: [],
    ownedCandidateIds: [],
    candidateIdsFromOwnedVacancies: [],
  });

  assert.deepEqual(scope.vacancyIds, []);
  assert.deepEqual(scope.candidateIds, []);
  assert.equal(isEmptyNonAdminAnalyticsScope(scope), true);
});

test("admin owner filter is preserved and non-admin owner filter is normalized away", () => {
  assert.equal(normalizeAnalyticsScopeFilters(filtersFrom("ownerId=user-2", "admin"), "admin").ownerId, "user-2");
  assert.equal(normalizeAnalyticsScopeFilters(filtersFrom("ownerId=user-2", "hr"), "hr").ownerId, null);
  assert.equal(normalizeAnalyticsScopeFilters(filtersFrom("ownerId=user-2", "recruiter"), "recruiter").ownerId, null);
});

test("dashboard DTO matches the client contract and keeps AI-shortlist fixed at 80+", () => {
  const filters = filtersFrom("periodStart=2026-05-01&periodEnd=2026-05-31&aiScoreMin=95", "admin");
  const dto = buildAnalyticsDashboardDto({
    role: "admin",
    generatedAt: "2026-05-19T12:00:00.000Z",
    filters,
    savedViews: [
      { id: "view-private", name: "Мой срез", visibility: "private" },
      { id: "view-company", name: "Команда", visibility: "company" },
    ],
    companyAiUsage: { used: 7, quota: 25, credits: 18 },
    vacancies: [
      {
        id: "vacancy-1",
        title: "Backend Developer",
        status: "active",
        createdAt: "2026-05-01T00:00:00.000Z",
        department: "Engineering",
        location: "Москва",
        ownerId: "user-2",
        ownerName: "Анна",
      },
    ],
    candidatesForMetrics: [
      {
        id: "candidate-90",
        name: "Иван",
        vacancyId: "vacancy-1",
        status: "hired",
        source: "manual",
        matchPercentage: 90,
        appliedAt: "2026-05-02T00:00:00.000Z",
        createdAt: "2026-05-02T00:00:00.000Z",
        updatedAt: "2026-05-12T00:00:00.000Z",
        ownerId: "user-2",
        ownerName: "Анна",
      },
      {
        id: "candidate-75",
        name: "Мария",
        vacancyId: "vacancy-1",
        status: "reviewing",
        source: "hh.ru",
        matchPercentage: 75,
        appliedAt: "2026-05-03T00:00:00.000Z",
        createdAt: "2026-05-03T00:00:00.000Z",
        updatedAt: "2026-05-03T00:00:00.000Z",
        ownerId: "user-2",
        ownerName: "Анна",
      },
    ],
    visibleCandidates: [
      {
        id: "candidate-visible-99",
        name: "Ольга",
        vacancyId: "vacancy-1",
        status: "reviewing",
        source: "manual",
        matchPercentage: 99,
        appliedAt: "2026-05-04T00:00:00.000Z",
        createdAt: "2026-05-04T00:00:00.000Z",
        updatedAt: "2026-05-04T00:00:00.000Z",
      },
    ],
    pipelineEvents: [
      {
        id: "event-hired",
        candidateId: "candidate-90",
        vacancyId: "vacancy-1",
        toStatus: "hired",
        fromStatus: "offer",
        eventType: "status_changed",
        occurredAt: "2026-05-12T00:00:00.000Z",
      },
    ],
    hiringTargets: [],
  });

  assert.equal(dto.role, "admin");
  assert.deepEqual(
    Object.keys(dto).sort(),
    [
      "aiBuckets",
      "aiShortlistConversion",
      "companyAiUsage",
      "configuredSlaBreaches",
      "dataQualityNotes",
      "filters",
      "funnel",
      "kpis",
      "needsAttention",
      "role",
      "savedViews",
      "sources",
      "team",
      "vacancies",
    ].sort(),
  );
  assert.equal(dto.filters.scoreThreshold, 95);
  assert.equal(dto.aiShortlistConversion.hire, 100);
  assert.equal(dto.aiBuckets.find((bucket) => bucket.label === "80-100")?.count, 1);
  assert.equal(dto.vacancies[0]?.candidatesTotal, 1, "visible rows may follow the custom score filter");
  assert.equal(dto.vacancies[0]?.ai80, 1);
  assert.equal(dto.savedViews.length, 2);
  assert.deepEqual(dto.companyAiUsage, { used: 7, quota: 25, credits: 18 });
  assert.equal(dto.configuredSlaBreaches, 0);
});

test("staleOnly narrows visible attention and vacancy rows without redefining base KPIs", () => {
  const filters = filtersFrom("periodStart=2026-05-01&periodEnd=2026-05-31&staleOnly=1", "admin");
  const dto = buildAnalyticsDashboardDto({
    role: "admin",
    generatedAt: "2026-05-19T12:00:00.000Z",
    filters,
    savedViews: [],
    companyAiUsage: null,
    vacancies: [
      {
        id: "vac-stale",
        title: "Stale",
        status: "active",
        createdAt: "2026-05-01T00:00:00.000Z",
        ownerId: "u1",
        ownerName: "A",
      },
      {
        id: "vac-fresh",
        title: "Fresh",
        status: "active",
        createdAt: "2026-05-01T00:00:00.000Z",
        ownerId: "u1",
        ownerName: "A",
      },
    ],
    candidatesForMetrics: [
      {
        id: "cand-stale",
        name: "Stale",
        vacancyId: "vac-stale",
        status: "reviewing",
        source: "manual",
        matchPercentage: 95,
        appliedAt: "2026-05-01T00:00:00.000Z",
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "cand-fresh",
        name: "Fresh",
        vacancyId: "vac-fresh",
        status: "reviewing",
        source: "manual",
        matchPercentage: 95,
        appliedAt: "2026-05-18T00:00:00.000Z",
        createdAt: "2026-05-18T00:00:00.000Z",
        updatedAt: "2026-05-18T00:00:00.000Z",
      },
    ],
    visibleCandidates: [
      {
        id: "cand-stale",
        name: "Stale",
        vacancyId: "vac-stale",
        status: "reviewing",
        source: "manual",
        matchPercentage: 95,
        appliedAt: "2026-05-01T00:00:00.000Z",
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "cand-fresh",
        name: "Fresh",
        vacancyId: "vac-fresh",
        status: "reviewing",
        source: "manual",
        matchPercentage: 95,
        appliedAt: "2026-05-18T00:00:00.000Z",
        createdAt: "2026-05-18T00:00:00.000Z",
        updatedAt: "2026-05-18T00:00:00.000Z",
      },
    ],
    pipelineEvents: [],
    hiringTargets: [],
  });

  assert.equal(dto.kpis.find((item) => item.id === "active")?.value, "2");
  assert.deepEqual(dto.vacancies.map((row) => row.id), ["vac-stale"]);
  assert.ok(
    dto.needsAttention.every((item) => {
      const params = new URL(item.href, "https://hiiire.local").searchParams;
      return !params.has("staleOnly") && params.get("returnTo")?.includes("staleOnly=1");
    }),
  );
});

test("raw analytics output applies staleOnly to export-scoped candidates, vacancies, and sources", async () => {
  const filters = filtersFrom("periodStart=2026-05-01&periodEnd=2026-05-31&staleOnly=1", "admin");
  const admin = new AdminStub({
    analytics_filter_views: [],
    vacancies: [
      {
        id: "vac-stale",
        company_id: "company-1",
        title: "Stale vacancy",
        status: "active",
        created_by: "user-1",
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
        closed_at: null,
      },
      {
        id: "vac-fresh",
        company_id: "company-1",
        title: "Fresh vacancy",
        status: "active",
        created_by: "user-1",
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-18T00:00:00.000Z",
        closed_at: null,
      },
      {
        id: "vac-terminal",
        company_id: "company-1",
        title: "Terminal vacancy",
        status: "active",
        created_by: "user-1",
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
        closed_at: null,
      },
    ],
    candidates: [
      {
        id: "cand-stale",
        name: "Stale",
        status: "reviewing",
        vacancy_id: "vac-stale",
        match_percentage: 88,
        source: "manual",
        created_by: "user-1",
        applied_at: "2026-05-01T00:00:00.000Z",
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "cand-fresh",
        name: "Fresh",
        status: "reviewing",
        vacancy_id: "vac-fresh",
        match_percentage: 91,
        source: "referral",
        created_by: "user-1",
        applied_at: "2026-05-01T00:00:00.000Z",
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "cand-terminal",
        name: "Terminal",
        status: "hired",
        vacancy_id: "vac-terminal",
        match_percentage: 96,
        source: "hh.ru",
        created_by: "user-1",
        applied_at: "2026-05-01T00:00:00.000Z",
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
      },
    ],
    pipeline_events: [
      {
        id: "event-fresh",
        company_id: "company-1",
        candidate_id: "cand-fresh",
        vacancy_id: "vac-fresh",
        to_status: "reviewing",
        from_status: "new",
        event_type: "status_changed",
        occurred_at: "2026-05-19T00:00:00.000Z",
        created_at: "2026-05-19T00:00:00.000Z",
      },
    ],
    hiring_targets: [],
    ai_analyses: [],
    company_credits: [],
    enterprise_agreements: [],
  });

  const dashboard = await loadAnalyticsDashboard({
    admin,
    ctx: { userId: "user-1", companyId: "company-1", role: "admin" },
    filters,
    generatedAt: "2026-05-19T12:00:00.000Z",
    output: "raw",
  });

  assert.deepEqual(
    dashboard.exportRows.candidates.map((row) => row.candidateId),
    ["cand-stale"],
  );
  assert.deepEqual(
    dashboard.vacancies.map((row) => row.vacancyId),
    ["vac-stale"],
  );
  assert.deepEqual(
    dashboard.sources.map((row) => row.source),
    ["manual"],
  );
});

test("non-admin dashboard DTO never exposes company AI usage or team rows", () => {
  const dto = buildAnalyticsDashboardDto({
    role: "recruiter",
    generatedAt: "2026-05-19T12:00:00.000Z",
    filters: filtersFrom("", "recruiter"),
    savedViews: [],
    companyAiUsage: { used: 7, quota: 25, credits: 18 },
    vacancies: [],
    candidatesForMetrics: [],
    visibleCandidates: [],
    pipelineEvents: [],
    hiringTargets: [],
  });

  assert.equal(dto.companyAiUsage, null);
  assert.deepEqual(dto.team, []);
});

test("GET /api/analytics uses server company context, admin client, safe Russian errors, and shared loader", () => {
  const source = readFileSync(new URL("../app/api/analytics/route.ts", import.meta.url), "utf8");

  assert.match(source, /createSupabaseServerClient/);
  assert.match(source, /getSupabaseAdminClient/);
  assert.match(source, /requireCompanyContext/);
  assert.match(source, /loadAnalyticsDashboard/);
  assert.match(source, /Проверьте период/);
  assert.doesNotMatch(source, /stack|provider|expected string|Too big|Too small/);
});

test("non-admin analytics scope restricts created-by candidates to the current company before full reads", () => {
  const source = readFileSync(new URL("../lib/analytics/scope.ts", import.meta.url), "utf8");

  assert.match(source, /const companyVacancyIds = mapIds\(companyVacancyRows\)/);
  assert.match(source, /values:\s*companyVacancyIds/);
  assert.match(source, /\.from\("candidates"\)[\s\S]*\.eq\("created_by",\s*ctx\.userId\)[\s\S]*\.in\("vacancy_id",\s*vacancyIdChunk\)/);
  assert.match(source, /ownedCandidateVacancyIds/);
  assert.match(source, /values:\s*ownedCandidateVacancyIds/);
  assert.match(source, /\.in\("id",\s*vacancyIdChunk\)/);
  assert.match(source, /companyOwnedCandidateVacancyIds/);
  assert.doesNotMatch(source, /\.from\("candidates"\)\.select\("id"\)\.eq\("created_by",\s*ctx\.userId\)/);
});

test("analytics server loader selects saved filters, scoped targets, and safe AI analysis rows", async () => {
  const filters = filtersFrom("periodStart=2026-05-01&periodEnd=2026-05-31", "admin");
  const admin = new AdminStub({
    analytics_filter_views: [
      {
        id: "view-1",
        company_id: "company-1",
        owner_id: "user-1",
        name: "Engineering",
        visibility: "private",
        filters: { department: "Engineering", aiScoreMin: 80 },
      },
    ],
    vacancies: [
      {
        id: "vac-1",
        company_id: "company-1",
        title: "Backend",
        status: "active",
        department: "Engineering",
        location: "Москва",
        hiring_manager: "Анна",
        created_by: "user-1",
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-02T00:00:00.000Z",
      },
    ],
    candidates: [
      {
        id: "cand-1",
        name: "Candidate",
        status: "offer",
        vacancy_id: "vac-1",
        match_percentage: 91,
        source: "manual",
        created_by: "user-1",
        applied_at: "2026-05-03T00:00:00.000Z",
        created_at: "2026-05-03T00:00:00.000Z",
        updated_at: "2026-05-04T00:00:00.000Z",
      },
    ],
    pipeline_events: [],
    hiring_targets: [
      {
        id: "target-1",
        company_id: "company-1",
        scope_type: "vacancy",
        scope_id: "vac-1",
        metric_name: "hires",
        target_hires: 2,
        target_time_to_fill_days: 20,
        target_time_to_hire_days: null,
        sla_feedback_hours: null,
        minimum_pipeline_size: 2,
        period_start: "2026-05-01",
        period_end: "2026-05-31",
      },
    ],
    ai_analyses: [
      {
        id: "ai-1",
        candidate_id: "cand-1",
        overall_score: 91,
        category_scores: { skills: { score: 95 }, provider_payload: "must not leak" },
        reasons: ["Сильный опыт"],
        ai_provider: "gemini",
        provider_model: "gemini-2.5",
        model_version: "analytics-model",
        prompt_version: "prompt-v1",
        score_version: "score-v1",
        score_explanation: { summary: "Безопасное объяснение", raw_prompt: "must not leak" },
        audit_event_id: "audit-1",
        analyzed_at: "2026-05-05T00:00:00.000Z",
        created_at: "2026-05-05T00:00:00.000Z",
      },
    ],
    company_credits: [],
    enterprise_agreements: [],
  });

  const dashboard = await loadAnalyticsDashboard({
    admin,
    ctx: { userId: "user-1", companyId: "company-1", role: "admin" },
    filters,
    generatedAt: "2026-05-19T12:00:00.000Z",
    output: "raw",
  });

  assert.ok(
    admin.selects.some((select) => select.table === "analytics_filter_views" && /filters/.test(select.columns)),
    "saved view loader must select filters",
  );
  assert.ok(
    admin.selects.some((select) => select.table === "hiring_targets" && /scope_type/.test(select.columns) && /scope_id/.test(select.columns) && /metric_name/.test(select.columns)),
    "hiring target loader must preserve scoped target fields",
  );
  assert.ok(
    admin.selects.some((select) => select.table === "ai_analyses" && /overall_score/.test(select.columns) && /category_scores/.test(select.columns)),
    "analytics loader must query real AI analysis rows",
  );

  assert.equal(dashboard.exportRows.aiScores[0]?.aiAnalysisId, "ai-1");
  assert.equal(dashboard.exportRows.aiScores[0]?.scoreTotal, 91);
  assert.equal(dashboard.exportRows.aiScores[0]?.finalCandidateStatus, "offer");
  assert.equal(dashboard.exportRows.aiAudit[0]?.auditEventId, "audit-1");
  assert.doesNotMatch(JSON.stringify(dashboard.exportRows.aiScores), /provider_payload|raw_prompt|must not leak/i);
  assert.doesNotMatch(JSON.stringify(dashboard.exportRows.aiAudit), /provider_payload|raw_prompt|must not leak/i);
});

test("analytics server reads vacancies.closed_at instead of treating updated_at as closure date", () => {
  const source = readFileSync(new URL("../lib/analytics/server.ts", import.meta.url), "utf8");

  assert.match(source, /closed_at/);
  assert.match(source, /closedAt:\s*asString\(row\.closed_at\)/);
  assert.doesNotMatch(source, /closedAt:\s*row\.status\s*===\s*"closed"\s*\?\s*asString\(row\.updated_at\)/);
});

test("analytics server precomputes latest candidate events for stale checks", () => {
  const source = readFileSync(new URL("../lib/analytics/server.ts", import.meta.url), "utf8");

  assert.match(source, /function\s+buildLatestCandidateEventMap/);
  const staleCandidateSource = source.match(/function\s+isStaleCandidate[\s\S]*?\n}/)?.[0] ?? "";
  assert.doesNotMatch(staleCandidateSource, /\.filter\([\s\S]*?candidateId[\s\S]*?\.sort\(\)[\s\S]*?\.at\(-1\)/);
});

test("analytics full-scope reads paginate past the Supabase REST row cap", () => {
  const serverSource = readFileSync(new URL("../lib/analytics/server.ts", import.meta.url), "utf8");
  const scopeSource = readFileSync(new URL("../lib/analytics/scope.ts", import.meta.url), "utf8");

  assert.match(serverSource, /loadAllSupabaseRows/);
  assert.match(serverSource, /loadAllSupabaseRowsForValues/);
  assert.match(serverSource, /runPageQuery:\s*\(from,\s*to\)/);
  assert.match(serverSource, /runChunkPageQuery:\s*\(valueChunk,\s*from,\s*to\)/);
  assert.match(serverSource, /\.range\(from,\s*to\)/);
  assert.match(serverSource, /\.order\("id",\s*\{\s*ascending:\s*true\s*\}\)/);
  assert.doesNotMatch(serverSource, /async function readAll<T>\(query: PromiseLike/);

  assert.match(scopeSource, /loadAllSupabaseRows/);
  assert.match(scopeSource, /loadAllSupabaseRowsForValues/);
  assert.match(scopeSource, /runPageQuery:\s*\(from,\s*to\)/);
  assert.match(scopeSource, /runChunkPageQuery:\s*\(vacancyIdChunk,\s*from,\s*to\)/);
  assert.match(scopeSource, /\.range\(from,\s*to\)/);
  assert.match(scopeSource, /\.order\("id",\s*\{\s*ascending:\s*true\s*\}\)/);
  assert.doesNotMatch(scopeSource, /await admin\.from\("candidates"\)\.select\("id,vacancy_id"\)\.eq\("created_by",\s*ctx\.userId\);/);
});
