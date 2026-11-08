import type { Candidate } from "@/types";
import type { Database } from "@/lib/supabase/database.types";
import { mapCandidateRow } from "./mappers";
import { z } from "zod";
import { mapCreateCandidateError, mapCreateCandidateInvalidBodyError } from "./candidate-errors";
import { readUserFacingApiErrorMessage } from "@/lib/api/user-facing-errors";
import type { CandidateJobSummary } from "./jobs";

const retryCandidateAnalysisInFlight = new Map<string, Promise<{ jobId: string }>>();

export type CandidatesScoreFilter = "all" | "high" | "medium" | "low" | "unscored";
export type CandidatesSort = "date_desc" | "date_asc" | "score_desc" | "score_asc";
export type CandidatesDateSort = "date_desc" | "date_asc";

export type BulkJobsRequest =
  | {
      mode: "ids";
      candidateIds: string[];
      limit?: number;
    }
  | {
      mode: "scope";
      filters: {
        vacancyId: "all" | string;
        scoreFilter: "unscored";
        statusFilter?: Candidate["status"] | "all";
        sort?: CandidatesDateSort;
        nameQuery?: string;
      };
      limit: number;
    };

export type BulkJobsResponse = {
  requested: number;
  selectedInScope: number;
  effectiveLimit: number;
  creditsAvailable: number;
  started: number;
  skipped: number;
  failed: number;
  clampedByCredits: boolean;
  message?: string;
};

export type ListCandidatesPageInput = {
  page: number;
  pageSize: number;
  vacancyId?: string | "all";
  scoreFilter?: CandidatesScoreFilter;
  source?: Candidate["source"] | null;
  status?: Candidate["status"] | null;
  eventStatus?: Candidate["status"] | null;
  eventPeriodStart?: string | null;
  eventPeriodEnd?: string | null;
  aiScoreMin?: number | null;
  aiScoreMax?: number | null;
  sort?: CandidatesSort;
  nameQuery?: string;
};

export type ListCandidatesPageResult = {
  items: Candidate[];
  total: number;
};

export type CandidateDetailsByIdResult = {
  candidate: Candidate | null;
  latestJob: CandidateJobSummary | null;
};

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, Math.trunc(v)));
}

type CandidateRow = Database["public"]["Tables"]["candidates"]["Row"];
type AiAnalysisRow = Database["public"]["Tables"]["ai_analyses"]["Row"];
type CandidateContactRow = Database["public"]["Tables"]["candidate_contacts"]["Row"];

function appendNullableParam(params: URLSearchParams, key: string, value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return;
  params.set(key, String(value));
}

function readCandidateListRows(json: unknown, fallback: string): {
  rows: CandidateRow[];
  analyses: AiAnalysisRow[];
  contacts: CandidateContactRow[];
  total: number;
} {
  const ok = z
    .object({
      items: z.array(z.any()),
      analyses: z.array(z.any()),
      contacts: z.array(z.any()),
      total: z.number(),
    })
    .safeParse(json);
  if (!ok.success) throw new Error(fallback);

  return {
    rows: ok.data.items as CandidateRow[],
    analyses: ok.data.analyses as AiAnalysisRow[],
    contacts: ok.data.contacts as CandidateContactRow[],
    total: ok.data.total,
  };
}

function mapCandidateListRows(rows: CandidateRow[], analyses: AiAnalysisRow[], contacts: CandidateContactRow[]): Candidate[] {
  const byCandidateId = new Map<string, AiAnalysisRow>();
  for (const analysis of analyses) {
    if (!byCandidateId.has(analysis.candidate_id)) byCandidateId.set(analysis.candidate_id, analysis);
  }

  const contactsByCandidateId = new Map<string, CandidateContactRow[]>();
  for (const contact of contacts) {
    const arr = contactsByCandidateId.get(contact.candidate_id) ?? [];
    arr.push(contact);
    contactsByCandidateId.set(contact.candidate_id, arr);
  }
  for (const arr of contactsByCandidateId.values()) {
    arr.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  }

  return rows.map((row) => mapCandidateRow(row, byCandidateId.get(row.id), contactsByCandidateId.get(row.id) ?? []));
}

export async function listCandidatesPage(input: ListCandidatesPageInput): Promise<ListCandidatesPageResult> {
  const page = clampInt(input.page, 1, 10_000);
  const pageSize = clampInt(input.pageSize, 1, 200);
  const scoreFilter: CandidatesScoreFilter = input.scoreFilter ?? "all";
  const vacancyId = input.vacancyId ?? "all";
  const sort: CandidatesSort = input.sort ?? "date_desc";

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  params.set("vacancyId", vacancyId);
  params.set("scoreFilter", scoreFilter);
  params.set("sort", sort);
  appendNullableParam(params, "source", input.source);
  appendNullableParam(params, "status", input.status);
  appendNullableParam(params, "eventStatus", input.eventStatus);
  appendNullableParam(params, "eventPeriodStart", input.eventPeriodStart);
  appendNullableParam(params, "eventPeriodEnd", input.eventPeriodEnd);
  appendNullableParam(params, "aiScoreMin", input.aiScoreMin);
  appendNullableParam(params, "aiScoreMax", input.aiScoreMax);
  appendNullableParam(params, "nameQuery", input.nameQuery);

  const res = await fetch(`/api/candidates/list?${params.toString()}`, { method: "GET", cache: "no-store" });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(readUserFacingApiErrorMessage(json, "Не удалось загрузить кандидатов"));

  const { rows, analyses, contacts, total } = readCandidateListRows(json, "Некорректный ответ сервера");
  return {
    items: mapCandidateListRows(rows, analyses, contacts),
    total,
  };
}

export async function getCandidateDetailsById(candidateId: string): Promise<CandidateDetailsByIdResult> {
  const id = candidateId.trim();
  if (!id) return { candidate: null, latestJob: null };

  const res = await fetch(`/api/candidates/${encodeURIComponent(id)}`, { method: "GET" });
  const json: unknown = await res.json().catch(() => null);
  if (res.status === 403 || res.status === 404) return { candidate: null, latestJob: null };
  if (!res.ok) {
    throw new Error(readUserFacingApiErrorMessage(json, "Не удалось открыть кандидата"));
  }

  const ok = z
    .object({
      candidate: z.any(),
      analysis: z.any().nullable(),
      contacts: z.array(z.any()).default([]),
      latestJob: z
        .object({
          status: z.enum(["queued", "processing", "done", "failed", "canceled"]),
          updatedAt: z.string(),
          attempt: z.number(),
          maxAttempts: z.number(),
          lastError: z.string().nullable(),
        })
        .nullable(),
    })
    .safeParse(json);
  if (!ok.success) throw new Error("Некорректный ответ сервера");

  return {
    candidate: mapCandidateRow(
      ok.data.candidate as Database["public"]["Tables"]["candidates"]["Row"],
      ok.data.analysis as Database["public"]["Tables"]["ai_analyses"]["Row"] | null,
      ok.data.contacts as Database["public"]["Tables"]["candidate_contacts"]["Row"][]
    ),
    latestJob: ok.data.latestJob,
  };
}

export async function getCandidateById(candidateId: string): Promise<Candidate | null> {
  const { candidate } = await getCandidateDetailsById(candidateId);
  return candidate;
}

export async function listCandidates(): Promise<Candidate[]> {
  const params = new URLSearchParams();
  params.set("all", "true");
  params.set("vacancyId", "all");
  params.set("scoreFilter", "all");
  params.set("sort", "date_desc");

  const res = await fetch(`/api/candidates/list?${params.toString()}`, { method: "GET", cache: "no-store" });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(readUserFacingApiErrorMessage(json, "Не удалось загрузить кандидатов"));

  const { rows, analyses, contacts } = readCandidateListRows(json, "Некорректный ответ сервера");
  return mapCandidateListRows(rows, analyses, contacts);
}

export async function updateCandidateComment(candidateId: string, comment: string): Promise<void> {
  const res = await fetch(`/api/candidates/${encodeURIComponent(candidateId)}/comment`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment }),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(readUserFacingApiErrorMessage(json, "Не удалось сохранить комментарий. Попробуйте ещё раз."));
  }
  const ok = z.object({ ok: z.literal(true) }).safeParse(json);
  if (!ok.success) throw new Error("Некорректный ответ сервера");
}

export async function updateCandidateName(candidateId: string, name: string): Promise<void> {
  const res = await fetch(`/api/candidates/${encodeURIComponent(candidateId)}/name`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(readUserFacingApiErrorMessage(json, "Не удалось переименовать кандидата. Попробуйте ещё раз."));
  }
  const ok = z.object({ ok: z.literal(true) }).safeParse(json);
  if (!ok.success) throw new Error("Некорректный ответ сервера");
}

export async function updateCandidateStatus(
  candidateId: string,
  status: Candidate["status"],
  options?: { rejectionReasonId?: string | null; rejectionComment?: string | null }
): Promise<void> {
  const res = await fetch(`/api/candidates/${encodeURIComponent(candidateId)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status,
      rejectionReasonId: options?.rejectionReasonId ?? null,
      rejectionComment: options?.rejectionComment ?? null,
    }),
  });

  if (!res.ok) {
    const json: unknown = await res.json().catch(() => null);
    const err = z
      .object({
        message: z.string().optional(),
        issues: z.array(z.object({ message: z.string() })).optional(),
      })
      .safeParse(json);
    throw new Error(err.success ? (err.data.message ?? err.data.issues?.[0]?.message ?? "Не удалось обновить статус") : "Не удалось обновить статус");
  }
}

export async function createCandidateAndQueueAnalysis(input: {
  vacancyId: string;
  resumeText?: string;
  source?: "manual" | "hh.ru" | "referral" | "other";
  resumeFile?: File;
  saveResumeFile?: boolean;
  skipAiAnalysis?: boolean;
  idempotencyKey?: string;
}): Promise<{ candidateId: string; jobId: string | null }> {
  if (!input.resumeFile && !input.resumeText) {
    throw new Error("Нужно передать либо файл резюме, либо текст");
  }

  // For PDF flow we always use multipart (server extracts text).
  const useMultipart = Boolean(input.resumeFile);
  const headers: HeadersInit = {};
  if (input.idempotencyKey) headers["X-Idempotency-Key"] = input.idempotencyKey;

  const res = await fetch("/api/candidates", useMultipart
    ? {
        method: "POST",
        headers,
        body: (() => {
          const fd = new FormData();
          fd.set("vacancyId", input.vacancyId);
          if (typeof input.resumeText === "string") fd.set("resumeText", input.resumeText);
          fd.set("source", input.source ?? "manual");
          if (input.saveResumeFile) fd.set("saveResumeFile", "true");
          if (input.skipAiAnalysis) fd.set("skipAiAnalysis", "true");
          fd.set("resumeFile", input.resumeFile as File);
          return fd;
        })(),
      }
    : {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          vacancyId: input.vacancyId,
          resumeText: input.resumeText,
          source: input.source ?? "manual",
          skipAiAnalysis: Boolean(input.skipAiAnalysis),
        }),
      });

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = z
      .object({
        error: z.string().optional(),
        candidateId: z.string().optional(),
        issues: z.array(z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() })).optional(),
        maxPages: z.number().int().positive().optional(),
        maxChars: z.number().int().positive().optional(),
        maxWords: z.number().int().positive().optional(),
      })
      .safeParse(json);

    if (err.success && err.data.error === "INVALID_BODY") {
      throw new Error(mapCreateCandidateInvalidBodyError(err.data.issues));
    }

    if (err.success && typeof err.data.error === "string" && err.data.error) {
      if (err.data.error === "SUBSCRIPTION_INACTIVE" && typeof err.data.candidateId === "string" && err.data.candidateId) {
        return { candidateId: err.data.candidateId, jobId: null };
      }

      // Special case: candidate was created, but job insert failed.
      // Server returns { error: "JOB_CREATE_FAILED", candidateId } so UI can retry.
      // Do the retry automatically to avoid forcing user to click "Retry".
      if (err.data.error === "JOB_CREATE_FAILED" && typeof err.data.candidateId === "string" && err.data.candidateId) {
        const { jobId } = await retryCandidateAnalysis(err.data.candidateId);
        return { candidateId: err.data.candidateId, jobId };
      }
      throw new Error(
        mapCreateCandidateError(err.data.error, { maxPages: err.data.maxPages, maxChars: err.data.maxChars, maxWords: err.data.maxWords })
      );
    }
    throw new Error("Не удалось создать кандидата");
  }

  const ok = z.object({ candidateId: z.string(), jobId: z.string().nullable() }).safeParse(json);
  if (!ok.success) throw new Error("Некорректный ответ сервера");
  return ok.data;
}

export async function retryCandidateAnalysis(candidateId: string): Promise<{ jobId: string }> {
  // Frontend idempotency: if user clicks "Retry" many times while request is in-flight,
  // return the same promise instead of sending multiple POSTs.
  // This also helps other UI surfaces (e.g. "Add candidates" dialog) reuse the same request.
  const existing = retryCandidateAnalysisInFlight.get(candidateId);
  if (existing) return existing;

  const p = (async () => {
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId }),
    });

    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = z.object({ error: z.string().optional() }).safeParse(json);
      const code = err.success && err.data.error ? err.data.error : null;
      if (code === "SUBSCRIPTION_INACTIVE") {
        throw new Error("Подписка неактивна. AI-анализ временно недоступен. Перейдите в «Настройки → Тариф».");
      }
      throw new Error(code ?? "Не удалось запустить анализ");
    }

    const ok = z.object({ jobId: z.string() }).safeParse(json);
    if (!ok.success) throw new Error("Некорректный ответ сервера");
    return ok.data;
  })()
    .finally(() => {
      retryCandidateAnalysisInFlight.delete(candidateId);
    });

  retryCandidateAnalysisInFlight.set(candidateId, p);
  return p;
}

export async function bulkStartCandidateAnalysis(input: BulkJobsRequest): Promise<BulkJobsResponse> {
  const res = await fetch("/api/jobs/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = z.object({ error: z.string().optional() }).safeParse(json);
    const code = err.success && err.data.error ? err.data.error : null;
    if (code === "SUBSCRIPTION_INACTIVE") {
      throw new Error("Подписка неактивна. AI-анализ временно недоступен. Перейдите в «Настройки → Тариф».");
    }
    if (code === "FORBIDDEN_SCOPE_VACANCY") {
      throw new Error("Нет доступа к выбранной вакансии для массового анализа.");
    }
    if (code === "CANDIDATES_LOOKUP_FAILED") {
      throw new Error("Не удалось получить список кандидатов. Обновите страницу и попробуйте ещё раз.");
    }
    if (code === "INVALID_BODY") {
      throw new Error("Проверьте параметры массового запуска и попробуйте ещё раз.");
    }
    throw new Error(code ?? "Не удалось запустить массовый анализ");
  }

  const ok = z
    .object({
      requested: z.number().int().nonnegative(),
      selectedInScope: z.number().int().nonnegative(),
      effectiveLimit: z.number().int().nonnegative(),
      creditsAvailable: z.number().int().nonnegative(),
      started: z.number().int().nonnegative(),
      skipped: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      clampedByCredits: z.boolean(),
      message: z.string().optional(),
    })
    .safeParse(json);

  if (!ok.success) throw new Error("Некорректный ответ сервера");
  return ok.data;
}
