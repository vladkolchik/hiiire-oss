import assert from "node:assert/strict";
import test from "node:test";

import type { AnalyticsDashboard } from "../lib/analytics/types.ts";
import { buildAnalyticsWorkbook } from "../lib/analytics/xlsx.ts";

const baseDashboard: AnalyticsDashboard = {
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
  vacancies: [{ vacancyId: "vac-1", vacancyName: "Backend", status: "active", openedAt: "2026-05-01T00:00:00.000Z", daysOpen: 18, candidatesTotal: 1, candidatesAi70Plus: 1, candidatesAi80Plus: 1, interviews: 1, offers: 1, hires: 0, riskStatus: "low", riskReason: "Риск не выявлен" }],
  sources: [{ source: "hh.ru", candidateCount: 1, interviewCount: 1, offerCount: 1, hireCount: 0, interviewConversion: 1, offerConversion: 1, hireConversion: 0, averageAiScore: 91, highScoreShare: 1 }],
  team: [{ ownerId: "user-1", ownerName: "Анна", activeVacancies: 1, candidatesInProcess: 1, staleCandidates: 0, aiShortlistWithoutMovement: 0, interviews: 1, offers: 1, hires: 0 }],
  ai: {
    coverage: { analyzed: 1, total: 1, value: 1 },
    scoreBuckets: [{ bucket: "80-100", count: 1 }],
    shortlistThreshold: 80,
    shortlistedCandidates: 1,
    shortlistToInterview: 1,
    shortlistToOffer: 1,
    shortlistToHire: 0,
    highScoreNeedsAttention: [],
  },
  dataQuality: [],
  exportRows: {
    candidates: [{ candidateId: "cand-1", candidateName: "Candidate", vacancyId: "vac-1", vacancyName: "Backend", status: "offer", source: "hh.ru", matchPercentage: 91, createdAt: "2026-05-01T00:00:00.000Z", updatedAt: "2026-05-02T00:00:00.000Z" }],
    pipelineEvents: [{ eventId: "event-1", candidateId: "cand-1", vacancyId: "vac-1", userId: "user-1", fromStage: "interviewed", toStage: "offer", eventType: "status_changed", eventDatetime: "2026-05-02T00:00:00.000Z", rejectionReason: null }],
    rejectionReasons: [{ rejectionReason: "не указана", category: "unknown", count: 1, share: 1 }],
    slaBreaches: [{ entityType: "candidate", entityId: "cand-1", ruleName: "Feedback", breachedAt: "2026-05-03T00:00:00.000Z", hoursOverdue: 12 }],
    aiScores: [{ aiAnalysisId: "ai-1", candidateId: "cand-1", vacancyId: "vac-1", scoreTotal: 91, scoreBreakdown: "{\"skills\":91}", modelVersion: "model", promptVersion: "prompt", createdAt: "2026-05-01T00:00:00.000Z", finalCandidateStatus: "offer" }],
    aiAudit: [{ auditEventId: "audit-1", candidateId: "cand-1", vacancyId: "vac-1", modelVersion: "model", promptVersion: "prompt", scoreVersion: "v1", scoreExplanation: "Краткое объяснение", analysisTimestamp: "2026-05-01T00:00:00.000Z" }],
  },
};

test("XLSX workbook includes required sheets, metadata, and admin-only audit sheets", async () => {
  const workbook = await buildAnalyticsWorkbook(baseDashboard);
  const sheetNames = workbook.worksheets.map((sheet) => sheet.name);

  assert.deepEqual(sheetNames, [
    "Summary",
    "Vacancies",
    "Candidates",
    "Pipeline events",
    "Rejection reasons",
    "SLA breaches",
    "Sources",
    "Recruiters",
    "AI scores",
    "AI audit",
  ]);

  const summary = workbook.getWorksheet("Summary");
  assert.equal(summary?.getCell("A1").value, "Сводка отчёта");
  assert.equal(summary?.getCell("B2").value, "2026-05-19T12:00:00.000Z");
  assert.equal(summary?.getCell("B3").value, "2026-05-01 - 2026-05-31");
});

test("XLSX workbook hides admin-only sheets for non-admin exports", async () => {
  const workbook = await buildAnalyticsWorkbook({
    ...baseDashboard,
    role: "recruiter",
    team: [],
  });
  const sheetNames = workbook.worksheets.map((sheet) => sheet.name);

  assert.equal(sheetNames.includes("Recruiters"), false);
  assert.equal(sheetNames.includes("AI audit"), false);
  assert.equal(sheetNames.includes("SLA breaches"), true);
});

test("XLSX workbook omits SLA breaches when no configured breach rows exist", async () => {
  const workbook = await buildAnalyticsWorkbook({
    ...baseDashboard,
    exportRows: { ...baseDashboard.exportRows, slaBreaches: [] },
  });

  assert.equal(workbook.worksheets.some((sheet) => sheet.name === "SLA breaches"), false);
});
