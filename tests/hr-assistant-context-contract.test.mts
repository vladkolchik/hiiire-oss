import assert from "node:assert/strict";
import test from "node:test";

import { buildHrAssistantPromptContext } from "../lib/hr-assistant/context.ts";

test("context builder includes current thread messages and excludes unrelated raw history", () => {
  const context = buildHrAssistantPromptContext({
    currentThread: {
      summary: "В этой теме сравнивают кандидатов по вакансии Product Manager.",
      messages: [
        { role: "user", content: "Сравни кандидатов." },
        { role: "assistant", content: "Смотрю доступных кандидатов." },
      ],
    },
    pinnedContext: [{ entityType: "vacancy", label: "Product Manager" }],
    retrievedDocs: ["Кредиты списываются только за AI-анализ."],
    retrievedCrmFacts: ["Кандидат Анна: статус new."],
    unrelatedThreadSummaries: ["Старая тема про тарифы."],
  });

  assert.match(context, /Сравни кандидатов/);
  assert.match(context, /Product Manager/);
  assert.match(context, /Кандидат Анна/);
  assert.doesNotMatch(context, /Старая тема про тарифы/);
});

test("context builder can include relevant external summaries explicitly", () => {
  const context = buildHrAssistantPromptContext({
    currentThread: { summary: "Текущая тема.", messages: [] },
    pinnedContext: [],
    retrievedDocs: [],
    retrievedCrmFacts: [],
    unrelatedThreadSummaries: ["Не включать"],
    relevantThreadSummaries: ["Пользователь предпочитает короткие письма кандидатам."],
  });

  assert.match(context, /Пользователь предпочитает короткие письма/);
  assert.doesNotMatch(context, /Не включать/);
});

test("context builder skips whitespace-only current thread messages", () => {
  const context = buildHrAssistantPromptContext({
    currentThread: {
      summary: null,
      messages: [
        { role: "user", content: "   " },
        { role: "assistant", content: "\n\t" },
        { role: "user", content: "  Покажи кандидатов.  " },
      ],
    },
    pinnedContext: [],
    retrievedDocs: [],
    retrievedCrmFacts: [],
  });

  assert.doesNotMatch(context, /^USER:$/m);
  assert.doesNotMatch(context, /^ASSISTANT:$/m);
  assert.match(context, /^USER: Покажи кандидатов\.$/m);
});

test("context builder skips pinned context entries with blank required fields", () => {
  const context = buildHrAssistantPromptContext({
    currentThread: { summary: null, messages: [] },
    pinnedContext: [
      { entityType: "vacancy", label: "   " },
      { entityType: "   ", label: "Product Manager" },
      { entityType: "\n", label: "\t" },
      { entityType: " vacancy ", label: " Product Manager " },
    ],
    retrievedDocs: [],
    retrievedCrmFacts: [],
  });

  assert.doesNotMatch(context, /^vacancy:$/m);
  assert.doesNotMatch(context, /^: Product Manager$/m);
  assert.match(context, /^vacancy: Product Manager$/m);
});
