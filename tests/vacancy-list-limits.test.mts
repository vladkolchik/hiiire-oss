import assert from "node:assert/strict";
import test from "node:test";

import {
  VACANCY_LIST_MAX_TEXT_LENGTH,
  VACANCY_LIST_TEXT_TOO_LONG_MESSAGE,
  parseVacancyListText,
  vacancyListApiSchema,
  vacancyListTextSchema,
} from "../lib/vacancies/lists.ts";

test("vacancy list fields use one total 2000 character limit", () => {
  assert.equal(VACANCY_LIST_MAX_TEXT_LENGTH, 2000);
  assert.match(VACANCY_LIST_TEXT_TOO_LONG_MESSAGE, /2000/);
});

test("vacancy list text allows more than 100 lines and long individual lines within total limit", () => {
  const lines = Array.from({ length: 120 }, (_, index) => `Пункт ${index + 1}`);
  const longLine = "а".repeat(250);
  const result = vacancyListTextSchema().safeParse([longLine, ...lines].join("\n"));

  assert.equal(result.success, true);
});

test("vacancy list text rejects text longer than 2000 characters", () => {
  const result = vacancyListTextSchema().safeParse("а".repeat(VACANCY_LIST_MAX_TEXT_LENGTH + 1));

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.issues[0]?.message, VACANCY_LIST_TEXT_TOO_LONG_MESSAGE);
  }
});

test("vacancy list API schema allows arrays whose joined text fits the 2000 character limit", () => {
  const result = vacancyListApiSchema().safeParse([
    "а".repeat(250),
    ...Array.from({ length: 120 }, (_, index) => `Пункт ${index + 1}`),
  ]);

  assert.equal(result.success, true);
});

test("vacancy list API schema rejects arrays whose joined text exceeds the 2000 character limit", () => {
  const result = vacancyListApiSchema().safeParse(["а".repeat(1200), "б".repeat(801)]);

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.issues[0]?.message, VACANCY_LIST_TEXT_TOO_LONG_MESSAGE);
  }
});

test("vacancy list parser keeps line-based structure without silently slicing items", () => {
  const lines = Array.from({ length: 120 }, (_, index) => `Пункт ${index + 1}`);

  assert.equal(parseVacancyListText(lines.join("\n")).length, 120);
});
