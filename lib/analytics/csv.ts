import type {
  AnalyticsAiAuditExportRow,
  AnalyticsAiScoreExportRow,
  AnalyticsCandidateExportRow,
  AnalyticsCsvDataset,
  AnalyticsDashboard,
  AnalyticsPipelineEventExportRow,
  AnalyticsRejectionReasonExportRow,
  AnalyticsSlaBreachExportRow,
  AnalyticsSourceRow,
  AnalyticsTeamRow,
} from "./types.ts";

type CsvColumn<T> = {
  key: string;
  value: (row: T) => unknown;
};

export interface AnalyticsCsvResult {
  dataset: AnalyticsCsvDataset | "metadata";
  rowCount: number;
  columns: string[];
  csv: string;
  metadata: Record<string, string | number | boolean | null>;
}

const candidateColumns: CsvColumn<AnalyticsCandidateExportRow>[] = [
  { key: "candidate_id", value: (row) => row.candidateId },
  { key: "candidate_name", value: (row) => row.candidateName },
  { key: "vacancy_id", value: (row) => row.vacancyId },
  { key: "vacancy_name", value: (row) => row.vacancyName },
  { key: "status", value: (row) => row.status },
  { key: "source", value: (row) => row.source },
  { key: "match_percentage", value: (row) => row.matchPercentage },
  { key: "created_at", value: (row) => row.createdAt },
  { key: "updated_at", value: (row) => row.updatedAt },
];

const pipelineColumns: CsvColumn<AnalyticsPipelineEventExportRow>[] = [
  { key: "event_id", value: (row) => row.eventId },
  { key: "candidate_id", value: (row) => row.candidateId },
  { key: "vacancy_id", value: (row) => row.vacancyId },
  { key: "user_id", value: (row) => row.userId },
  { key: "from_stage", value: (row) => row.fromStage },
  { key: "to_stage", value: (row) => row.toStage },
  { key: "event_type", value: (row) => row.eventType },
  { key: "event_datetime", value: (row) => row.eventDatetime },
  { key: "rejection_reason", value: (row) => row.rejectionReason },
];

const rejectionReasonColumns: CsvColumn<AnalyticsRejectionReasonExportRow>[] = [
  { key: "rejection_reason", value: (row) => row.rejectionReason },
  { key: "category", value: (row) => row.category },
  { key: "count", value: (row) => row.count },
  { key: "share", value: (row) => row.share },
];

const sourceColumns: CsvColumn<AnalyticsSourceRow>[] = [
  { key: "source", value: (row) => row.source },
  { key: "candidate_count", value: (row) => row.candidateCount },
  { key: "interview_count", value: (row) => row.interviewCount },
  { key: "offer_count", value: (row) => row.offerCount },
  { key: "hire_count", value: (row) => row.hireCount },
  { key: "interview_conversion", value: (row) => row.interviewConversion },
  { key: "offer_conversion", value: (row) => row.offerConversion },
  { key: "hire_conversion", value: (row) => row.hireConversion },
  { key: "average_ai_score", value: (row) => row.averageAiScore },
  { key: "high_score_share", value: (row) => row.highScoreShare },
];

const aiScoreColumns: CsvColumn<AnalyticsAiScoreExportRow>[] = [
  { key: "ai_analysis_id", value: (row) => row.aiAnalysisId },
  { key: "candidate_id", value: (row) => row.candidateId },
  { key: "vacancy_id", value: (row) => row.vacancyId },
  { key: "score_total", value: (row) => row.scoreTotal },
  { key: "score_breakdown", value: (row) => row.scoreBreakdown },
  { key: "model_version", value: (row) => row.modelVersion },
  { key: "prompt_version", value: (row) => row.promptVersion },
  { key: "created_at", value: (row) => row.createdAt },
  { key: "final_candidate_status", value: (row) => row.finalCandidateStatus },
];

const slaColumns: CsvColumn<AnalyticsSlaBreachExportRow>[] = [
  { key: "entity_type", value: (row) => row.entityType },
  { key: "entity_id", value: (row) => row.entityId },
  { key: "rule_name", value: (row) => row.ruleName },
  { key: "breached_at", value: (row) => row.breachedAt },
  { key: "hours_overdue", value: (row) => row.hoursOverdue },
];

const teamColumns: CsvColumn<AnalyticsTeamRow>[] = [
  { key: "user_id", value: (row) => row.ownerId },
  { key: "name", value: (row) => row.ownerName },
  { key: "active_vacancies", value: (row) => row.activeVacancies },
  { key: "candidates_in_process", value: (row) => row.candidatesInProcess },
  { key: "stale_candidates", value: (row) => row.staleCandidates },
  { key: "ai_shortlist_without_movement", value: (row) => row.aiShortlistWithoutMovement },
  { key: "interviews", value: (row) => row.interviews },
  { key: "offers", value: (row) => row.offers },
  { key: "hires", value: (row) => row.hires },
];

const aiAuditColumns: CsvColumn<AnalyticsAiAuditExportRow>[] = [
  { key: "audit_event_id", value: (row) => row.auditEventId },
  { key: "candidate_id", value: (row) => row.candidateId },
  { key: "vacancy_id", value: (row) => row.vacancyId },
  { key: "model_version", value: (row) => row.modelVersion },
  { key: "prompt_version", value: (row) => row.promptVersion },
  { key: "score_version", value: (row) => row.scoreVersion },
  { key: "score_explanation", value: (row) => row.scoreExplanation },
  { key: "analysis_timestamp", value: (row) => row.analysisTimestamp },
];

function exportMetadata(dashboard: AnalyticsDashboard, datasets?: string[]): Record<string, string | number | boolean | null> {
  return {
    generated_at: dashboard.generatedAt,
    role: dashboard.role,
    period_start: dashboard.filters.periodStart,
    period_end: dashboard.filters.periodEnd,
    period_mode: dashboard.filters.periodMode,
    as_of_date: dashboard.filters.asOfDate,
    ai_shortlist_threshold: dashboard.filters.aiShortlistThreshold,
    datasets: datasets?.join("|") ?? null,
  };
}

function escapeFormulaInjection(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function serializeCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "string" ? escapeFormulaInjection(value) : String(value);
  if (/[",\r\n]/.test(raw)) return `"${raw.replaceAll('"', '""')}"`;
  return raw;
}

function serializeRows<T>(rows: T[], columns: CsvColumn<T>[]) {
  const header = columns.map((column) => column.key).join(",");
  const body = rows.map((row) => columns.map((column) => serializeCell(column.value(row))).join(","));
  return [header, ...body].join("\n");
}

export function listAvailableCsvDatasets(dashboard: AnalyticsDashboard): AnalyticsCsvDataset[] {
  const datasets: AnalyticsCsvDataset[] = ["candidates", "pipeline-events", "rejection-reasons", "sources", "ai-scores"];

  if (dashboard.exportRows.slaBreaches.length > 0) datasets.push("sla-breaches");
  if (dashboard.role === "admin") {
    datasets.push("recruiters");
    datasets.push("ai-audit");
  }

  return datasets;
}

export function buildAnalyticsCsvDataset(dashboard: AnalyticsDashboard, dataset: AnalyticsCsvDataset): AnalyticsCsvResult {
  if (dataset === "recruiters" && dashboard.role !== "admin") {
    throw new Error("Recruiters dataset is available only for admin analytics exports.");
  }
  if (dataset === "ai-audit" && dashboard.role !== "admin") {
    throw new Error("AI audit dataset is available only for admin analytics exports.");
  }
  if (dataset === "sla-breaches" && dashboard.exportRows.slaBreaches.length === 0) {
    throw new Error("SLA breaches dataset is available only when configured breach rows exist.");
  }

  const table =
    dataset === "candidates"
      ? { rows: dashboard.exportRows.candidates, columns: candidateColumns }
      : dataset === "pipeline-events"
        ? { rows: dashboard.exportRows.pipelineEvents, columns: pipelineColumns }
        : dataset === "rejection-reasons"
          ? { rows: dashboard.exportRows.rejectionReasons, columns: rejectionReasonColumns }
          : dataset === "sources"
            ? { rows: dashboard.sources, columns: sourceColumns }
            : dataset === "ai-scores"
              ? { rows: dashboard.exportRows.aiScores, columns: aiScoreColumns }
              : dataset === "sla-breaches"
                ? { rows: dashboard.exportRows.slaBreaches, columns: slaColumns }
                : dataset === "recruiters"
                  ? { rows: dashboard.team, columns: teamColumns }
                  : { rows: dashboard.exportRows.aiAudit, columns: aiAuditColumns };

  return {
    dataset,
    rowCount: table.rows.length,
    columns: table.columns.map((column) => column.key),
    csv: serializeRows(table.rows as never[], table.columns as CsvColumn<never>[]),
    metadata: exportMetadata(dashboard, [dataset]),
  };
}

export function buildAnalyticsCsvMetadataDataset(dashboard: AnalyticsDashboard, datasets: AnalyticsCsvDataset[]): AnalyticsCsvResult {
  const metadata = exportMetadata(dashboard, datasets);
  const rows = Object.entries(metadata).map(([key, value]) => ({ key, value }));
  const columns: CsvColumn<{ key: string; value: string | number | boolean | null }>[] = [
    { key: "key", value: (row) => row.key },
    { key: "value", value: (row) => row.value },
  ];

  return {
    dataset: "metadata",
    rowCount: rows.length,
    columns: columns.map((column) => column.key),
    csv: serializeRows(rows, columns),
    metadata,
  };
}
