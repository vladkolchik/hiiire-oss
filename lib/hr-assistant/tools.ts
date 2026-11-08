import "server-only";

import { tool } from "ai";
import { z } from "zod";

import type { CompanyContext } from "@/lib/access/company-guards";

import { createAssistantToolRun, updateAssistantToolRunResultPreview, writeAssistantAuditEvent } from "./tool-runs";
import { proposeAiAnalysisFromAssistant } from "./tools/ai-analysis";
import { buildInterviewPrepPrompt, listAccessibleInterviewsForAssistant } from "./tools/calendar";
import { ASSISTANT_CALENDAR_TIME_PRESETS, resolveAssistantCalendarTime } from "./tools/calendar-time";
import { getAccessibleCandidateForAssistant, listAccessibleCandidatesForAssistant } from "./tools/candidate-read";
import {
  CANDIDATE_STATUS_VALUES,
  MAX_CANDIDATE_COMMENT_LENGTH,
  proposeCandidateNoteUpdate,
  proposeCandidateStatusChange,
} from "./tools/crm-write";
import { buildDraftInstruction } from "./tools/drafts";
import { getUnsupportedActionMessage } from "./tools/unsupported";
import { getAccessibleVacancyForAssistant, listAccessibleVacanciesForAssistant } from "./tools/vacancy-read";

export const HR_ASSISTANT_TOOL_NAMES = [
  "list_accessible_vacancies",
  "get_accessible_vacancy",
  "list_accessible_candidates",
  "get_accessible_candidate",
  "create_draft",
  "start_candidate_ai_analysis",
  "propose_candidate_status_change",
  "propose_candidate_note_update",
  "resolve_calendar_time",
  "list_accessible_interviews",
  "build_interview_prep",
  "explain_unsupported_action",
] as const;

export type HrAssistantToolName = (typeof HR_ASSISTANT_TOOL_NAMES)[number];

type CreateHrAssistantToolsInput = {
  admin: any;
  ctx: CompanyContext;
  threadId: string;
  assistantRequestId?: string | null;
  calendarTimeContext?: {
    timeZone?: string | null;
    referenceIso?: string | null;
  };
};

export function createHrAssistantTools(input: CreateHrAssistantToolsInput) {
  const { admin, ctx, threadId, assistantRequestId, calendarTimeContext } = input;

  function buildReadToolResultPreview(result: unknown): Record<string, unknown> {
    if (!result || typeof result !== "object") return { ok: false };
    const record = result as Record<string, unknown>;
    const items = Array.isArray(record.items) ? record.items : null;

    return {
      ok: record.ok,
      pageInfo: record.pageInfo,
      scope: record.scope,
      itemCount: items ? items.length : record.item ? 1 : 0,
      appliedFilters: record.appliedFilters,
      error: record.error,
    };
  }

  async function recordReadToolResultPreview(toolRunId: string, result: unknown) {
    const resultPreview = buildReadToolResultPreview(result);
    await updateAssistantToolRunResultPreview(admin, ctx, { toolRunId, resultPreview });
  }

  async function recordAutoApprovedToolRun(toolName: HrAssistantToolName, inputPreview: Record<string, unknown>, riskLevel: "read" | "draft") {
    const run = await createAssistantToolRun(admin, ctx, {
      threadId,
      toolName,
      inputPreview,
      riskLevel,
      policyDecision: "auto_approved",
      approvalStatus: "not_required",
      assistantRequestId,
    });

    await writeAssistantAuditEvent(admin, ctx, {
      threadId,
      toolRunId: run.id,
      eventType: "assistant_tool_auto_approved",
      afterSnapshot: { toolName, riskLevel },
    });

    return run;
  }

  return {
    list_accessible_vacancies: tool({
      description:
        "Search vacancies visible to the current hiiire user. Returns a paged MCP-ready envelope with pageInfo, appliedFilters, scope, optional aggregations, and items[].href as the ready dashboard card link.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().nullable().optional(),
        titleQuery: z.string().trim().max(200).nullable().optional(),
        status: z.enum(["draft", "active", "paused", "closed"]).nullable().optional(),
        sort: z.enum(["updated_desc", "updated_asc", "created_desc", "created_asc"]).default("updated_desc"),
        includeAggregations: z.boolean().optional(),
      }),
      execute: async (args) => {
        const run = await recordAutoApprovedToolRun("list_accessible_vacancies", args, "read");
        const result = await listAccessibleVacanciesForAssistant(admin, ctx, args);
        await recordReadToolResultPreview(run.id, result);
        return { ...result, toolRunId: run.id };
      },
    }),
    get_accessible_vacancy: tool({
      description: "Get one vacancy only after existing hiiire access checks pass. The item.href field is the ready dashboard card link.",
      inputSchema: z.object({ vacancyId: z.string().uuid() }),
      execute: async ({ vacancyId }) => {
        const run = await recordAutoApprovedToolRun("get_accessible_vacancy", { vacancyId }, "read");
        const result = await getAccessibleVacancyForAssistant(admin, ctx, vacancyId);
        await recordReadToolResultPreview(run.id, result);
        return { ...result, toolRunId: run.id };
      },
    }),
    list_accessible_candidates: tool({
      description:
        "Search candidates visible to the current hiiire user. Returns a paged MCP-ready envelope with pageInfo, appliedFilters, scope, optional aggregations, and items[].href as the ready dashboard card link.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().nullable().optional(),
        vacancyId: z.string().uuid().nullable().optional(),
        nameQuery: z.string().trim().max(200).nullable().optional(),
        status: z.enum(CANDIDATE_STATUS_VALUES).nullable().optional(),
        scoreFilter: z.enum(["all", "high", "medium", "low", "unscored"]).default("all"),
        source: z.enum(["all", "manual", "hh", "referral", "other"]).default("all"),
        sort: z.enum(["date_desc", "date_asc", "score_desc", "score_asc"]).default("date_desc"),
        includeAggregations: z.boolean().optional(),
      }),
      execute: async (args) => {
        const run = await recordAutoApprovedToolRun("list_accessible_candidates", args, "read");
        const result = await listAccessibleCandidatesForAssistant(admin, ctx, args);
        await recordReadToolResultPreview(run.id, result);
        return { ...result, toolRunId: run.id };
      },
    }),
    get_accessible_candidate: tool({
      description: "Get one candidate after hiiire access checks pass, with explicit safe includes. The item.href field is the ready dashboard card link.",
      inputSchema: z.object({
        candidateId: z.string().uuid(),
        include: z.array(z.enum(["vacancy", "contacts", "analysis", "latestJob", "resumeSummary"])).max(5).optional(),
      }),
      execute: async ({ candidateId, include }) => {
        const run = await recordAutoApprovedToolRun("get_accessible_candidate", { candidateId, include: include ?? [] }, "read");
        const result = await getAccessibleCandidateForAssistant(admin, ctx, { candidateId, include });
        await recordReadToolResultPreview(run.id, result);
        return { ...result, toolRunId: run.id };
      },
    }),
    create_draft: tool({
      description: "Prepare text only. This tool never sends messages or changes CRM records.",
      inputSchema: z.object({
        kind: z.enum(["candidate_message", "rejection", "invitation", "vacancy_description", "interview_plan"]),
        topic: z.string().max(1000).optional(),
      }),
      execute: async ({ kind, topic }) => {
        const run = await recordAutoApprovedToolRun("create_draft", { kind, topic: topic ?? null }, "draft");
        return {
          toolRunId: run.id,
          instruction: buildDraftInstruction(kind),
          topic: topic ?? null,
          externalActionPerformed: false,
          crmWritePerformed: false,
        };
      },
    }),
    start_candidate_ai_analysis: tool({
      description: "Prepare a manual approval request for candidate AI analysis. This tool does not enqueue the job.",
      inputSchema: z.object({ candidateId: z.string().uuid() }),
      execute: async ({ candidateId }) => {
        return proposeAiAnalysisFromAssistant(admin, ctx, { threadId, candidateId, assistantRequestId });
      },
    }),
    propose_candidate_status_change: tool({
      description: "Prepare a manual approval request to change a candidate status. This tool does not update CRM records.",
      inputSchema: z.object({
        candidateId: z.string().uuid(),
        status: z.enum(CANDIDATE_STATUS_VALUES),
        reason: z.string().max(1000).optional(),
      }),
      execute: async ({ candidateId, status, reason }) => {
        return proposeCandidateStatusChange(admin, ctx, { threadId, candidateId, status, reason, assistantRequestId });
      },
    }),
    propose_candidate_note_update: tool({
      description: "Prepare a manual approval request to update a candidate note. This tool does not update CRM records.",
      inputSchema: z.object({
        candidateId: z.string().uuid(),
        comment: z.string().trim().min(1).max(MAX_CANDIDATE_COMMENT_LENGTH),
      }),
      execute: async ({ candidateId, comment }) => {
        return proposeCandidateNoteUpdate(admin, ctx, { threadId, candidateId, comment, assistantRequestId });
      },
    }),
    resolve_calendar_time: tool({
      description:
        "Resolve relative calendar time for the current user's visible calendar day. Always use this before list_accessible_interviews when the user asks about today, tomorrow, yesterday, this week, next week, or a local calendar date.",
      inputSchema: z.object({
        preset: z.enum(ASSISTANT_CALENDAR_TIME_PRESETS),
        localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      }),
      execute: async (args) => {
        const run = await recordAutoApprovedToolRun(
          "resolve_calendar_time",
          {
            preset: args.preset,
            localDate: args.localDate ?? null,
            timeZone: calendarTimeContext?.timeZone ?? null,
            referenceIso: calendarTimeContext?.referenceIso ?? null,
          },
          "read"
        );
        const result = resolveAssistantCalendarTime({
          preset: args.preset,
          localDate: args.localDate,
          timeZone: calendarTimeContext?.timeZone,
          referenceIso: calendarTimeContext?.referenceIso,
        });
        await recordReadToolResultPreview(run.id, result);
        return { ...result, toolRunId: run.id };
      },
    }),
    list_accessible_interviews: tool({
      description: "List interviews visible to the current hiiire user for a time range. Returns a paged envelope after access filtering.",
      inputSchema: z.object({
        fromIso: z.string().datetime({ offset: true }),
        toIso: z.string().datetime({ offset: true }),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().nullable().optional(),
      }),
      execute: async (args) => {
        const run = await recordAutoApprovedToolRun("list_accessible_interviews", args, "read");
        const result = await listAccessibleInterviewsForAssistant(admin, ctx, args);
        await recordReadToolResultPreview(run.id, result);
        return { ...result, toolRunId: run.id };
      },
    }),
    build_interview_prep: tool({
      description: "Build a recruiter-facing interview prep instruction without changing calendar or CRM records.",
      inputSchema: z.object({
        candidateName: z.string().max(200).optional(),
        vacancyTitle: z.string().max(200).optional(),
      }),
      execute: async ({ candidateName, vacancyTitle }) => {
        const run = await recordAutoApprovedToolRun(
          "build_interview_prep",
          { candidateName: candidateName ?? null, vacancyTitle: vacancyTitle ?? null },
          "draft"
        );
        return {
          toolRunId: run.id,
          instruction: buildInterviewPrepPrompt({ candidateName, vacancyTitle }),
          externalActionPerformed: false,
          crmWritePerformed: false,
        };
      },
    }),
    explain_unsupported_action: tool({
      description: "Explain future actions that are intentionally not executable in v1.",
      inputSchema: z.object({
        action: z.enum(["send_email", "hh_publish", "hh_message", "candidate_facing_chat"]),
      }),
      execute: async ({ action }) => {
        const run = await createAssistantToolRun(admin, ctx, {
          threadId,
          toolName: "explain_unsupported_action",
          inputPreview: { action },
          riskLevel: "external",
          policyDecision: "not_supported_yet",
          approvalStatus: "not_required",
          resultPreview: { status: "not_supported_yet" },
          assistantRequestId,
        });

        await writeAssistantAuditEvent(admin, ctx, {
          threadId,
          toolRunId: run.id,
          eventType: "assistant_action_not_supported",
          afterSnapshot: { action, status: "not_supported_yet" },
        });

        return {
          status: "not_supported_yet",
          toolRunId: run.id,
          message: getUnsupportedActionMessage(action),
          externalActionPerformed: false,
          crmWritePerformed: false,
        };
      },
    }),
  };
}
