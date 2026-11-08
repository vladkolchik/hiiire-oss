"use client";

import {
  ComposerPrimitive,
  MessagePrimitive,
  useMessage,
  ThreadPrimitive,
} from "@assistant-ui/react";
import { Bot, SendHorizontal, User } from "lucide-react";
import posthog from "posthog-js";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ActionCard, type HrAssistantActionCardState } from "@/components/dashboard/hr-assistant/action-card";
import { Button } from "@/components/ui/button";
import { getHrAssistantUserFacingErrorMessage } from "@/lib/hr-assistant/user-facing-errors";
import { cn } from "@/lib/utils";

const requestIdStoragePrefix = "hr-assistant:last-request-id:";

export function Thread({ threadId }: { threadId?: string | null }) {
  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <ThreadPrimitive.Viewport
        autoScroll
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-1"
      >
        <ThreadPrimitive.Empty>
          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center px-4 py-12 text-center">
            <div className="max-w-md min-w-0 space-y-2">
              <div className="mx-auto flex size-10 items-center justify-center rounded-md border bg-muted">
                <Bot className="size-5 text-muted-foreground" aria-hidden="true" />
              </div>
              <h2 className="break-words text-base font-semibold">Новый чат</h2>
              <p className="break-words text-sm text-muted-foreground">
                Задайте вопрос по вакансиям, кандидатам, интервью или настройкам.
              </p>
            </div>
          </div>
        </ThreadPrimitive.Empty>

        <ThreadPrimitive.Messages>
          {({ message }) =>
            message.role === "user" ? <UserMessage /> : <AssistantMessage threadId={threadId} />
          }
        </ThreadPrimitive.Messages>

        <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mt-auto bg-background pt-3">
          <Composer />
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex min-w-0 justify-end py-2">
      <MessageBubble
        icon={<User className="size-4" aria-hidden="true" />}
        tone="user"
      />
    </MessagePrimitive.Root>
  );
}

function AssistantMessage({ threadId }: { threadId?: string | null }) {
  return (
    <MessagePrimitive.Root className="flex min-w-0 justify-start py-2">
      <MessageBubble
        icon={<Bot className="size-4" aria-hidden="true" />}
        tone="assistant"
        threadId={threadId}
      />
    </MessagePrimitive.Root>
  );
}

type MessageBubbleProps = {
  icon: ReactNode;
  tone: "assistant" | "user";
  threadId?: string | null;
};

function MessageBubble({ icon, tone, threadId }: MessageBubbleProps) {
  return (
    <div
      className={cn(
        "flex max-w-[min(42rem,92%)] min-w-0 gap-3 rounded-md border px-3 py-2 text-sm shadow-sm",
        tone === "user"
          ? "bg-primary text-primary-foreground"
          : "bg-muted/60 text-foreground"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md",
          tone === "user" ? "bg-primary-foreground/15" : "bg-background"
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1 break-words leading-6">
        <MessageParts />
        {tone === "assistant" ? <PersistedActionCards /> : null}
        <MessagePrimitive.Error>
          <MessageErrorReporter threadId={threadId} />
          <span className="break-words text-destructive">
            Не удалось получить ответ. Попробуйте ещё раз.
          </span>
        </MessagePrimitive.Error>
      </div>
    </div>
  );
}

function MessageParts() {
  return (
    <MessagePrimitive.Parts>
      {({ part }) => {
        if (part.type === "text") return <MarkdownTextPart text={part.text} />;
        return null;
      }}
    </MessagePrimitive.Parts>
  );
}

function MarkdownTextPart({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="my-0 whitespace-pre-wrap break-words">{children}</p>,
        a: ({ children, href }) => (
          <a
            className="break-words font-medium underline underline-offset-2"
            href={href}
            rel="noopener noreferrer"
            target="_blank"
          >
            {children}
          </a>
        ),
        ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
        li: ({ children }) => <li className="break-words pl-1">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        code: ({ children }) => (
          <code className="rounded bg-background/70 px-1 py-0.5 font-mono text-[0.85em] text-foreground">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="my-2 overflow-x-auto rounded-md bg-background/70 p-3 font-mono text-xs leading-5">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <div className="my-2 max-w-full overflow-x-auto">
            <table className="prose-table w-full min-w-max border-collapse text-left text-xs">
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border px-2 py-1 font-semibold text-foreground">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border px-2 py-1 align-top text-foreground">
            {children}
          </td>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function MessageErrorReporter({ threadId }: { threadId?: string | null }) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || !posthog.__loaded) return;

    const requestId = threadId
      ? sessionStorage.getItem(`${requestIdStoragePrefix}${threadId}`)
      : null;

    posthog.capture("hr_assistant_message_error_visible", {
      feature: "hr_assistant",
      thread_id: threadId,
      request_id: requestId,
    });
  }, [threadId]);

  return null;
}

type ApprovalToolResult = {
  ok?: boolean;
  approvalRequired?: boolean;
  toolRunId?: string;
  message?: string;
  status?: string;
};

type ActionRenderPart = {
  key: string;
  toolRunId?: string;
  title: string;
  description: string;
  approvalStatus?: string;
  executionStatus?: string;
  result?: ApprovalToolResult;
};

const approvalToolTitles: Record<string, string> = {
  propose_candidate_status_change: "Изменить статус кандидата",
  propose_candidate_note_update: "Обновить заметку кандидата",
  start_candidate_ai_analysis: "Запустить AI-анализ кандидата",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readApprovalToolResult(value: unknown): ApprovalToolResult | null {
  if (!isRecord(value)) return null;

  return {
    ok: typeof value.ok === "boolean" ? value.ok : undefined,
    approvalRequired: typeof value.approvalRequired === "boolean" ? value.approvalRequired : undefined,
    toolRunId: typeof value.toolRunId === "string" ? value.toolRunId : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
    status: typeof value.status === "string" ? value.status : undefined,
  };
}

function readPersistedActionPart(part: unknown): ActionRenderPart | null {
  if (!isRecord(part) || part.type !== "action") return null;

  const toolRunId = typeof part.toolRunId === "string" ? part.toolRunId : null;
  if (!toolRunId) return null;

  return {
    key: toolRunId,
    toolRunId,
    title: typeof part.title === "string" ? part.title : "Действие ассистента",
    description: typeof part.description === "string" ? part.description : "Проверьте действие и подтвердите, если всё верно.",
    approvalStatus: typeof part.approvalStatus === "string" ? part.approvalStatus : "pending",
    executionStatus: typeof part.executionStatus === "string" ? part.executionStatus : "not_started",
  };
}

function readLiveActionPart(part: unknown, index: number): ActionRenderPart | null {
  if (!isRecord(part) || part.type !== "tool-call") return null;

  const toolName = typeof part.toolName === "string" ? part.toolName : null;
  if (!toolName) return null;

  const result = readApprovalToolResult(part.result);
  if (!result) return null;

  const title = approvalToolTitles[toolName] ?? (result.status === "not_supported_yet" ? "Действие пока недоступно" : null);
  if (!title) return null;

  return {
    key: result.toolRunId ?? `${toolName}-${index}`,
    toolRunId: result.toolRunId,
    title,
    description: describeApprovalTool(toolName, result),
    result,
  };
}

function describeApprovalTool(toolName: string, result: ApprovalToolResult) {
  return result.message ?? "Ассистент подготовил действие. Подтвердите его, если всё верно.";
}

function getInitialActionState(result: ApprovalToolResult): HrAssistantActionCardState {
  if (result.status === "not_supported_yet") return "blocked";
  if (result.ok === false) return "failed";
  if (result.approvalRequired && result.toolRunId) return "pending";
  return "auto";
}

function getPersistedActionState(part: ActionRenderPart): HrAssistantActionCardState {
  if (part.executionStatus === "succeeded") return "approved";
  if (part.executionStatus === "failed") return "failed";
  if (part.executionStatus === "blocked") return "blocked";
  if (part.approvalStatus === "rejected") return "rejected";
  if (part.result) return getInitialActionState(part.result);
  return "pending";
}

function PersistedActionCards() {
  const content = useMessage((state) => state.content);
  const [overrides, setOverrides] = useState<Record<string, { state: HrAssistantActionCardState; detail?: string }>>({});

  const handleDecision = useCallback(async (toolRunId: string, decision: "approved" | "rejected") => {
    setOverrides((current) => ({
      ...current,
      [toolRunId]: { state: "pending", detail: decision === "approved" ? "Выполняем действие..." : "Отклоняем действие..." },
    }));

    try {
      const res = await fetch(`/api/hr-assistant/approvals/${toolRunId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(getHrAssistantUserFacingErrorMessage(json, "Не удалось обработать действие."));
      }

      setOverrides((current) => ({
        ...current,
        [toolRunId]: {
          state: decision === "approved" ? "approved" : "rejected",
          detail: decision === "approved" ? "Действие выполнено." : "Действие отклонено.",
        },
      }));
    } catch (error) {
      setOverrides((current) => ({
        ...current,
        [toolRunId]: {
          state: "failed",
          detail: error instanceof Error ? error.message : "Не удалось обработать действие.",
        },
      }));
    }
  }, []);

  const cards = content
    .map((part, index) => readPersistedActionPart(part) ?? readLiveActionPart(part, index))
    .filter((part): part is ActionRenderPart => Boolean(part))
    .map((part) => {
      const override = part.toolRunId ? overrides[part.toolRunId] : undefined;
      const state = override?.state ?? getPersistedActionState(part);

      return {
        key: part.key,
        title: part.title,
        description: part.description,
        state,
        detail: override?.detail,
        isBusy: override?.state === "pending" && Boolean(override.detail),
        toolRunId: part.toolRunId,
      };
    })
    .filter((card): card is NonNullable<typeof card> => Boolean(card));

  if (cards.length === 0) return null;

  return (
    <div className="mt-3 flex min-w-0 flex-col gap-2">
      {cards.map((card) => (
        <ActionCard
          key={card.key}
          title={card.title}
          description={card.description}
          state={card.state}
          detail={card.detail}
          isBusy={card.isBusy}
          onApprove={card.toolRunId ? () => void handleDecision(card.toolRunId!, "approved") : undefined}
          onReject={card.toolRunId ? () => void handleDecision(card.toolRunId!, "rejected") : undefined}
        />
      ))}
    </div>
  );
}

function Composer() {
  return (
    <ComposerPrimitive.Root className="flex min-w-0 items-end gap-2 border-t bg-background px-1 py-3">
      <ComposerPrimitive.Input
        aria-label="Сообщение HR-ассистенту"
        className="max-h-40 min-h-11 min-w-0 flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
        placeholder="Напишите сообщение..."
        submitMode="enter"
      />
      <ComposerPrimitive.Send asChild>
        <Button
          aria-label="Отправить сообщение"
          className="shrink-0"
          size="icon"
          type="button"
        >
          <SendHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
}
