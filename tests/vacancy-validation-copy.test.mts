import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import { getVacancyValidationMessage, mapVacancyValidationIssues } from "../lib/vacancies/validation.ts";
import { readUserFacingApiErrorMessage } from "../lib/api/user-facing-errors.ts";

test("vacancy title limit uses Russian user-facing copy", () => {
  assert.equal(
    getVacancyValidationMessage([
      {
        path: ["title"],
        message: "Название вакансии не должно быть длиннее 120 символов",
      },
    ]),
    "Название вакансии не должно быть длиннее 120 символов"
  );
});

test("vacancy description max error is not replaced by min-length copy", () => {
  assert.equal(
    getVacancyValidationMessage([
      {
        path: ["description"],
        message: "Описание вакансии не должно быть длиннее 20000 символов",
      },
    ]),
    "Описание вакансии не должно быть длиннее 20000 символов"
  );
});

test("vacancy description technical zod copy uses readable fallback", () => {
  assert.equal(
    getVacancyValidationMessage([
      {
        path: ["description"],
        message: "Too small: expected string to have >=20 characters",
      },
    ]),
    "Описание вакансии должно быть не короче 20 символов"
  );
});

test("vacancy validation issue mapping sanitizes enum and numeric defaults", () => {
  const schema = z.object({
    employmentType: z.enum(["full-time", "part-time", "contract", "internship"]),
    headcount: z.number().int().min(1).max(1000),
  });

  const parsed = schema.safeParse({
    employmentType: "remote",
    headcount: "many",
  });

  assert.equal(parsed.success, false);

  if (!parsed.success) {
    assert.deepEqual(mapVacancyValidationIssues(parsed.error), [
      {
        path: ["employmentType"],
        message: "Выберите тип занятости",
      },
      {
        path: ["headcount"],
        message: "Укажите план найма",
      },
    ]);
  }
});

test("service layer reads issue message from INVALID_BODY response", () => {
  assert.equal(
    readUserFacingApiErrorMessage(
      {
        error: "INVALID_BODY",
        issues: [{ path: ["title"], message: "Название вакансии не должно быть длиннее 120 символов" }],
      },
      "Не удалось создать вакансию"
    ),
    "Название вакансии не должно быть длиннее 120 символов"
  );
});
