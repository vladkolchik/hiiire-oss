import "server-only";

import type { CompanyContext } from "@/lib/access/company-guards";
import { requireCandidateAccess } from "@/lib/access/company-guards";
import { formatCandidateStatusLabel } from "@/lib/candidates/status-labels";

import { requireAssistantToolRunAccess, writeAssistantAuditEvent, type WriteAssistantAuditEventInput } from "../tool-runs";
import { enqueueAiAnalysisFromAssistant } from "../tools/ai-analysis";
import { CANDIDATE_STATUS_VALUES, MAX_CANDIDATE_COMMENT_LENGTH, isCandidateStatus } from "../tools/crm-write";

type ExecuteApprovedAssistantActionResult =
  | { ok: true; alreadyExecuted?: boolean }
  | { ok: false; actionApplied?: boolean; restorePending?: boolean; inProgress?: boolean; message: string };

type CandidateUpdateField = "status" | "comment";

const statusValues = new Set<string>(CANDIDATE_STATUS_VALUES);
const EXECUTING_LEASE_MS = 5 * 60 * 1000;

function getPreviewRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "string" ? value : null;
}

function getScopedCandidateQuery(admin: any, ctx: CompanyContext, candidateId: string, access: Awaited<ReturnType<typeof requireCandidateAccess>>) {
  if (!access.ok) throw new Error("ASSISTANT_CANDIDATE_NOT_AVAILABLE");

  let query = admin.from("candidates").select("id,status,comment").eq("id", candidateId).eq("vacancy_id", access.data.candidate.vacancyId);
  if (ctx.role !== "admin") {
    query = query.eq("created_by", ctx.userId);
  }
  return query;
}

function getScopedCandidateUpdateQuery(
  admin: any,
  ctx: CompanyContext,
  candidateId: string,
  access: Awaited<ReturnType<typeof requireCandidateAccess>>,
  update: Partial<Record<CandidateUpdateField, string>>
) {
  if (!access.ok) throw new Error("ASSISTANT_CANDIDATE_NOT_AVAILABLE");

  let query = admin.from("candidates").update(update).eq("id", candidateId).eq("vacancy_id", access.data.candidate.vacancyId);
  if (ctx.role !== "admin") {
    query = query.eq("created_by", ctx.userId);
  }
  return query.select("id,status,comment").maybeSingle();
}

async function finalizeAssistantToolRun(admin: any, ctx: CompanyContext, toolRunId: string, resultPreview: Record<string, unknown>) {
  return admin
    .from("assistant_tool_runs")
    .update({ executed_at: new Date().toISOString(), result_preview: resultPreview, error_message: null })
    .eq("id", toolRunId)
    .eq("company_id", ctx.companyId);
}

async function claimApprovedAssistantToolRun(admin: any, ctx: CompanyContext, toolRunId: string) {
  return admin
    .from("assistant_tool_runs")
    .update({ executed_at: new Date().toISOString(), result_preview: { status: "executing" }, error_message: null })
    .eq("id", toolRunId)
    .eq("company_id", ctx.companyId)
    .eq("approval_status", "approved")
    .is("executed_at", null)
    .select("id")
    .maybeSingle();
}

async function restoreStaleExecutingAssistantToolRun(admin: any, ctx: CompanyContext, toolRunId: string, executedAt: string) {
  const cutoffIso = new Date(Date.now() - EXECUTING_LEASE_MS).toISOString();

  return admin
    .from("assistant_tool_runs")
    .update({ executed_at: null, result_preview: { ok: false, staleExecutionRecovered: true }, error_message: "Истекло время выполнения действия." })
    .eq("id", toolRunId)
    .eq("company_id", ctx.companyId)
    .eq("approval_status", "approved")
    .eq("executed_at", executedAt)
    .lt("executed_at", cutoffIso);
}

async function restoreApprovedAssistantToolRun(admin: any, ctx: CompanyContext, toolRunId: string, message: string) {
  return admin
    .from("assistant_tool_runs")
    .update({ executed_at: null, result_preview: { ok: false }, error_message: message })
    .eq("id", toolRunId)
    .eq("company_id", ctx.companyId);
}

async function restoreApprovedAssistantToolRunOrReport(
  admin: any,
  ctx: CompanyContext,
  toolRunId: string,
  serviceMessage: string,
  userMessage: string
): Promise<Extract<ExecuteApprovedAssistantActionResult, { ok: false }>> {
  const { error } = await restoreApprovedAssistantToolRun(admin, ctx, toolRunId, serviceMessage);
  if (error) {
    return {
      ok: false as const,
      actionApplied: false,
      restorePending: false,
      message: "Не удалось выполнить действие. Обновите страницу.",
    };
  }

  return { ok: false as const, actionApplied: false, restorePending: true, message: userMessage };
}

async function markAppliedAssistantToolRunError(admin: any, ctx: CompanyContext, toolRunId: string, message: string) {
  return admin
    .from("assistant_tool_runs")
    .update({ result_preview: { ok: false, actionApplied: true }, error_message: message })
    .eq("id", toolRunId)
    .eq("company_id", ctx.companyId);
}

async function safeWriteAssistantAuditEvent(admin: any, ctx: CompanyContext, input: WriteAssistantAuditEventInput) {
  try {
    await writeAssistantAuditEvent(admin, ctx, input);
    return true;
  } catch {
    return false;
  }
}

function isExecutingResult(value: unknown) {
  const resultPreview = getPreviewRecord(value);
  return resultPreview?.status === "executing";
}

function isStaleExecutingLease(executedAt: string | null) {
  if (!executedAt) return false;

  const timestamp = Date.parse(executedAt);
  return Number.isFinite(timestamp) && timestamp < Date.now() - EXECUTING_LEASE_MS;
}

export async function executeApprovedAssistantAction(
  admin: any,
  ctx: CompanyContext,
  toolRunId: string
): Promise<ExecuteApprovedAssistantActionResult> {
  let actionApplied = false;
  let runIdForError: string | null = null;

  try {
    const run = await requireAssistantToolRunAccess(admin, ctx, toolRunId);
    runIdForError = run.id;

    if (run.approval_status !== "approved") {
      return { ok: false as const, message: "Сначала подтвердите действие." };
    }

    if (run.executed_at && isExecutingResult(run.result_preview) && isStaleExecutingLease(run.executed_at)) {
      const { error } = await restoreStaleExecutingAssistantToolRun(admin, ctx, run.id, run.executed_at);
      if (error) {
        return { ok: false as const, inProgress: true, actionApplied: false, restorePending: false, message: "Действие уже выполняется." };
      }
    } else if (run.executed_at && isExecutingResult(run.result_preview)) {
      return { ok: false as const, inProgress: true, actionApplied: false, restorePending: false, message: "Действие уже выполняется." };
    } else if (run.executed_at) {
      return { ok: true as const, alreadyExecuted: true };
    }

    const { data: claimedRun, error: claimError } = await claimApprovedAssistantToolRun(admin, ctx, run.id);
    if (claimError) {
      return { ok: false as const, message: "Не удалось выполнить действие. Попробуйте ещё раз." };
    }
    if (!claimedRun) {
      return { ok: false as const, inProgress: true, actionApplied: false, restorePending: false, message: "Действие уже выполняется." };
    }

    const inputPreview = getPreviewRecord(run.input_preview);
    if (!inputPreview) {
      return restoreApprovedAssistantToolRunOrReport(
        admin,
        ctx,
        run.id,
        "Некорректные данные действия.",
        "Не удалось выполнить действие. Попробуйте ещё раз."
      );
    }

    let resultPreview: Record<string, unknown>;

    if (run.tool_name === "propose_candidate_status_change") {
      const input = {
        candidateId: readString(inputPreview, "candidateId"),
        status: readString(inputPreview, "status"),
      };

      if (!input.candidateId || !input.status || !isCandidateStatus(input.status) || !statusValues.has(input.status)) {
        return restoreApprovedAssistantToolRunOrReport(admin, ctx, run.id, "Некорректный статус кандидата.", "Не удалось изменить статус кандидата.");
      }

      const access = await requireCandidateAccess(admin, ctx, input.candidateId);
      if (!access.ok) {
        return restoreApprovedAssistantToolRunOrReport(
          admin,
          ctx,
          run.id,
          "Кандидат недоступен для роли пользователя.",
          "Этот кандидат недоступен для вашей роли."
        );
      }

      const { data: currentCandidate, error: currentError } = await getScopedCandidateQuery(
        admin,
        ctx,
        input.candidateId,
        access
      ).maybeSingle();
      if (currentError || !currentCandidate) {
        return restoreApprovedAssistantToolRunOrReport(admin, ctx, run.id, "Не удалось прочитать кандидата.", "Не удалось изменить статус кандидата.");
      }

      const beforeStatus = currentCandidate.status ?? null;
      const beforeSnapshot = { status: beforeStatus, statusLabel: formatCandidateStatusLabel(beforeStatus) };
      const { data: updatedCandidate, error } = await getScopedCandidateUpdateQuery(admin, ctx, input.candidateId, access, { status: input.status });
      if (error || !updatedCandidate) {
        return restoreApprovedAssistantToolRunOrReport(admin, ctx, run.id, "Не удалось изменить статус кандидата.", "Не удалось изменить статус кандидата.");
      }
      actionApplied = true;
      const updatedStatus = updatedCandidate.status ?? input.status;
      const statusLabel = formatCandidateStatusLabel(updatedStatus);

      // Audit helper writes assistant_audit_events after rechecking the tool run scope.
      const auditRecorded = await safeWriteAssistantAuditEvent(admin, ctx, {
        threadId: run.thread_id,
        toolRunId: run.id,
        eventType: "candidate_status_updated_by_assistant",
        entityType: "candidate",
        entityId: input.candidateId,
        beforeSnapshot,
        afterSnapshot: { status: updatedStatus, statusLabel },
      });

      resultPreview = {
        ok: true,
        action: run.tool_name,
        candidateId: input.candidateId,
        status: updatedStatus,
        statusLabel,
        auditRecorded,
      };
    } else if (run.tool_name === "propose_candidate_note_update") {
      const input = {
        candidateId: readString(inputPreview, "candidateId"),
        comment: readString(inputPreview, "comment"),
      };
      const comment = input.comment?.trim() ?? "";

      if (!input.candidateId || !comment || comment.length > MAX_CANDIDATE_COMMENT_LENGTH) {
        return restoreApprovedAssistantToolRunOrReport(admin, ctx, run.id, "Некорректная заметка кандидата.", "Не удалось обновить заметку кандидата.");
      }

      const access = await requireCandidateAccess(admin, ctx, input.candidateId);
      if (!access.ok) {
        return restoreApprovedAssistantToolRunOrReport(
          admin,
          ctx,
          run.id,
          "Кандидат недоступен для роли пользователя.",
          "Этот кандидат недоступен для вашей роли."
        );
      }

      const { data: currentCandidate, error: currentError } = await getScopedCandidateQuery(
        admin,
        ctx,
        input.candidateId,
        access
      ).maybeSingle();
      if (currentError || !currentCandidate) {
        return restoreApprovedAssistantToolRunOrReport(admin, ctx, run.id, "Не удалось прочитать кандидата.", "Не удалось обновить заметку кандидата.");
      }

      const beforeSnapshot = { comment: currentCandidate.comment ?? null };
      const { data: updatedCandidate, error } = await getScopedCandidateUpdateQuery(admin, ctx, input.candidateId, access, { comment });
      if (error || !updatedCandidate) {
        return restoreApprovedAssistantToolRunOrReport(admin, ctx, run.id, "Не удалось обновить заметку кандидата.", "Не удалось обновить заметку кандидата.");
      }
      actionApplied = true;

      const auditRecorded = await safeWriteAssistantAuditEvent(admin, ctx, {
        threadId: run.thread_id,
        toolRunId: run.id,
        eventType: "candidate_note_updated_by_assistant",
        entityType: "candidate",
        entityId: input.candidateId,
        beforeSnapshot,
        afterSnapshot: { comment: updatedCandidate.comment ?? comment },
      });

      resultPreview = {
        ok: true,
        action: run.tool_name,
        candidateId: input.candidateId,
        comment: updatedCandidate.comment ?? comment,
        auditRecorded,
      };
    } else if (run.tool_name === "start_candidate_ai_analysis") {
      const candidateId = readString(inputPreview, "candidateId");
      if (!candidateId) {
        return restoreApprovedAssistantToolRunOrReport(admin, ctx, run.id, "Некорректный кандидат.", "Не удалось запустить AI-анализ.");
      }

      const result = await enqueueAiAnalysisFromAssistant(admin, ctx, candidateId);
      if (!result.ok) {
        return restoreApprovedAssistantToolRunOrReport(admin, ctx, run.id, result.message, result.message);
      }
      actionApplied = true;

      const auditRecorded = await safeWriteAssistantAuditEvent(admin, ctx, {
        threadId: run.thread_id,
        toolRunId: run.id,
        eventType: "candidate_ai_analysis_started_by_assistant",
        entityType: "candidate",
        entityId: candidateId,
        afterSnapshot: { jobId: result.jobId },
      });

      resultPreview = { ok: true, action: run.tool_name, candidateId, jobId: result.jobId, auditRecorded };
    } else {
      return restoreApprovedAssistantToolRunOrReport(admin, ctx, run.id, "Действие пока недоступно.", "Это действие пока недоступно.");
    }

    const { error: finalizeError } = await finalizeAssistantToolRun(admin, ctx, run.id, resultPreview);
    if (finalizeError) {
      await markAppliedAssistantToolRunError(admin, ctx, run.id, "Действие выполнено, но не удалось сохранить результат.");
      return {
        ok: false as const,
        actionApplied,
        restorePending: false,
        message: "Действие выполнено, но не удалось сохранить результат. Обновите страницу.",
      };
    }

    return { ok: true as const };
  } catch {
    let restorePending = !actionApplied;
    if (!actionApplied && runIdForError) {
      try {
        const { error } = await restoreApprovedAssistantToolRun(admin, ctx, runIdForError, "Не удалось выполнить действие.");
        restorePending = !error;
      } catch {
        restorePending = false;
        // Keep the response user-safe even if the service row cannot record the failure.
      }
    } else if (actionApplied && runIdForError) {
      try {
        await markAppliedAssistantToolRunError(admin, ctx, runIdForError, "Действие выполнено, но не удалось сохранить служебную запись.");
      } catch {
        // Keep the response user-safe even if the service row cannot record the failure.
      }
    }

    return {
      ok: false as const,
      actionApplied,
      restorePending,
      message: actionApplied
        ? "Действие выполнено, но не удалось сохранить служебную запись. Обновите страницу."
        : restorePending
          ? "Не удалось выполнить действие. Попробуйте ещё раз."
          : "Не удалось выполнить действие. Обновите страницу.",
    };
  }
}
