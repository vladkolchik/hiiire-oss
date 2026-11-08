import assert from "node:assert/strict";
import test from "node:test";

import type { AnalyticsDashboard } from "../lib/analytics/types.ts";
import {
  buildAnalyticsCsvDataset,
  buildAnalyticsCsvMetadataDataset,
  listAvailableCsvDatasets,
} from "../lib/analytics/csv.ts";

const dashboard: AnalyticsDashboard = {
  role: "admin",
  generatedAt: "2026-05-19T12:00:00.000Z",
  filters: {
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    periodMode: "period_event",
    asOfDate: "2026-05-19",
    vacancyId: null,
    vacancyStatus: "all",
    ownerId: null,
    department: null,
    location: null,
    source: null,
    candidateStatus: null,
    aiScoreMin: null,
    aiShortlistThreshold: 80,
    riskyOnly: false,
    staleOnly: false,
    savedViewId: null,
  },
  kpis: {
    planFactHires: { periodMode: "period_event", actual: 1, target: 2, completion: 0.5 },
    activeVacancies: { periodMode: "as_of_snapshot", value: 1 },
    closedVacancies: { periodMode: "period_closed", value: 1 },
    riskyVacancies: { periodMode: "as_of_snapshot", value: 0 },
    timeToFill: { periodMode: "period_closed", averageDays: 20, medianDays: 20, count: 1 },
    timeToHire: { periodMode: "period_event", averageDays: 10, medianDays: 10, count: 1 },
    funnelConversion: { periodMode: "period_event", value: 0.5 },
    offerAcceptance: { periodMode: "period_event", value: 0.5 },
    aiCoverage: { periodMode: "as_of_snapshot", analyzed: 2, total: 3, value: 0.667 },
  },
  needsAttention: [],
  funnel: [],
  vacancies: [],
  sources: [
    {
      source: "=hh.ru",
      candidateCount: 2,
      interviewCount: 1,
      offerCount: 1,
      hireCount: 0,
      interviewConversion: 0.5,
      offerConversion: 0.5,
      hireConversion: 0,
      averageAiScore: 82,
      highScoreShare: 0.5,
    },
  ],
  team: [{ ownerId: "user-1", ownerName: "+Анна", activeVacancies: 1, candidatesInProcess: 2, staleCandidates: 0, aiShortlistWithoutMovement: 0, interviews: 1, offers: 1, hires: 0 }],
  ai: {
    coverage: { analyzed: 2, total: 3, value: 0.667 },
    scoreBuckets: [
      { bucket: "80-100", count: 1 },
      { bucket: "Без оценки", count: 1 },
    ],
    shortlistThreshold: 80,
    shortlistedCandidates: 1,
    shortlistToInterview: 1,
    shortlistToOffer: 1,
    shortlistToHire: 0,
    highScoreNeedsAttention: [],
  },
  dataQuality: [],
  exportRows: {
    candidates: [
      {
        candidateId: "cand-1",
        candidateName: "@Candidate",
        vacancyId: "vac-1",
        vacancyName: "Backend",
        status: "offer",
        source: "hh.ru",
        matchPercentage: 90,
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-02T00:00:00.000Z",
      },
    ],
    pipelineEvents: [],
    rejectionReasons: [],
    slaBreaches: [{ entityType: "candidate", entityId: "cand-1", ruleName: "Feedback", breachedAt: "2026-05-03T00:00:00.000Z", hoursOverdue: 12 }],
    aiScores: [{ aiAnalysisId: "ai-1", candidateId: "cand-1", vacancyId: "vac-1", scoreTotal: 90, createdAt: "2026-05-01T00:00:00.000Z", finalCandidateStatus: "offer" }],
    aiAudit: [{ auditEventId: "audit-1", candidateId: "cand-1", vacancyId: "vac-1", modelVersion: "m", promptVersion: "p", scoreVersion: "s", scoreExplanation: "-safe", analysisTimestamp: "2026-05-01T00:00:00.000Z" }],
  },
};

test("CSV datasets are named exports with admin-only datasets and optional SLA breaches", () => {
  assert.deepEqual(listAvailableCsvDatasets(dashboard), [
    "candidates",
    "pipeline-events",
    "rejection-reasons",
    "sources",
    "ai-scores",
    "sla-breaches",
    "recruiters",
    "ai-audit",
  ]);

  assert.deepEqual(listAvailableCsvDatasets({ ...dashboard, role: "hr", team: [] }), [
    "candidates",
    "pipeline-events",
    "rejection-reasons",
    "sources",
    "ai-scores",
    "sla-breaches",
  ]);

  assert.throws(() => buildAnalyticsCsvDataset({ ...dashboard, role: "hr", team: [] }, "ai-audit"), /admin/);
});

test("CSV builder uses stable headers and guards spreadsheet formula injection", () => {
  const dataset = buildAnalyticsCsvDataset(dashboard, "candidates");

  assert.equal(dataset.dataset, "candidates");
  assert.match(dataset.csv, /^candidate_id,candidate_name,vacancy_id/);
  assert.match(dataset.csv, /cand-1,'@Candidate,vac-1/);
  assert.equal(dataset.rowCount, 1);
});

test("CSV source and metadata companion datasets stay BI-friendly", () => {
  const sources = buildAnalyticsCsvDataset(dashboard, "sources");
  const metadata = buildAnalyticsCsvMetadataDataset(dashboard, ["sources"]);

  assert.match(sources.csv, /^source,candidate_count,interview_count/);
  assert.match(sources.csv, /'=hh.ru,2,1/);
  assert.match(metadata.csv, /^key,value/);
  assert.match(metadata.csv, /generated_at,2026-05-19T12:00:00.000Z/);
  assert.match(metadata.csv, /period_start,2026-05-01/);
  assert.equal(metadata.rowCount > 3, true);
});
