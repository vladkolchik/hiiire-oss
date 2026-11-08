import "server-only";

import type { CompanyContext } from "@/lib/access/company-guards";
import { requireCandidateAccess } from "@/lib/access/company-guards";
import { formatCandidateStatusLabel } from "@/lib/candidates/status-labels";

import { createAssistantToolRun } from "../tool-runs";

export const CANDIDATE_STATUS_VALUES = [
  "new",
  "reviewing",
  "security-check",
  "interview-scheduled",
  "interviewed",
  "offer",
  "hired",
  "rejected",
] as const;

export type CandidateStatus = (typeof CANDIDATE_STATUS_VALUES)[number];

export const MAX_CANDIDATE_COMMENT_LENGTH = 500;

const candidateStatusSet = new Set<string>(CANDIDATE_STATUS_VALUES);

export function isCandidateStatus(value: unknown): value is CandidateStatus {
  return typeof value === "string" && candidateStatusSet.has(value);
}

export function normalizeCandidateComment(value: unknown) {
  if (typeof value !== "string") return null;
  const comment = value.trim();
  if (!comment || comment.length > MAX_CANDIDATE_COMMENT_LENGTH) return null;
  return comment;
}

export async function proposeCandidateStatusChange(
  admin: any,
  ctx: CompanyContext,
  input: { threadId: string; candidateId: string; status: CandidateStatus; reason?: string | null; assistantRequestId?: string | null }
) {
  const access = await requireCandidateAccess(admin, ctx, input.candidateId);
  if (!access.ok) return { ok: false as const, message: "Этот кандидат недоступен для вашей роли." };

  if (!isCandidateStatus(input.status)) {
    return { ok: false as const, message: "Выберите доступный статус кандидата." };
  }

  const reason = typeof input.reason === "string" && input.reason.trim() ? input.reason.trim() : null;
  const statusLabel = formatCandidateStatusLabel(input.status);
  const message = `Подтвердите изменение статуса кандидата: ${statusLabel}.`;
  const run = await createAssistantToolRun(admin, ctx, {
    threadId: input.threadId,
    toolName: "propose_candidate_status_change",
    inputPreview: { candidateId: input.candidateId, status: input.status, statusLabel, reason },
    riskLevel: "crm_write",
    policyDecision: "manual_approval_required",
    approvalStatus: "pending",
    resultPreview: { message, statusLabel },
    assistantRequestId: input.assistantRequestId,
  });

  return {
    ok: true as const,
    approvalRequired: true,
    toolRunId: run.id,
    message,
    statusLabel,
  };
}

export async function proposeCandidateNoteUpdate(
  admin: any,
  ctx: CompanyContext,
  input: { threadId: string; candidateId: string; comment: string; assistantRequestId?: string | null }
) {
  const access = await requireCandidateAccess(admin, ctx, input.candidateId);
  if (!access.ok) return { ok: false as const, message: "Этот кандидат недоступен для вашей роли." };

  const rawComment = typeof input.comment === "string" ? input.comment : "";
  const comment = normalizeCandidateComment(rawComment);
  if (!comment) {
    return {
      ok: false as const,
      message: rawComment.trim().length > MAX_CANDIDATE_COMMENT_LENGTH ? "Сократите заметку до 500 символов." : "Добавьте текст заметки.",
    };
  }

  const run = await createAssistantToolRun(admin, ctx, {
    threadId: input.threadId,
    toolName: "propose_candidate_note_update",
    inputPreview: { candidateId: input.candidateId, comment },
    riskLevel: "crm_write",
    policyDecision: "manual_approval_required",
    approvalStatus: "pending",
    assistantRequestId: input.assistantRequestId,
  });

  return {
    ok: true as const,
    approvalRequired: true,
    toolRunId: run.id,
    message: "Подтвердите обновление заметки кандидата.",
  };
}
