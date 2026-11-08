import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import { captureBusinessEvent } from "@/lib/analytics/business-events";
import { recordAiUsageEventBestEffort } from "@/lib/ai/usage-events";
import { requireSameOriginRequest } from "@/lib/api/csrf";
import { isAiAllowed, loadCompanyPlanSnapshot } from "@/lib/billing/subscription";
import { parseCandidateProfileFromResumeText, type ParsedCandidateProfile } from "@/lib/candidates/profile-parser";
import { withKeyedMutex } from "@/lib/candidates/profile-parser-limiter";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCompanyContext, requireVacancyAccess } from "@/lib/access/company-guards";
import { buildCandidateCreateRequestHash } from "@/lib/idempotency/candidate-create";
import {
  contentTypeForKind,
  defaultFileNameForKind,
  detectResumeFileKind,
  extractTextFromResumeFile,
  MAX_RESUME_FILE_SIZE_BYTES,
  MAX_RESUME_TEXT_CHARS,
  MAX_RESUME_WORDS,
  type ResumeFileKind,
} from "@/lib/resume/extract-text";

export const runtime = "nodejs";
// Increase execution time budget for resume extraction if platform supports it (e.g. Vercel).
export const maxDuration = 30;

const MIN_RESUME_TEXT_CHARS = 20;
const CANDIDATE_ROUTE_PARSER_SAFETY_MARGIN_MS = 3_000;
const INVALID_CANDIDATE_BODY_MESSAGE = "Проверьте данные кандидата и попробуйте ещё раз.";

const JsonBodySchema = z.object({
  vacancyId: z.string().min(1),
  resumeText: z.string().min(MIN_RESUME_TEXT_CHARS).max(MAX_RESUME_TEXT_CHARS),
  source: z.enum(["manual", "hh.ru", "referral", "other"]).default("manual"),
  // If true, candidate will be created but AI analysis won't be queued.
  // Useful when user has no credits (add now, analyze later).
  skipAiAnalysis: z.boolean().optional().default(false),
});

const CandidateCreateRpcResultSchema = z.object({
  responseStatus: z.number().int(),
  responseBody: z.object({}).passthrough(),
  candidateId: z.string().uuid().nullable().optional(),
  jobId: z.string().uuid().nullable().optional(),
  replayed: z.boolean(),
});

type CandidateCreateMode = "enqueue" | "skip_ai_analysis" | "subscription_inactive";

type CandidateCreateReplayLookup =
  | { kind: "response"; response: NextResponse }
  | {
      kind: "completed_replay";
      responseStatus: number;
      responseBody: Record<string, unknown>;
      candidateId: string | null;
      jobId: string | null;
    };

export async function POST(req: NextRequest) {
  const csrf = requireSameOriginRequest(req);
  if (!csrf.ok) return csrf.response;

  const routeStartedAt = Date.now();
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const contentType = req.headers.get("content-type") ?? "";
    const isMultipart = contentType.includes("multipart/form-data");

    let vacancyId: string;
    let resumeText = "";
    let source: "manual" | "hh.ru" | "referral" | "other";
    let saveResumeFile = false;
    let skipAiAnalysis = false;
    let resumeFile: File | null = null;
    let resumeFileKind: ResumeFileKind | null = null;

    if (isMultipart) {
      let fd: FormData;
      try {
        fd = await req.formData();
      } catch {
        return invalidCandidateBodyResponse();
      }

      const MultipartSchema = z.object({
        vacancyId: z.string().min(1),
        // Optional: client-provided text (we prefer server extraction from file).
        resumeText: z.string().max(MAX_RESUME_TEXT_CHARS).optional().default(""),
        source: z.enum(["manual", "hh.ru", "referral", "other"]).default("manual"),
        skipAiAnalysis: z
          .string()
          .optional()
          .transform((v) => v === "true" || v === "1" || v === "on"),
        saveResumeFile: z
          .string()
          .optional()
          .transform((v) => v === "true" || v === "1" || v === "on"),
      });

      const parsed = MultipartSchema.safeParse({
        vacancyId: fd.get("vacancyId"),
        resumeText: fd.get("resumeText") ?? "",
        // FormData.get() returns `null` when the key is missing; normalize to `undefined` for Zod.
        source: fd.get("source") ?? undefined,
        skipAiAnalysis: fd.get("skipAiAnalysis") ?? undefined,
        saveResumeFile: fd.get("saveResumeFile") ?? undefined,
      });

      if (!parsed.success) {
        return invalidCandidateBodyResponse();
      }

      vacancyId = parsed.data.vacancyId;
      source = parsed.data.source;
      saveResumeFile = Boolean(parsed.data.saveResumeFile);
      skipAiAnalysis = Boolean(parsed.data.skipAiAnalysis);

      const maybeFile = fd.get("resumeFile");
      if (!(maybeFile instanceof File)) {
        return NextResponse.json({ error: "RESUME_FILE_MISSING" }, { status: 400 });
      }
      if (maybeFile.size > MAX_RESUME_FILE_SIZE_BYTES) {
        return NextResponse.json({ error: "RESUME_FILE_TOO_LARGE" }, { status: 400 });
      }

      resumeFile = maybeFile;

      const detectedKind = detectResumeFileKind(resumeFile);
      if (!detectedKind) {
        return NextResponse.json(
          { error: "RESUME_FILE_UNSUPPORTED_TYPE", maxChars: MAX_RESUME_TEXT_CHARS, maxWords: MAX_RESUME_WORDS },
          { status: 400 }
        );
      }

      resumeFileKind = detectedKind;
    } else {
      const bodyJson = await req.json().catch(() => null);
      const parsed = JsonBodySchema.safeParse(bodyJson);
      if (!parsed.success) {
        return invalidCandidateBodyResponse();
      }

      vacancyId = parsed.data.vacancyId;
      resumeText = parsed.data.resumeText;
      source = parsed.data.source;
      skipAiAnalysis = Boolean(parsed.data.skipAiAnalysis);
    }

    // IMPORTANT:
    // - `admin` bypasses RLS, so we MUST enforce access explicitly.
    // - We intentionally avoid relying on DB RLS for creating candidates, because misapplied
    //   policies across environments can break core product flows with 403 (as observed).
    const vacRes = await requireVacancyAccess(admin, ctx, vacancyId);
    if (!vacRes.ok) {
      // Keep API contract stable for frontend.
      const status = vacRes.response.status;
      if (status === 403) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      if (status === 404) return NextResponse.json({ error: "VACANCY_NOT_FOUND" }, { status: 404 });
      return vacRes.response;
    }
    const vacancy = vacRes.data.vacancy;
    const candidateCreateRequestId = randomUUID();

    if (resumeFile) {
      const detectedKind = resumeFileKind ?? detectResumeFileKind(resumeFile);
      const extractionRequestId = randomUUID();
      const extractionStartedAt = Date.now();
      const extracted = await extractTextFromResumeFile(resumeFile, extractionRequestId);
      const extractionDurationMs = Date.now() - extractionStartedAt;

      if (!extracted.ok) {
        await captureBusinessEvent({
          event: "resume_extraction_failed",
          userId: ctx.userId,
          companyId: ctx.companyId,
          role: ctx.role,
          properties: {
            file_kind: detectedKind,
            file_size_bytes: resumeFile.size,
            duration_ms: extractionDurationMs,
            result_code: extracted.code,
            error_kind: extracted.code,
            request_id: extractionRequestId,
          },
        });

        return NextResponse.json(
          { error: extracted.code, maxChars: MAX_RESUME_TEXT_CHARS, maxWords: MAX_RESUME_WORDS },
          { status: 400 }
        );
      }

      resumeFileKind = extracted.kind;
      resumeText = extracted.text;

      await captureBusinessEvent({
        event: "resume_extraction_completed",
        userId: ctx.userId,
        companyId: ctx.companyId,
        role: ctx.role,
        properties: {
          file_kind: extracted.kind,
          file_size_bytes: resumeFile.size,
          duration_ms: extractionDurationMs,
          result_code: "ok",
          request_id: extractionRequestId,
        },
      });
    }

    const idempotencyKey = normalizeIdempotencyKey(req.headers.get("x-idempotency-key")) ?? `candidate-create:${randomUUID()}`;
    const nowIso = new Date().toISOString();
    const planSnapshot = skipAiAnalysis ? null : await loadCompanyPlanSnapshot(admin, vacancy.companyId);
    const mode: CandidateCreateMode = skipAiAnalysis
      ? "skip_ai_analysis"
      : planSnapshot && isAiAllowed(planSnapshot)
        ? "enqueue"
        : "subscription_inactive";
    const requestHash = buildCandidateCreateRequestHash({
      vacancyId: vacancy.id,
      source,
      saveResumeFile,
      mode,
      resumeText,
    });
    const idempotencyMutexKey = `candidate_create\u0000${ctx.userId}\u0000${vacancy.companyId}\u0000${idempotencyKey}`;
    const parserDeadlineAt = routeStartedAt + maxDuration * 1000 - CANDIDATE_ROUTE_PARSER_SAFETY_MARGIN_MS;

    return await withKeyedMutex(idempotencyMutexKey, async () => {
      const replayLookup = await findCandidateCreateIdempotencyReplay(admin, {
        key: idempotencyKey,
        operation: "candidate_create",
        userId: ctx.userId,
        companyId: vacancy.companyId,
        requestHash,
      });
      if (replayLookup?.kind === "response") return replayLookup.response;

      const parsedProfile = await parseCandidateProfileFromResumeText({
        resumeText,
        requestId: candidateCreateRequestId,
        deadlineAt: parserDeadlineAt,
      });
      const { name, position, contacts: extractedContacts } = parsedProfile;
      const desiredSalary = parsedProfile.desiredSalary;

      let responseStatus: number;
      let responseBody: Record<string, unknown>;
      let candidateId: string | null;
      let jobId: string | null;
      let replayed = false;

      if (replayLookup?.kind === "completed_replay") {
        responseStatus = replayLookup.responseStatus;
        responseBody = replayLookup.responseBody;
        candidateId = replayLookup.candidateId;
        jobId = replayLookup.jobId;
        replayed = true;
      } else {
        const { data: candidateCreateRaw, error: candidateCreateError } = await (admin as any).rpc("create_candidate_with_idempotency", {
          p_key: idempotencyKey,
          p_operation: "candidate_create",
          p_user_id: ctx.userId,
          p_company_id: vacancy.companyId,
          p_request_hash: requestHash,
          p_vacancy_id: vacancy.id,
          p_name: name,
          p_position: position,
          p_resume_text: resumeText,
          p_source: source,
          p_applied_at: nowIso,
          p_mode: mode,
          p_desired_salary_text: desiredSalary.text,
          p_desired_salary_amount: desiredSalary.amount,
          p_desired_salary_currency: desiredSalary.currency,
          p_desired_salary_source: desiredSalary.source,
        });

        if (candidateCreateError || !candidateCreateRaw) {
          await recordParserUsage(admin, {
            companyId: vacancy.companyId,
            userId: ctx.userId,
            candidateId: null,
            requestId: candidateCreateRequestId,
            parsedProfile,
          });
          if (process.env.NODE_ENV !== "production") {
            console.warn("[candidates] idempotent create failed", {
              code: (candidateCreateError as { code?: unknown })?.code,
            });
          }

          return NextResponse.json(
            {
              error: "CANDIDATE_CREATE_FAILED",
              ...(process.env.NODE_ENV !== "production"
                ? {
                    debug: {
                      code: (candidateCreateError as { code?: unknown })?.code,
                    },
                  }
                : {}),
            },
            { status: 500 }
          );
        }

        const parsedCreate = CandidateCreateRpcResultSchema.safeParse(candidateCreateRaw);
        if (!parsedCreate.success) {
          await recordParserUsage(admin, {
            companyId: vacancy.companyId,
            userId: ctx.userId,
            candidateId: null,
            requestId: candidateCreateRequestId,
            parsedProfile,
          });
          return NextResponse.json({ error: "CANDIDATE_CREATE_FAILED" }, { status: 500 });
        }

        responseStatus = parsedCreate.data.responseStatus;
        responseBody = parsedCreate.data.responseBody;
        candidateId =
          parsedCreate.data.candidateId ??
          (typeof responseBody.candidateId === "string" ? responseBody.candidateId : null);
        replayed = parsedCreate.data.replayed;
        jobId = parsedCreate.data.jobId ?? (typeof responseBody.jobId === "string" ? responseBody.jobId : null);
      }

      await recordParserUsage(admin, {
        companyId: vacancy.companyId,
        userId: ctx.userId,
        candidateId,
        requestId: candidateCreateRequestId,
        parsedProfile,
      });

      if (candidateId && !replayed) {
        const { error: pipelineEventErr } = await (admin as any).from("pipeline_events").insert({
          company_id: vacancy.companyId,
          candidate_id: candidateId,
          vacancy_id: vacancy.id,
          actor_id: ctx.userId,
          from_status: null,
          to_status: "new",
          event_type: "candidate_created",
          occurred_at: nowIso,
          metadata: {
            source,
            mode,
            route: "api_candidates",
          },
        });
        if (pipelineEventErr) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[pipeline_events] candidate_created insert failed", {
              candidateId,
              code: (pipelineEventErr as { code?: unknown })?.code,
            });
          }
          return NextResponse.json({ error: "PIPELINE_EVENT_CREATE_FAILED" }, { status: 500 });
        }

        await captureBusinessEvent({
          event: source === "hh.ru" ? "candidate_imported_hh" : "candidate_added",
          userId: ctx.userId,
          companyId: vacancy.companyId,
          role: ctx.role,
          properties: {
            candidate_id: candidateId,
            vacancy_id: vacancy.id,
            source,
            mode,
            save_resume_file: saveResumeFile,
          },
        });
      }

      if (jobId && mode === "enqueue" && !replayed) {
        await captureBusinessEvent({
          event: "ai_analysis_started",
          userId: ctx.userId,
          companyId: vacancy.companyId,
          role: ctx.role,
          properties: {
            job_id: jobId,
            candidate_id: candidateId,
            vacancy_id: vacancy.id,
            trigger: "candidate_create",
          },
        });
      }

      if (candidateId && extractedContacts.length > 0) {
        // Contacts are derived from resume text, so retries can safely backfill anything
        // that did not make it to DB during the first attempt.
        const payload = extractedContacts.map((c) => ({
          candidate_id: candidateId,
          type: String(c.type),
          value: String(c.value),
          label: c.label ? String(c.label) : null,
        }));

        const existingKeySet = new Set<string>();
        const { data: existingContacts, error: existingContactsErr } = await admin
          .from("candidate_contacts")
          .select("type, value, label")
          .eq("candidate_id", candidateId);

        if (existingContactsErr && process.env.NODE_ENV !== "production") {
          console.warn("[candidate_contacts] read failed", {
            candidateId,
            code: (existingContactsErr as { code?: unknown }).code,
          });
        }
        if (existingContactsErr && replayed) {
          return NextResponse.json(responseBody, { status: responseStatus });
        }

        for (const existing of existingContacts ?? []) {
          existingKeySet.add(buildCandidateContactKey(existing.type, existing.value, existing.label));
        }
        const missingPayload = replayed && existingKeySet.size > 0
          ? []
          : payload.filter((item) => !existingKeySet.has(buildCandidateContactKey(item.type, item.value, item.label)));

        if (missingPayload.length > 0) {
          // Use admin client to avoid any RLS mismatch for sub-resources.
          const { error: contactsErr } = await admin.from("candidate_contacts").insert(missingPayload);
          if (contactsErr && process.env.NODE_ENV !== "production") {
            // Do not log PII values. Only technical meta.
            console.warn("[candidate_contacts] insert failed", {
              candidateId,
              count: missingPayload.length,
              code: (contactsErr as { code?: unknown }).code,
            });
          }
        }
      }

      // Optional: store original resume in Supabase Storage (private bucket) and save pointer in DB.
      if (candidateId && saveResumeFile && resumeFile) {
        const kind = resumeFileKind ?? detectResumeFileKind(resumeFile) ?? "pdf";
        const pathInBucket = buildResumeStoragePath(vacancy.companyId, candidateId, idempotencyKey, kind);
        const contentType = contentTypeForKind(kind);

        const { error: uploadError } = await admin.storage
          .from("resumes")
          .upload(pathInBucket, resumeFile, {
            contentType,
            upsert: true,
          });

        if (uploadError) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[candidate_resume] upload failed", {
              candidateId,
              code: (uploadError as { statusCode?: unknown; error?: unknown }).statusCode,
            });
          }
          if (replayed) {
            return NextResponse.json(responseBody, { status: responseStatus });
          }
          return NextResponse.json({ error: "CANDIDATE_RESUME_UPLOAD_FAILED", candidateId }, { status: 500 });
        }

        // Store pointer in DB (use admin to bypass RLS edge cases).
        await admin
          .from("candidates")
          .update({
            resume_url: `resumes/${pathInBucket}`,
            resume_file_name: resumeFile.name || defaultFileNameForKind(kind),
            resume_file_size: resumeFile.size,
          })
          .eq("id", candidateId);
      }

      return NextResponse.json(responseBody, { status: responseStatus });
    });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

function normalizeIdempotencyKey(raw: string | null): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  return value;
}

function invalidCandidateBodyResponse() {
  return NextResponse.json(
    {
      error: "INVALID_BODY",
      message: INVALID_CANDIDATE_BODY_MESSAGE,
    },
    { status: 400 }
  );
}

function buildCandidateContactKey(type: string, value: string, label: string | null): string {
  return `${type}\u0000${value}\u0000${label ?? ""}`;
}

async function findCandidateCreateIdempotencyReplay(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  input: {
    key: string;
    operation: "candidate_create";
    userId: string;
    companyId: string;
    requestHash: string;
  }
): Promise<CandidateCreateReplayLookup | null> {
  const { data, error } = await (admin as any)
    .from("api_idempotency_keys")
    .select("operation,user_id,company_id,request_hash,status,response_status,response_body,candidate_id,job_id")
    .eq("key", input.key)
    .maybeSingle();

  if (error || !data) return null;
  if (
    data.operation !== input.operation ||
    data.user_id !== input.userId ||
    data.company_id !== input.companyId ||
    data.request_hash !== input.requestHash
  ) {
    return {
      kind: "response",
      response: NextResponse.json({ error: "IDEMPOTENCY_KEY_REUSED" }, { status: 409 }),
    };
  }

  if (data.status === "completed" && data.response_status && data.response_body) {
    const responseBody = data.response_body as Record<string, unknown>;
    return {
      kind: "completed_replay",
      responseStatus: Number(data.response_status),
      responseBody,
      candidateId: data.candidate_id ?? (typeof responseBody.candidateId === "string" ? responseBody.candidateId : null),
      jobId: data.job_id ?? (typeof responseBody.jobId === "string" ? responseBody.jobId : null),
    };
  }

  return {
    kind: "response",
    response: NextResponse.json({ error: "IDEMPOTENCY_REQUEST_IN_PROGRESS" }, { status: 409 }),
  };
}

async function recordParserUsage(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  input: {
    companyId: string;
    userId: string;
    candidateId: string | null;
    requestId: string;
    parsedProfile: ParsedCandidateProfile;
  }
): Promise<void> {
  await recordAiUsageEventBestEffort(admin, {
    companyId: input.companyId,
    userId: input.userId,
    candidateId: input.candidateId,
    requestId: input.requestId,
    task: "candidate_profile_parse",
    provider: "deepseek",
    model: input.parsedProfile.meta.model,
    status: input.parsedProfile.meta.source === "deepseek" ? "success" : "fallback",
    fallbackReason: input.parsedProfile.meta.fallbackReason,
    attempts: input.parsedProfile.meta.attempts,
    tokensIn: input.parsedProfile.meta.tokensInTotal,
    tokensOut: input.parsedProfile.meta.tokensOutTotal,
    durationMs: input.parsedProfile.meta.durationMs,
  });
}

function buildResumeStoragePath(
  companyId: string,
  candidateId: string,
  idempotencyKey: string,
  kind: ResumeFileKind
): string {
  const requestKeyHash = createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32);
  return `companies/${companyId}/candidates/${candidateId}/resumes/${requestKeyHash}.${kind}`;
}
