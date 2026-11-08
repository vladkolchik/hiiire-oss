import assert from "node:assert/strict";
import test from "node:test";

import {
  firstUserFacingIssueMessage,
  readUserFacingApiErrorMessage,
  zodErrorToUserFacingIssues,
} from "../lib/api/user-facing-errors.ts";
import { z } from "zod";

test("maps zod max string errors to readable issue messages", () => {
  const schema = z.object({
    title: z.string().trim().min(2, "Введите название").max(120, "Название не должно быть длиннее 120 символов"),
  });

  const parsed = schema.safeParse({ title: "x".repeat(121) });
  assert.equal(parsed.success, false);

  if (!parsed.success) {
    assert.deepEqual(zodErrorToUserFacingIssues(parsed.error), [
      {
        path: ["title"],
        message: "Название не должно быть длиннее 120 символов",
      },
    ]);
  }
});

test("prefers payload message over raw technical error code", () => {
  assert.equal(
    readUserFacingApiErrorMessage(
      {
        error: "INVALID_BODY",
        message: "Проверьте название компании.",
      },
      "Не удалось выполнить действие"
    ),
    "Проверьте название компании."
  );
});

test("uses first issue when message is absent", () => {
  assert.equal(
    readUserFacingApiErrorMessage(
      {
        error: "INVALID_BODY",
        issues: [{ path: ["description"], message: "Описание не должно быть длиннее 20000 символов" }],
      },
      "Не удалось сохранить"
    ),
    "Описание не должно быть длиннее 20000 символов"
  );
});

test("does not expose known technical error codes", () => {
  assert.equal(readUserFacingApiErrorMessage({ error: "INVALID_BODY" }, "Проверьте поля формы"), "Проверьте поля формы");
  assert.equal(readUserFacingApiErrorMessage({ error: "Too big: expected string" }, "Проверьте поля формы"), "Проверьте поля формы");
});

test("does not expose internal payload messages", () => {
  assert.equal(readUserFacingApiErrorMessage({ message: "INTERNAL_ERROR" }, "Проверьте поля формы"), "Проверьте поля формы");
  assert.equal(
    readUserFacingApiErrorMessage({ message: "CANDIDATE_CONTACTS_UPDATE_FAILED" }, "Проверьте поля формы"),
    "Проверьте поля формы"
  );
});

test("does not expose stack or provider style payload messages", () => {
  assert.equal(
    readUserFacingApiErrorMessage({ message: "Error: token expired at auth.js:10" }, "Проверьте поля формы"),
    "Проверьте поля формы"
  );
});

test("does not expose browser transport failure messages", () => {
  assert.equal(readUserFacingApiErrorMessage({ message: "Failed to fetch" }, "Попробуйте ещё раз"), "Попробуйте ещё раз");
  assert.equal(readUserFacingApiErrorMessage({ message: "NetworkError when attempting to fetch resource." }, "Попробуйте ещё раз"), "Попробуйте ещё раз");
});

test("does not expose thrown error class payload messages", () => {
  assert.equal(
    readUserFacingApiErrorMessage(
      { message: "TypeError: Cannot read properties of undefined (reading 'id')" },
      "Проверьте поля формы"
    ),
    "Проверьте поля формы"
  );
  assert.equal(
    readUserFacingApiErrorMessage(
      { message: "ReferenceError: fetchCandidate is not defined" },
      "Проверьте поля формы"
    ),
    "Проверьте поля формы"
  );
  assert.equal(
    readUserFacingApiErrorMessage(
      { message: "AuthApiError: Invalid login credentials" },
      "Проверьте поля формы"
    ),
    "Проверьте поля формы"
  );
});

test("uses later safe issue message when earlier issue is technical", () => {
  assert.equal(
    readUserFacingApiErrorMessage(
      {
        issues: [
          { path: ["title"], message: "Invalid input" },
          { path: ["title"], message: "Введите название" },
        ],
      },
      "Проверьте поля формы"
    ),
    "Введите название"
  );
});

test("zod issue mapping replaces default technical messages with fallback", () => {
  const schema = z.object({
    fullName: z.string().trim().min(2, "Укажите имя и фамилию"),
  });

  const parsed = schema.safeParse({ fullName: null });
  assert.equal(parsed.success, false);

  if (!parsed.success) {
    assert.deepEqual(zodErrorToUserFacingIssues(parsed.error, "Проверьте поля заявки."), [
      {
        path: ["fullName"],
        message: "Проверьте поля заявки.",
      },
    ]);
  }
});

test("firstUserFacingIssueMessage returns fallback for empty issue arrays", () => {
  assert.equal(firstUserFacingIssueMessage([], "Проверьте поля формы"), "Проверьте поля формы");
});
