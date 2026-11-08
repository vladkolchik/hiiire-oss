import assert from "node:assert/strict";
import test from "node:test";

import {
  CancelInterviewBodySchema,
  CompleteInterviewBodySchema,
  CreateInterviewBodySchema,
  UpdateInterviewBodySchema,
  mapInterviewValidationIssues,
} from "../lib/interviews/validation.ts";

test("create interview validation exposes Russian user-facing messages", () => {
  const parsed = CreateInterviewBodySchema.safeParse({
    candidateId: "",
    vacancyId: "",
    scheduledAt: "not-a-date",
    durationMinutes: 4,
    type: "coffee",
    interviewerIds: [],
    meetingUrl: "not a url",
    location: "x".repeat(251),
    notes: "x".repeat(2001),
  });

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    const messages = mapInterviewValidationIssues(parsed.error).map((issue) => issue.message);
    assert.ok(messages.includes("Выберите кандидата"));
    assert.ok(messages.includes("Выберите вакансию"));
    assert.ok(messages.includes("Укажите дату и время собеседования"));
    assert.ok(messages.includes("Длительность должна быть от 5 до 480 минут"));
    assert.ok(messages.includes("Выберите тип собеседования"));
    assert.ok(messages.includes("Добавьте хотя бы одного интервьюера"));
    assert.ok(messages.includes("Введите корректную ссылку"));
    assert.ok(messages.includes("Адрес не должен быть длиннее 250 символов"));
    assert.ok(messages.includes("Заметка не должна быть длиннее 2000 символов"));
  }
});

test("create interview validation accepts required MVP fields", () => {
  const parsed = CreateInterviewBodySchema.safeParse({
    candidateId: "11111111-1111-4111-8111-111111111111",
    vacancyId: "22222222-2222-4222-8222-222222222222",
    scheduledAt: "2099-01-10T09:00:00.000Z",
    durationMinutes: 60,
    type: "video",
    interviewerIds: ["33333333-3333-4333-8333-333333333333"],
    meetingUrl: "https://meet.example.com/hiiire",
    location: "",
    notes: "Первичное интервью",
  });

  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.location, undefined);
    assert.equal(parsed.data.type, "video");
  }
});

test("create interview validation rejects past dates and deduplicates interviewers", () => {
  const past = CreateInterviewBodySchema.safeParse({
    candidateId: "11111111-1111-4111-8111-111111111111",
    vacancyId: "22222222-2222-4222-8222-222222222222",
    scheduledAt: "2000-01-10T09:00:00.000Z",
    durationMinutes: 60,
    type: "video",
    interviewerIds: ["33333333-3333-4333-8333-333333333333"],
  });

  assert.equal(past.success, false);
  if (!past.success) {
    const messages = mapInterviewValidationIssues(past.error).map((issue) => issue.message);
    assert.ok(messages.includes("Выберите будущее время собеседования"));
  }

  const parsed = CreateInterviewBodySchema.safeParse({
    candidateId: "11111111-1111-4111-8111-111111111111",
    vacancyId: "22222222-2222-4222-8222-222222222222",
    scheduledAt: "2099-01-10T09:00:00.000Z",
    durationMinutes: 60,
    type: "video",
    interviewerIds: [
      "33333333-3333-4333-8333-333333333333",
      "33333333-3333-4333-8333-333333333333",
    ],
    allowConflicts: true,
  });

  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.deepEqual(parsed.data.interviewerIds, ["33333333-3333-4333-8333-333333333333"]);
    assert.equal(parsed.data.allowConflicts, true);
  }
});

test("completion note is optional and capped", () => {
  assert.equal(
    CompleteInterviewBodySchema.safeParse({
      expectedUpdatedAt: "2026-01-10T09:00:00.123456+00:00",
    }).success,
    true
  );

  const parsed = CompleteInterviewBodySchema.safeParse({
    completionNote: "x".repeat(2001),
    expectedUpdatedAt: "2026-01-10T09:00:00.123456+00:00",
  });
  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.deepEqual(mapInterviewValidationIssues(parsed.error), [
      { path: ["completionNote"], message: "Заметка не должна быть длиннее 2000 символов" },
    ]);
  }
});

test("update validation accepts past updated_at precondition", () => {
  const parsed = UpdateInterviewBodySchema.safeParse({
    candidateId: "11111111-1111-4111-8111-111111111111",
    vacancyId: "22222222-2222-4222-8222-222222222222",
    scheduledAt: "2099-01-10T09:00:00.000Z",
    durationMinutes: 5,
    type: "video",
    interviewerIds: ["33333333-3333-4333-8333-333333333333"],
    expectedUpdatedAt: "2026-01-10T09:00:00.123456+00:00",
  });

  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.candidateId, "11111111-1111-4111-8111-111111111111");
    assert.equal(parsed.data.vacancyId, "22222222-2222-4222-8222-222222222222");
    assert.equal(parsed.data.durationMinutes, 5);
  }
});

test("cancel and complete validation require updated-at precondition", () => {
  const expectedUpdatedAt = "2026-01-10T09:00:00.123456+00:00";

  assert.equal(CancelInterviewBodySchema.safeParse({ cancelNote: "Причина", expectedUpdatedAt }).success, true);
  assert.equal(CompleteInterviewBodySchema.safeParse({ completionNote: "Итог", expectedUpdatedAt }).success, true);

  for (const schema of [CancelInterviewBodySchema, CompleteInterviewBodySchema]) {
    const parsed = schema.safeParse({});
    assert.equal(parsed.success, false);
    if (!parsed.success) {
      const messages = mapInterviewValidationIssues(parsed.error).map((issue) => issue.message);
      assert.ok(messages.includes("Обновите календарь и попробуйте ещё раз"));
    }
  }
});
