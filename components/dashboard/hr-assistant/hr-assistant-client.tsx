"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/react-ai-sdk";
import type { UIMessage } from "ai";
import { ArrowLeft, Plus } from "lucide-react";
import posthog from "posthog-js";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Thread } from "@/components/assistant-ui/thread";
import { Button } from "@/components/ui/button";
import { getHrAssistantUserFacingErrorMessage } from "@/lib/hr-assistant/user-facing-errors";
import { cn } from "@/lib/utils";

import { ContextPanel } from "./context-panel";
import { ThreadList, type ThreadListItem } from "./thread-list";

type ThreadMessageRow = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  parts?: Array<Record<string, unknown>>;
  created_at: string;
};

type LoadThreadsOptions = {
  searchQuery?: string;
};

const MAX_HYDRATED_MESSAGES = 60;
const requestIdStoragePrefix = "hr-assistant:last-request-id:";

function getClientTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readThreads(payload: unknown): ThreadListItem[] {
  if (!isRecord(payload) || !Array.isArray(payload.threads)) return [];

  return payload.threads.flatMap((thread): ThreadListItem[] => {
    if (!isRecord(thread)) return [];

    const id = typeof thread.id === "string" ? thread.id : null;
    const title = typeof thread.title === "string" ? thread.title : null;
    const mode = typeof thread.mode === "string" ? thread.mode : null;
    const updatedAt = typeof thread.updated_at === "string" ? thread.updated_at : null;
    if (!id || !title || !mode || !updatedAt) return [];
    const archivedAt = typeof thread.archived_at === "string" ? thread.archived_at : null;
    const pinnedAt = typeof thread.pinned_at === "string" ? thread.pinned_at : null;
    const messageSnippet = typeof thread.message_snippet === "string" ? thread.message_snippet : null;
    const searchMatchType = thread.search_match_type === "title" || thread.search_match_type === "message" ? thread.search_match_type : null;

    return [{
      id,
      title,
      mode,
      updated_at: updatedAt,
      archived_at: archivedAt,
      pinned_at: pinnedAt,
      messageSnippet,
      searchMatchType,
    }];
  });
}

function readMessages(payload: unknown): ThreadMessageRow[] {
  if (!isRecord(payload) || !Array.isArray(payload.messages)) return [];

  return payload.messages.filter((message): message is ThreadMessageRow => {
    if (!isRecord(message)) return false;

    return (
      typeof message.id === "string" &&
      typeof message.role === "string" &&
      ["user", "assistant", "tool"].includes(message.role) &&
      typeof message.content === "string" &&
      typeof message.created_at === "string"
    );
  });
}

function readMessageParts(parts: unknown, fallbackText: string): UIMessage["parts"] {
  if (!Array.isArray(parts)) return [{ type: "text", text: fallbackText }];

  const safeParts = parts.filter((part): part is UIMessage["parts"][number] => isRecord(part) && typeof part.type === "string");
  return safeParts.length > 0 ? safeParts : [{ type: "text", text: fallbackText }];
}

function readCreatedThreadId(payload: unknown): string | null {
  if (!isRecord(payload) || !isRecord(payload.thread)) return null;
  return typeof payload.thread.id === "string" ? payload.thread.id : null;
}

type HrAssistantRuntimeShellProps = {
  activeThreadId: string | null;
  initialMessages: UIMessage[];
  onChatResponseSettled: () => void;
  children: ReactNode;
};

function HrAssistantRuntimeShell({
  activeThreadId,
  initialMessages,
  onChatResponseSettled,
  children,
}: HrAssistantRuntimeShellProps) {
  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: "/api/hr-assistant/chat",
        fetch: async (input, init) => {
          const res = await globalThis.fetch(input, init);
          const requestId = res.headers.get("x-hr-assistant-request-id");
          if (activeThreadId && requestId) {
            sessionStorage.setItem(`${requestIdStoragePrefix}${activeThreadId}`, requestId);
          }

          if (!res.ok && process.env.NEXT_PUBLIC_POSTHOG_KEY && posthog.__loaded) {
            posthog.capture("hr_assistant_chat_http_error", {
              feature: "hr_assistant",
              thread_id: activeThreadId,
              request_id: requestId,
              status: res.status,
            });
          }

          if (res.ok) {
            void res.clone().text().catch(() => undefined).finally(onChatResponseSettled);
          }

          return res;
        },
        prepareSendMessagesRequest: ({ messages }) => ({
          body: { threadId: activeThreadId, messages, clientTimeZone: getClientTimeZone() },
        }),
      }),
    [activeThreadId, onChatResponseSettled]
  );
  const runtime = useChatRuntime({
    id: activeThreadId ?? "no-thread",
    messages: initialMessages,
    transport,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}

export function HrAssistantClient() {
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [loadedMessagesThreadId, setLoadedMessagesThreadId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [messageLoadError, setMessageLoadError] = useState<string | null>(null);
  const [messageLoadErrorThreadId, setMessageLoadErrorThreadId] = useState<string | null>(null);
  const [messageLoadRetryKey, setMessageLoadRetryKey] = useState(0);
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [updatingThreadId, setUpdatingThreadId] = useState<string | null>(null);
  const threadListRequestSeq = useRef(0);
  const isSearchTooShort = searchQuery.trim().length === 1;

  const loadThreads = useCallback(async (nextActiveThreadId?: string, options: LoadThreadsOptions = {}) => {
    const requestSeq = ++threadListRequestSeq.current;
    const params = new URLSearchParams();
    const requestSearchQuery = options.searchQuery ?? searchQuery;
    const trimmedSearch = requestSearchQuery.trim();
    const effectiveSearch = trimmedSearch.length >= 2 ? trimmedSearch : "";
    if (effectiveSearch) params.set("search", effectiveSearch);
    if (showArchived) params.set("includeArchived", "true");
    if (effectiveSearch && !showArchived) params.set("includeArchived", "false");

    const queryString = params.toString();
    const res = await fetch("/api/hr-assistant/threads" + (queryString ? `?${queryString}` : ""), { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (requestSeq !== threadListRequestSeq.current) return null;
    if (!res.ok) {
      throw new Error(
        getHrAssistantUserFacingErrorMessage(json, "Не удалось загрузить чаты.")
      );
    }

    const loaded = readThreads(json);
    setThreads(loaded);
    setActiveThreadId((prev) => {
      if (nextActiveThreadId && loaded.some((thread) => thread.id === nextActiveThreadId)) {
        return nextActiveThreadId;
      }

      if (prev && loaded.some((thread) => thread.id === prev)) return prev;

      return loaded[0]?.id ?? null;
    });
    setLoadError(null);
    return loaded;
  }, [searchQuery, showArchived]);

  const loadThreadMessages = useCallback(async (threadId: string) => {
    const res = await fetch(`/api/hr-assistant/threads/${threadId}/messages`, {
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        getHrAssistantUserFacingErrorMessage(
          json,
          "Не удалось загрузить историю чата."
        )
      );
    }

    const rows = readMessages(json);
    return rows.slice(-MAX_HYDRATED_MESSAGES).map((row) => ({
      id: row.id,
      role: row.role === "assistant" ? "assistant" : "user",
      parts: readMessageParts(row.parts, row.content),
      metadata: { createdAt: row.created_at },
    })) satisfies UIMessage[];
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (isSearchTooShort) {
      threadListRequestSeq.current += 1;
      setIsLoadingThreads(false);
      setLoadError(null);
      return () => {
        cancelled = true;
      };
    }

    setIsLoadingThreads(true);
    void loadThreads()
      .catch((error) => {
        if (cancelled) return;

        setLoadError(
          error instanceof Error ? error.message : "Не удалось загрузить чаты."
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoadingThreads(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isSearchTooShort, loadThreads]);

  useEffect(() => {
    let cancelled = false;

    if (!activeThreadId) {
      setInitialMessages([]);
      setLoadedMessagesThreadId(null);
      setMessageLoadError(null);
      setMessageLoadErrorThreadId(null);
      setIsLoadingMessages(false);
      return () => {
        cancelled = true;
      };
    }

    setInitialMessages([]);
    setLoadedMessagesThreadId(null);
    setMessageLoadError(null);
    setMessageLoadErrorThreadId(null);
    setIsLoadingMessages(true);
    void loadThreadMessages(activeThreadId)
      .then((messages) => {
        if (cancelled) return;

        setInitialMessages(messages);
        setLoadedMessagesThreadId(activeThreadId);
        setMessageLoadError(null);
        setMessageLoadErrorThreadId(null);
        setLoadError(null);
      })
      .catch((error) => {
        if (cancelled) return;

        setInitialMessages([]);
        setLoadedMessagesThreadId(null);
        setMessageLoadError(
          error instanceof Error
            ? error.message
            : "Не удалось загрузить историю чата."
        );
        setMessageLoadErrorThreadId(activeThreadId);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingMessages(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeThreadId, loadThreadMessages, messageLoadRetryKey]);

  const createThread = useCallback(async () => {
    if (isCreatingThread) return;

    let createdThreadId: string | null = null;
    setIsCreatingThread(true);
    setLoadError(null);

    try {
      const res = await fetch("/api/hr-assistant/threads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Новый чат",
          scopeType: "company",
          mode: "general",
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          getHrAssistantUserFacingErrorMessage(
            json,
            "Не удалось создать чат."
          )
        );
      }

      createdThreadId = readCreatedThreadId(json);
      if (createdThreadId) {
        setInitialMessages([]);
        setLoadedMessagesThreadId(null);
        setMessageLoadError(null);
        setMessageLoadErrorThreadId(null);
      }
      setSearchQuery("");
      await loadThreads(createdThreadId ?? undefined, { searchQuery: "" });
      if (createdThreadId) {
        setActiveThreadId(createdThreadId);
        setMobileChatOpen(true);
      }
    } catch (error) {
      if (createdThreadId) {
        setActiveThreadId(null);
        setMobileChatOpen(false);
        setInitialMessages([]);
        setLoadedMessagesThreadId(null);
        setMessageLoadError(null);
        setMessageLoadErrorThreadId(null);
        setIsLoadingMessages(false);
      }
      setLoadError(
        error instanceof Error ? error.message : "Не удалось создать чат."
      );
    } finally {
      setIsCreatingThread(false);
    }
  }, [isCreatingThread, loadThreads]);

  const patchThread = useCallback(async (threadId: string, patch: Record<string, boolean>, fallback: string) => {
    setUpdatingThreadId(threadId);
    setLoadError(null);

    try {
      const res = await fetch(`/api/hr-assistant/threads/${threadId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(getHrAssistantUserFacingErrorMessage(json, fallback));
      }

      await loadThreads(activeThreadId ?? undefined);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : fallback);
    } finally {
      setUpdatingThreadId(null);
    }
  }, [activeThreadId, loadThreads]);

  const handleArchiveThread = useCallback((threadId: string, archived: boolean) => {
    void patchThread(threadId, { archived }, archived ? "Не удалось архивировать чат." : "Не удалось вернуть чат из архива.");
  }, [patchThread]);

  const handlePinThread = useCallback((threadId: string, pinned: boolean) => {
    void patchThread(threadId, { pinned }, pinned ? "Не удалось закрепить чат." : "Не удалось открепить чат.");
  }, [patchThread]);

  const handleChatResponseSettled = useCallback(() => {
    if (isSearchTooShort) return;

    void loadThreads(activeThreadId ?? undefined).catch((error) => {
      setLoadError(error instanceof Error ? error.message : "Не удалось обновить список чатов.");
    });
  }, [activeThreadId, isSearchTooShort, loadThreads]);

  const handleSelectThread = useCallback((threadId: string) => {
    if (threadId === activeThreadId) {
      setMobileChatOpen(true);
      return;
    }

    setInitialMessages([]);
    setLoadedMessagesThreadId(null);
    setMessageLoadError(null);
    setMessageLoadErrorThreadId(null);
    setActiveThreadId(threadId);
    setMobileChatOpen(true);
    setLoadError(null);
  }, [activeThreadId]);

  const handleRetryThreadMessages = useCallback(() => {
    if (!activeThreadId) return;

    setInitialMessages([]);
    setLoadedMessagesThreadId(null);
    setMessageLoadError(null);
    setMessageLoadErrorThreadId(null);
    setIsLoadingMessages(true);
    setMessageLoadRetryKey((value) => value + 1);
  }, [activeThreadId]);

  const isActiveThreadReady =
    activeThreadId !== null &&
    loadedMessagesThreadId === activeThreadId &&
    !isLoadingMessages;
  const shouldShowThreadLoading =
    activeThreadId !== null && isLoadingMessages;
  const shouldShowMessageLoadError =
    activeThreadId !== null &&
    !isLoadingMessages &&
    messageLoadErrorThreadId === activeThreadId &&
    loadedMessagesThreadId !== activeThreadId;
  const shouldShowMobileMain = mobileChatOpen || Boolean(loadError);

  const noThreadCta = (
    <div className="flex min-h-[24rem] min-w-0 flex-1 items-center justify-center p-4">
      <div className="flex max-w-sm min-w-0 flex-col items-center gap-3 text-center">
        <h2 className="break-words text-lg font-semibold">Создайте чат</h2>
        <p className="break-words text-sm text-muted-foreground">
          HR-ассистент начнет отвечать после создания первого чата.
        </p>
        <Button
          type="button"
          onClick={createThread}
          disabled={isCreatingThread || isLoadingThreads}
        >
          <Plus className="size-4" aria-hidden="true" />
          {isCreatingThread ? "Создаем..." : "Создать чат"}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="min-w-0">
        <h1 className="break-words text-3xl font-bold tracking-tight">
          HR-ассистент
        </h1>
        <p className="mt-1 max-w-3xl break-words text-sm text-muted-foreground">
          Помогает работать с вакансиями, кандидатами, интервью и настройками
          hiiire.
        </p>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border bg-background md:flex-row">
        <ThreadList
          className={shouldShowMobileMain ? "hidden md:flex" : "flex"}
          threads={isSearchTooShort ? [] : threads}
          activeThreadId={activeThreadId}
          searchQuery={searchQuery}
          searchTooShort={isSearchTooShort}
          showArchived={showArchived}
          onSelectThread={handleSelectThread}
          onNewThread={createThread}
          onSearchQueryChange={setSearchQuery}
          onShowArchivedChange={setShowArchived}
          onArchiveThread={handleArchiveThread}
          onPinThread={handlePinThread}
          isLoading={isLoadingThreads}
          isNewThreadDisabled={isCreatingThread || isLoadingThreads}
          newThreadLabel={isCreatingThread ? "Создаем..." : "Новый"}
          updatingThreadId={updatingThreadId}
        />
        <main
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3 md:flex md:p-4",
            shouldShowMobileMain ? "flex" : "hidden md:flex"
          )}
        >
          {activeThreadId ? (
            <div className="mb-3 flex min-w-0 shrink-0 items-center justify-between gap-2 md:hidden">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMobileChatOpen(false)}
                aria-label="Вернуться к списку чатов"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                <span className="min-w-0 truncate">Чаты</span>
              </Button>
              <Button
                className="shrink-0"
                size="sm"
                type="button"
                onClick={createThread}
                disabled={isCreatingThread || isLoadingThreads}
              >
                <Plus className="size-4" aria-hidden="true" />
                {isCreatingThread ? "Создаем..." : "Новый"}
              </Button>
            </div>
          ) : null}
          {loadError ? (
            <p className="mb-3 shrink-0 break-words rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {loadError}
            </p>
          ) : null}
          {isLoadingThreads ? (
            <p className="break-words rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              Загружаем чаты...
            </p>
          ) : null}
          {!isLoadingThreads && activeThreadId === null ? noThreadCta : null}
          {!isLoadingThreads && shouldShowThreadLoading ? (
            <p className="shrink-0 break-words rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              Загружаем историю чата...
            </p>
          ) : null}
          {shouldShowMessageLoadError ? (
            <div className="flex shrink-0 flex-col items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
              <p className="break-words">
                {messageLoadError ?? "Не удалось загрузить историю чата."}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRetryThreadMessages}
              >
                Повторить
              </Button>
            </div>
          ) : null}
          {isActiveThreadReady ? (
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              <HrAssistantRuntimeShell
                key={activeThreadId ?? "no-thread"}
                activeThreadId={activeThreadId}
                initialMessages={initialMessages}
                onChatResponseSettled={handleChatResponseSettled}
              >
                <Thread threadId={activeThreadId} />
              </HrAssistantRuntimeShell>
            </div>
          ) : null}
        </main>
        <ContextPanel />
      </div>
    </div>
  );
}
