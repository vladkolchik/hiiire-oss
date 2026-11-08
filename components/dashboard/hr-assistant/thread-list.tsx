import { Archive, ArchiveRestore, Pin, PinOff, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type ThreadListItem = {
  id: string;
  title: string;
  mode: string;
  updated_at: string;
  archived_at?: string | null;
  pinned_at?: string | null;
  messageSnippet?: string | null;
  searchMatchType?: "title" | "message" | null;
};

type ThreadListProps = {
  className?: string;
  threads: ThreadListItem[];
  activeThreadId: string | null;
  searchQuery: string;
  searchTooShort?: boolean;
  showArchived: boolean;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onSearchQueryChange: (value: string) => void;
  onShowArchivedChange: (value: boolean) => void;
  onArchiveThread: (threadId: string, archived: boolean) => void;
  onPinThread: (threadId: string, pinned: boolean) => void;
  isLoading?: boolean;
  isNewThreadDisabled?: boolean;
  newThreadLabel?: string;
  updatingThreadId?: string | null;
};

const modeLabels: Record<string, string> = {
  general: "Общий чат",
  screening: "Скрининг",
  outreach: "Аутрич",
  interview: "Интервью",
  pipeline: "Воронка",
  support: "Поддержка",
};

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Недавно";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function ThreadList({
  className,
  threads,
  activeThreadId,
  searchQuery,
  searchTooShort = false,
  showArchived,
  onSelectThread,
  onNewThread,
  onSearchQueryChange,
  onShowArchivedChange,
  onArchiveThread,
  onPinThread,
  isLoading = false,
  isNewThreadDisabled = false,
  newThreadLabel = "Новый",
  updatingThreadId = null,
}: ThreadListProps) {
  return (
    <aside className={cn("flex min-h-0 min-w-0 flex-col gap-3 border-b bg-background p-3 md:w-72 md:shrink-0 md:border-b-0 md:border-r", className)}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-sm font-semibold">Чаты</h2>
        <Button
          className="shrink-0"
          size="sm"
          type="button"
          onClick={onNewThread}
          disabled={isNewThreadDisabled}
        >
          <Plus className="size-4" aria-hidden="true" />
          {newThreadLabel}
        </Button>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <Label className="sr-only" htmlFor="hr-assistant-thread-search">
          Поиск по чатам
        </Label>
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="hr-assistant-thread-search"
            className="min-w-0 pl-8"
            maxLength={120}
            minLength={2}
            placeholder="Поиск по чатам"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
          />
        </div>
        <Button
          className="w-full justify-start"
          type="button"
          variant={showArchived ? "secondary" : "outline"}
          size="sm"
          onClick={() => onShowArchivedChange(!showArchived)}
        >
          <Archive className="size-4" aria-hidden="true" />
          {showArchived ? "Скрыть архив" : "Показать архив"}
        </Button>
      </div>

      <div className="min-h-0 min-w-0 flex-1 space-y-1 overflow-y-auto">
        {threads.length === 0 ? (
          <p className="min-w-0 break-words rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            {isLoading
              ? "Загружаем чаты..."
              : searchQuery.trim() || showArchived
                ? searchTooShort
                  ? "Введите минимум 2 символа для поиска."
                  : "Подходящие чаты не найдены."
              : "Пока нет чатов. Создайте первый, чтобы начать."}
          </p>
        ) : (
          threads.map((thread) => {
            const isActive = thread.id === activeThreadId;
            const isArchived = Boolean(thread.archived_at);
            const isPinned = Boolean(thread.pinned_at);
            const isUpdating = updatingThreadId === thread.id;

            return (
              <div
                key={thread.id}
                className={cn(
                  "group flex min-w-0 gap-1 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted/80",
                  isActive ? "bg-muted text-foreground" : "text-muted-foreground",
                  isArchived ? "opacity-75" : ""
                )}
              >
                <button
                  className="min-w-0 flex-1 text-left outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onSelectThread(thread.id)}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {isPinned ? <Pin className="size-3.5 shrink-0 fill-current" aria-hidden="true" /> : null}
                    <span className="block min-w-0 truncate font-medium text-foreground">
                      {thread.title}
                    </span>
                  </span>
                  <span className="mt-1 flex min-w-0 items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate">
                      {isArchived ? "Архив" : modeLabels[thread.mode] ?? "Общий чат"}
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                      {formatUpdatedAt(thread.updated_at)}
                    </span>
                  </span>
                  {thread.messageSnippet ? (
                    <span className="mt-1 block min-w-0 truncate text-xs text-muted-foreground">
                      {thread.searchMatchType === "message" ? "Сообщение: " : ""}
                      {thread.messageSnippet}
                    </span>
                  ) : null}
                </button>
                <TooltipProvider delayDuration={200}>
                  <div className="flex shrink-0 items-start gap-0.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          className="size-7"
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={isUpdating}
                          aria-label={isPinned ? "Открепить" : "Закрепить"}
                          onClick={() => onPinThread(thread.id, !isPinned)}
                        >
                          {isPinned ? <PinOff className="size-4" aria-hidden="true" /> : <Pin className="size-4" aria-hidden="true" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{isPinned ? "Открепить" : "Закрепить"}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          className="size-7"
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={isUpdating}
                          aria-label={isArchived ? "Вернуть из архива" : "В архив"}
                          onClick={() => onArchiveThread(thread.id, !isArchived)}
                        >
                          {isArchived ? <ArchiveRestore className="size-4" aria-hidden="true" /> : <Archive className="size-4" aria-hidden="true" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{isArchived ? "Вернуть из архива" : "В архив"}</TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
