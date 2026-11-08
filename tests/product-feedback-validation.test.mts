import assert from "node:assert/strict";
import test from "node:test";

import {
  FeedbackSubmissionSchema,
  FeedbackAdminUpdateSchema,
  mapFeedbackValidationIssues,
  normalizeFeedbackSections,
  normalizeFeedbackSourceUrl,
  readFeedbackApiErrorMessage,
} from "../lib/feedback/validation.ts";

test("feedback submission normalizes unique section slugs", () => {
  assert.deepEqual(normalizeFeedbackSections(["stats", "stats", " calendar ", ""]), ["stats", "calendar"]);
});

test("feedback submission rejects missing type, sections, and message with Russian copy", () => {
  const parsed = FeedbackSubmissionSchema.safeParse({
    type: "",
    sections: [],
    message: "",
  });

  assert.equal(parsed.success, false);
  if (parsed.success) return;

  assert.deepEqual(mapFeedbackValidationIssues(parsed.error), [
    { path: ["type"], message: "Выберите тип обращения" },
    { path: ["sections"], message: "Выберите хотя бы один раздел" },
    { path: ["message"], message: "Напишите сообщение" },
  ]);
});

test("feedback submission enforces message and source url limits", () => {
  const parsed = FeedbackSubmissionSchema.safeParse({
    type: "idea",
    sections: ["stats"],
    message: "а".repeat(10001),
    sourceUrl: "https://example.com/" + "a".repeat(2048),
  });

  assert.equal(parsed.success, false);
  if (parsed.success) return;

  const messages = mapFeedbackValidationIssues(parsed.error).map((issue) => issue.message);
  assert.ok(messages.includes("Сообщение не должно быть длиннее 10000 символов"));
  assert.ok(messages.includes("Ссылка на страницу слишком длинная"));
});

test("feedback submission accepts detailed messages up to 10000 characters", () => {
  const parsed = FeedbackSubmissionSchema.safeParse({
    type: "idea",
    sections: ["stats"],
    message: "а".repeat(10000),
  });

  assert.equal(parsed.success, true);
});

test("feedback source url accepts only same-origin http app urls", () => {
  assert.equal(normalizeFeedbackSourceUrl("/dashboard/feedback", "https://app.hiiire.test"), "https://app.hiiire.test/dashboard/feedback");
  assert.equal(
    normalizeFeedbackSourceUrl("https://app.hiiire.test/dashboard/feedback?tab=idea", "https://app.hiiire.test"),
    "https://app.hiiire.test/dashboard/feedback?tab=idea"
  );
  assert.equal(normalizeFeedbackSourceUrl("https://evil.test/dashboard/feedback", "https://app.hiiire.test"), null);
  assert.equal(normalizeFeedbackSourceUrl("javascript:alert(1)", "https://app.hiiire.test"), null);
  assert.equal(normalizeFeedbackSourceUrl("https://app.hiiire.test/" + "a".repeat(2048), "https://app.hiiire.test"), null);
});

test("feedback admin update validates note and external url safely", () => {
  const parsed = FeedbackAdminUpdateSchema.safeParse({
    feedbackId: "not-a-uuid",
    status: "bad",
    adminClass: "bug",
    adminNote: "а".repeat(5001),
    externalUrl: "ftp://example.com/task",
  });

  assert.equal(parsed.success, false);
  if (parsed.success) return;

  const messages = mapFeedbackValidationIssues(parsed.error).map((issue) => issue.message);
  assert.ok(messages.includes("Не удалось определить обращение"));
  assert.ok(messages.includes("Выберите корректный статус"));
  assert.ok(messages.includes("Заметка не должна быть длиннее 5000 символов"));
  assert.ok(messages.includes("Укажите ссылку, которая начинается с http:// или https://"));
});

test("feedback API error reader never exposes raw INVALID_BODY", () => {
  assert.equal(
    readFeedbackApiErrorMessage(
      {
        error: "INVALID_BODY",
        issues: [{ path: ["message"], message: "Сообщение не должно быть длиннее 10000 символов" }],
      },
      "Не удалось отправить сообщение"
    ),
    "Сообщение не должно быть длиннее 10000 символов"
  );

  assert.equal(
    readFeedbackApiErrorMessage({ error: "INVALID_BODY" }, "Не удалось отправить сообщение"),
    "Проверьте сообщение и попробуйте ещё раз."
  );
});
