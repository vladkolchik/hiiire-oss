import assert from "node:assert/strict";
import test from "node:test";

import {
  type AnalyticsCandidate,
  type AnalyticsPipelineEvent,
  type AnalyticsVacancy,
  type HiringTarget,
} from "../lib/analytics/types.ts";
import { calculateAnalyticsDashboard } from "../lib/analytics/calculations.ts";
import { AI_SHORTLIST_THRESHOLD, normalizeAnalyticsFilters } from "../lib/analytics/filters.ts";

const filters = normalizeAnalyticsFilters(
  new URLSearchParams({ periodStart: "2026-05-01", periodEnd: "2026-05-31" }),
  { now: new Date("2026-05-19T12:00:00.000Z"), role: "admin" },
);

const vacancies: AnalyticsVacancy[] = [
  {
    id: "vac-1",
    title: "Backend Developer",
    status: "active",
    createdAt: "2026-04-01T00:00:00.000Z",
    department: "Engineering",
    location: "Москва",
    ownerId: "user-1",
    ownerName: "Анна",
  },
  {
    id: "vac-2",
    title: "Sales Manager",
    status: "closed",
    createdAt: "2026-04-20T00:00:00.000Z",
    closedAt: "2026-05-10T00:00:00.000Z",
    department: "Sales",
    location: "Санкт-Петербург",
    ownerId: "user-2",
    ownerName: "Иван",
  },
];

const candidates: AnalyticsCandidate[] = [
  {
    id: "cand-1",
    name: "Candidate One",
    vacancyId: "vac-1",
    status: "interviewed",
    source: "hh.ru",
    matchPercentage: 85,
    appliedAt: "2026-05-01T00:00:00.000Z",
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-05T00:00:00.000Z",
  },
  {
    id: "cand-2",
    name: "Candidate Two",
    vacancyId: "vac-2",
    status: "hired",
    source: "referral",
    matchPercentage: 78,
    appliedAt: "2026-05-02T00:00:00.000Z",
    createdAt: "2026-05-02T00:00:00.000Z",
    updatedAt: "2026-05-12T00:00:00.000Z",
  },
  {
    id: "cand-3",
    name: "Candidate Three",
    vacancyId: "vac-1",
    status: "new",
    source: "manual",
    matchPercentage: null,
    appliedAt: "2026-05-09T00:00:00.000Z",
    createdAt: "2026-05-09T00:00:00.000Z",
    updatedAt: "2026-05-09T00:00:00.000Z",
  },
  {
    id: "cand-4",
    name: "Candidate Four",
    vacancyId: "vac-1",
    status: "offer",
    source: "hh.ru",
    matchPercentage: 92,
    appliedAt: "2026-05-03T00:00:00.000Z",
    createdAt: "2026-05-03T00:00:00.000Z",
    updatedAt: "2026-05-03T00:00:00.000Z",
  },
];

const events: AnalyticsPipelineEvent[] = [
  {
    id: "ev-1",
    candidateId: "cand-1",
    vacancyId: "vac-1",
    actorId: "user-1",
    fromStatus: "new",
    toStatus: "interviewed",
    eventType: "status_changed",
    occurredAt: "2026-05-06T00:00:00.000Z",
  },
  {
    id: "ev-2",
    candidateId: "cand-2",
    vacancyId: "vac-2",
    actorId: "user-2",
    fromStatus: "offer",
    toStatus: "hired",
    eventType: "status_changed",
    occurredAt: "2026-05-12T00:00:00.000Z",
  },
  {
    id: "ev-3",
    candidateId: "cand-4",
    vacancyId: "vac-1",
    actorId: "user-1",
    fromStatus: "interviewed",
    toStatus: "offer",
    eventType: "status_changed",
    occurredAt: "2026-05-08T00:00:00.000Z",
  },
  {
    id: "ev-4",
    candidateId: "cand-old",
    vacancyId: "vac-old",
    actorId: "user-3",
    fromStatus: "offer",
    toStatus: "hired",
    eventType: "status_changed",
    occurredAt: "2026-04-29T00:00:00.000Z",
  },
];

const targets: HiringTarget[] = [
  {
    id: "target-1",
    scopeType: "company",
    scopeId: null,
    metricName: "hires",
    targetHires: 3,
    targetTimeToFillDays: 30,
    minimumPipelineSize: 3,
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
  },
];

test("analytics calculations keep period_event hires separate from as_of_snapshot vacancies", () => {
  const dashboard = calculateAnalyticsDashboard({
    role: "admin",
    generatedAt: "2026-05-19T12:00:00.000Z",
    filters,
    vacancies,
    candidates,
    pipelineEvents: events,
    hiringTargets: targets,
  });

  assert.equal(dashboard.kpis.planFactHires.periodMode, "period_event");
  assert.equal(dashboard.kpis.planFactHires.actual, 1);
  assert.equal(dashboard.kpis.planFactHires.target, 3);
  assert.equal(dashboard.kpis.activeVacancies.periodMode, "as_of_snapshot");
  assert.equal(dashboard.kpis.activeVacancies.value, 1);
  assert.equal(dashboard.kpis.closedVacancies.periodMode, "period_closed");
  assert.equal(dashboard.kpis.closedVacancies.value, 1);
});

test("analytics calculations produce time metrics, funnel conversion, source quality, and offer acceptance", () => {
  const dashboard = calculateAnalyticsDashboard({
    role: "admin",
    generatedAt: "2026-05-19T12:00:00.000Z",
    filters,
    vacancies,
    candidates,
    pipelineEvents: events,
    hiringTargets: targets,
  });

  assert.equal(dashboard.kpis.timeToFill.averageDays, 20);
  assert.equal(dashboard.kpis.timeToFill.medianDays, 20);
  assert.equal(dashboard.kpis.timeToHire.averageDays, 10);
  assert.equal(dashboard.kpis.funnelConversion.value, 0.25);
  assert.equal(dashboard.kpis.offerAcceptance.value, 0.5);
  assert.equal(dashboard.funnel.find((row) => row.stage === "hired")?.count, 1);

  const hh = dashboard.sources.find((row) => row.source === "hh.ru");
  assert.equal(hh?.candidateCount, 2);
  assert.equal(hh?.interviewConversion, 1);
  assert.equal(hh?.offerConversion, 0.5);
  assert.equal(hh?.averageAiScore, 88.5);
  assert.equal(hh?.highScoreShare, 1);
});

test("AI-shortlist conversion is fixed at match_percentage >= 80 even with a stricter visible score filter", () => {
  const strictFilters = { ...filters, aiScoreMin: 90 };
  const dashboard = calculateAnalyticsDashboard({
    role: "admin",
    generatedAt: "2026-05-19T12:00:00.000Z",
    filters: strictFilters,
    vacancies,
    candidates,
    pipelineEvents: events,
    hiringTargets: targets,
  });

  assert.equal(dashboard.ai.shortlistThreshold, AI_SHORTLIST_THRESHOLD);
  assert.equal(dashboard.ai.shortlistedCandidates, 2);
  assert.equal(dashboard.ai.shortlistToInterview, 1);
  assert.equal(dashboard.ai.shortlistToOffer, 0.5);
  assert.deepEqual(
    dashboard.ai.highScoreNeedsAttention.map((candidate) => candidate.candidateId).sort(),
    ["cand-1", "cand-4"],
  );
});

test("calculations return honest data-quality states when pipeline history is missing", () => {
  const dashboard = calculateAnalyticsDashboard({
    role: "recruiter",
    generatedAt: "2026-05-19T12:00:00.000Z",
    filters,
    vacancies,
    candidates,
    pipelineEvents: [],
    hiringTargets: [],
  });

  assert.equal(dashboard.dataQuality.some((state) => state.code === "pipeline_history_missing"), true);
  assert.match(dashboard.dataQuality[0]?.message ?? "", /Недостаточно истории переходов/);
  assert.equal(dashboard.funnel.find((row) => row.stage === "offer")?.count, 1);
});

test("closed vacancies without closedAt create a data-quality note and stay out of closed period KPIs", () => {
  const dashboard = calculateAnalyticsDashboard({
    role: "admin",
    generatedAt: "2026-05-19T12:00:00.000Z",
    filters,
    vacancies: [
      {
        id: "closed-with-date",
        title: "Closed with date",
        status: "closed",
        createdAt: "2026-05-01T00:00:00.000Z",
        closedAt: "2026-05-10T00:00:00.000Z",
      },
      {
        id: "closed-missing-date",
        title: "Closed missing date",
        status: "closed",
        createdAt: "2026-05-01T00:00:00.000Z",
      },
    ],
    candidates: [],
    pipelineEvents: [],
    hiringTargets: [],
  });

  assert.equal(dashboard.kpis.closedVacancies.value, 1);
  assert.equal(dashboard.kpis.timeToFill.count, 1);
  assert.equal(
    dashboard.dataQuality.some(
      (state) =>
        state.code === "closed_dates_missing" &&
        state.periodMode === "period_closed" &&
        /нет сохранённой даты закрытия/.test(state.message),
    ),
    true,
  );
});

test("scoped hiring targets use company plan for overview and vacancy-specific targets for risk", () => {
  const dashboard = calculateAnalyticsDashboard({
    role: "admin",
    generatedAt: "2026-05-19T12:00:00.000Z",
    filters,
    vacancies,
    candidates,
    pipelineEvents: events,
    hiringTargets: [
      {
        id: "target-vacancy",
        scopeType: "vacancy",
        scopeId: "vac-1",
        metricName: "hires",
        targetHires: 99,
        targetTimeToFillDays: 10,
        minimumPipelineSize: 1,
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
      },
      {
        id: "target-company",
        scopeType: "company",
        scopeId: null,
        metricName: "hires",
        targetHires: 4,
        targetTimeToFillDays: 90,
        minimumPipelineSize: 10,
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
      },
    ],
  });

  assert.equal(dashboard.kpis.planFactHires.target, 4, "overview must not use the first scoped target");
  const vacancy = dashboard.vacancies.find((row) => row.vacancyId === "vac-1");
  assert.equal(vacancy?.riskStatus, "high", "vacancy target should override the company SLA for this vacancy");
  assert.equal(vacancy?.riskReason, "Вакансия открыта дольше целевого срока");
});

test("irrelevant scoped hiring targets do not create false vacancy risk", () => {
  const dashboard = calculateAnalyticsDashboard({
    role: "admin",
    generatedAt: "2026-05-19T12:00:00.000Z",
    filters,
    vacancies: [vacancies[0]!],
    candidates: candidates.filter((candidate) => candidate.id === "cand-3"),
    pipelineEvents: [],
    hiringTargets: [
      {
        id: "target-other-vacancy",
        scopeType: "vacancy",
        scopeId: "other-vacancy",
        metricName: "hires",
        targetTimeToFillDays: 1,
        minimumPipelineSize: 99,
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
      },
    ],
  });

  assert.equal(dashboard.kpis.planFactHires.target, null);
  assert.equal(dashboard.vacancies[0]?.riskStatus, "low");
  assert.equal(dashboard.kpis.riskyVacancies.value, 0);
});

test("company targets with scope ids and unresolved department targets are ignored", () => {
  const dashboard = calculateAnalyticsDashboard({
    role: "admin",
    generatedAt: "2026-05-19T12:00:00.000Z",
    filters,
    vacancies: [vacancies[0]!],
    candidates: candidates.filter((candidate) => candidate.id === "cand-3"),
    pipelineEvents: [],
    hiringTargets: [
      {
        id: "target-invalid-company",
        scopeType: "company",
        scopeId: "11111111-1111-4111-8111-111111111111",
        metricName: "hires",
        targetHires: 10,
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
      },
      {
        id: "target-department",
        scopeType: "department",
        scopeId: "22222222-2222-4222-8222-222222222222",
        metricName: "hires",
        targetTimeToFillDays: 1,
        minimumPipelineSize: 99,
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
      },
    ],
  });

  assert.equal(dashboard.kpis.planFactHires.target, null, "company target with scope_id must not become global");
  assert.equal(dashboard.vacancies[0]?.riskStatus, "low", "department UUID must not be compared to vacancy.department text");
});

test("SLA breach export rows are generated only from configured SLA targets", () => {
  const activeCandidate = candidates.find((candidate) => candidate.id === "cand-3")!;
  const dashboardWithoutSla = calculateAnalyticsDashboard({
    role: "admin",
    generatedAt: "2026-05-19T12:00:00.000Z",
    filters,
    vacancies: [vacancies[0]!],
    candidates: [activeCandidate],
    pipelineEvents: [],
    hiringTargets: [],
  });

  const dashboardWithSla = calculateAnalyticsDashboard({
    role: "admin",
    generatedAt: "2026-05-19T12:00:00.000Z",
    filters,
    vacancies: [vacancies[0]!],
    candidates: [activeCandidate],
    pipelineEvents: [],
    hiringTargets: [
      {
        id: "target-sla",
        scopeType: "vacancy",
        scopeId: "vac-1",
        metricName: "hires",
        slaFeedbackHours: 24,
        periodStart: "2026-05-01",
        periodEnd: "2026-05-31",
      },
    ],
  });

  assert.equal(dashboardWithoutSla.exportRows.slaBreaches.length, 0);
  assert.equal(dashboardWithSla.exportRows.slaBreaches.length, 1);
  assert.equal(dashboardWithSla.exportRows.slaBreaches[0]?.entityId, "cand-3");
  assert.match(dashboardWithSla.exportRows.slaBreaches[0]?.ruleName ?? "", /настроенного SLA/);
});

test("rejection reason aggregation prefers normalized reason names and buckets missing reasons as unknown", () => {
  const dashboard = calculateAnalyticsDashboard({
    role: "admin",
    generatedAt: "2026-05-19T12:00:00.000Z",
    filters,
    vacancies,
    candidates,
    pipelineEvents: [
      {
        id: "reject-normalized",
        candidateId: "cand-1",
        vacancyId: "vac-1",
        toStatus: "rejected",
        eventType: "status_changed",
        occurredAt: "2026-05-10T00:00:00.000Z",
        rejectionReasonId: "reason-1",
        rejectionReason: "Не хватает опыта",
        rejectionComment: "Комментарий не должен заменить нормализованную причину",
      },
      {
        id: "reject-comment",
        candidateId: "cand-3",
        vacancyId: "vac-1",
        toStatus: "rejected",
        eventType: "status_changed",
        occurredAt: "2026-05-11T00:00:00.000Z",
        rejectionReason: null,
        rejectionComment: "Кандидат отказался сам",
      },
      {
        id: "reject-empty",
        candidateId: "cand-4",
        vacancyId: "vac-1",
        toStatus: "rejected",
        eventType: "status_changed",
        occurredAt: "2026-05-12T00:00:00.000Z",
      },
    ],
    hiringTargets: [],
  });

  assert.deepEqual(
    dashboard.exportRows.rejectionReasons.map((row) => row.rejectionReason).sort(),
    ["Не хватает опыта", "не указана"],
  );
  assert.equal(dashboard.exportRows.rejectionReasons.find((row) => row.rejectionReason === "не указана")?.count, 2);
});
