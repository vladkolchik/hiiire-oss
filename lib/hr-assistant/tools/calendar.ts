import "server-only";

import type { CompanyContext } from "@/lib/access/company-guards";
import { buildCandidateCardHref, buildVacancyCardHref } from "@/lib/dashboard/deep-links";
import { INTERVIEW_STATUS_LABELS, formatInterviewStatusLabel } from "@/lib/interviews/status-labels";
import { INTERVIEW_TYPE_LABELS, formatInterviewTypeLabel } from "@/lib/interviews/type-labels";
import { requireInterviewReadAccess } from "@/lib/interviews/access";
import { getInterviewRangeQueryWindow, interviewOverlapsRange } from "@/lib/interviews/range";

import {
  clampToolLimit,
  createCursor,
  decodeCursor,
  filtersHash,
  toHrAssistantScope,
  toolFailure,
  toolListSuccess,
} from "../tool-contracts";

const ASSISTANT_INTERVIEW_LIST_DEFAULT_LIMIT = 20;
const ASSISTANT_INTERVIEW_LIST_MAX_LIMIT = 100;

type AssistantInterviewRow = {
  id: string;
  company_id: string;
  candidate_id: string;
  vacancy_id: string;
  scheduled_at: string;
  duration_minutes: number;
  type: string;
  status: "scheduled" | "completed" | "cancelled";
  interviewer_ids: string[] | null;
  meeting_url: string | null;
  location: string | null;
  created_by: string;
  updated_at: string;
};

type ListAccessibleInterviewsInput = {
  fromIso: string;
  toIso: string;
  limit?: number;
  cursor?: string | null;
};

function buildInterviewAppliedFilterLabels(input: { fromIso: string; toIso: string }) {
  return {
    fromIso: "Начало периода",
    toIso: "Конец периода",
  };
}

type AccessibleAssistantInterview =
  | {
      id: string;
      accessLevel: "interviewer_only";
      scheduledAt: string;
      durationMinutes: number;
      type: string;
      typeLabel: string;
      status: AssistantInterviewRow["status"];
      statusLabel: string;
      candidateId?: string;
      vacancyId?: string;
      meetingUrl?: string | null;
      location?: string | null;
    }
  | {
      id: string;
      accessLevel: "manage";
      candidateId: string;
      vacancyId: string;
      scheduledAt: string;
      durationMinutes: number;
      type: string;
      typeLabel: string;
      status: AssistantInterviewRow["status"];
      statusLabel: string;
      interviewerIds: string[];
      meetingUrl?: string | null;
      location?: string | null;
      createdById: string;
      updatedAt: string;
    };

type CandidateDisplayRow = {
  id: string;
  name: string | null;
};

type VacancyDisplayRow = {
  id: string;
  title: string | null;
};

type InterviewerDisplayRow = {
  id: string;
  name: string | null;
  email: string | null;
};

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0)));
}

function toInterviewer(row: InterviewerDisplayRow) {
  return {
    id: row.id,
    name: row.name ?? "Интервьюер",
    email: row.email ?? null,
  };
}

async function enrichInterviewDisplayData(admin: any, accessible: AccessibleAssistantInterview[]) {
  const displayInterviews = accessible.filter((interview): interview is AccessibleAssistantInterview & { candidateId: string; vacancyId: string } => {
    return "candidateId" in interview && "vacancyId" in interview;
  });
  const manageInterviews = accessible.filter((interview): interview is Extract<AccessibleAssistantInterview, { accessLevel: "manage" }> => {
    return interview.accessLevel === "manage";
  });

  if (displayInterviews.length === 0) return { ok: true as const, items: accessible };

  const candidateIds = uniqueStrings(displayInterviews.map((interview) => interview.candidateId));
  const vacancyIds = uniqueStrings(displayInterviews.map((interview) => interview.vacancyId));
  const interviewerIds = uniqueStrings(manageInterviews.flatMap((interview) => interview.interviewerIds));

  const [{ data: candidates, error: candidatesError }, { data: vacancies, error: vacanciesError }, { data: profiles, error: profilesError }] =
    await Promise.all([
      candidateIds.length ? admin.from("candidates").select("id,name").in("id", candidateIds) : Promise.resolve({ data: [], error: null }),
      vacancyIds.length ? admin.from("vacancies").select("id,title").in("id", vacancyIds) : Promise.resolve({ data: [], error: null }),
      interviewerIds.length ? admin.from("profiles").select("id,name,email").in("id", interviewerIds) : Promise.resolve({ data: [], error: null }),
    ]);

  if (candidatesError || vacanciesError || profilesError) return { ok: false as const };

  const candidatesById = new Map(((candidates ?? []) as CandidateDisplayRow[]).map((candidate) => [candidate.id, candidate]));
  const vacanciesById = new Map(((vacancies ?? []) as VacancyDisplayRow[]).map((vacancy) => [vacancy.id, vacancy]));
  const profilesById = new Map(((profiles ?? []) as InterviewerDisplayRow[]).map((profile) => [profile.id, profile]));

  return {
    ok: true as const,
    items: accessible.map((interview) => {
      const candidate = candidatesById.get(interview.candidateId ?? "");
      const vacancy = vacanciesById.get(interview.vacancyId ?? "");

      if (interview.accessLevel === "interviewer_only") {
        const { candidateId: _candidateId, vacancyId: _vacancyId, ...safeInterview } = interview;
        return {
          ...safeInterview,
          candidateName: candidate?.name ?? "Кандидат",
          vacancyTitle: vacancy?.title ?? "Вакансия",
          displayTitle: candidate?.name ?? "Кандидат",
          displaySubtitle: vacancy?.title ?? "Вакансия",
        };
      }

      const interviewers = interview.interviewerIds
        .map((id) => profilesById.get(id))
        .filter((profile): profile is InterviewerDisplayRow => Boolean(profile))
        .map(toInterviewer);

      return {
        ...interview,
        candidateName: candidate?.name ?? "Кандидат",
        vacancyTitle: vacancy?.title ?? "Вакансия",
        interviewerNames: interviewers.map((person) => person.name),
        interviewers,
        candidateHref: buildCandidateCardHref(interview.candidateId),
        vacancyHref: buildVacancyCardHref(interview.vacancyId),
        displayTitle: candidate?.name ?? "Кандидат",
        displaySubtitle: vacancy?.title ?? "Вакансия",
      };
    }),
  };
}

function applyInterviewCursor(query: any, input: { cursor: string | null | undefined; filtersHash: string }) {
  if (!input.cursor) return { ok: true as const, query };

  try {
    const cursor = decodeCursor(input.cursor);
    if (cursor.entity !== "interviews" || cursor.filtersHash !== input.filtersHash) {
      return { ok: false as const, reason: "changed" };
    }

    const lastScheduledAt = cursor.last.scheduledAt ? String(cursor.last.scheduledAt) : "";
    const lastId = cursor.last.id ? String(cursor.last.id) : "";
    if (!lastScheduledAt || !lastId) return { ok: false as const, reason: "invalid" };

    return { ok: true as const, query: query.or(`scheduled_at.gt.${lastScheduledAt},and(scheduled_at.eq.${lastScheduledAt},id.gt.${lastId})`) };
  } catch {
    return { ok: false as const, reason: "invalid" };
  }
}

export async function listAccessibleInterviewsForAssistant(admin: any, ctx: CompanyContext, input: ListAccessibleInterviewsInput) {
  const limit = clampToolLimit(input.limit, {
    defaultLimit: ASSISTANT_INTERVIEW_LIST_DEFAULT_LIMIT,
    maxLimit: ASSISTANT_INTERVIEW_LIST_MAX_LIMIT,
  });
  const batchSize = Math.min(200, Math.max(limit * 4, 50));
  const sort = { key: "scheduled_at", direction: "asc" as const };
  const appliedFilters = { fromIso: input.fromIso, toIso: input.toIso };
  const currentFiltersHash = filtersHash(appliedFilters, sort);
  const window = getInterviewRangeQueryWindow({ from: input.fromIso, to: input.toIso });
  const accessible: AccessibleAssistantInterview[] = [];
  let scannedCount = 0;
  let lastSeen: { scheduledAt: string; id: string } | null = null;
  let hasMore = false;

  let baseQuery = admin
    .from("interviews")
    .select("id,company_id,candidate_id,vacancy_id,scheduled_at,duration_minutes,type,status,interviewer_ids,meeting_url,location,created_by,updated_at")
    .eq("company_id", ctx.companyId)
    .gte("scheduled_at", window.queryFrom)
    .lt("scheduled_at", window.queryTo);

  const cursorResult = applyInterviewCursor(baseQuery, { cursor: input.cursor, filtersHash: currentFiltersHash });
  if (!cursorResult.ok) {
    return toolFailure(
      "invalid_input",
      cursorResult.reason === "changed" ? "Обновите список собеседований: параметры страницы изменились." : "Обновите список собеседований: страница устарела.",
      false
    );
  }
  baseQuery = cursorResult.query;

  while (accessible.length < limit) {
    const { data, error } = await baseQuery.order("scheduled_at", { ascending: true }).order("id", { ascending: true }).limit(batchSize);

    if (error) {
      return toolFailure("temporary_failure", "Не удалось загрузить собеседования. Попробуйте еще раз.", true);
    }

    const rows = (data ?? []) as AssistantInterviewRow[];
    if (rows.length === 0) break;

    let stoppedInsideBatch = false;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      scannedCount += 1;
      lastSeen = { scheduledAt: row.scheduled_at, id: row.id };

      if (
        !interviewOverlapsRange({
          scheduledAt: row.scheduled_at,
          durationMinutes: row.duration_minutes,
          from: input.fromIso,
          to: input.toIso,
        })
      ) {
        continue;
      }

      const level = await requireInterviewReadAccess(admin, ctx, {
        id: row.id,
        companyId: row.company_id,
        candidateId: row.candidate_id,
        vacancyId: row.vacancy_id,
        status: row.status,
        interviewerIds: row.interviewer_ids ?? [],
        createdById: row.created_by,
        updatedAt: row.updated_at,
      });

      if (level === "interviewer_only") {
        accessible.push({
          id: row.id,
          accessLevel: "interviewer_only",
          scheduledAt: row.scheduled_at,
          durationMinutes: row.duration_minutes,
          type: row.type,
          typeLabel: formatInterviewTypeLabel(row.type),
          status: row.status,
          statusLabel: formatInterviewStatusLabel(row.status),
          candidateId: row.candidate_id,
          vacancyId: row.vacancy_id,
          meetingUrl: row.meeting_url,
          location: row.location,
        });
      } else if (level === "manage") {
        accessible.push({
          id: row.id,
          accessLevel: "manage",
          candidateId: row.candidate_id,
          vacancyId: row.vacancy_id,
          scheduledAt: row.scheduled_at,
          durationMinutes: row.duration_minutes,
          type: row.type,
          typeLabel: formatInterviewTypeLabel(row.type),
          status: row.status,
          statusLabel: formatInterviewStatusLabel(row.status),
          interviewerIds: row.interviewer_ids ?? [],
          meetingUrl: row.meeting_url,
          location: row.location,
          createdById: row.created_by,
          updatedAt: row.updated_at,
        });
      }

      if (accessible.length >= limit) {
        stoppedInsideBatch = index < rows.length - 1;
        break;
      }
    }

    hasMore = stoppedInsideBatch || rows.length === batchSize;
    if (!hasMore || accessible.length >= limit || !lastSeen) break;

    baseQuery = admin
      .from("interviews")
      .select("id,company_id,candidate_id,vacancy_id,scheduled_at,duration_minutes,type,status,interviewer_ids,meeting_url,location,created_by,updated_at")
      .eq("company_id", ctx.companyId)
      .gte("scheduled_at", window.queryFrom)
      .lt("scheduled_at", window.queryTo)
      .or(`scheduled_at.gt.${lastSeen.scheduledAt},and(scheduled_at.eq.${lastSeen.scheduledAt},id.gt.${lastSeen.id})`);
  }

  const nextCursor =
    hasMore && lastSeen
      ? createCursor({
          entity: "interviews",
          filtersHash: currentFiltersHash,
          sort,
          last: { scheduledAt: lastSeen.scheduledAt, id: lastSeen.id },
        })
      : null;

  const displayDataResult = await enrichInterviewDisplayData(admin, accessible);
  if (!displayDataResult.ok) {
    return toolFailure("temporary_failure", "Не удалось загрузить данные собеседований. Попробуйте еще раз.", true);
  }

  const appliedFilterLabels = buildInterviewAppliedFilterLabels(appliedFilters);
  const sortLabel = "Дата собеседования: ближайшие сверху";
  const scopeLabel = "Все доступные собеседования";

  return toolListSuccess({
    toolRunId: "",
    items: displayDataResult.items,
    pageInfo: { limit, nextCursor, hasMore, total: null, totalExact: false, scannedCount },
    appliedFilters,
    appliedFilterLabels: appliedFilterLabels,
    sort,
    sortLabel: sortLabel,
    scope: toHrAssistantScope(ctx, { scopeType: "workspace", scopeId: null }),
    scopeLabel: scopeLabel,
    aggregations: { statusLabels: INTERVIEW_STATUS_LABELS, typeLabels: INTERVIEW_TYPE_LABELS },
  });
}

export function buildInterviewPrepPrompt(input: { candidateName?: string; vacancyTitle?: string }) {
  return [
    "Подготовь план интервью для рекрутера.",
    input.candidateName ? `Кандидат: ${input.candidateName}` : null,
    input.vacancyTitle ? `Вакансия: ${input.vacancyTitle}` : null,
    "Не создавай и не переноси встречу. Если нужен календарный шаг, предложи его как действие для подтверждения.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}
