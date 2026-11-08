import "server-only";

import type { CompanyContext } from "@/lib/access/company-guards";

import type { HrAssistantPolicyDecision } from "./types";
import { requireAssistantThreadAccess } from "./persistence";

const ASSISTANT_REQUEST_ID_INPUT_KEY = "_assistantRequestId";

export type AssistantToolRiskLevel = "read" | "draft" | "ai_cost" | "crm_write" | "external" | "destructive";
export type AssistantToolApprovalStatus = "not_required" | "pending" | "approved" | "rejected" | "expired";

export type CreateAssistantToolRunInput = {
  threadId: string;
  toolName: string;
  inputPreview: Record<string, unknown>;
  riskLevel: AssistantToolRiskLevel;
  policyDecision: HrAssistantPolicyDecision;
  approvalStatus?: AssistantToolApprovalStatus;
  messageId?: string | null;
  resultPreview?: Record<string, unknown> | null;
  assistantRequestId?: string | null;
};

function withAssistantRequestId(inputPreview: Record<string, unknown>, assistantRequestId?: string | null) {
  if (!assistantRequestId) return inputPreview;
  return { ...inputPreview, [ASSISTANT_REQUEST_ID_INPUT_KEY]: assistantRequestId };
}

export async function createAssistantToolRun(admin: any, ctx: CompanyContext, input: CreateAssistantToolRunInput) {
  await requireAssistantThreadAccess(admin, ctx, input.threadId);

  const { data, error } = await admin
    .from("assistant_tool_runs")
    .insert({
      thread_id: input.threadId,
      message_id: input.messageId ?? null,
      company_id: ctx.companyId,
      tool_name: input.toolName,
      input_preview: withAssistantRequestId(input.inputPreview, input.assistantRequestId),
      risk_level: input.riskLevel,
      policy_decision: input.policyDecision,
      approval_status: input.approvalStatus ?? "not_required",
      result_preview: input.resultPreview ?? {},
    })
    .select("id,thread_id,approval_status,policy_decision,tool_name,input_preview")
    .single();

  if (error || !data) throw new Error("ASSISTANT_TOOL_RUN_CREATE_FAILED");
  return data;
}

export async function attachAssistantToolRunsToMessage(
  admin: any,
  ctx: CompanyContext,
  input: { threadId: string; messageId: string; assistantRequestId: string }
) {
  await requireAssistantThreadAccess(admin, ctx, input.threadId);

  const { error } = await admin
    .from("assistant_tool_runs")
    .update({ message_id: input.messageId })
    .eq("company_id", ctx.companyId)
    .eq("thread_id", input.threadId)
    .is("message_id", null)
    .filter(`input_preview->>${ASSISTANT_REQUEST_ID_INPUT_KEY}`, "eq", input.assistantRequestId);

  if (error) throw new Error("ASSISTANT_TOOL_RUN_ATTACH_FAILED");
}

export async function requireAssistantToolRunAccess(admin: any, ctx: CompanyContext, toolRunId: string) {
  const { data, error } = await admin
    .from("assistant_tool_runs")
    .select("id,thread_id,company_id,tool_name,input_preview,risk_level,policy_decision,approval_status,executed_at,result_preview")
    .eq("id", toolRunId)
    .eq("company_id", ctx.companyId)
    .maybeSingle();

  if (error || !data) throw new Error("ASSISTANT_TOOL_RUN_LOOKUP_FAILED");
  await requireAssistantThreadAccess(admin, ctx, data.thread_id);
  return data;
}

export async function updateAssistantToolRunResultPreview(
  admin: any,
  ctx: CompanyContext,
  input: { toolRunId: string; resultPreview: Record<string, unknown> }
) {
  await requireAssistantToolRunAccess(admin, ctx, input.toolRunId);

  const { error } = await admin
    .from("assistant_tool_runs")
    .update({ result_preview: input.resultPreview })
    .eq("id", input.toolRunId)
    .eq("company_id", ctx.companyId);

  if (error) throw new Error("ASSISTANT_TOOL_RUN_RESULT_UPDATE_FAILED");
}

export type WriteAssistantAuditEventInput = {
  threadId?: string | null;
  toolRunId?: string | null;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  beforeSnapshot?: Record<string, unknown> | null;
  afterSnapshot?: Record<string, unknown> | null;
};

export async function writeAssistantAuditEvent(admin: any, ctx: CompanyContext, input: WriteAssistantAuditEventInput) {
  let threadId = input.threadId ?? null;

  if (input.toolRunId) {
    const toolRun = await requireAssistantToolRunAccess(admin, ctx, input.toolRunId);
    if (threadId && toolRun.thread_id !== threadId) throw new Error("ASSISTANT_AUDIT_WRITE_FAILED");
    threadId = toolRun.thread_id;
  }

  if (input.threadId) {
    await requireAssistantThreadAccess(admin, ctx, input.threadId);
  }

  const { error } = await admin.from("assistant_audit_events").insert({
    company_id: ctx.companyId,
    thread_id: threadId,
    tool_run_id: input.toolRunId ?? null,
    actor_user_id: ctx.userId,
    event_type: input.eventType,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    before_snapshot: input.beforeSnapshot ?? null,
    after_snapshot: input.afterSnapshot ?? null,
  });

  if (error) throw new Error("ASSISTANT_AUDIT_WRITE_FAILED");
}
