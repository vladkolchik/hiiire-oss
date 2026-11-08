import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { getVacancyValidationMessage } from "../lib/vacancies/validation.ts";

function getDescriptionMin(filePath: string): number {
  const source = readFileSync(join(process.cwd(), filePath), "utf8");
  const match = source.match(/description:\s*z\s*\.\s*string\(\)\s*\.\s*trim\(\)\s*\.\s*min\((\d+)/s);

  assert.ok(match, `Не удалось найти минимальную длину description в ${filePath}`);

  return Number(match[1]);
}

test("vacancy description minimum length matches between form dialogs and API", () => {
  const createDialogMin = getDescriptionMin("components/dashboard/create-vacancy-dialog.tsx");
  const editDialogMin = getDescriptionMin("components/dashboard/edit-vacancy-dialog.tsx");
  const apiMin = getDescriptionMin("app/api/vacancies/route.ts");

  assert.equal(createDialogMin, apiMin);
  assert.equal(editDialogMin, apiMin);
  assert.equal(apiMin, 20);
});

test("vacancy description validation message stays user-friendly", () => {
  const message = getVacancyValidationMessage([
    {
      path: ["description"],
      message: "Too small: expected string to have >=20 characters",
    },
  ]);

  assert.equal(message, "Описание вакансии должно быть не короче 20 символов");
});
