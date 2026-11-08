import assert from "node:assert/strict";
import test from "node:test";

import { readInterviewMutationErrorDescription } from "../lib/interviews/user-facing-mutation-error.ts";

test("interview mutation error copy keeps safe API messages", () => {
  assert.equal(
    readInterviewMutationErrorDescription(
      new Error("Кандидат не относится к выбранной вакансии."),
      "Не удалось назначить собеседование. Проверьте данные и попробуйте ещё раз."
    ),
    "Кандидат не относится к выбранной вакансии."
  );
});

test("interview mutation error copy hides network and technical errors", () => {
  const fallback = "Не удалось назначить собеседование. Проверьте данные и попробуйте ещё раз.";

  assert.equal(readInterviewMutationErrorDescription(new Error("Failed to fetch"), fallback), fallback);
  assert.equal(readInterviewMutationErrorDescription(new Error("TypeError: Cannot read properties of undefined"), fallback), fallback);
  assert.equal(readInterviewMutationErrorDescription(new Error("CANDIDATE_VACANCY_MISMATCH"), fallback), fallback);
});

test("interview mutation error copy hides mixed user and technical messages", () => {
  const fallback = "Не удалось назначить собеседование. Проверьте данные и попробуйте ещё раз.";

  assert.equal(readInterviewMutationErrorDescription(new Error("Не удалось назначить: CANDIDATE_VACANCY_MISMATCH"), fallback), fallback);
});
