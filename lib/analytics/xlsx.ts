import ExcelJS from "exceljs";

import type {
  AnalyticsAiAuditExportRow,
  AnalyticsAiScoreExportRow,
  AnalyticsCandidateExportRow,
  AnalyticsDashboard,
  AnalyticsPipelineEventExportRow,
  AnalyticsRejectionReasonExportRow,
  AnalyticsSlaBreachExportRow,
  AnalyticsSourceRow,
  AnalyticsTeamRow,
  AnalyticsVacancyRow,
} from "./types.ts";

type Column<T> = {
  header: string;
  key: string;
  value: (row: T) => unknown;
  width?: number;
};

function addTableSheet<T>(workbook: ExcelJS.Workbook, name: string, rows: T[], columns: Column<T>[]) {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width ?? Math.max(12, column.header.length + 2),
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECEFF3" } };

  for (const row of rows) {
    sheet.addRow(Object.fromEntries(columns.map((column) => [column.key, column.value(row)])));
  }

  return sheet;
}

function addSummarySheet(workbook: ExcelJS.Workbook, dashboard: AnalyticsDashboard) {
  const sheet = workbook.addWorksheet("Summary");
  sheet.columns = [
    { key: "label", width: 34 },
    { key: "value", width: 34 },
    { key: "periodMode", width: 22 },
  ];
  sheet.getCell("A1").value = "Сводка отчёта";
  sheet.getCell("A1").font = { bold: true, size: 14 };
  sheet.getCell("A2").value = "Дата формирования";
  sheet.getCell("B2").value = dashboard.generatedAt;
  sheet.getCell("A3").value = "Период";
  sheet.getCell("B3").value = `${dashboard.filters.periodStart} - ${dashboard.filters.periodEnd}`;
  sheet.getCell("A4").value = "Режим периода";
  sheet.getCell("B4").value = dashboard.filters.periodMode;
  sheet.getCell("A5").value = "Роль";
  sheet.getCell("B5").value = dashboard.role;
  sheet.getCell("A6").value = "AI-shortlist";
  sheet.getCell("B6").value = `match_percentage >= ${dashboard.filters.aiShortlistThreshold}`;
  sheet.getCell("A8").value = "Метрика";
  sheet.getCell("B8").value = "Значение";
  sheet.getCell("C8").value = "Режим";
  sheet.getRow(8).font = { bold: true };

  const rows = [
    ["План/факт наймов", `${dashboard.kpis.planFactHires.actual}/${dashboard.kpis.planFactHires.target ?? ""}`, dashboard.kpis.planFactHires.periodMode],
    ["Открытые вакансии", dashboard.kpis.activeVacancies.value, dashboard.kpis.activeVacancies.periodMode],
    ["Закрытые вакансии", dashboard.kpis.closedVacancies.value, dashboard.kpis.closedVacancies.periodMode],
    ["Вакансии под риском", dashboard.kpis.riskyVacancies.value, dashboard.kpis.riskyVacancies.periodMode],
    ["Time-to-fill, среднее", dashboard.kpis.timeToFill.averageDays, dashboard.kpis.timeToFill.periodMode],
    ["Time-to-hire, среднее", dashboard.kpis.timeToHire.averageDays, dashboard.kpis.timeToHire.periodMode],
    ["Конверсия воронки", dashboard.kpis.funnelConversion.value, dashboard.kpis.funnelConversion.periodMode],
    ["Offer acceptance", dashboard.kpis.offerAcceptance.value, dashboard.kpis.offerAcceptance.periodMode],
    ["AI coverage", dashboard.kpis.aiCoverage.value, dashboard.kpis.aiCoverage.periodMode],
  ];

  for (const row of rows) sheet.addRow(row);

  const rowCountsStart = sheet.rowCount + 2;
  sheet.getCell(`A${rowCountsStart}`).value = "Строки в листах";
  sheet.getCell(`A${rowCountsStart}`).font = { bold: true };
  const rowCounts = getWorkbookRowCounts(dashboard);
  for (const [sheetName, count] of Object.entries(rowCounts)) {
    sheet.addRow([sheetName, count]);
  }

  return sheet;
}

function getWorkbookRowCounts(dashboard: AnalyticsDashboard) {
  return {
    Vacancies: dashboard.vacancies.length,
    Candidates: dashboard.exportRows.candidates.length,
    "Pipeline events": dashboard.exportRows.pipelineEvents.length,
    "Rejection reasons": dashboard.exportRows.rejectionReasons.length,
    "SLA breaches": dashboard.exportRows.slaBreaches.length,
    Sources: dashboard.sources.length,
    Recruiters: dashboard.role === "admin" ? dashboard.team.length : 0,
    "AI scores": dashboard.exportRows.aiScores.length,
    "AI audit": dashboard.role === "admin" ? dashboard.exportRows.aiAudit.length : 0,
  };
}

const vacancyColumns: Column<AnalyticsVacancyRow>[] = [
  { header: "vacancy_id", key: "vacancy_id", value: (row) => row.vacancyId, width: 18 },
  { header: "vacancy_name", key: "vacancy_name", value: (row) => row.vacancyName, width: 28 },
  { header: "department", key: "department", value: (row) => row.department },
  { header: "city", key: "city", value: (row) => row.city },
  { header: "owner_recruiter", key: "owner_recruiter", value: (row) => row.ownerRecruiter },
  { header: "opened_at", key: "opened_at", value: (row) => row.openedAt },
  { header: "status", key: "status", value: (row) => row.status },
  { header: "days_open", key: "days_open", value: (row) => row.daysOpen },
  { header: "candidates_total", key: "candidates_total", value: (row) => row.candidatesTotal },
  { header: "candidates_ai_70_plus", key: "candidates_ai_70_plus", value: (row) => row.candidatesAi70Plus },
  { header: "candidates_ai_80_plus", key: "candidates_ai_80_plus", value: (row) => row.candidatesAi80Plus },
  { header: "interviews", key: "interviews", value: (row) => row.interviews },
  { header: "offers", key: "offers", value: (row) => row.offers },
  { header: "hires", key: "hires", value: (row) => row.hires },
  { header: "risk_status", key: "risk_status", value: (row) => row.riskStatus },
  { header: "risk_reason", key: "risk_reason", value: (row) => row.riskReason, width: 30 },
];

const candidateColumns: Column<AnalyticsCandidateExportRow>[] = [
  { header: "candidate_id", key: "candidate_id", value: (row) => row.candidateId },
  { header: "candidate_name", key: "candidate_name", value: (row) => row.candidateName, width: 24 },
  { header: "vacancy_id", key: "vacancy_id", value: (row) => row.vacancyId },
  { header: "vacancy_name", key: "vacancy_name", value: (row) => row.vacancyName, width: 24 },
  { header: "status", key: "status", value: (row) => row.status },
  { header: "source", key: "source", value: (row) => row.source },
  { header: "match_percentage", key: "match_percentage", value: (row) => row.matchPercentage },
  { header: "created_at", key: "created_at", value: (row) => row.createdAt },
  { header: "updated_at", key: "updated_at", value: (row) => row.updatedAt },
];

const pipelineColumns: Column<AnalyticsPipelineEventExportRow>[] = [
  { header: "event_id", key: "event_id", value: (row) => row.eventId },
  { header: "candidate_id", key: "candidate_id", value: (row) => row.candidateId },
  { header: "vacancy_id", key: "vacancy_id", value: (row) => row.vacancyId },
  { header: "user_id", key: "user_id", value: (row) => row.userId },
  { header: "from_stage", key: "from_stage", value: (row) => row.fromStage },
  { header: "to_stage", key: "to_stage", value: (row) => row.toStage },
  { header: "event_type", key: "event_type", value: (row) => row.eventType },
  { header: "event_datetime", key: "event_datetime", value: (row) => row.eventDatetime },
  { header: "rejection_reason", key: "rejection_reason", value: (row) => row.rejectionReason, width: 24 },
];

const rejectionColumns: Column<AnalyticsRejectionReasonExportRow>[] = [
  { header: "rejection_reason", key: "rejection_reason", value: (row) => row.rejectionReason, width: 28 },
  { header: "category", key: "category", value: (row) => row.category },
  { header: "count", key: "count", value: (row) => row.count },
  { header: "share", key: "share", value: (row) => row.share },
];

const sourceColumns: Column<AnalyticsSourceRow>[] = [
  { header: "source", key: "source", value: (row) => row.source },
  { header: "candidate_count", key: "candidate_count", value: (row) => row.candidateCount },
  { header: "interview_count", key: "interview_count", value: (row) => row.interviewCount },
  { header: "offer_count", key: "offer_count", value: (row) => row.offerCount },
  { header: "hire_count", key: "hire_count", value: (row) => row.hireCount },
  { header: "interview_conversion", key: "interview_conversion", value: (row) => row.interviewConversion },
  { header: "offer_conversion", key: "offer_conversion", value: (row) => row.offerConversion },
  { header: "hire_conversion", key: "hire_conversion", value: (row) => row.hireConversion },
  { header: "average_ai_score", key: "average_ai_score", value: (row) => row.averageAiScore },
  { header: "high_score_share", key: "high_score_share", value: (row) => row.highScoreShare },
];

const teamColumns: Column<AnalyticsTeamRow>[] = [
  { header: "user_id", key: "user_id", value: (row) => row.ownerId },
  { header: "name", key: "name", value: (row) => row.ownerName },
  { header: "active_vacancies", key: "active_vacancies", value: (row) => row.activeVacancies },
  { header: "candidates_in_process", key: "candidates_in_process", value: (row) => row.candidatesInProcess },
  { header: "stale_candidates", key: "stale_candidates", value: (row) => row.staleCandidates },
  { header: "ai_shortlist_without_movement", key: "ai_shortlist_without_movement", value: (row) => row.aiShortlistWithoutMovement },
  { header: "interviews", key: "interviews", value: (row) => row.interviews },
  { header: "offers", key: "offers", value: (row) => row.offers },
  { header: "hires", key: "hires", value: (row) => row.hires },
];

const slaColumns: Column<AnalyticsSlaBreachExportRow>[] = [
  { header: "entity_type", key: "entity_type", value: (row) => row.entityType },
  { header: "entity_id", key: "entity_id", value: (row) => row.entityId },
  { header: "rule_name", key: "rule_name", value: (row) => row.ruleName },
  { header: "breached_at", key: "breached_at", value: (row) => row.breachedAt },
  { header: "hours_overdue", key: "hours_overdue", value: (row) => row.hoursOverdue },
];

const aiScoreColumns: Column<AnalyticsAiScoreExportRow>[] = [
  { header: "ai_analysis_id", key: "ai_analysis_id", value: (row) => row.aiAnalysisId },
  { header: "candidate_id", key: "candidate_id", value: (row) => row.candidateId },
  { header: "vacancy_id", key: "vacancy_id", value: (row) => row.vacancyId },
  { header: "score_total", key: "score_total", value: (row) => row.scoreTotal },
  { header: "score_breakdown", key: "score_breakdown", value: (row) => row.scoreBreakdown },
  { header: "model_version", key: "model_version", value: (row) => row.modelVersion },
  { header: "prompt_version", key: "prompt_version", value: (row) => row.promptVersion },
  { header: "created_at", key: "created_at", value: (row) => row.createdAt },
  { header: "final_candidate_status", key: "final_candidate_status", value: (row) => row.finalCandidateStatus },
];

const aiAuditColumns: Column<AnalyticsAiAuditExportRow>[] = [
  { header: "audit_event_id", key: "audit_event_id", value: (row) => row.auditEventId },
  { header: "candidate_id", key: "candidate_id", value: (row) => row.candidateId },
  { header: "vacancy_id", key: "vacancy_id", value: (row) => row.vacancyId },
  { header: "model_version", key: "model_version", value: (row) => row.modelVersion },
  { header: "prompt_version", key: "prompt_version", value: (row) => row.promptVersion },
  { header: "score_version", key: "score_version", value: (row) => row.scoreVersion },
  { header: "score_explanation", key: "score_explanation", value: (row) => row.scoreExplanation, width: 34 },
  { header: "analysis_timestamp", key: "analysis_timestamp", value: (row) => row.analysisTimestamp },
];

export async function buildAnalyticsWorkbook(dashboard: AnalyticsDashboard): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "hiiire analytics";
  workbook.created = new Date(dashboard.generatedAt);

  addSummarySheet(workbook, dashboard);
  addTableSheet(workbook, "Vacancies", dashboard.vacancies, vacancyColumns);
  addTableSheet(workbook, "Candidates", dashboard.exportRows.candidates, candidateColumns);
  addTableSheet(workbook, "Pipeline events", dashboard.exportRows.pipelineEvents, pipelineColumns);
  addTableSheet(workbook, "Rejection reasons", dashboard.exportRows.rejectionReasons, rejectionColumns);
  if (dashboard.exportRows.slaBreaches.length > 0) {
    addTableSheet(workbook, "SLA breaches", dashboard.exportRows.slaBreaches, slaColumns);
  }
  addTableSheet(workbook, "Sources", dashboard.sources, sourceColumns);
  if (dashboard.role === "admin") {
    addTableSheet(workbook, "Recruiters", dashboard.team, teamColumns);
  }
  addTableSheet(workbook, "AI scores", dashboard.exportRows.aiScores, aiScoreColumns);
  if (dashboard.role === "admin") {
    addTableSheet(workbook, "AI audit", dashboard.exportRows.aiAudit, aiAuditColumns);
  }

  return workbook;
}

export async function buildAnalyticsXlsxBuffer(dashboard: AnalyticsDashboard): Promise<Buffer> {
  const workbook = await buildAnalyticsWorkbook(dashboard);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
