import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCompanyContext, type CompanyContext } from "@/lib/access/company-guards";
import { zodErrorToUserFacingIssues } from "@/lib/api/user-facing-errors";
import { executeApprovedAssistantAction } from "@/lib/hr-assistant/actions/execute-approved";
import { hrAssistantPlanAccessResponse, requireHrAssistantPlanAccess } from "@/lib/hr-assistant/access";
import { AssistantPersistenceError } from "@/lib/hr-assistant/persistence";
import { requireAssistantToolRunAccess, writeAssistantAuditEvent, type WriteAssistantAuditEventInput } from "@/lib/hr-assistant/tool-runs";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ACTION_ID_MESSAGE = "Действие не найдено или недоступно.";
const ACTION_DECISION_MESSAGE = "Выберите, подтвердить или отклонить действие.";
const ACTION_UPDATE_ERROR_MESSAGE = "Не удалось обновить действие. Попробуйте ещё раз.";
const ACTION_EXECUTION_ERROR_MESSAGE = "Не удалось выполнить действие. Попробуйте ещё раз.";
const ACTION_IN_PROGRESS_MESSAGE = "Действие уже выполняется.";
const EXECUTING_LEASE_MS = 5 * 60 * 1000;

const ParamsSchema = z.object({
  id: z.string({ error: ACTION_ID_MESSAGE }).uuid(ACTION_ID_MESSAGE),
});

const BodySchema = z
  .object({
    decision: z.enum(["approved", "rejected"], { error: ACTION_DECISION_MESSAGE }),
  })
  .strict();

function validationResponse(error: z.ZodError, code: "INVALID_PARAMS" | "INVALID_BODY") {
  const fallback = code === "INVALID_BODY" ? ACTION_DECISION_MESSAGE : ACTION_ID_MESSAGE;
  if (code === "INVALID_BODY") {
    return NextResponse.json(
      {
        error: code,
        message: fallback,
        issues: [{ path: ["decision"], message: fallback }],
      },
      { status: 400 }
    );
  }

  const issues = zodErrorToUserFacingIssues(error, fallback);
  return NextResponse.json(
    {
      error: code,
      message: issues[0]?.message ?? fallback,
      issues,
    },
    { status: 400 }
  );
}

function companyContextResponse(status: number) {
  if (status === 401) {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "Войдите в аккаунт, чтобы обработать действие." }, { status: 401 });
  }

  if (status === 403) {
    return NextResponse.json({ error: "FORBIDDEN", message: "Действие недоступно для вашей роли или компании." }, { status: 403 });
  }

  return NextResponse.json(
    { error: "INTERNAL_ERROR", message: "Не удалось проверить доступ к действию." },
    { status: 500 }
  );
}

function persistenceErrorResponse(error: AssistantPersistenceError) {
  if (error.code === "ASSISTANT_THREAD_NOT_FOUND" || error.code === "ASSISTANT_SCOPE_NOT_FOUND") {
    return NextResponse.json({ error: "NOT_FOUND", message: ACTION_ID_MESSAGE }, { status: 404 });
  }

  if (error.code === "ASSISTANT_SCOPE_NOT_SUPPORTED_YET") {
    return NextResponse.json({ error: "UNSUPPORTED_SCOPE", message: "Этот контекст пока нельзя использовать для действия." }, { status: 400 });
  }

  return NextResponse.json({ error: "INTERNAL_ERROR", message: "Не удалось проверить действие." }, { status: 500 });
}

function unknownErrorResponse(error: unknown) {
  if (error instanceof AssistantPersistenceError) return persistenceErrorResponse(error);

  if (error instanceof Error && error.message === "ASSISTANT_TOOL_RUN_LOOKUP_FAILED") {
    return NextResponse.json({ error: "NOT_FOUND", message: ACTION_ID_MESSAGE }, { status: 404 });
  }

  return NextResponse.json({ error: "INTERNAL_ERROR", message: "Не удалось обработать действие." }, { status: 500 });
}

function getPreviewRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isStaleExecution(executedAt: string | null) {
  if (!executedAt) return false;

  const timestamp = Date.parse(executedAt);
  return Number.isFinite(timestamp) && timestamp < Date.now() - EXECUTING_LEASE_MS;
}

function isExecutingApproval(toolRun: { approval_status: string; executed_at: string | null; result_preview?: unknown }) {
  const resultPreview = getPreviewRecord(toolRun.result_preview);
  return toolRun.approval_status === "approved" && Boolean(toolRun.executed_at) && resultPreview?.status === "executing" && !isStaleExecution(toolRun.executed_at);
}

async function safeWriteAssistantAuditEvent(admin: any, ctx: CompanyContext, input: WriteAssistantAuditEventInput) {
  try {
    await writeAssistantAuditEvent(admin, ctx, input);
  } catch {
    // Audit should not change the user-visible result after the action state is saved.
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const paramsResult = ParamsSchema.safeParse(await Promise.resolve(params));
    if (!paramsResult.success) return validationResponse(paramsResult.error, "INVALID_PARAMS");
    const { id } = paramsResult.data;

    const bodyJson = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(bodyJson);
    if (!parsed.success) return validationResponse(parsed.error, "INVALID_BODY");

    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();
    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return companyContextResponse(ctxRes.response.status);
    const ctx = ctxRes.data;
    if (!(await requireHrAssistantPlanAccess(admin, ctx.companyId))) return hrAssistantPlanAccessResponse();

    const toolRun = await requireAssistantToolRunAccess(admin, ctx, id);
    if (toolRun.policy_decision === "not_supported_yet" || toolRun.risk_level === "external") {
      return NextResponse.json(
        { error: "NOT_SUPPORTED", message: "Это действие пока недоступно. Можно подготовить черновик или выбрать другой шаг." },
        { status: 409 }
      );
    }

    if (isExecutingApproval(toolRun)) {
      return NextResponse.json({ error: "ACTION_IN_PROGRESS", message: ACTION_IN_PROGRESS_MESSAGE }, { status: 409 });
    }

    const alreadyApprovedButRunnable =
      toolRun.approval_status === "approved" &&
      parsed.data.decision === "approved" &&
      (!toolRun.executed_at || isStaleExecution(toolRun.executed_at));
    if (toolRun.approval_status !== "pending" && !alreadyApprovedButRunnable) {
      return NextResponse.json({ error: "ALREADY_RESOLVED", message: "Это действие уже обработано." }, { status: 409 });
    }

    let approval: { id: string; approval_status: string };
    if (alreadyApprovedButRunnable) {
      approval = { id: toolRun.id, approval_status: toolRun.approval_status };
    } else {
      const { data, error } = await admin
        .from("assistant_tool_runs")
        .update({
          approval_status: parsed.data.decision,
          approved_by: ctx.userId,
        })
        .eq("id", id)
        .eq("company_id", ctx.companyId)
        .eq("approval_status", "pending")
        .is("executed_at", null)
        .select("id,approval_status")
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: "UPDATE_FAILED", message: ACTION_UPDATE_ERROR_MESSAGE }, { status: 500 });
      }
      if (!data) {
        return NextResponse.json({ error: "ALREADY_RESOLVED", message: "Это действие уже обработано." }, { status: 409 });
      }

      approval = data;
    }

    if (parsed.data.decision === "rejected") {
      await safeWriteAssistantAuditEvent(admin, ctx, {
        threadId: toolRun.thread_id,
        toolRunId: toolRun.id,
        eventType: "assistant_action_rejected",
        afterSnapshot: { approval_status: "rejected" },
      });

      return NextResponse.json({ approval }, { status: 200 });
    }

    const execution = await executeApprovedAssistantAction(admin, ctx, id);
    if (!execution.ok) {
      if (execution.inProgress) {
        return NextResponse.json({ error: "ACTION_IN_PROGRESS", message: ACTION_IN_PROGRESS_MESSAGE }, { status: 409 });
      }

      const actionApplied = execution.actionApplied === true;
      const restorePending = execution.restorePending !== false && !actionApplied;
      const { error: restoreError } = await admin
        .from("assistant_tool_runs")
        .update({
          approval_status: restorePending ? "pending" : "approved",
          error_message: execution.message,
          executed_at: actionApplied ? new Date().toISOString() : null,
          result_preview: { ok: false, actionApplied: execution.actionApplied === true },
        })
        .eq("id", id)
        .eq("company_id", ctx.companyId);

      await safeWriteAssistantAuditEvent(admin, ctx, {
        threadId: toolRun.thread_id,
        toolRunId: toolRun.id,
        eventType: "assistant_action_execution_failed",
        afterSnapshot: {
          message: execution.message,
          actionApplied,
          restorePending,
          restoreError: Boolean(restoreError),
        },
      });

      if (restoreError) {
        return NextResponse.json(
          { error: "RESTORE_FAILED", message: "Действие не выполнено. Обновите страницу и проверьте статус." },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          error: "EXECUTION_FAILED",
          message: actionApplied ? "Действие выполнено, но карточка не обновилась. Обновите страницу." : ACTION_EXECUTION_ERROR_MESSAGE,
        },
        { status: actionApplied ? 500 : 409 }
      );
    }

    return NextResponse.json({ approval, execution }, { status: 200 });
  } catch (error) {
    return unknownErrorResponse(error);
  }
}
