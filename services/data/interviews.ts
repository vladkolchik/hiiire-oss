import { z } from "zod";

import {
  normalizeInterviewSearch,
  parseInterviewListScope,
  parseInterviewStatusFilter,
  type InterviewListScope,
  type InterviewStatusFilter,
} from "@/lib/interviews/list-query";
import { readInterviewApiErrorMessage } from "@/lib/interviews/validation";
import type { Database } from "@/lib/supabase/database.types";
import type { Interview, InterviewListItem, InterviewPersonSummary } from "@/types";
import { mapInterviewRow } from "./mappers";

type InterviewRow = Database["public"]["Tables"]["interviews"]["Row"];

export type InterviewerOption = InterviewPersonSummary & {
  role: "admin" | "hr" | "recruiter";
};

export type InterviewMutationInput = {
  candidateId: string;
  vacancyId: string;
  scheduledAt: string;
  durationMinutes: number;
  type: Interview["type"];
  interviewerIds: string[];
  meetingUrl?: string;
  location?: string;
  notes?: string;
  allowConflicts?: boolean;
};

export type InterviewUpdateInput = InterviewMutationInput & {
  expectedUpdatedAt: string;
};

export type InterviewCancelInput = {
  cancelNote?: string;
  expectedUpdatedAt: string;
};

export type InterviewCompleteInput = {
  completionNote?: string;
  expectedUpdatedAt: string;
};

export type InterviewConflict = {
  interviewId: string;
  kind?: "interviewer" | "candidate";
  interviewerId?: string;
  interviewerName?: string;
  candidateId?: string;
  startsAt: string;
  endsAt: string;
  message: string;
};

export type InterviewListResult = {
  interviews: InterviewListItem[];
  version: string;
};

export type InterviewListPageInput = {
  scope: InterviewListScope;
  page: number;
  pageSize: number;
  status?: InterviewStatusFilter;
  search?: string;
};

export type InterviewListPageResult = {
  interviews: InterviewListItem[];
  total: number;
  hasMore: boolean;
  totalIsExact: boolean;
  scanLimitReached: boolean;
  page: number;
  pageSize: number;
};

export type InterviewChangesResult = {
  version: string;
  checkedAt: string;
};

function mapPerson(raw: any): InterviewPersonSummary {
  return {
    id: raw.id,
    name: raw.name,
    email: raw.email ?? undefined,
    avatar: raw.avatar ?? raw.avatar_url ?? undefined,
  };
}

function mapListItem(raw: any): InterviewListItem {
  const interviewers = (raw.interviewers ?? []).map(mapPerson);

  if (raw.accessLevel === "interviewer_only") {
    return {
      id: raw.id,
      accessLevel: "interviewer_only",
      scheduledAt: new Date(raw.scheduledAt),
      durationMinutes: raw.durationMinutes,
      type: raw.type,
      status: raw.status,
      displayTitle: raw.displayTitle ?? "Кандидат",
      displaySubtitle: raw.displaySubtitle ?? "Вакансия",
      meetingUrl: raw.meetingUrl ?? undefined,
      location: raw.location ?? undefined,
      interviewers,
    };
  }

  const interview = mapInterviewRow(raw as InterviewRow);
  return {
    ...interview,
    accessLevel: "manage",
    candidate: {
      id: raw.candidate?.id ?? interview.candidateId,
      name: raw.candidate?.name ?? "Кандидат",
      avatar: raw.candidate?.avatar_url ?? undefined,
      status: raw.candidate?.status ?? "new",
    },
    vacancy: {
      id: raw.vacancy?.id ?? interview.vacancyId,
      title: raw.vacancy?.title ?? "Вакансия",
    },
    displayTitle: raw.displayTitle ?? raw.candidate?.name ?? "Кандидат",
    displaySubtitle: raw.displaySubtitle ?? raw.vacancy?.title ?? "Вакансия",
    interviewers,
  };
}

export class InterviewConflictError extends Error {
  constructor(
    message: string,
    public readonly conflicts: InterviewConflict[]
  ) {
    super(message);
    this.name = "InterviewConflictError";
  }
}

export class InterviewChangedError extends Error {
  constructor(message = "Собеседование уже изменилось. Обновите календарь и попробуйте ещё раз.") {
    super(message);
    this.name = "InterviewChangedError";
  }
}

async function readJson(res: Response): Promise<unknown> {
  return res.json().catch(() => null);
}

function isConflictResponse(json: unknown): json is { conflicts: InterviewConflict[] } {
  return Boolean(json && typeof json === "object" && Array.isArray((json as { conflicts?: unknown }).conflicts));
}

function isInterviewChangedResponse(json: unknown): boolean {
  return Boolean(json && typeof json === "object" && (json as { error?: unknown }).error === "INTERVIEW_CHANGED");
}

function calendarRangeParams(input: { from?: string; to?: string }): URLSearchParams {
  const params = new URLSearchParams();
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  return params;
}

export async function listInterviewsWithVersion(input: { from?: string; to?: string }): Promise<InterviewListResult> {
  const params = calendarRangeParams(input);
  const res = await fetch(`/api/interviews?${params.toString()}`, { method: "GET", cache: "no-store" });
  const json = await readJson(res);
  if (!res.ok) throw new Error(readInterviewApiErrorMessage(json, "Не удалось загрузить собеседования"));

  const ok = z.object({ interviews: z.array(z.any()), version: z.string() }).safeParse(json);
  if (!ok.success) throw new Error("Некорректный ответ сервера");
  return { interviews: ok.data.interviews.map(mapListItem), version: ok.data.version };
}

export async function listInterviews(input: { from?: string; to?: string }): Promise<InterviewListItem[]> {
  const result = await listInterviewsWithVersion(input);
  return result.interviews;
}

export async function listInterviewsPage(input: InterviewListPageInput): Promise<InterviewListPageResult> {
  const params = new URLSearchParams();
  params.set("mode", "list");
  params.set("scope", parseInterviewListScope(input.scope));
  params.set("page", String(input.page));
  params.set("pageSize", String(input.pageSize));

  const status = parseInterviewStatusFilter(input.status);
  const search = normalizeInterviewSearch(input.search);
  if (status !== "all") params.set("status", status);
  if (search) params.set("q", search);

  const res = await fetch(`/api/interviews?${params.toString()}`, { method: "GET", cache: "no-store" });
  const json = await readJson(res);
  if (!res.ok) throw new Error(readInterviewApiErrorMessage(json, "Не удалось загрузить собеседования"));

  const ok = z
    .object({
      interviews: z.array(z.any()),
      total: z.number().int().nonnegative(),
      hasMore: z.boolean(),
      totalIsExact: z.boolean(),
      scanLimitReached: z.boolean().optional().default(false),
      page: z.number().int().positive(),
      pageSize: z.number().int().positive(),
    })
    .safeParse(json);
  if (!ok.success) throw new Error("Некорректный ответ сервера");

  return {
    interviews: ok.data.interviews.map(mapListItem),
    total: ok.data.total,
    hasMore: ok.data.hasMore,
    totalIsExact: ok.data.totalIsExact,
    scanLimitReached: ok.data.scanLimitReached,
    page: ok.data.page,
    pageSize: ok.data.pageSize,
  };
}

export async function checkInterviewChanges(input: { from?: string; to?: string }): Promise<InterviewChangesResult> {
  const params = calendarRangeParams(input);
  const res = await fetch(`/api/interviews/changes?${params.toString()}`, { method: "GET", cache: "no-store" });
  const json = await readJson(res);
  if (!res.ok) throw new Error(readInterviewApiErrorMessage(json, "Не удалось проверить изменения календаря"));

  const ok = z.object({ version: z.string(), checkedAt: z.string() }).safeParse(json);
  if (!ok.success) throw new Error("Некорректный ответ сервера");
  return ok.data;
}

export async function listInterviewers(): Promise<InterviewerOption[]> {
  const res = await fetch("/api/interviews/interviewers", { method: "GET" });
  const json = await readJson(res);
  if (!res.ok) throw new Error(readInterviewApiErrorMessage(json, "Не удалось загрузить интервьюеров"));

  const ok = z.object({ interviewers: z.array(z.any()) }).safeParse(json);
  if (!ok.success) throw new Error("Некорректный ответ сервера");
  return ok.data.interviewers.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    avatar: row.avatar ?? undefined,
    role: row.role,
  }));
}

export async function createInterview(input: InterviewMutationInput): Promise<{ interview: Interview; conflicts: InterviewConflict[] }> {
  const res = await fetch("/api/interviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await readJson(res);
  if (res.status === 409 && isConflictResponse(json)) {
    throw new InterviewConflictError(readInterviewApiErrorMessage(json, "Есть пересечение по времени"), json.conflicts);
  }
  if (!res.ok) throw new Error(readInterviewApiErrorMessage(json, "Не удалось назначить собеседование"));

  const ok = z.object({ interview: z.any(), conflicts: z.array(z.any()).default([]) }).safeParse(json);
  if (!ok.success) throw new Error("Некорректный ответ сервера");
  return { interview: mapInterviewRow(ok.data.interview as InterviewRow), conflicts: ok.data.conflicts };
}

export async function updateInterview(
  id: string,
  input: InterviewUpdateInput
): Promise<{ interview: Interview; conflicts: InterviewConflict[] }> {
  const res = await fetch(`/api/interviews/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const json = await readJson(res);
  if (res.status === 409 && isConflictResponse(json)) {
    throw new InterviewConflictError(readInterviewApiErrorMessage(json, "Есть пересечение по времени"), json.conflicts);
  }
  if (res.status === 409 && isInterviewChangedResponse(json)) {
    throw new InterviewChangedError(readInterviewApiErrorMessage(json));
  }
  if (!res.ok) throw new Error(readInterviewApiErrorMessage(json, "Не удалось обновить собеседование"));

  const ok = z.object({ interview: z.any(), conflicts: z.array(z.any()).default([]) }).safeParse(json);
  if (!ok.success) throw new Error("Некорректный ответ сервера");
  return { interview: mapInterviewRow(ok.data.interview as InterviewRow), conflicts: ok.data.conflicts };
}

export async function cancelInterview(id: string, input: InterviewCancelInput): Promise<Interview> {
  const res = await fetch(`/api/interviews/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cancelNote: input.cancelNote,
      expectedUpdatedAt: input.expectedUpdatedAt,
    }),
  });
  const json = await readJson(res);
  if (res.status === 409 && isInterviewChangedResponse(json)) {
    throw new InterviewChangedError(readInterviewApiErrorMessage(json));
  }
  if (!res.ok) throw new Error(readInterviewApiErrorMessage(json, "Не удалось отменить собеседование"));

  const ok = z.object({ interview: z.any() }).safeParse(json);
  if (!ok.success) throw new Error("Некорректный ответ сервера");
  return mapInterviewRow(ok.data.interview as InterviewRow);
}

export async function completeInterview(id: string, input: InterviewCompleteInput): Promise<Interview> {
  const res = await fetch(`/api/interviews/${encodeURIComponent(id)}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      completionNote: input.completionNote,
      expectedUpdatedAt: input.expectedUpdatedAt,
    }),
  });
  const json = await readJson(res);
  if (res.status === 409 && isInterviewChangedResponse(json)) {
    throw new InterviewChangedError(readInterviewApiErrorMessage(json));
  }
  if (!res.ok) throw new Error(readInterviewApiErrorMessage(json, "Не удалось завершить собеседование"));

  const ok = z.object({ interview: z.any() }).safeParse(json);
  if (!ok.success) throw new Error("Некорректный ответ сервера");
  return mapInterviewRow(ok.data.interview as InterviewRow);
}
