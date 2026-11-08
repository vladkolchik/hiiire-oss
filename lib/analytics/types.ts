export type AnalyticsRole = "admin" | "hr" | "recruiter";

export type AnalyticsPeriodMode = "period_event" | "period_created" | "period_closed" | "as_of_snapshot";

export type AnalyticsVacancyStatus = "draft" | "active" | "paused" | "closed";

export type AnalyticsCandidateStatus =
  | "new"
  | "reviewing"
  | "security-check"
  | "interview-scheduled"
  | "interviewed"
  | "offer"
  | "hired"
  | "rejected";

export type AnalyticsCandidateSource = "hh.ru" | "manual" | "referral" | "other" | string;

export type AnalyticsPipelineEventType =
  | "candidate_created"
  | "status_changed"
  | "backfill_initial"
  | "candidate_imported"
  | "offer_declined"
  | "offer_accepted"
  | string;

export interface AnalyticsFilters {
  periodStart: string;
  periodEnd: string;
  periodMode: AnalyticsPeriodMode;
  asOfDate: string;
  vacancyId: string | null;
  vacancyStatus: AnalyticsVacancyStatus | "all";
  ownerId: string | null;
  department: string | null;
  location: string | null;
  source: string | null;
  candidateStatus: AnalyticsCandidateStatus | null;
  aiScoreMin: number | null;
  aiShortlistThreshold: 80;
  riskyOnly: boolean;
  staleOnly: boolean;
  savedViewId: string | null;
}

export interface AnalyticsVacancy {
  id: string;
  title: string;
  status: AnalyticsVacancyStatus;
  createdAt: string;
  updatedAt?: string | null;
  closedAt?: string | null;
  deadlineAt?: string | null;
  department?: string | null;
  location?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
}

export interface AnalyticsCandidate {
  id: string;
  name: string;
  vacancyId: string;
  status: AnalyticsCandidateStatus;
  source: AnalyticsCandidateSource;
  matchPercentage: number | null;
  appliedAt: string;
  createdAt: string;
  updatedAt: string;
  ownerId?: string | null;
  ownerName?: string | null;
}

export interface AnalyticsPipelineEvent {
  id: string;
  candidateId: string;
  vacancyId: string;
  actorId?: string | null;
  fromStatus?: AnalyticsCandidateStatus | null;
  toStatus: AnalyticsCandidateStatus;
  eventType: AnalyticsPipelineEventType;
  occurredAt: string;
  rejectionReasonId?: string | null;
  rejectionReason?: string | null;
  rejectionComment?: string | null;
}

export type HiringTargetScopeType = "company" | "department" | "vacancy" | "recruiter";

export interface HiringTarget {
  id: string;
  scopeType: HiringTargetScopeType;
  scopeId?: string | null;
  metricName: string;
  targetHires?: number | null;
  targetTimeToFillDays?: number | null;
  targetTimeToHireDays?: number | null;
  slaFeedbackHours?: number | null;
  minimumPipelineSize?: number | null;
  periodStart: string;
  periodEnd: string;
}

export interface AnalyticsDataQualityState {
  code: "pipeline_history_missing" | "closed_dates_missing" | "not_enough_data" | string;
  message: string;
  periodMode?: AnalyticsPeriodMode;
}

export interface AnalyticsKpis {
  planFactHires: { periodMode: "period_event"; actual: number; target: number | null; completion: number | null };
  activeVacancies: { periodMode: "as_of_snapshot"; value: number };
  closedVacancies: { periodMode: "period_closed"; value: number };
  riskyVacancies: { periodMode: "as_of_snapshot"; value: number };
  timeToFill: { periodMode: "period_closed"; averageDays: number | null; medianDays: number | null; count: number };
  timeToHire: { periodMode: "period_event"; averageDays: number | null; medianDays: number | null; count: number };
  funnelConversion: { periodMode: "period_event"; value: number | null };
  offerAcceptance: { periodMode: "period_event"; value: number | null };
  aiCoverage: { periodMode: "as_of_snapshot"; analyzed: number; total: number; value: number | null };
}

export interface AnalyticsFunnelRow {
  stage: AnalyticsCandidateStatus;
  label: string;
  count: number;
  conversionFromPrevious: number | null;
  periodMode: AnalyticsPeriodMode;
}

export interface AnalyticsVacancyRow {
  vacancyId: string;
  vacancyName: string;
  department?: string | null;
  city?: string | null;
  ownerHr?: string | null;
  ownerRecruiter?: string | null;
  status: AnalyticsVacancyStatus;
  openedAt: string;
  closedAt?: string | null;
  daysOpen: number;
  candidatesTotal: number;
  candidatesAi70Plus: number;
  candidatesAi80Plus: number;
  interviews: number;
  offers: number;
  hires: number;
  funnelConversion?: number | null;
  riskStatus: "low" | "medium" | "high";
  riskReason: string;
  nextAction?: string | null;
}

export interface AnalyticsSourceRow {
  source: string;
  candidateCount: number;
  interviewCount: number;
  offerCount: number;
  hireCount: number;
  interviewConversion: number | null;
  offerConversion: number | null;
  hireConversion: number | null;
  averageAiScore: number | null;
  highScoreShare: number | null;
}

export interface AnalyticsTeamRow {
  ownerId: string;
  ownerName: string;
  activeVacancies: number;
  candidatesInProcess: number;
  staleCandidates: number;
  aiShortlistWithoutMovement: number;
  interviews: number;
  offers: number;
  hires: number;
}

export interface AnalyticsAiScoreBucket {
  bucket: "Без оценки" | "0-49" | "50-69" | "70-79" | "80-100";
  count: number;
}

export interface AnalyticsNeedsAttentionItem {
  type: "risky_vacancy" | "stale_candidate" | "high_score_candidate" | "weak_source" | "team_load";
  severity: "medium" | "high";
  title: string;
  reason: string;
  action: string;
  vacancyId?: string;
  candidateId?: string;
  ownerId?: string;
}

export interface AnalyticsAiSummary {
  coverage: { analyzed: number; total: number; value: number | null };
  scoreBuckets: AnalyticsAiScoreBucket[];
  shortlistThreshold: 80;
  shortlistedCandidates: number;
  shortlistToInterview: number | null;
  shortlistToOffer: number | null;
  shortlistToHire: number | null;
  highScoreNeedsAttention: Array<{
    candidateId: string;
    candidateName: string;
    vacancyId: string;
    matchPercentage: number;
    lastMovementAt: string;
    hoursWithoutMovement: number;
  }>;
}

export interface AnalyticsCandidateExportRow {
  candidateId: string;
  candidateName: string;
  vacancyId: string;
  vacancyName: string;
  status: string;
  source: string;
  matchPercentage: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsPipelineEventExportRow {
  eventId: string;
  candidateId: string;
  vacancyId: string;
  userId?: string | null;
  fromStage?: string | null;
  toStage: string;
  eventType: string;
  eventDatetime: string;
  rejectionReason?: string | null;
}

export interface AnalyticsRejectionReasonExportRow {
  rejectionReason: string;
  category?: string | null;
  count: number;
  share: number | null;
}

export interface AnalyticsSlaBreachExportRow {
  entityType: "candidate" | "vacancy" | string;
  entityId: string;
  ruleName: string;
  breachedAt: string;
  hoursOverdue: number;
}

export interface AnalyticsAiScoreExportRow {
  aiAnalysisId: string;
  candidateId: string;
  vacancyId: string;
  scoreTotal: number | null;
  scoreBreakdown?: string | null;
  modelVersion?: string | null;
  promptVersion?: string | null;
  createdAt: string;
  finalCandidateStatus?: string | null;
}

export interface AnalyticsAiAuditExportRow {
  auditEventId: string;
  candidateId: string;
  vacancyId: string;
  modelVersion?: string | null;
  promptVersion?: string | null;
  scoreVersion?: string | null;
  scoreExplanation?: string | null;
  analysisTimestamp: string;
}

export interface AnalyticsExportRows {
  candidates: AnalyticsCandidateExportRow[];
  pipelineEvents: AnalyticsPipelineEventExportRow[];
  rejectionReasons: AnalyticsRejectionReasonExportRow[];
  slaBreaches: AnalyticsSlaBreachExportRow[];
  aiScores: AnalyticsAiScoreExportRow[];
  aiAudit: AnalyticsAiAuditExportRow[];
}

export interface AnalyticsDashboard {
  role: AnalyticsRole;
  generatedAt: string;
  filters: AnalyticsFilters;
  kpis: AnalyticsKpis;
  needsAttention: AnalyticsNeedsAttentionItem[];
  funnel: AnalyticsFunnelRow[];
  vacancies: AnalyticsVacancyRow[];
  sources: AnalyticsSourceRow[];
  team: AnalyticsTeamRow[];
  ai: AnalyticsAiSummary;
  dataQuality: AnalyticsDataQualityState[];
  exportRows: AnalyticsExportRows;
}

export interface CalculateAnalyticsDashboardInput {
  role: AnalyticsRole;
  generatedAt: string;
  filters: AnalyticsFilters;
  vacancies: AnalyticsVacancy[];
  candidates: AnalyticsCandidate[];
  pipelineEvents: AnalyticsPipelineEvent[];
  hiringTargets?: HiringTarget[];
  exportRows?: Partial<AnalyticsExportRows>;
}

export type AnalyticsCsvDataset =
  | "candidates"
  | "pipeline-events"
  | "rejection-reasons"
  | "sources"
  | "ai-scores"
  | "sla-breaches"
  | "recruiters"
  | "ai-audit";
