import "server-only";

import type { CompanyContext } from "@/lib/access/company-guards";
import { requireCandidateAccess } from "@/lib/access/company-guards";
import { isAiAllowed, loadCompanyPlanSnapshot } from "@/lib/billing/subscription";

import { createAssistantToolRun } from "../tool-runs";

type AiAnalysisValidationErrorReason = "access" | "plan" | "duplicate" | "credits" | "lookup";

type AiAnalysisValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: AiAnalysisValidationErrorReason;
      message: string;
    };

export async function getAvailableCredits(admin: any, companyId: string): Promise<number> {
  const { data, error } = await admin
    .from("company_credits")
    .select("balance,reserved")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) return 0;

  const balance = typeof data?.balance === "number" ? data.balance : 0;
  const reserved = typeof data?.reserved === "number" ? data.reserved : 0;
  return Math.max(0, balance - reserved);
}

async function hasActiveOrCompletedAnalysis(admin: any, ctx: CompanyContext, candidateId: string) {
  const { data, error } = await admin
    .from("jobs_ai")
    .select("id,status")
    .eq("company_id", ctx.companyId)
    .eq("candidate_id", candidateId)
    .in("status", ["queued", "processing", "done"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false as const };
  return { ok: true as const, exists: Boolean(data) };
}

export async function validateAiAnalysisFromAssistant(
  admin: any,
  ctx: CompanyContext,
  candidateId: string
): Promise<AiAnalysisValidationResult> {
  const access = await requireCandidateAccess(admin, ctx, candidateId);
  if (!access.ok) {
    return { ok: false, reason: "access", message: "Этот кандидат недоступен для вашей роли." };
  }

  const planSnapshot = await loadCompanyPlanSnapshot(admin, ctx.companyId);
  if (!isAiAllowed(planSnapshot)) {
    return { ok: false, reason: "plan", message: "AI-анализ доступен только на активном тарифе." };
  }

  const existingAnalysis = await hasActiveOrCompletedAnalysis(admin, ctx, candidateId);
  if (!existingAnalysis.ok) {
    return { ok: false, reason: "lookup", message: "Не удалось проверить текущий AI-анализ. Попробуйте ещё раз." };
  }

  if (existingAnalysis.exists) {
    return { ok: false, reason: "duplicate", message: "AI-анализ для этого кандидата уже есть или выполняется." };
  }

  const availableCredits = await getAvailableCredits(admin, ctx.companyId);
  if (availableCredits < 1) {
    return { ok: false, reason: "credits", message: "Пополните баланс, чтобы запустить AI-анализ." };
  }

  return { ok: true };
}

export async function proposeAiAnalysisFromAssistant(
  admin: any,
  ctx: CompanyContext,
  input: { threadId: string; candidateId: string; assistantRequestId?: string | null }
) {
  const validation = await validateAiAnalysisFromAssistant(admin, ctx, input.candidateId);
  if (!validation.ok) return validation;

  const run = await createAssistantToolRun(admin, ctx, {
    threadId: input.threadId,
    toolName: "start_candidate_ai_analysis",
    inputPreview: { candidateId: input.candidateId },
    riskLevel: "ai_cost",
    policyDecision: "manual_approval_required",
    approvalStatus: "pending",
    assistantRequestId: input.assistantRequestId,
  });

  return {
    ok: true as const,
    approvalRequired: true,
    toolRunId: run.id,
    message: "Подтвердите запуск AI-анализа. Будет зарезервирован 1 кредит.",
  };
}

export async function enqueueAiAnalysisFromAssistant(admin: any, ctx: CompanyContext, candidateId: string) {
  const validation = await validateAiAnalysisFromAssistant(admin, ctx, candidateId);
  if (!validation.ok) return validation;

  const { data: job, error } = await admin.rpc("enqueue_ai_job_with_credit_reserve", {
    p_company_id: ctx.companyId,
    p_candidate_id: candidateId,
    p_requested_by: ctx.userId,
    p_credits_to_reserve: 1,
  });

  if (error || !job || typeof (job as { id?: unknown }).id !== "string") {
    return { ok: false as const, reason: "enqueue", message: "Не удалось запустить AI-анализ. Попробуйте ещё раз." };
  }

  return { ok: true as const, jobId: (job as { id: string }).id };
}
