import { readUserFacingApiErrorMessage } from "@/lib/api/user-facing-errors";
import { z } from "zod";

export type JobStatus = "queued" | "processing" | "done" | "failed" | "canceled";

export type CandidateJobSummary = {
  status: JobStatus;
  updatedAt: string;
  attempt: number;
  maxAttempts: number;
  lastError: string | null;
};

export type JobStatusResponse = {
  id: string;
  status: JobStatus;
  attempt: number;
  maxAttempts: number;
  candidateId: string;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  error: string | null;
  lastError: string | null;
};

const JOB_IDS_CHUNK_SIZE = 200;
const JOB_STATUS_LOAD_MESSAGE = "Не удалось загрузить статусы анализа";

const ActiveJobsResponseSchema = z.object({
  jobs: z.array(
    z.object({
      candidateId: z.string(),
      status: z.enum(["queued", "processing"]),
      updatedAt: z.string(),
    })
  ),
});

const LatestJobsResponseSchema = z.object({
  jobs: z.array(
    z.object({
      candidateId: z.string(),
      status: z.enum(["queued", "processing", "done", "failed"]),
      updatedAt: z.string(),
      attempt: z.number(),
      maxAttempts: z.number(),
      lastError: z.string().nullable(),
    })
  ),
});

function uniqueCandidateIds(candidateIds: string[]): string[] {
  return Array.from(new Set(candidateIds.map((id) => id.trim()).filter(Boolean)));
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { method: "GET" });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = z.object({ error: z.string().optional() }).safeParse(json);
    throw new Error(err.success && err.data.error ? err.data.error : "Не удалось получить статус");
  }

  const ok = z
    .object({
      id: z.string(),
      status: z.enum(["queued", "processing", "done", "failed", "canceled"]),
      attempt: z.number(),
      maxAttempts: z.number(),
      candidateId: z.string(),
      createdAt: z.string(),
      updatedAt: z.string(),
      finishedAt: z.string().nullable(),
      error: z.string().nullable(),
      lastError: z.string().nullable(),
    })
    .safeParse(json);

  if (!ok.success) throw new Error("Некорректный ответ сервера");
  return ok.data;
}

export async function listActiveJobsByCandidateIds(candidateIds: string[]): Promise<Map<string, JobStatus>> {
  const byCandidate = new Map<string, JobStatus>();
  const unique = uniqueCandidateIds(candidateIds);
  if (unique.length === 0) return byCandidate;

  for (let start = 0; start < unique.length; start += JOB_IDS_CHUNK_SIZE) {
    const chunk = unique.slice(start, start + JOB_IDS_CHUNK_SIZE);
    const params = new URLSearchParams();
    params.set("candidateIds", chunk.join(","));

    const res = await fetch(`/api/jobs/active?${params.toString()}`, { method: "GET", cache: "no-store" });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(readUserFacingApiErrorMessage(json, JOB_STATUS_LOAD_MESSAGE));
    }

    const parsed = ActiveJobsResponseSchema.safeParse(json);
    if (!parsed.success) throw new Error("Некорректный ответ сервера");

    for (const row of parsed.data.jobs) {
      // If multiple jobs exist, prefer "processing" over "queued".
      const prev = byCandidate.get(row.candidateId);
      if (!prev || prev === "queued") byCandidate.set(row.candidateId, row.status);
    }
  }

  return byCandidate;
}

/**
 * Returns the latest job status per candidate (including done/failed).
 *
 * Why include `done`:
 * - UX needs a transition state when job is done but `match_percentage` hasn't been observed yet.
 */
export async function listLatestJobsByCandidateIds(candidateIds: string[]): Promise<Map<string, CandidateJobSummary>> {
  const byCandidate = new Map<string, CandidateJobSummary>();
  const unique = uniqueCandidateIds(candidateIds);
  if (unique.length === 0) return byCandidate;

  for (let start = 0; start < unique.length; start += JOB_IDS_CHUNK_SIZE) {
    const chunk = unique.slice(start, start + JOB_IDS_CHUNK_SIZE);
    const params = new URLSearchParams();
    params.set("candidateIds", chunk.join(","));

    const res = await fetch(`/api/jobs/latest?${params.toString()}`, { method: "GET", cache: "no-store" });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(readUserFacingApiErrorMessage(json, JOB_STATUS_LOAD_MESSAGE));
    }

    const parsed = LatestJobsResponseSchema.safeParse(json);
    if (!parsed.success) throw new Error("Некорректный ответ сервера");

    for (const row of parsed.data.jobs) {
      byCandidate.set(row.candidateId, {
        status: row.status,
        updatedAt: row.updatedAt,
        attempt: row.attempt,
        maxAttempts: row.maxAttempts,
        lastError: row.lastError,
      });
    }
  }

  return byCandidate;
}
