import "./load-env";

import os from "node:os";
import process from "node:process";
import http from "node:http";

import { analyzeResumeWithDeepSeek } from "./deepseek";
import { analyzeResumeWithGemini } from "./gemini";
import { analyzeResumeWithOpenAI } from "./openai";
import { getSupabaseAdmin } from "./supabase";
import type { AiJobRow } from "./types";
import type { Database, Json } from "./database.types";
import type { AiAnalysis } from "./ai-analysis";
import type { CandidateDesiredSalaryForAi, VacancySalaryForAi } from "./ai-prompt";
import {
  buildAiAnalysisFinalizePayload,
  type AiAnalysisFallbackFinalizeInput,
} from "./ai-finalize-payload";
import { sanitizeResumeForLlm, type ResumeSafety } from "./prompt-injection";
import { startHhAutoSync } from "./hh-sync";
import {
  captureWorkerEvent,
  captureWorkerException,
  registerWorkerProcessErrorHandlers,
} from "./telemetry";

const WORKER_ID = process.env.WORKER_ID || `${os.hostname()}:${process.pid}`;
const POLL_MS = Number(process.env.WORKER_POLL_MS || 1000);
const AI_PROVIDER = (process.env.AI_PROVIDER || "gemini").toLowerCase();
const WORKER_CONCURRENCY = Math.max(1, Math.min(32, Number(process.env.WORKER_CONCURRENCY || 3)));
const HEARTBEAT_MS = Math.max(5_000, Number(process.env.WORKER_HEARTBEAT_MS || 30_000));
const WORKER_HEARTBEAT_GLOBAL_MS = Math.max(10_000, Number(process.env.WORKER_HEARTBEAT_GLOBAL_MS || 30_000));
const WORKER_VERSION = process.env.WORKER_VERSION || process.env.APP_VERSION || null;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function getIdlePollDelay(emptyClaimStreak: number): number {
  if (emptyClaimStreak <= 1) return POLL_MS;
  return Math.min(30_000, POLL_MS * 2 ** Math.min(emptyClaimStreak - 1, 3));
}

async function main() {
  console.log(
    `[worker] starting. worker_id=${WORKER_ID} poll_ms=${POLL_MS} concurrency=${WORKER_CONCURRENCY} provider=${AI_PROVIDER}`
  );
  void captureWorkerEvent("worker_started", {
    provider: AI_PROVIDER,
    concurrency: WORKER_CONCURRENCY,
    poll_ms: POLL_MS,
  });
  void logEgressIpIfEnabled();
  startHealthServerIfNeeded();
  startWorkerHeartbeat();
  startHhAutoSync();

  const inFlight = new Set<Promise<void>>();
  let emptyClaimStreak = 0;
  let loopErrorStreak = 0;

  while (true) {
    try {
      let claimedAny = false;

      // Fill the pipeline up to concurrency.
      while (inFlight.size < WORKER_CONCURRENCY) {
        const job = await claimNextJob();
        if (!job) break;
        claimedAny = true;
        emptyClaimStreak = 0;

        console.log(
          `[worker] claimed job ${job.id} candidate=${job.candidate_id} attempt=${job.attempt}/${job.max_attempts}`
        );
        void captureWorkerEvent("ai_job_claimed", jobTelemetryProps(job));

        const p = processJob(job)
          .catch((err) => {
            // processJob already marks failed/retry; keep loop alive.
            console.error(`[worker] processJob unhandled error job=${job.id}:`, err);
            void captureWorkerException(err, "worker_process_job_unhandled", jobTelemetryProps(job));
          })
          .finally(() => {
            inFlight.delete(p);
          });
        inFlight.add(p);
      }

      // If nothing is running and nothing was claimed, back off.
      if (inFlight.size === 0) {
        emptyClaimStreak += 1;
        loopErrorStreak = 0;
        await sleep(getIdlePollDelay(emptyClaimStreak));
        continue;
      }

      // Wait for either: one job finishes OR poll interval passes (to claim more).
      await Promise.race([sleep(POLL_MS), ...Array.from(inFlight)]);
      loopErrorStreak = 0;
    } catch (err) {
      loopErrorStreak += 1;
      if (isLikelySupabaseNetworkError(err)) {
        console.warn(`[worker] supabase temporary network error (streak=${loopErrorStreak}): ${formatErrorForLog(err)}`);
      } else {
        console.error("[worker] loop error:", err);
      }
      void captureWorkerException(err, "worker_loop_error", {
        loop_error_streak: loopErrorStreak,
        provider: AI_PROVIDER,
      });

      // Exponential backoff on repeated transient failures to avoid hot-looping.
      const backoff = Math.min(30_000, 1_000 * 2 ** Math.min(loopErrorStreak, 5));
      await sleep(Math.max(backoff, Math.min(5_000, POLL_MS)));
    }
  }
}

async function logEgressIpIfEnabled() {
  const enabled =
    process.env.WORKER_LOG_EGRESS_IP === "1" ||
    process.env.WORKER_LOG_EGRESS_IP === "true" ||
    process.env.WORKER_LOG_EGRESS_IP === "yes";
  if (!enabled) return;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
    clearTimeout(timeout);

    if (!resp.ok) {
      console.warn(`[worker] egress ip lookup failed: status=${resp.status}`);
      return;
    }
    const data = (await resp.json()) as { ip?: unknown };
    const ip = typeof data.ip === "string" ? data.ip : null;
    if (ip) console.log(`[worker] egress ip=${ip}`);
  } catch (err) {
    console.warn("[worker] egress ip lookup failed:", err);
  }
}

function startHealthServerIfNeeded() {
  const portRaw = process.env.PORT;
  if (!portRaw) return;

  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0) return;

  const server = http.createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === "/health" || url === "/" || url.startsWith("/health?")) {
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      res.end("ok");
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[worker] health server listening on :${port} (GET /health)`);
  });
}

function startWorkerHeartbeat() {
  const supabase = getSupabaseAdmin();
  const tick = async () => {
    const nowIso = new Date().toISOString();
    try {
      await supabase.from("worker_heartbeats").upsert(
        {
          worker_id: WORKER_ID,
          last_seen_at: nowIso,
          concurrency: WORKER_CONCURRENCY,
          provider: AI_PROVIDER,
          version: WORKER_VERSION,
          updated_at: nowIso,
        },
        { onConflict: "worker_id" }
      );
    } catch (err) {
      // Best-effort telemetry. Do not fail the worker loop if metrics can't be written.
      const msg = formatErrorForLog(err);
      console.warn(`[worker] heartbeat write failed: ${msg}`);
    }
  };

  // Fire immediately so admin sees the worker quickly after deploy.
  void tick();
  const interval = setInterval(() => void tick(), WORKER_HEARTBEAT_GLOBAL_MS);
  interval.unref?.();
}

async function claimNextJob(): Promise<AiJobRow | null> {
  const supabase = getSupabaseAdmin();

  const isValidClaimedJob = (value: unknown): value is AiJobRow => {
    if (!value || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    return (
      typeof v.id === "string" &&
      v.id.length > 0 &&
      typeof v.company_id === "string" &&
      v.company_id.length > 0 &&
      typeof v.candidate_id === "string" &&
      v.candidate_id.length > 0 &&
      typeof v.status === "string" &&
      (v.status === "processing" || v.status === "queued" || v.status === "done" || v.status === "failed" || v.status === "canceled")
    );
  };

  // Prefer atomic claim via RPC (recommended for correctness at 10–30+ users).
  const { data: rpcData, error: rpcError } = await supabase.rpc("claim_next_ai_job", {
    worker_id: WORKER_ID,
  });

  // NOTE: Some Postgres composites may come back as an "all-null" object when no rows were updated.
  // Treat that as "no job available".
  if (!rpcError && isValidClaimedJob(rpcData)) return rpcData;

  // If Supabase is temporarily unreachable (connect timeout / fetch failed),
  // do NOT attempt fallback queries — they will fail too and only add noise.
  if (rpcError && isLikelySupabaseNetworkError(rpcError)) {
    throw rpcError;
  }

  // Fallback: single-worker best-effort claim if RPC isn't installed yet.
  // NOTE: Not safe with multiple worker replicas.
  if (rpcError) {
    const msg = String((rpcError as { message?: string }).message ?? rpcError);
    if (!msg.toLowerCase().includes("function") && !msg.toLowerCase().includes("rpc")) {
      console.warn("[worker] claim_next_ai_job rpc error:", rpcError);
    }
  }

  const nowIso = new Date().toISOString();
  const { data: jobs } = await supabase
    .from("jobs_ai")
    .select("*")
    .eq("status", "queued")
    .lte("available_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(1);

  const job = jobs?.[0] as AiJobRow | undefined;
  if (!job) return null;

  const { data: updated, error: updErr } = await supabase
    .from("jobs_ai")
    .update({
      status: "processing",
      locked_at: nowIso,
      locked_by: WORKER_ID,
      updated_at: nowIso,
    })
    .eq("id", job.id)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();

  if (updErr || !updated) return null;
  return updated as AiJobRow;
}

async function processJob(job: AiJobRow) {
  const supabase = getSupabaseAdmin();
  const heartbeat = startJobHeartbeat(job.id);

  try {
    // Ensure credits are reserved atomically before spending AI provider tokens.
    // This prevents "overbooking" the queue when users enqueue faster than workers can process.
    const reservedOk = await ensureCreditsReservedForJob({
      jobId: job.id,
      companyId: job.company_id,
      requestedBy: job.requested_by,
      creditsToReserve: 1,
    });
    if (!reservedOk) {
      const nowIso = new Date().toISOString();
      // Best-effort: if a reservation exists (e.g. stale state), release it.
      await releaseCreditsReservationSafe(job.id, "INSUFFICIENT_CREDITS_AT_PROCESSING");
      await supabase
        .from("jobs_ai")
        .update({
          status: "failed",
          attempt: job.max_attempts ?? 3,
          last_error: `INSUFFICIENT_CREDITS: company=${job.company_id}`,
          finished_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", job.id);
      void captureWorkerEvent("ai_job_terminal_failed", {
        ...jobTelemetryProps(job),
        reason: "INSUFFICIENT_CREDITS_AT_PROCESSING",
      });
      void captureWorkerEvent("ai_analysis_failed", {
        ...jobTelemetryProps(job),
        attempt: job.max_attempts ?? 3,
        max_attempts: job.max_attempts ?? 3,
        reason: "INSUFFICIENT_CREDITS_AT_PROCESSING",
        event_source: "worker",
      });
      return;
    }

    type CandidateAiContextRow = Pick<
      Database["public"]["Tables"]["candidates"]["Row"],
      | "id"
      | "vacancy_id"
      | "resume_text"
      | "hh_auto_survey_text"
      | "desired_salary_text"
      | "desired_salary_amount"
      | "desired_salary_currency"
      | "desired_salary_source"
    >;
    const { data: candidate, error: candErr } = await supabase
      .from("candidates")
      .select("id,vacancy_id,resume_text,hh_auto_survey_text,desired_salary_text,desired_salary_amount,desired_salary_currency,desired_salary_source")
      .eq("id", job.candidate_id)
      .maybeSingle<CandidateAiContextRow>();
    if (candErr) throw candErr;
    if (!candidate) throw new Error("Candidate not found");
    if (!candidate.resume_text) throw new Error("Missing resume_text for candidate");

    const resumeSanitizeResult = sanitizeResumeForLlm(candidate.resume_text);
    const rawHhAutoSurveyText = typeof candidate.hh_auto_survey_text === "string" ? candidate.hh_auto_survey_text : "";
    const hhAutoSurveySanitizeResult =
      rawHhAutoSurveyText.trim().length > 0 ? sanitizeResumeForLlm(rawHhAutoSurveyText) : null;

    const mergedRuleIds = new Set<string>(resumeSanitizeResult.safety.matchedRuleIds);
    if (hhAutoSurveySanitizeResult) {
      for (const id of hhAutoSurveySanitizeResult.safety.matchedRuleIds) mergedRuleIds.add(id);
    }
    const mergedSafety: ResumeSafety = {
      injectionDetected:
        resumeSanitizeResult.safety.injectionDetected || Boolean(hhAutoSurveySanitizeResult?.safety.injectionDetected),
      redactedLineCount:
        resumeSanitizeResult.safety.redactedLineCount + (hhAutoSurveySanitizeResult?.safety.redactedLineCount ?? 0),
      matchedRuleIds: Array.from(mergedRuleIds).sort(),
    };

    const sanitizedHhAutoSurveyText = hhAutoSurveySanitizeResult?.sanitizedText.trim()
      ? hhAutoSurveySanitizeResult.sanitizedText
      : undefined;

    if (mergedSafety.injectionDetected) {
      // Security telemetry (no PII / no resume text).
      console.warn(
        `[worker][security] prompt_injection_detected input_sanitized job=${job.id} candidate=${job.candidate_id} redacted_lines=${mergedSafety.redactedLineCount} rules=${mergedSafety.matchedRuleIds.join(",")}`
      );
      console.warn("[worker][security] prompt_injection_details", {
        job_id: job.id,
        candidate_id: job.candidate_id,
        redactedLineCount: mergedSafety.redactedLineCount,
        matchedRuleIds: mergedSafety.matchedRuleIds,
        resume: {
          redactedLineCount: resumeSanitizeResult.safety.redactedLineCount,
          matchedRuleIds: resumeSanitizeResult.safety.matchedRuleIds,
          normalizedSha256: resumeSanitizeResult.normalizedSha256,
        },
        hhAutoSurvey: hhAutoSurveySanitizeResult
          ? {
              redactedLineCount: hhAutoSurveySanitizeResult.safety.redactedLineCount,
              matchedRuleIds: hhAutoSurveySanitizeResult.safety.matchedRuleIds,
              normalizedSha256: hhAutoSurveySanitizeResult.normalizedSha256,
            }
          : null,
      });
    }

    type VacancyAiContextRow = Pick<
      Database["public"]["Tables"]["vacancies"]["Row"],
      | "id"
      | "description"
      | "requirements"
      | "company_id"
      | "salary_min"
      | "salary_max"
      | "salary_currency"
      | "salary_period"
      | "salary_tax"
    > & {
      mandatory_requirements_text: unknown;
    };
    const { data: vacancy, error: vacErr } = await supabase
      .from("vacancies")
      .select("id,description,requirements,mandatory_requirements_text,company_id,salary_min,salary_max,salary_currency,salary_period,salary_tax")
      .eq("id", candidate.vacancy_id)
      .maybeSingle<VacancyAiContextRow>();
    if (vacErr) throw vacErr;
    if (!vacancy) throw new Error("Vacancy not found");
    if (vacancy.company_id !== job.company_id) throw new Error("Company boundary violation");
    const vacancyMandatoryRequirementsText =
      typeof vacancy.mandatory_requirements_text === "string"
        ? vacancy.mandatory_requirements_text
        : null;
    const candidateDesiredSalary: CandidateDesiredSalaryForAi = {
      text: candidate.desired_salary_text,
      amount: candidate.desired_salary_amount,
      currency: candidate.desired_salary_currency,
      source: candidate.desired_salary_source,
    };
    const vacancySalary: VacancySalaryForAi = {
      min: vacancy.salary_min,
      max: vacancy.salary_max,
      currency: vacancy.salary_currency,
      period: vacancy.salary_period,
      tax: vacancy.salary_tax,
    };

    const { analysis, model, provider, tokensIn, tokensOut } = await analyzeResume({
      resumeText: resumeSanitizeResult.sanitizedText,
      hhAutoSurveyText: sanitizedHhAutoSurveyText,
      vacancyDescription: vacancy.description,
      vacancyRequirements: vacancy.requirements,
      vacancyMandatoryRequirementsText,
      candidateDesiredSalary,
      vacancySalary,
      safety: mergedSafety,
      meta: { jobId: job.id, candidateId: job.candidate_id },
    });

    const finalizePayload = buildAiAnalysisFinalizePayload({
      candidateId: job.candidate_id,
      jobId: job.id,
      requestedBy: job.requested_by,
      analysis,
      provider,
      providerModel: model,
      tokensIn,
      tokensOut,
      candidateDesiredSalary,
      vacancySalary,
    });
    const matchPercentage = finalizePayload.matchPercentage;

    // Prefer atomic finalize via RPC.
    const { error: finalizeErr } = await supabase.rpc("finalize_ai_job", finalizePayload.rpcArgs);

    if (!finalizeErr) {
      console.log(`[worker] finalized job ${job.id} done score=${analysis.overallScore}`);
      void captureWorkerEvent("ai_job_completed", {
        ...jobTelemetryProps(job),
        provider,
        model,
        score: analysis.overallScore,
        match_percentage: matchPercentage,
        finalize_mode: "rpc",
      });
      void captureAiAnalysisCompleted(job, {
        provider,
        model,
        score: analysis.overallScore,
        matchPercentage,
      });
      return;
    }

    // IMPORTANT: Do NOT attempt non-atomic fallback finalize on arbitrary errors.
    // It can partially write analysis/ledger and still fail to mark job done, which is worse than retry.
    // Only use fallback when the RPC isn't installed yet (dev / new environment bootstrap).
    if (isLikelySupabaseNetworkError(finalizeErr)) throw finalizeErr;

    const msg = String((finalizeErr as { message?: string }).message ?? finalizeErr);
    const msgLower = msg.toLowerCase();
    const looksLikeMissingRpc =
      msgLower.includes("function") ||
      msgLower.includes("rpc") ||
      msgLower.includes("finalize_ai_job") ||
      msgLower.includes("does not exist");

    if (looksLikeMissingRpc) {
      const { error: legacyFinalizeErr } = await supabase.rpc("finalize_ai_job", finalizePayload.legacyRpcArgs);

      if (!legacyFinalizeErr) {
        await updateAnalysisTokenUsageBestEffort(job.candidate_id, tokensIn, tokensOut);
        console.log(`[worker] finalized job ${job.id} done (legacy rpc + token patch) score=${analysis.overallScore}`);
        void captureWorkerEvent("ai_job_completed", {
          ...jobTelemetryProps(job),
          provider,
          model,
          score: analysis.overallScore,
          match_percentage: matchPercentage,
          finalize_mode: "rpc_legacy_token_patch",
        });
        void captureAiAnalysisCompleted(job, {
          provider,
          model,
          score: analysis.overallScore,
          matchPercentage,
        });
        return;
      }

      if (isLikelySupabaseNetworkError(legacyFinalizeErr)) throw legacyFinalizeErr;

      const legacyMsg = String((legacyFinalizeErr as { message?: string }).message ?? legacyFinalizeErr);
      const legacyMsgLower = legacyMsg.toLowerCase();
      const legacyLooksLikeMissingRpc =
        legacyMsgLower.includes("function") ||
        legacyMsgLower.includes("rpc") ||
        legacyMsgLower.includes("finalize_ai_job") ||
        legacyMsgLower.includes("does not exist");

      if (!legacyLooksLikeMissingRpc) {
        throw legacyFinalizeErr;
      }
    }

    if (!looksLikeMissingRpc) {
      // Let the normal retry mechanism handle it.
      throw finalizeErr;
    }

    // Fallback finalize sequence (non-atomic) ONLY when RPC isn't installed yet.
    console.warn("[worker] finalize_ai_job rpc missing; using fallbackFinalize");
    await fallbackFinalize(job, finalizePayload.fallbackInput);

    console.log(`[worker] finalized job ${job.id} done (fallback) score=${analysis.overallScore}`);
    void captureWorkerEvent("ai_job_completed", {
      ...jobTelemetryProps(job),
      provider,
      model,
      score: analysis.overallScore,
      match_percentage: matchPercentage,
      finalize_mode: "fallback",
    });
    void captureAiAnalysisCompleted(job, {
      provider,
      model,
      score: analysis.overallScore,
      matchPercentage,
    });
  } catch (err) {
    console.error(`[worker] job ${job.id} failed:`, err);
    const aiErrorClass = classifyAiError(err);
    void captureWorkerException(err, "ai_job_failed", {
      ...jobTelemetryProps(job),
      retryable: aiErrorClass.retryable,
      reason: aiErrorClass.reason,
      error_summary: formatErrorForLog(err),
    });
    // If we can't reach Supabase, we can't update job status anyway.
    // The queue must be self-healing on the DB side (stale lock TTL reclaim).
    if (isLikelySupabaseNetworkError(err)) {
      console.warn(
        `[worker] supabase unreachable; leaving job in processing for TTL reclaim job=${job.id} err="${formatErrorForLog(err)}"`
      );
      return;
    }

    try {
      await markJobFailedOrRetry(job, err);
    } catch (markErr) {
      // Never crash the worker loop due to a secondary DB failure.
      console.warn(
        `[worker] failed to update job status (will rely on TTL reclaim) job=${job.id} err="${formatErrorForLog(markErr)}"`
      );
    }
  } finally {
    heartbeat.stop();
  }
}

async function captureAiAnalysisCompleted(
  job: AiJobRow,
  input: {
    provider: string;
    model: string;
    score: number;
    matchPercentage: number;
  }
) {
  try {
    await captureWorkerEvent("ai_analysis_completed", {
      company_id: job.company_id,
      candidate_id: job.candidate_id,
      job_id: job.id,
      provider: input.provider,
      model: input.model,
      score: input.score,
      match_percentage: input.matchPercentage,
      event_source: "worker",
    });

    const supabase = getSupabaseAdmin();
    const { count: companyAnalysesCount } = await supabase
      .from("ai_analyses")
      .select("candidate_id,candidates!inner(vacancies!inner(company_id))", { count: "exact", head: true })
      .eq("candidates.vacancies.company_id", job.company_id);

    if (companyAnalysesCount === 1) {
      await captureWorkerEvent("company_activated", {
        company_id: job.company_id,
        candidate_id: job.candidate_id,
        job_id: job.id,
        activation_definition: "one_vacancy_and_one_ai_analysis",
        event_source: "worker",
      });
    }
  } catch (err) {
    console.warn(`[worker] product analytics capture failed job=${job.id}: ${formatErrorForLog(err)}`);
  }
}

async function updateAnalysisTokenUsageBestEffort(candidateId: string, tokensIn: number | null, tokensOut: number | null) {
  if (tokensIn === null && tokensOut === null) return;

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("ai_analyses")
      .update({
        tokens_in: tokensIn,
        tokens_out: tokensOut,
      })
      .eq("candidate_id", candidateId);
    if (error) throw error;
  } catch (err) {
    console.warn(`[worker] token usage patch failed candidate=${candidateId}: ${formatErrorForLog(err)}`);
  }
}

async function analyzeResume(input: {
  resumeText: string;
  hhAutoSurveyText?: string;
  vacancyDescription: string;
  vacancyRequirements: string[];
  vacancyMandatoryRequirementsText?: string | null;
  candidateDesiredSalary?: CandidateDesiredSalaryForAi;
  vacancySalary?: VacancySalaryForAi;
  safety?: ResumeSafety;
  meta?: { jobId: string; candidateId: string };
}): Promise<{ analysis: AiAnalysis; rawText: string; model: string; provider: string; tokensIn: number | null; tokensOut: number | null }> {
  if (AI_PROVIDER === "deepseek" || AI_PROVIDER === "deepseek-chat" || AI_PROVIDER === "deepseek-reasoner") {
    const { analysis, rawText, model, tokensIn, tokensOut } = await analyzeResumeWithDeepSeek({
      ...input,
      vacancyMandatoryRequirementsText: input.vacancyMandatoryRequirementsText,
      candidateDesiredSalary: input.candidateDesiredSalary,
      vacancySalary: input.vacancySalary,
    } as typeof input);
    return { analysis, rawText, model, provider: "deepseek", tokensIn, tokensOut };
  }

  if (AI_PROVIDER === "openai" || AI_PROVIDER === "gpt" || AI_PROVIDER === "gpt-5.2") {
    try {
      const { analysis, rawText, model, tokensIn, tokensOut } = await analyzeResumeWithOpenAI({
        ...input,
        vacancyMandatoryRequirementsText: input.vacancyMandatoryRequirementsText,
        candidateDesiredSalary: input.candidateDesiredSalary,
        vacancySalary: input.vacancySalary,
      } as typeof input);
      return { analysis, rawText, model, provider: "openai", tokensIn, tokensOut };
    } catch (err) {
      // Implicit fallback: if DeepSeek key exists, use it as a backup when OpenAI fails.
      // NOTE: No PII — log only job/candidate ids and a short error summary.
      if (!process.env.DEEPSEEK_API_KEY) throw err;

      const jobId = input.meta?.jobId;
      const candidateId = input.meta?.candidateId;
      const errText = formatErrorForDb(err).slice(0, 400);
      console.warn(
        `[worker][ai] openai_failed_fallback_to_deepseek${jobId ? ` job=${jobId}` : ""}${candidateId ? ` candidate=${candidateId}` : ""} openai_error="${errText}"`
      );
      void captureWorkerException(err, "openai_failed_fallback_to_deepseek", {
        job_id: jobId ?? null,
        candidate_id: candidateId ?? null,
        provider: "openai",
        fallback_provider: "deepseek",
        error_summary: errText,
      });

      const { analysis, rawText, model, tokensIn, tokensOut } = await analyzeResumeWithDeepSeek({
        ...input,
        vacancyMandatoryRequirementsText: input.vacancyMandatoryRequirementsText,
        candidateDesiredSalary: input.candidateDesiredSalary,
        vacancySalary: input.vacancySalary,
      } as typeof input);
      return { analysis, rawText, model, provider: "deepseek", tokensIn, tokensOut };
    }
  }

  // default: gemini
  const { analysis, rawText, model, tokensIn, tokensOut } = await analyzeResumeWithGemini({
    ...input,
    vacancyMandatoryRequirementsText: input.vacancyMandatoryRequirementsText,
    candidateDesiredSalary: input.candidateDesiredSalary,
    vacancySalary: input.vacancySalary,
  } as typeof input);
  return { analysis, rawText, model, provider: "gemini", tokensIn, tokensOut };
}

async function fallbackFinalize(
  job: AiJobRow,
  input: AiAnalysisFallbackFinalizeInput
) {
  const supabase = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  // Upsert analysis (unique by candidate_id).
  const { error: upsertErr } = await supabase.from("ai_analyses").upsert(
    {
      candidate_id: job.candidate_id,
      overall_score: input.analysis.overallScore,
      category_scores: input.analysis.categories as unknown as Json,
      summary: input.analysis.summary,
      verdict: input.analysis.verdict,
      reasons: input.analysis.reasons,
      prospects: input.analysis.prospects,
      strengths: input.analysis.strengths,
      weaknesses: input.analysis.weaknesses,
      recommendations: input.analysis.recommendations,
      ai_provider: input.provider,
      analyzed_at: nowIso,
      provider_model: input.providerModel,
      tokens_in: input.tokensIn,
      tokens_out: input.tokensOut,
    },
    { onConflict: "candidate_id" }
  );
  if (upsertErr) throw upsertErr;

  const { error: candUpdErr } = await supabase
    .from("candidates")
    .update({
      match_percentage: input.matchPercentage,
      updated_at: nowIso,
    })
    .eq("id", job.candidate_id);
  if (candUpdErr) throw candUpdErr;

  // Auto-transition status: new -> reviewing (if still new).
  const { error: statusUpdErr } = await supabase
    .from("candidates")
    .update({ status: "reviewing", updated_at: nowIso })
    .eq("id", job.candidate_id)
    .eq("status", "new");
  if (statusUpdErr) throw statusUpdErr;

  // Idempotent charge: only insert if not present.
  const { data: existing, error: existingErr } = await supabase
    .from("credit_ledger")
    .select("id")
    .eq("reason", "resume_analysis")
    .eq("reference_type", "ai_job")
    .eq("reference_id", job.id)
    .limit(1);
  if (existingErr) throw existingErr;

  if (!existing || existing.length === 0) {
    const { error: ledgerErr } = await supabase.from("credit_ledger").insert({
      company_id: job.company_id,
      delta: -1,
      reason: "resume_analysis",
      reference_type: "ai_job",
      reference_id: job.id,
      created_by: job.requested_by,
      notes: `AI analysis job ${job.id}`,
    });
    if (ledgerErr) throw ledgerErr;
  }

  const { error: jobUpdErr } = await supabase
    .from("jobs_ai")
    .update({ status: "done", finished_at: nowIso, last_error: null, updated_at: nowIso })
    .eq("id", job.id);
  if (jobUpdErr) throw jobUpdErr;
}

async function markJobFailedOrRetry(job: AiJobRow, err: unknown) {
  const supabase = getSupabaseAdmin();
  const now = new Date();

  const attempt = (job.attempt ?? 0) + 1;
  const maxAttempts = job.max_attempts ?? 3;
  const lastError = formatErrorForDb(err);

  const { retryable, reason } = classifyAiError(err);
  if (!retryable) {
    const errText = `${reason}: ${lastError}`;
    await releaseCreditsReservationSafe(job.id, errText);
    await supabase
      .from("jobs_ai")
      .update({
        status: "failed",
        attempt: maxAttempts,
        last_error: errText.slice(0, 2000),
        finished_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", job.id);
    void captureWorkerEvent("ai_job_terminal_failed", {
      ...jobTelemetryProps(job),
      attempt,
      max_attempts: maxAttempts,
      retryable,
      reason,
      error_summary: errText.slice(0, 500),
    });
    void captureWorkerEvent("ai_analysis_failed", {
      ...jobTelemetryProps(job),
      attempt,
      max_attempts: maxAttempts,
      reason,
      event_source: "worker",
    });
    return;
  }

  if (attempt >= maxAttempts) {
    await releaseCreditsReservationSafe(job.id, lastError);
    await supabase
      .from("jobs_ai")
      .update({
        status: "failed",
        attempt,
        last_error: lastError.slice(0, 2000),
        finished_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", job.id);
    void captureWorkerEvent("ai_job_terminal_failed", {
      ...jobTelemetryProps(job),
      attempt,
      max_attempts: maxAttempts,
      retryable: false,
      reason: "max_attempts_exhausted",
      error_summary: lastError.slice(0, 500),
    });
    void captureWorkerEvent("ai_analysis_failed", {
      ...jobTelemetryProps(job),
      attempt,
      max_attempts: maxAttempts,
      reason: "max_attempts_exhausted",
      event_source: "worker",
    });
    return;
  }

  const backoffSeconds = Math.min(60, 2 ** attempt);
  const availableAt = new Date(now.getTime() + backoffSeconds * 1000).toISOString();

  await supabase
    .from("jobs_ai")
    .update({
      status: "queued",
      attempt,
      last_error: lastError.slice(0, 2000),
      available_at: availableAt,
      locked_at: null,
      locked_by: null,
      updated_at: now.toISOString(),
    })
    .eq("id", job.id);
  void captureWorkerEvent("ai_job_requeued", {
    ...jobTelemetryProps(job),
    attempt,
    max_attempts: maxAttempts,
    retryable,
    reason,
    backoff_seconds: backoffSeconds,
    error_summary: lastError.slice(0, 500),
  });
}

function formatErrorForDb(err: unknown): string {
  if (err instanceof Error) {
    const anyErr = err as unknown as Record<string, unknown>;
    const status = typeof anyErr.status === "number" ? anyErr.status : undefined;
    const code = typeof anyErr.code === "number" ? anyErr.code : undefined;
    const parts = [
      err.name ? `name=${err.name}` : null,
      typeof status === "number" ? `status=${status}` : null,
      typeof code === "number" ? `code=${code}` : null,
      err.message ? `message=${err.message}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : String(err);
  }
  return String(err);
}

function classifyAiError(err: unknown): { retryable: boolean; reason: string } {
  const status = getNumericErrorField(err, "status") ?? getNumericErrorField(err, "code");
  const message = err instanceof Error ? err.message : String(err);
  const messageLower = message.toLowerCase();
  const codeStr = getStringErrorField(err, "code")?.toLowerCase();

  // Non-retryable: config/auth issues.
  if (status === 401 || status === 403) return { retryable: false, reason: "non-retryable (auth/config)" };
  if (messageLower.includes("ensurestrictjsonschema") || messageLower.includes("all fields must be required"))
    return { retryable: false, reason: "non-retryable (schema/structured-outputs)" };
  if (messageLower.includes("uses `.optional()` without `.nullable()`"))
    return { retryable: false, reason: "non-retryable (schema/structured-outputs)" };
  if (codeStr === "insufficient_quota" || messageLower.includes("exceeded your current quota"))
    return { retryable: false, reason: "non-retryable (insufficient_quota)" };

  // Non-retryable: Gemini geo / eligibility failures.
  // Example: {"error":{"code":400,"message":"User location is not supported for the API use.","status":"FAILED_PRECONDITION"}}
  if (status === 400) {
    if (messageLower.includes("user location is not supported")) return { retryable: false, reason: "non-retryable (geo/eligibility)" };
    if (message.includes('"status":"FAILED_PRECONDITION"') || messageLower.includes("failed_precondition"))
      return { retryable: false, reason: "non-retryable (failed_precondition)" };
  }

  // Retryable: rate limits and transient server errors.
  if (status === 429) return { retryable: true, reason: "retryable (rate limited)" };
  if (typeof status === "number" && status >= 500 && status <= 599) return { retryable: true, reason: "retryable (server error)" };

  // Retryable: common transient network failures.
  if (codeStr && ["etimedout", "econnreset", "eai_again", "enotfound", "econnrefused"].includes(codeStr))
    return { retryable: true, reason: "retryable (network)" };

  // Default: keep current behavior (retry with backoff).
  return { retryable: true, reason: "retryable (default)" };
}

function getNumericErrorField(err: unknown, key: string): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const v = (err as Record<string, unknown>)[key];
  return typeof v === "number" ? v : undefined;
}

function getStringErrorField(err: unknown, key: string): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const v = (err as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
}

async function ensureCreditsReservedForJob(input: {
  jobId: string;
  companyId: string;
  requestedBy: string | null;
  creditsToReserve: number;
}): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("ensure_ai_job_reservation", {
    p_job_id: input.jobId,
    p_company_id: input.companyId,
    p_requested_by: input.requestedBy,
    p_credits_to_reserve: input.creditsToReserve,
  });
  if (error) throw error;
  return Boolean(data);
}

async function releaseCreditsReservationSafe(jobId: string, reason: string) {
  const supabase = getSupabaseAdmin();
  try {
    await supabase.rpc("release_ai_job_reservation", { p_job_id: jobId, reason });
  } catch {
    // Best-effort: if release fails (e.g. transient Supabase error), TTL reclaim will re-run the job and retry release.
  }
}

function jobTelemetryProps(job: AiJobRow): Record<string, string | number | boolean | null | undefined> {
  return {
    job_id: job.id,
    candidate_id: job.candidate_id,
    company_id: job.company_id,
    requested_by: job.requested_by,
    attempt: job.attempt,
    max_attempts: job.max_attempts,
    provider: AI_PROVIDER,
  };
}

registerWorkerProcessErrorHandlers();
void main();

function startJobHeartbeat(jobId: string): { stop: () => void } {
  const supabase = getSupabaseAdmin();
  const tick = async () => {
    const nowIso = new Date().toISOString();
    try {
      // Best-effort lease refresh. If it fails, the DB TTL reclaim will eventually requeue.
      await supabase
        .from("jobs_ai")
        .update({ locked_at: nowIso, updated_at: nowIso })
        .eq("id", jobId)
        .eq("status", "processing")
        .eq("locked_by", WORKER_ID);
    } catch {
      // ignore
    }
  };

  // Fire once shortly after start (helps with long AI calls).
  void tick();
  const interval = setInterval(() => void tick(), HEARTBEAT_MS);
  // Don't keep event loop alive just for heartbeat.
  interval.unref?.();

  return {
    stop: () => clearInterval(interval),
  };
}

function isLikelySupabaseNetworkError(err: unknown): boolean {
  const text = stringifyErrorForMatch(err).toLowerCase();

  // undici / node fetch
  if (text.includes("und_err_connect_timeout")) return true;
  if (text.includes("connect timeouterror")) return true;
  if (text.includes("connect timeout error")) return true;
  if (text.includes("typeerror: fetch failed")) return true;
  if (text.includes("fetch failed")) return true;

  // Common node network codes
  if (text.includes("etimedout")) return true;
  if (text.includes("econnreset")) return true;
  if (text.includes("eai_again")) return true;
  if (text.includes("enotfound")) return true;
  if (text.includes("econnrefused")) return true;

  // Supabase error objects often include `details:` with a stack-like string.
  if (text.includes("supabase.co:443") && text.includes("timeout")) return true;

  return false;
}

function stringifyErrorForMatch(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return `${err.name}: ${err.message}\n${err.stack ?? ""}`;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function formatErrorForLog(err: unknown): string {
  const raw = stringifyErrorForMatch(err);
  return raw.replaceAll(/\s+/g, " ").trim().slice(0, 500);
}
