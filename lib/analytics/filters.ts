import type {
  AnalyticsCandidateStatus,
  AnalyticsFilters,
  AnalyticsPeriodMode,
  AnalyticsRole,
  AnalyticsVacancyStatus,
} from "./types.ts";

export const AI_SHORTLIST_THRESHOLD = 80 as const;

const periodModes = new Set<AnalyticsPeriodMode>([
  "period_event",
  "period_created",
  "period_closed",
  "as_of_snapshot",
]);

const vacancyStatuses = new Set<AnalyticsVacancyStatus | "all">(["all", "draft", "active", "paused", "closed"]);

const candidateStatuses = new Set<AnalyticsCandidateStatus>([
  "new",
  "reviewing",
  "security-check",
  "interview-scheduled",
  "interviewed",
  "offer",
  "hired",
  "rejected",
]);

const labels: Record<keyof AnalyticsFilters, string> = {
  periodStart: "Начало периода",
  periodEnd: "Конец периода",
  periodMode: "Режим периода",
  asOfDate: "Дата среза",
  vacancyId: "Вакансия",
  vacancyStatus: "Статус вакансии",
  ownerId: "Ответственный",
  department: "Департамент",
  location: "Город",
  source: "Источник кандидата",
  candidateStatus: "Этап кандидата",
  aiScoreMin: "AI-score от",
  aiShortlistThreshold: "Порог AI-shortlist",
  riskyOnly: "Только вакансии под риском",
  staleOnly: "Только кандидаты без движения",
  savedViewId: "Сохранённый вид",
};

type NormalizeOptions = {
  now?: Date;
  role: AnalyticsRole;
};

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDateOnly(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatDate(parsed) === value ? value : null;
}

function defaultPeriod(now: Date) {
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 30);
  return {
    periodStart: formatDate(start),
    periodEnd: formatDate(end),
    asOfDate: formatDate(end),
  };
}

function cleanId(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanText(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 120) : null;
}

function parseBoolean(value: string | null): boolean {
  return value === "true" || value === "1";
}

function parseAiScore(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) return null;
  return parsed;
}

export function isAnalyticsPeriodOrderValid(periodStart: string, periodEnd: string) {
  return (
    new Date(`${periodStart}T00:00:00.000Z`).getTime() <=
    new Date(`${periodEnd}T23:59:59.999Z`).getTime()
  );
}

export function normalizeAnalyticsFilters(params: URLSearchParams, options: NormalizeOptions): AnalyticsFilters {
  const now = options.now ?? new Date();
  const defaults = defaultPeriod(now);
  const periodStart = parseDateOnly(params.get("periodStart")) ?? defaults.periodStart;
  const periodEnd = parseDateOnly(params.get("periodEnd")) ?? defaults.periodEnd;
  const rawMode = params.get("periodMode");
  const rawVacancyStatus = params.get("vacancyStatus");
  const rawCandidateStatus = params.get("candidateStatus");

  return {
    periodStart,
    periodEnd,
    periodMode: rawMode && periodModes.has(rawMode as AnalyticsPeriodMode) ? (rawMode as AnalyticsPeriodMode) : "period_event",
    asOfDate: parseDateOnly(params.get("asOfDate")) ?? defaults.asOfDate,
    vacancyId: cleanId(params.get("vacancyId")),
    vacancyStatus:
      rawVacancyStatus && vacancyStatuses.has(rawVacancyStatus as AnalyticsVacancyStatus | "all")
        ? (rawVacancyStatus as AnalyticsVacancyStatus | "all")
        : "all",
    ownerId: options.role === "admin" ? cleanId(params.get("ownerId")) : null,
    department: cleanText(params.get("department")),
    location: cleanText(params.get("location")),
    source: cleanText(params.get("source")),
    candidateStatus:
      rawCandidateStatus && candidateStatuses.has(rawCandidateStatus as AnalyticsCandidateStatus)
        ? (rawCandidateStatus as AnalyticsCandidateStatus)
        : null,
    aiScoreMin: parseAiScore(params.get("aiScoreMin")),
    aiShortlistThreshold: AI_SHORTLIST_THRESHOLD,
    riskyOnly: parseBoolean(params.get("riskyOnly")),
    staleOnly: parseBoolean(params.get("staleOnly")),
    savedViewId: cleanId(params.get("savedViewId")),
  };
}

export function getAnalyticsFilterLabel(filter: keyof AnalyticsFilters) {
  return labels[filter];
}
