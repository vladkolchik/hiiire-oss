import "server-only";

import type { CompanyContext } from "@/lib/access/company-guards";
import { requireCandidateAccess, requireVacancyAccess } from "@/lib/access/company-guards";
import { formatCandidateStatusLabel } from "@/lib/candidates/status-labels";
import { requireInterviewReadAccess } from "@/lib/interviews/access";

import type { HrAssistantThreadMode, HrAssistantThreadScope } from "./types";

export type CreateAssistantThreadInput = {
  title: string;
  scopeType: HrAssistantThreadScope;
  scopeId?: string | null;
  mode: HrAssistantThreadMode;
};

export type ListAssistantThreadsInput = {
  includeArchived?: boolean;
  searchQuery?: string | null;
};

export type AssistantPersistenceErrorCode =
  | "ASSISTANT_SCOPE_NOT_FOUND"
  | "ASSISTANT_SCOPE_NOT_SUPPORTED_YET"
  | "ASSISTANT_THREADS_LOOKUP_FAILED"
  | "ASSISTANT_THREAD_CREATE_FAILED"
  | "ASSISTANT_THREAD_UPDATE_FAILED"
  | "ASSISTANT_THREAD_LOOKUP_FAILED"
  | "ASSISTANT_THREAD_NOT_FOUND"
  | "ASSISTANT_MESSAGES_LOOKUP_FAILED"
  | "ASSISTANT_MESSAGE_SAVE_FAILED";

export class AssistantPersistenceError extends Error {
  constructor(readonly code: AssistantPersistenceErrorCode) {
    super(code);
    this.name = "AssistantPersistenceError";
  }
}

function fail(code: AssistantPersistenceErrorCode): never {
  throw new AssistantPersistenceError(code);
}

export async function requireAssistantScopeAccess(
  admin: any,
  ctx: CompanyContext,
  input: { scopeType: HrAssistantThreadScope; scopeId?: string | null }
) {
  if (input.scopeType === "company" || input.scopeType === "support") return;
  if (input.scopeType === "client_account") fail("ASSISTANT_SCOPE_NOT_SUPPORTED_YET");
  if (!input.scopeId) fail("ASSISTANT_SCOPE_NOT_FOUND");

  if (input.scopeType === "vacancy") {
    const access = await requireVacancyAccess(admin, ctx, input.scopeId);
    if (!access.ok) fail("ASSISTANT_SCOPE_NOT_FOUND");
    return;
  }

  if (input.scopeType === "candidate") {
    const access = await requireCandidateAccess(admin, ctx, input.scopeId);
    if (!access.ok) fail("ASSISTANT_SCOPE_NOT_FOUND");
    return;
  }

  if (input.scopeType === "interview") {
    const { data, error } = await admin
      .from("interviews")
      .select("id,company_id,candidate_id,vacancy_id,status,interviewer_ids,created_by,updated_at")
      .eq("id", input.scopeId)
      .maybeSingle();

    if (error || !data || data.company_id !== ctx.companyId) fail("ASSISTANT_SCOPE_NOT_FOUND");

    const access = await requireInterviewReadAccess(admin, ctx, {
      id: data.id,
      companyId: data.company_id,
      candidateId: data.candidate_id,
      vacancyId: data.vacancy_id,
      status: data.status,
      interviewerIds: data.interviewer_ids ?? [],
      createdById: data.created_by,
      updatedAt: data.updated_at,
    });
    if (!access) fail("ASSISTANT_SCOPE_NOT_FOUND");
    return;
  }

  fail("ASSISTANT_SCOPE_NOT_SUPPORTED_YET");
}

const THREAD_SELECT_FIELDS = "id,title,scope_type,scope_id,mode,summary,updated_at,archived_at,pinned_at,owner_id,visibility";
const DEFAULT_THREAD_TITLE = "Новый чат";
const THREAD_TITLE_MAX_LENGTH = 160;
const THREAD_LIST_LIMIT = 50;
const THREAD_SEARCH_LIMIT = 100;
const THREAD_SEARCH_THREAD_SCAN_LIMIT = 500;
const THREAD_SEARCH_MESSAGE_CHUNK_SIZE = 50;

type AssistantThreadRow = {
  id: string;
  title: string;
  scope_type: HrAssistantThreadScope;
  scope_id: string | null;
  mode: HrAssistantThreadMode;
  summary: string | null;
  updated_at: string;
  archived_at: string | null;
  pinned_at: string | null;
  owner_id: string;
  visibility: "private" | "company";
  message_snippet?: string | null;
  search_match_type?: "title" | "message" | null;
};

type AssistantMessageSearchRow = {
  thread_id: string;
  content: string;
  created_at: string;
};

function applyThreadAccessFilters(query: any, ctx: CompanyContext) {
  if (ctx.role === "admin") return query;
  return query.eq("owner_id", ctx.userId).eq("visibility", "private");
}

function normalizeThreadSearchQuery(value: string | null | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  return normalized.length >= 2 ? normalized.slice(0, 120) : "";
}

function toIlikePattern(value: string) {
  return `%${value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
}

function getMessageSnippet(content: string, searchQuery: string) {
  const normalizedContent = content.replace(/\s+/g, " ").trim();
  if (!normalizedContent) return null;

  const lowerContent = normalizedContent.toLocaleLowerCase("ru-RU");
  const lowerQuery = searchQuery.toLocaleLowerCase("ru-RU");
  const matchIndex = lowerContent.indexOf(lowerQuery);
  const start = matchIndex > 24 ? matchIndex - 24 : 0;
  const end = Math.min(normalizedContent.length, Math.max(matchIndex + searchQuery.length + 56, 96));
  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalizedContent.length ? "..." : "";
  return `${prefix}${normalizedContent.slice(start, end)}${suffix}`;
}

export function generateAssistantThreadTitle(message: string) {
  const normalized = message
    .replace(/\s+/g, " ")
    .replace(/^["'«»]+|["'«»]+$/g, "")
    .trim();
  if (!normalized) return DEFAULT_THREAD_TITLE;

  const withoutTrailingPunctuation = normalized.replace(/[.!?。！？]+$/u, "").trim();
  const candidate = withoutTrailingPunctuation || normalized;
  if (candidate.length <= 64) return candidate;
  return `${candidate.slice(0, 61).trimEnd()}...`;
}

async function filterAccessibleThreads(admin: any, ctx: CompanyContext, threads: AssistantThreadRow[]) {
  const visibleThreads = [];
  for (const thread of threads ?? []) {
    try {
      await requireAssistantScopeAccess(admin, ctx, {
        scopeType: thread.scope_type,
        scopeId: thread.scope_id,
      });
      visibleThreads.push(thread);
    } catch (error) {
      if (error instanceof AssistantPersistenceError) continue;
      throw error;
    }
  }

  return visibleThreads;
}

async function loadAccessibleAssistantThreadSearchPool(admin: any, ctx: CompanyContext, includeArchived: boolean) {
  let query = admin
    .from("assistant_threads")
    .select(THREAD_SELECT_FIELDS)
    .eq("company_id", ctx.companyId)
    .order("pinned_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(THREAD_SEARCH_THREAD_SCAN_LIMIT);

  if (!includeArchived) query = query.is("archived_at", null);
  query = applyThreadAccessFilters(query, ctx);

  const { data, error } = await query;
  if (error) fail("ASSISTANT_THREADS_LOOKUP_FAILED");

  return filterAccessibleThreads(admin, ctx, (data ?? []) as AssistantThreadRow[]);
}

function sortAssistantThreads(threads: AssistantThreadRow[]) {
  return [...threads].sort((a, b) => {
    if (Boolean(a.pinned_at) !== Boolean(b.pinned_at)) return a.pinned_at ? -1 : 1;
    const aPinned = a.pinned_at ? Date.parse(a.pinned_at) : 0;
    const bPinned = b.pinned_at ? Date.parse(b.pinned_at) : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    return Date.parse(b.updated_at) - Date.parse(a.updated_at);
  });
}

export async function listAssistantThreads(admin: any, ctx: CompanyContext, input: ListAssistantThreadsInput = {}) {
  const searchQuery = normalizeThreadSearchQuery(input.searchQuery);
  if (searchQuery) return searchAssistantThreads(admin, ctx, searchQuery, input);

  let query = admin
    .from("assistant_threads")
    .select(THREAD_SELECT_FIELDS)
    .eq("company_id", ctx.companyId)
    .order("pinned_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(THREAD_LIST_LIMIT);

  if (!input.includeArchived) {
    query = query.is("archived_at", null);
  }

  query = applyThreadAccessFilters(query, ctx);

  const { data, error } = await query;
  if (error) fail("ASSISTANT_THREADS_LOOKUP_FAILED");

  return filterAccessibleThreads(admin, ctx, (data ?? []) as AssistantThreadRow[]);
}

async function searchAssistantThreads(admin: any, ctx: CompanyContext, searchQuery: string, input: ListAssistantThreadsInput) {
  const pattern = toIlikePattern(searchQuery);
  const includeArchived = input.includeArchived ?? false;
  const accessibleThreads = await loadAccessibleAssistantThreadSearchPool(admin, ctx, includeArchived);
  const accessibleThreadIds = accessibleThreads.map((thread) => thread.id);
  const messageSnippets = new Map<string, string | null>();

  for (let index = 0; index < accessibleThreadIds.length; index += THREAD_SEARCH_MESSAGE_CHUNK_SIZE) {
    const threadIdChunk = accessibleThreadIds.slice(index, index + THREAD_SEARCH_MESSAGE_CHUNK_SIZE);
    if (threadIdChunk.length === 0) continue;

    const { data: messages, error: messageError } = await admin
      .from("assistant_messages")
      .select("thread_id,content,created_at")
      .eq("company_id", ctx.companyId)
      .in("thread_id", threadIdChunk)
      .ilike("content", pattern)
      .order("created_at", { ascending: false })
      .limit(THREAD_SEARCH_LIMIT);

    if (messageError) fail("ASSISTANT_MESSAGES_LOOKUP_FAILED");

    for (const message of (messages ?? []) as AssistantMessageSearchRow[]) {
      if (!messageSnippets.has(message.thread_id)) {
        messageSnippets.set(message.thread_id, getMessageSnippet(message.content, searchQuery));
      }
    }
  }

  const merged = new Map<string, AssistantThreadRow>();
  const normalizedSearchQuery = searchQuery.toLocaleLowerCase("ru-RU");
  for (const thread of accessibleThreads) {
    const titleMatches = thread.title.toLocaleLowerCase("ru-RU").includes(normalizedSearchQuery);
    const messageSnippet = messageSnippets.get(thread.id) ?? null;
    if (titleMatches) {
      merged.set(thread.id, { ...thread, search_match_type: "title", message_snippet: messageSnippet });
      continue;
    }

    if (messageSnippets.has(thread.id)) {
      merged.set(thread.id, { ...thread, search_match_type: "message", message_snippet: messageSnippet });
    }
  }

  return sortAssistantThreads(Array.from(merged.values())).slice(0, THREAD_LIST_LIMIT);
}

export async function createAssistantThread(admin: any, ctx: CompanyContext, input: CreateAssistantThreadInput) {
  await requireAssistantScopeAccess(admin, ctx, input);

  const { data, error } = await admin
    .from("assistant_threads")
    .insert({
      company_id: ctx.companyId,
      owner_id: ctx.userId,
      title: input.title,
      scope_type: input.scopeType,
      scope_id: input.scopeId ?? null,
      mode: input.mode,
      visibility: "private",
    })
    .select(THREAD_SELECT_FIELDS)
    .single();

  if (error || !data) fail("ASSISTANT_THREAD_CREATE_FAILED");
  return data;
}

export async function requireAssistantThreadAccess(admin: any, ctx: CompanyContext, threadId: string) {
  const { data, error } = await admin
    .from("assistant_threads")
    .select("id,company_id,owner_id,title,scope_type,scope_id,mode,summary,archived_at,pinned_at,visibility")
    .eq("id", threadId)
    .maybeSingle();

  if (error) fail("ASSISTANT_THREAD_LOOKUP_FAILED");
  if (!data || data.company_id !== ctx.companyId) fail("ASSISTANT_THREAD_NOT_FOUND");
  if (ctx.role !== "admin" && (data.visibility !== "private" || data.owner_id !== ctx.userId)) {
    fail("ASSISTANT_THREAD_NOT_FOUND");
  }

  await requireAssistantScopeAccess(admin, ctx, {
    scopeType: data.scope_type,
    scopeId: data.scope_id,
  });
  return data;
}

export async function updateAssistantThreadTitleFromFirstMessage(
  admin: any,
  ctx: CompanyContext,
  input: { threadId: string; currentTitle: string; firstUserMessage: string }
) {
  if (input.currentTitle !== DEFAULT_THREAD_TITLE) return null;

  const title = generateAssistantThreadTitle(input.firstUserMessage);
  if (!title || title === DEFAULT_THREAD_TITLE) return null;

  const { data, error } = await admin
    .from("assistant_threads")
    .update({ title: title.slice(0, THREAD_TITLE_MAX_LENGTH), updated_at: new Date().toISOString() })
    .eq("id", input.threadId)
    .eq("company_id", ctx.companyId)
    .eq("title", DEFAULT_THREAD_TITLE)
    .select("id,title")
    .maybeSingle();

  if (error) fail("ASSISTANT_THREAD_UPDATE_FAILED");
  return data;
}

export async function listAssistantMessages(admin: any, ctx: CompanyContext, threadId: string) {
  await requireAssistantThreadAccess(admin, ctx, threadId);

  const { data, error } = await admin
    .from("assistant_messages")
    .select("id,role,content,metadata,model,provider,created_at")
    .eq("company_id", ctx.companyId)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) fail("ASSISTANT_MESSAGES_LOOKUP_FAILED");
  return data ?? [];
}

export type AssistantDisplayMessagePart =
  | { type: "text"; text: string }
  | {
      type: "action";
      toolRunId: string;
      toolName: string;
      title: string;
      description: string;
      approvalStatus: string;
      executionStatus: "not_started" | "executing" | "succeeded" | "failed" | "blocked";
      riskLevel: string;
      inputPreview: Record<string, unknown>;
      resultPreview: Record<string, unknown> | null;
      errorMessage: string | null;
    };

export type AssistantDisplayMessage = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  parts: AssistantDisplayMessagePart[];
  created_at: string;
};

const ASSISTANT_REQUEST_ID_INPUT_KEY = "_assistantRequestId";

type AssistantToolRunDisplayRow = {
  id: string;
  message_id: string | null;
  tool_name: string;
  input_preview: unknown;
  risk_level: string;
  approval_status: string;
  policy_decision: string;
  executed_at: string | null;
  result_preview: unknown;
  error_message: string | null;
  created_at: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toPublicInputPreview(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  const { [ASSISTANT_REQUEST_ID_INPUT_KEY]: _assistantRequestId, ...publicInputPreview } = record;
  return publicInputPreview;
}

function getActionTitle(toolName: string): string | null {
  if (toolName === "propose_candidate_status_change") return "Изменить статус кандидата";
  if (toolName === "propose_candidate_note_update") return "Обновить заметку кандидата";
  if (toolName === "start_candidate_ai_analysis") return "Запустить AI-анализ кандидата";
  if (toolName === "explain_unsupported_action") return "Действие пока недоступно";
  return null;
}

function getActionDescription(row: AssistantToolRunDisplayRow): string {
  if (row.error_message) return row.error_message;
  const resultPreview = asRecord(row.result_preview);
  if (typeof resultPreview.message === "string" && resultPreview.message) return resultPreview.message;
  if (row.tool_name === "propose_candidate_status_change") {
    const inputPreview = asRecord(row.input_preview);
    const statusLabel =
      typeof inputPreview.statusLabel === "string" && inputPreview.statusLabel
        ? inputPreview.statusLabel
        : formatCandidateStatusLabel(typeof inputPreview.status === "string" ? inputPreview.status : null);
    return `Подтвердите изменение статуса кандидата: ${statusLabel}.`;
  }
  if (row.policy_decision === "not_supported_yet") return "Это действие пока нельзя выполнить из ассистента.";
  return "Проверьте действие и подтвердите, если всё верно.";
}

function getExecutionStatus(row: {
  approval_status: string;
  policy_decision: string;
  executed_at: string | null;
  result_preview: unknown;
  error_message: string | null;
}) {
  const result = asRecord(row.result_preview);
  if (row.approval_status === "rejected" || row.approval_status === "expired" || row.policy_decision === "not_supported_yet") return "blocked" as const;
  if (result.status === "executing") return "executing" as const;
  if (row.error_message) return "failed" as const;
  if (row.executed_at) return "succeeded" as const;
  return "not_started" as const;
}

function toActionPart(row: AssistantToolRunDisplayRow): AssistantDisplayMessagePart | null {
  const title = getActionTitle(row.tool_name);
  if (!title) return null;

  return {
    type: "action",
    toolRunId: row.id,
    toolName: row.tool_name,
    title,
    description: getActionDescription(row),
    approvalStatus: row.approval_status,
    executionStatus: getExecutionStatus(row),
    riskLevel: row.risk_level,
    inputPreview: toPublicInputPreview(row.input_preview),
    resultPreview: row.result_preview ? asRecord(row.result_preview) : null,
    errorMessage: row.error_message ?? null,
  };
}

export async function listAssistantDisplayMessages(admin: any, ctx: CompanyContext, threadId: string): Promise<AssistantDisplayMessage[]> {
  const messages = (await listAssistantMessages(admin, ctx, threadId)) as Array<{
    id: string;
    role: "user" | "assistant" | "tool";
    content: string;
    created_at: string;
  }>;

  const { data: runs, error } = await admin
    .from("assistant_tool_runs")
    .select("id,message_id,tool_name,input_preview,risk_level,policy_decision,approval_status,executed_at,result_preview,error_message,created_at")
    .eq("company_id", ctx.companyId)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) fail("ASSISTANT_MESSAGES_LOOKUP_FAILED");

  const runsByMessageId = new Map<string, AssistantToolRunDisplayRow[]>();

  for (const run of (runs ?? []) as AssistantToolRunDisplayRow[]) {
    if (!run.message_id) continue;

    const actionPart = toActionPart(run);
    if (!actionPart) continue;

    const list = runsByMessageId.get(run.message_id) ?? [];
    list.push(run);
    runsByMessageId.set(run.message_id, list);
  }

  return messages.map((message) => {
    const actionParts = (runsByMessageId.get(message.id) ?? [])
      .map(toActionPart)
      .filter((part): part is AssistantDisplayMessagePart => Boolean(part));

    return {
      id: message.id,
      role: message.role,
      content: message.content,
      created_at: message.created_at,
      parts: [{ type: "text" as const, text: message.content }, ...actionParts],
    };
  });
}

export async function listRecentAssistantMessages(admin: any, ctx: CompanyContext, threadId: string, limit = 20) {
  await requireAssistantThreadAccess(admin, ctx, threadId);

  const { data, error } = await admin
    .from("assistant_messages")
    .select("id,role,content,metadata,model,provider,created_at")
    .eq("company_id", ctx.companyId)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (error) fail("ASSISTANT_MESSAGES_LOOKUP_FAILED");
  return (data ?? []).reverse();
}

export async function saveAssistantMessage(
  admin: any,
  ctx: CompanyContext,
  input: {
    threadId: string;
    role: "user" | "assistant" | "tool";
    content: string;
    metadata?: Record<string, unknown>;
    model?: string | null;
    provider?: string | null;
  }
) {
  await requireAssistantThreadAccess(admin, ctx, input.threadId);

  const { data, error } = await admin
    .from("assistant_messages")
    .insert({
      thread_id: input.threadId,
      company_id: ctx.companyId,
      role: input.role,
      content: input.content,
      metadata: input.metadata ?? {},
      model: input.model ?? null,
      provider: input.provider ?? null,
      created_by: input.role === "user" ? ctx.userId : null,
    })
    .select("id")
    .single();

  if (error || !data) fail("ASSISTANT_MESSAGE_SAVE_FAILED");
  return data;
}

export async function saveAssistantUserMessageOnce(
  admin: any,
  ctx: CompanyContext,
  input: { threadId: string; content: string; clientMessageId: string | null }
) {
  if (!input.clientMessageId) {
    const data = await saveAssistantMessage(admin, ctx, {
      threadId: input.threadId,
      role: "user",
      content: input.content,
    });
    return { saved: true as const, data };
  }

  await requireAssistantThreadAccess(admin, ctx, input.threadId);

  const { data, error } = await admin
    .from("assistant_messages")
    .insert({
      thread_id: input.threadId,
      company_id: ctx.companyId,
      role: "user",
      content: input.content,
      metadata: { clientMessageId: input.clientMessageId },
      model: null,
      provider: null,
      created_by: ctx.userId,
    })
    .select("id")
    .single();

  if (error?.code === "23505") return { saved: false as const };
  if (error || !data) fail("ASSISTANT_MESSAGE_SAVE_FAILED");
  return { saved: true as const, data };
}
