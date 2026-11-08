import { AI_SHORTLIST_THRESHOLD } from "./filters.ts";
import type {
  AnalyticsCandidate,
  AnalyticsCandidateStatus,
  AnalyticsDashboard,
  AnalyticsDataQualityState,
  AnalyticsExportRows,
  AnalyticsFunnelRow,
  AnalyticsNeedsAttentionItem,
  AnalyticsPipelineEvent,
  AnalyticsSourceRow,
  AnalyticsTeamRow,
  AnalyticsVacancy,
  AnalyticsVacancyRow,
  CalculateAnalyticsDashboardInput,
  HiringTarget,
} from "./types.ts";

const STAGE_ORDER: AnalyticsCandidateStatus[] = [
  "new",
  "reviewing",
  "security-check",
  "interview-scheduled",
  "interviewed",
  "offer",
  "hired",
  "rejected",
];

const STAGE_LABELS: Record<AnalyticsCandidateStatus, string> = {
  new: "Новый кандидат",
  reviewing: "На рассмотрении",
  "security-check": "Проверка",
  "interview-scheduled": "Собеседование назначено",
  interviewed: "Собеседование проведено",
  offer: "Оффер",
  hired: "Нанят",
  rejected: "Отказ",
};

const terminalStatuses = new Set<AnalyticsCandidateStatus>(["hired", "rejected"]);

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(start: string, end: string) {
  const startDate = toDate(start);
  const endDate = toDate(end);
  if (!startDate || !endDate) return null;
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000));
}

function hoursBetween(start: string, end: string) {
  const startDate = toDate(start);
  const endDate = toDate(end);
  if (!startDate || !endDate) return 0;
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 3_600_000));
}

function addHours(value: string, hours: number) {
  const date = toDate(value);
  if (!date) return value;
  return new Date(date.getTime() + hours * 3_600_000).toISOString();
}

function inPeriod(value: string, start: string, end: string) {
  const date = toDate(value);
  const startDate = toDate(`${start}T00:00:00.000Z`);
  const endDate = toDate(`${end}T23:59:59.999Z`);
  if (!date || !startDate || !endDate) return false;
  return date >= startDate && date <= endDate;
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(3)) : null;
}

function average(values: number[]) {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : null;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  return Number((((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2).toFixed(1));
}

function latestMovementAt(candidate: AnalyticsCandidate, events: AnalyticsPipelineEvent[]) {
  const eventDates = events
    .filter((event) => event.candidateId === candidate.id)
    .map((event) => event.occurredAt)
    .sort();
  return eventDates.at(-1) ?? candidate.updatedAt ?? candidate.createdAt;
}

function reachedStage(candidateId: string, status: AnalyticsCandidateStatus, events: AnalyticsPipelineEvent[], candidates: AnalyticsCandidate[]) {
  const candidate = candidates.find((item) => item.id === candidateId);
  if (candidate?.status === status) return true;
  return events.some((event) => event.candidateId === candidateId && (event.toStatus === status || event.fromStatus === status));
}

function reachedAtLeast(candidateId: string, status: AnalyticsCandidateStatus, events: AnalyticsPipelineEvent[], candidates: AnalyticsCandidate[]) {
  const targetIndex = STAGE_ORDER.indexOf(status);
  const candidate = candidates.find((item) => item.id === candidateId);
  if (candidate && STAGE_ORDER.indexOf(candidate.status) >= targetIndex) return true;
  return events.some((event) => {
    return (
      event.candidateId === candidateId &&
      (STAGE_ORDER.indexOf(event.toStatus) >= targetIndex ||
        (event.fromStatus ? STAGE_ORDER.indexOf(event.fromStatus) >= targetIndex : false))
    );
  });
}

function targetHasValue(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function targetScopeMatches(target: HiringTarget, vacancy: AnalyticsVacancy, scopeType: HiringTarget["scopeType"]) {
  if (target.scopeType !== scopeType) return false;
  if (scopeType === "company") return !target.scopeId;
  if (!target.scopeId) return false;

  if (scopeType === "vacancy") return target.scopeId === vacancy.id;
  if (scopeType === "department") return false;
  if (scopeType === "recruiter") return target.scopeId === vacancy.ownerId;
  return false;
}

function findScopedVacancyTarget(
  targets: HiringTarget[],
  vacancy: AnalyticsVacancy,
  hasRelevantValue: (target: HiringTarget) => boolean,
) {
  const scopePriority: HiringTarget["scopeType"][] = ["vacancy", "department", "recruiter", "company"];

  for (const scopeType of scopePriority) {
    const target = targets.find((item) => targetScopeMatches(item, vacancy, scopeType) && hasRelevantValue(item));
    if (target) return target;
  }

  return null;
}

function findCompanyTarget(targets: HiringTarget[], hasRelevantValue: (target: HiringTarget) => boolean) {
  const companyTargets = targets.filter((target) => target.scopeType === "company" && !target.scopeId && hasRelevantValue(target));
  return companyTargets.find((target) => target.metricName === "hires") ?? companyTargets[0] ?? null;
}

function rejectionReasonLabel(event: AnalyticsPipelineEvent) {
  const normalizedReason = event.rejectionReason?.trim();
  if (normalizedReason) return normalizedReason;

  return "не указана";
}

function buildVacancyRows(input: CalculateAnalyticsDashboardInput, periodEvents: AnalyticsPipelineEvent[]) {
  const generatedAt = input.generatedAt;
  const targets = input.hiringTargets ?? [];

  return input.vacancies.map<AnalyticsVacancyRow>((vacancy) => {
    const timeToFillTarget = findScopedVacancyTarget(targets, vacancy, (target) => targetHasValue(target.targetTimeToFillDays));
    const pipelineTarget = findScopedVacancyTarget(targets, vacancy, (target) => targetHasValue(target.minimumPipelineSize));
    const vacancyCandidates = input.candidates.filter((candidate) => candidate.vacancyId === vacancy.id);
    const interviews = vacancyCandidates.filter((candidate) => reachedAtLeast(candidate.id, "interviewed", periodEvents, input.candidates)).length;
    const offers = vacancyCandidates.filter((candidate) => reachedAtLeast(candidate.id, "offer", periodEvents, input.candidates)).length;
    const hires = vacancyCandidates.filter((candidate) => reachedAtLeast(candidate.id, "hired", periodEvents, input.candidates)).length;
    const daysOpen = daysBetween(vacancy.createdAt, vacancy.closedAt ?? generatedAt) ?? 0;
    const activeCandidates = vacancyCandidates.filter((candidate) => !terminalStatuses.has(candidate.status)).length;
    const highScoreStale = vacancyCandidates.some((candidate) => {
      if ((candidate.matchPercentage ?? -1) < AI_SHORTLIST_THRESHOLD || terminalStatuses.has(candidate.status)) return false;
      return hoursBetween(latestMovementAt(candidate, input.pipelineEvents), generatedAt) >= 48;
    });

    let riskStatus: AnalyticsVacancyRow["riskStatus"] = "low";
    let riskReason = "Риск не выявлен";
    let nextAction: string | null = null;

    if (vacancy.status === "active" && timeToFillTarget?.targetTimeToFillDays && daysOpen > timeToFillTarget.targetTimeToFillDays) {
      riskStatus = "high";
      riskReason = "Вакансия открыта дольше целевого срока";
      nextAction = "Проверьте воронку и добавьте кандидатов в работу";
    } else if (vacancy.status === "active" && pipelineTarget?.minimumPipelineSize && activeCandidates < pipelineTarget.minimumPipelineSize) {
      riskStatus = "medium";
      riskReason = "В активной воронке мало кандидатов";
      nextAction = "Добавьте кандидатов или расширьте источники";
    } else if (highScoreStale) {
      riskStatus = "medium";
      riskReason = "Есть кандидаты с высоким AI-score без движения";
      nextAction = "Проверьте кандидатов с высоким приоритетом";
    }

    return {
      vacancyId: vacancy.id,
      vacancyName: vacancy.title,
      department: vacancy.department ?? null,
      city: vacancy.location ?? null,
      ownerRecruiter: vacancy.ownerName ?? null,
      status: vacancy.status,
      openedAt: vacancy.createdAt,
      closedAt: vacancy.closedAt ?? null,
      daysOpen,
      candidatesTotal: vacancyCandidates.length,
      candidatesAi70Plus: vacancyCandidates.filter((candidate) => (candidate.matchPercentage ?? -1) >= 70).length,
      candidatesAi80Plus: vacancyCandidates.filter((candidate) => (candidate.matchPercentage ?? -1) >= AI_SHORTLIST_THRESHOLD).length,
      interviews,
      offers,
      hires,
      funnelConversion: ratio(hires, vacancyCandidates.length),
      riskStatus,
      riskReason,
      nextAction,
    };
  });
}

function buildFunnelRows(input: CalculateAnalyticsDashboardInput, periodEvents: AnalyticsPipelineEvent[]): AnalyticsFunnelRow[] {
  const hasHistory = periodEvents.length > 0;
  const counts = new Map<AnalyticsCandidateStatus, number>();

  if (hasHistory) {
    for (const status of STAGE_ORDER) {
      const candidateIds = new Set(periodEvents.filter((event) => event.toStatus === status).map((event) => event.candidateId));
      counts.set(status, candidateIds.size);
    }
  } else {
    for (const status of STAGE_ORDER) {
      counts.set(
        status,
        input.candidates.filter((candidate) => candidate.status === status).length,
      );
    }
  }

  return STAGE_ORDER.map((stage, index) => {
    const count = counts.get(stage) ?? 0;
    const previous = index > 0 ? (counts.get(STAGE_ORDER[index - 1]!) ?? 0) : 0;
    return {
      stage,
      label: STAGE_LABELS[stage],
      count,
      conversionFromPrevious: index === 0 ? null : ratio(count, previous),
      periodMode: hasHistory ? "period_event" : "as_of_snapshot",
    };
  });
}

function buildSources(input: CalculateAnalyticsDashboardInput, periodEvents: AnalyticsPipelineEvent[]): AnalyticsSourceRow[] {
  const grouped = new Map<string, AnalyticsCandidate[]>();
  for (const candidate of input.candidates) {
    const current = grouped.get(candidate.source) ?? [];
    current.push(candidate);
    grouped.set(candidate.source, current);
  }

  return [...grouped.entries()]
    .map(([source, sourceCandidates]) => {
      const interviewCount = sourceCandidates.filter((candidate) => reachedAtLeast(candidate.id, "interviewed", periodEvents, input.candidates)).length;
      const offerCount = sourceCandidates.filter((candidate) => reachedAtLeast(candidate.id, "offer", periodEvents, input.candidates)).length;
      const hireCount = sourceCandidates.filter((candidate) => reachedAtLeast(candidate.id, "hired", periodEvents, input.candidates)).length;
      const scores = sourceCandidates.flatMap((candidate) => (candidate.matchPercentage === null ? [] : [candidate.matchPercentage]));
      return {
        source,
        candidateCount: sourceCandidates.length,
        interviewCount,
        offerCount,
        hireCount,
        interviewConversion: ratio(interviewCount, sourceCandidates.length),
        offerConversion: ratio(offerCount, sourceCandidates.length),
        hireConversion: ratio(hireCount, sourceCandidates.length),
        averageAiScore: average(scores),
        highScoreShare: ratio(
          sourceCandidates.filter((candidate) => (candidate.matchPercentage ?? -1) >= AI_SHORTLIST_THRESHOLD).length,
          sourceCandidates.length,
        ),
      };
    })
    .sort((a, b) => b.candidateCount - a.candidateCount || a.source.localeCompare(b.source));
}

function buildTeam(input: CalculateAnalyticsDashboardInput, periodEvents: AnalyticsPipelineEvent[]): AnalyticsTeamRow[] {
  if (input.role !== "admin") return [];
  const owners = new Map<string, { name: string; vacancies: AnalyticsVacancy[]; candidates: AnalyticsCandidate[] }>();

  for (const vacancy of input.vacancies) {
    const ownerId = vacancy.ownerId ?? "unknown";
    const owner = owners.get(ownerId) ?? { name: vacancy.ownerName ?? "Не указан", vacancies: [], candidates: [] };
    owner.vacancies.push(vacancy);
    owners.set(ownerId, owner);
  }

  for (const candidate of input.candidates) {
    const vacancy = input.vacancies.find((item) => item.id === candidate.vacancyId);
    const ownerId = candidate.ownerId ?? vacancy?.ownerId ?? "unknown";
    const owner = owners.get(ownerId) ?? { name: candidate.ownerName ?? vacancy?.ownerName ?? "Не указан", vacancies: [], candidates: [] };
    owner.candidates.push(candidate);
    owners.set(ownerId, owner);
  }

  return [...owners.entries()].map(([ownerId, owner]) => ({
    ownerId,
    ownerName: owner.name,
    activeVacancies: owner.vacancies.filter((vacancy) => vacancy.status === "active").length,
    candidatesInProcess: owner.candidates.filter((candidate) => !terminalStatuses.has(candidate.status)).length,
    staleCandidates: owner.candidates.filter((candidate) => hoursBetween(latestMovementAt(candidate, input.pipelineEvents), input.generatedAt) >= 48).length,
    aiShortlistWithoutMovement: owner.candidates.filter(
      (candidate) =>
        (candidate.matchPercentage ?? -1) >= AI_SHORTLIST_THRESHOLD &&
        !terminalStatuses.has(candidate.status) &&
        hoursBetween(latestMovementAt(candidate, input.pipelineEvents), input.generatedAt) >= 48,
    ).length,
    interviews: owner.candidates.filter((candidate) => reachedAtLeast(candidate.id, "interviewed", periodEvents, input.candidates)).length,
    offers: owner.candidates.filter((candidate) => reachedAtLeast(candidate.id, "offer", periodEvents, input.candidates)).length,
    hires: owner.candidates.filter((candidate) => reachedAtLeast(candidate.id, "hired", periodEvents, input.candidates)).length,
  }));
}

function buildExportRows(input: CalculateAnalyticsDashboardInput, sources: AnalyticsSourceRow[]): AnalyticsExportRows {
  const vacancyById = new Map(input.vacancies.map((vacancy) => [vacancy.id, vacancy]));
  const totalRejections = input.pipelineEvents.filter((event) => event.toStatus === "rejected").length;
  const rejectionCounts = new Map<string, number>();
  const slaBreaches = input.candidates.flatMap((candidate) => {
    if (terminalStatuses.has(candidate.status)) return [];
    const vacancy = vacancyById.get(candidate.vacancyId);
    if (!vacancy) return [];
    const target = findScopedVacancyTarget(input.hiringTargets ?? [], vacancy, (item) => targetHasValue(item.slaFeedbackHours));
    if (!target?.slaFeedbackHours) return [];
    const lastMovementAt = latestMovementAt(candidate, input.pipelineEvents);
    const hoursSinceMovement = hoursBetween(lastMovementAt, input.generatedAt);
    if (hoursSinceMovement <= target.slaFeedbackHours) return [];

    return [
      {
        entityType: "candidate" as const,
        entityId: candidate.id,
        ruleName: "Нет движения по кандидату дольше настроенного SLA",
        breachedAt: addHours(lastMovementAt, target.slaFeedbackHours),
        hoursOverdue: hoursSinceMovement - target.slaFeedbackHours,
      },
    ];
  });

  for (const event of input.pipelineEvents.filter((item) => item.toStatus === "rejected")) {
    const reason = rejectionReasonLabel(event);
    rejectionCounts.set(reason, (rejectionCounts.get(reason) ?? 0) + 1);
  }

  return {
    candidates: input.candidates.map((candidate) => ({
      candidateId: candidate.id,
      candidateName: candidate.name,
      vacancyId: candidate.vacancyId,
      vacancyName: vacancyById.get(candidate.vacancyId)?.title ?? "",
      status: candidate.status,
      source: candidate.source,
      matchPercentage: candidate.matchPercentage,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
    })),
    pipelineEvents: input.pipelineEvents.map((event) => ({
      eventId: event.id,
      candidateId: event.candidateId,
      vacancyId: event.vacancyId,
      userId: event.actorId ?? null,
      fromStage: event.fromStatus ?? null,
      toStage: event.toStatus,
      eventType: event.eventType,
      eventDatetime: event.occurredAt,
      rejectionReason: event.toStatus === "rejected" ? rejectionReasonLabel(event) : event.rejectionReason ?? null,
    })),
    rejectionReasons: [...rejectionCounts.entries()].map(([rejectionReason, count]) => ({
      rejectionReason,
      category: null,
      count,
      share: ratio(count, totalRejections),
    })),
    slaBreaches,
    aiScores: input.candidates
      .filter((candidate) => candidate.matchPercentage !== null)
      .map((candidate) => ({
        aiAnalysisId: `candidate:${candidate.id}`,
        candidateId: candidate.id,
        vacancyId: candidate.vacancyId,
        scoreTotal: candidate.matchPercentage,
        createdAt: candidate.updatedAt,
        finalCandidateStatus: candidate.status,
      })),
    aiAudit: [],
    ...input.exportRows,
  };
}

export function calculateAnalyticsDashboard(input: CalculateAnalyticsDashboardInput): AnalyticsDashboard {
  const periodEvents = input.pipelineEvents.filter((event) => inPeriod(event.occurredAt, input.filters.periodStart, input.filters.periodEnd));
  const hireEvents = periodEvents.filter((event) => event.toStatus === "hired");
  const offerCandidateIds = new Set(
    periodEvents
      .filter((event) => event.toStatus === "offer" || event.fromStatus === "offer" || event.toStatus === "hired")
      .map((event) => event.candidateId),
  );
  const target = findCompanyTarget(input.hiringTargets ?? [], (item) => targetHasValue(item.targetHires));
  const closedVacancies = input.vacancies.filter((vacancy) => vacancy.closedAt && inPeriod(vacancy.closedAt, input.filters.periodStart, input.filters.periodEnd));
  const timeToFillValues = closedVacancies.flatMap((vacancy) => {
    const value = daysBetween(vacancy.createdAt, vacancy.closedAt ?? "");
    return value === null ? [] : [value];
  });
  const timeToHireValues = hireEvents.flatMap((event) => {
    const candidate = input.candidates.find((item) => item.id === event.candidateId);
    const value = candidate ? daysBetween(candidate.appliedAt, event.occurredAt) : null;
    return value === null ? [] : [value];
  });
  const vacancyRows = buildVacancyRows(input, periodEvents);
  const riskyVacancies = vacancyRows.filter((row) => row.riskStatus === "high" || row.riskStatus === "medium");
  const funnel = buildFunnelRows(input, periodEvents);
  const sources = buildSources(input, periodEvents);
  const analyzed = input.candidates.filter((candidate) => candidate.matchPercentage !== null).length;
  const shortlisted = input.candidates.filter((candidate) => (candidate.matchPercentage ?? -1) >= AI_SHORTLIST_THRESHOLD);
  const shortlistToInterview = shortlisted.filter((candidate) => reachedAtLeast(candidate.id, "interviewed", periodEvents, input.candidates)).length;
  const shortlistToOffer = shortlisted.filter((candidate) => reachedAtLeast(candidate.id, "offer", periodEvents, input.candidates)).length;
  const shortlistToHire = shortlisted.filter((candidate) => reachedAtLeast(candidate.id, "hired", periodEvents, input.candidates)).length;
  const highScoreNeedsAttention = shortlisted
    .filter((candidate) => !terminalStatuses.has(candidate.status))
    .map((candidate) => ({
      candidate,
      lastMovementAt: latestMovementAt(candidate, input.pipelineEvents),
    }))
    .filter(({ lastMovementAt }) => hoursBetween(lastMovementAt, input.generatedAt) >= 48)
    .map(({ candidate, lastMovementAt }) => ({
      candidateId: candidate.id,
      candidateName: candidate.name,
      vacancyId: candidate.vacancyId,
      matchPercentage: candidate.matchPercentage ?? 0,
      lastMovementAt,
      hoursWithoutMovement: hoursBetween(lastMovementAt, input.generatedAt),
    }));
  const scoreBuckets = [
    { bucket: "80-100" as const, count: input.candidates.filter((candidate) => (candidate.matchPercentage ?? -1) >= 80).length },
    { bucket: "70-79" as const, count: input.candidates.filter((candidate) => (candidate.matchPercentage ?? -1) >= 70 && (candidate.matchPercentage ?? -1) < 80).length },
    { bucket: "50-69" as const, count: input.candidates.filter((candidate) => (candidate.matchPercentage ?? -1) >= 50 && (candidate.matchPercentage ?? -1) < 70).length },
    { bucket: "0-49" as const, count: input.candidates.filter((candidate) => (candidate.matchPercentage ?? -1) >= 0 && (candidate.matchPercentage ?? -1) < 50).length },
    { bucket: "Без оценки" as const, count: input.candidates.filter((candidate) => candidate.matchPercentage === null).length },
  ];
  const team = buildTeam(input, periodEvents);
  const dataQuality: AnalyticsDataQualityState[] = [];

  if (input.candidates.length > 0 && input.pipelineEvents.length === 0) {
    dataQuality.push({
      code: "pipeline_history_missing",
      message: "Недостаточно истории переходов, чтобы посчитать время на этапах. Новые изменения статусов начнут появляться здесь автоматически.",
      periodMode: "period_event",
    });
  }

  if (input.vacancies.some((vacancy) => vacancy.status === "closed" && !vacancy.closedAt)) {
    dataQuality.push({
      code: "closed_dates_missing",
      message:
        "У части закрытых вакансий нет сохранённой даты закрытия. Time-to-fill и закрытия за период считаются только по вакансиям с надёжной датой.",
      periodMode: "period_closed",
    });
  }

  const needsAttention: AnalyticsNeedsAttentionItem[] = [
    ...riskyVacancies.map((vacancy) => ({
      type: "risky_vacancy" as const,
      severity: vacancy.riskStatus === "high" ? ("high" as const) : ("medium" as const),
      title: vacancy.vacancyName,
      reason: vacancy.riskReason,
      action: vacancy.nextAction ?? "Проверьте вакансию",
      vacancyId: vacancy.vacancyId,
    })),
    ...highScoreNeedsAttention.map((candidate) => ({
      type: "high_score_candidate" as const,
      severity: "medium" as const,
      title: candidate.candidateName,
      reason: "Кандидат с высоким AI-score давно без движения",
      action: "Проверьте следующий шаг по кандидату",
      candidateId: candidate.candidateId,
      vacancyId: candidate.vacancyId,
    })),
  ];
  const exportRows = buildExportRows(input, sources);

  return {
    role: input.role,
    generatedAt: input.generatedAt,
    filters: input.filters,
    kpis: {
      planFactHires: {
        periodMode: "period_event",
        actual: hireEvents.length,
        target: target?.targetHires ?? null,
        completion: target?.targetHires ? ratio(hireEvents.length, target.targetHires) : null,
      },
      activeVacancies: { periodMode: "as_of_snapshot", value: input.vacancies.filter((vacancy) => vacancy.status === "active").length },
      closedVacancies: { periodMode: "period_closed", value: closedVacancies.length },
      riskyVacancies: { periodMode: "as_of_snapshot", value: riskyVacancies.length },
      timeToFill: {
        periodMode: "period_closed",
        averageDays: average(timeToFillValues),
        medianDays: median(timeToFillValues),
        count: timeToFillValues.length,
      },
      timeToHire: {
        periodMode: "period_event",
        averageDays: average(timeToHireValues),
        medianDays: median(timeToHireValues),
        count: timeToHireValues.length,
      },
      funnelConversion: { periodMode: "period_event", value: ratio(hireEvents.length, input.candidates.length) },
      offerAcceptance: {
        periodMode: "period_event",
        value: ratio(hireEvents.filter((event) => offerCandidateIds.has(event.candidateId)).length, offerCandidateIds.size),
      },
      aiCoverage: { periodMode: "as_of_snapshot", analyzed, total: input.candidates.length, value: ratio(analyzed, input.candidates.length) },
    },
    needsAttention,
    funnel,
    vacancies: vacancyRows,
    sources,
    team,
    ai: {
      coverage: { analyzed, total: input.candidates.length, value: ratio(analyzed, input.candidates.length) },
      scoreBuckets,
      shortlistThreshold: AI_SHORTLIST_THRESHOLD,
      shortlistedCandidates: shortlisted.length,
      shortlistToInterview: ratio(shortlistToInterview, shortlisted.length),
      shortlistToOffer: ratio(shortlistToOffer, shortlisted.length),
      shortlistToHire: ratio(shortlistToHire, shortlisted.length),
      highScoreNeedsAttention,
    },
    dataQuality,
    exportRows,
  };
}
