"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Bot, Loader2, Send, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { readUserFacingApiErrorMessage } from "@/lib/api/user-facing-errors";

type Verdict = "expected_behavior" | "looks_like_bug" | "not_documented";

type DocReference = {
  refId: string;
  file: "docs/For_juniors/hiiire_for_junior.md";
  section: string;
  lineStart: number;
  lineEnd: number;
};

type QaResponse = {
  verdict: Verdict;
  reasoning: string;
  docReferences: DocReference[];
  expectedBehavior: string | null;
  recommendation: string | null;
};

type HistoryItem = {
  role: "user" | "assistant";
  content: string;
};

type ChatMessage =
  | {
      id: string;
      role: "user";
      content: string;
    }
  | {
      id: string;
      role: "assistant";
      response: QaResponse;
      historyContent: string;
    };

const HISTORY_WINDOW = 8;
const QA_CHAT_ERROR_MESSAGE = "Не удалось получить ответ QA-ассистента. Попробуйте ещё раз.";

export default function QaAssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  const canSend = input.trim().length > 0 && !isLoading;

  useEffect(() => {
    anchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading]);

  const history = useMemo(() => toHistory(messages).slice(-HISTORY_WINDOW), [messages]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend) return;

    const userText = input.trim();
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: userText,
    };

    setInput("");
    setError(null);
    setIsLoading(true);
    setMessages((prev) => [...prev, userMessage]);

    try {
      const res = await fetch("/api/qa-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: userText,
          history,
        }),
      });

      const json = (await res.json().catch(() => null)) as (Partial<QaResponse> & { error?: string; message?: string }) | null;
      if (!res.ok || !json) {
        throw new Error(readUserFacingApiErrorMessage(json, QA_CHAT_ERROR_MESSAGE));
      }

      const response = normalizeResponse(json);
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        response,
        historyContent: buildAssistantHistoryContent(response),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? readUserFacingApiErrorMessage({ message: submitError.message }, QA_CHAT_ERROR_MESSAGE)
          : QA_CHAT_ERROR_MESSAGE;
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">QA-ассистент</h1>
        <p className="text-muted-foreground">
          Ассистент проверяет кейсы только по документации: docs/For_juniors/hiiire_for_junior.md.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Как задавать вопрос</CardTitle>
          <CardDescription>
            Формат: где проблема, шаги, фактический результат, ожидаемое поведение.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>1. Где: URL или экран.</p>
          <p>2. Шаги: что сделали последовательно.</p>
          <p>3. Факт: что увидели по факту.</p>
          <p>4. Ожидание: что должно было произойти.</p>
        </CardContent>
      </Card>

      <Card className="min-h-[520px]">
        <CardHeader>
          <CardTitle>Диалог</CardTitle>
          <CardDescription>История хранится только в текущей вкладке браузера.</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[520px] flex-col gap-4">
          <ScrollArea className="flex-1 rounded-md border p-4">
            <div className="flex flex-col gap-4">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Диалог пуст. Отправьте первый кейс для проверки.
                </p>
              ) : (
                messages.map((message) => {
                  if (message.role === "user") {
                    return (
                      <div key={message.id} className="flex justify-end">
                        <div className="max-w-[85%] rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground">
                          <div className="mb-2 flex items-center gap-2 text-xs opacity-90">
                            <User className="h-3.5 w-3.5" />
                            <span>Вы</span>
                          </div>
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={message.id} className="flex justify-start">
                      <div className="max-w-[95%] rounded-lg border bg-background px-4 py-3 text-sm">
                        <div className="mb-3 flex items-center gap-2">
                          <Bot className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">QA-ассистент</span>
                          <VerdictBadge verdict={message.response.verdict} />
                        </div>
                        <p className="whitespace-pre-wrap leading-relaxed">{message.response.reasoning}</p>

                        {message.response.docReferences.length > 0 ? (
                          <div className="mt-3 space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">Разделы документации:</p>
                            {message.response.docReferences.map((ref) => (
                              <p key={`${message.id}-${ref.refId}`} className="text-xs text-muted-foreground">
                                [{ref.refId}] {ref.file} • {ref.section} • строки {ref.lineStart}-{ref.lineEnd}
                              </p>
                            ))}
                          </div>
                        ) : null}

                        {message.response.expectedBehavior ? (
                          <div className="mt-3 rounded-md bg-muted p-3">
                            <p className="text-xs font-medium text-muted-foreground">Ожидаемое поведение</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm">{message.response.expectedBehavior}</p>
                          </div>
                        ) : null}

                        {message.response.recommendation ? (
                          <div className="mt-3 rounded-md border border-dashed p-3">
                            <p className="text-xs font-medium text-muted-foreground">Рекомендация</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm">{message.response.recommendation}</p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}

              {isLoading ? (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-lg border bg-background px-4 py-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>QA-ассистент анализирует документацию…</span>
                  </div>
                </div>
              ) : null}
              <div ref={anchorRef} />
            </div>
          </ScrollArea>

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>Ошибка запроса: {error}</p>
            </div>
          ) : null}

          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Например: /dashboard/settings → вкладка Профиль. Нажал Сохранить, toast успеха есть, но имя не меняется..."
              rows={4}
              maxLength={2000}
              disabled={isLoading}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Контекст истории: последние {HISTORY_WINDOW} сообщений.
              </p>
              <Button type="submit" disabled={!canSend}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Отправить
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  if (verdict === "expected_behavior") {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Expected behavior</Badge>;
  }
  if (verdict === "looks_like_bug") {
    return <Badge variant="destructive">Похоже на баг</Badge>;
  }
  return <Badge variant="secondary">Не описано</Badge>;
}

function normalizeResponse(data: Partial<QaResponse>): QaResponse {
  return {
    verdict: toVerdict(data.verdict),
    reasoning: typeof data.reasoning === "string" && data.reasoning.trim().length > 0 ? data.reasoning.trim() : "Нет обоснования",
    docReferences: Array.isArray(data.docReferences) ? data.docReferences.filter(isDocReference) : [],
    expectedBehavior: typeof data.expectedBehavior === "string" && data.expectedBehavior.trim().length > 0 ? data.expectedBehavior : null,
    recommendation: typeof data.recommendation === "string" && data.recommendation.trim().length > 0 ? data.recommendation : null,
  };
}

function toVerdict(value: unknown): Verdict {
  if (value === "expected_behavior" || value === "looks_like_bug" || value === "not_documented") return value;
  return "not_documented";
}

function isDocReference(value: unknown): value is DocReference {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  const file = rec.file;
  return (
    typeof rec.refId === "string" &&
    typeof rec.section === "string" &&
    file === "docs/For_juniors/hiiire_for_junior.md" &&
    typeof rec.lineStart === "number" &&
    typeof rec.lineEnd === "number"
  );
}

function toHistory(messages: ChatMessage[]): HistoryItem[] {
  return messages.map((message) => {
    if (message.role === "user") {
      return { role: "user", content: message.content };
    }
    return { role: "assistant", content: message.historyContent };
  });
}

function buildAssistantHistoryContent(response: QaResponse): string {
  const verdictLabel =
    response.verdict === "expected_behavior"
      ? "Expected behavior"
      : response.verdict === "looks_like_bug"
        ? "Похоже на баг"
        : "Не описано";

  const refText =
    response.docReferences.length > 0
      ? response.docReferences.map((ref) => `${ref.file}:${ref.lineStart}-${ref.lineEnd}`).join("; ")
      : "нет ссылок";

  return [
    `Вердикт: ${verdictLabel}`,
    `Обоснование: ${response.reasoning}`,
    `Ссылки: ${refText}`,
    response.expectedBehavior ? `Ожидаемое поведение: ${response.expectedBehavior}` : null,
    response.recommendation ? `Рекомендация: ${response.recommendation}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}
