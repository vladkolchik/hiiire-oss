import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  CompanyPatchSchema,
  getCompanyValidationMessage,
  mapCompanyValidationIssues,
  readCompanyApiErrorMessage,
} from "../lib/company/validation.ts";

test("company name validation uses Russian copy for values longer than 120 characters", () => {
  const result = CompanyPatchSchema.safeParse({
    name: "а".repeat(121),
  });

  assert.equal(result.success, false);
  if (result.success) return;

  assert.equal(result.error.flatten().fieldErrors.name?.[0], "Название компании не должно быть длиннее 120 символов");
});

test("company validation issues expose user-facing messages", () => {
  const result = CompanyPatchSchema.safeParse({
    name: "а".repeat(121),
  });

  assert.equal(result.success, false);
  if (result.success) return;

  assert.deepEqual(mapCompanyValidationIssues(result.error), [
    {
      path: ["name"],
      message: "Название компании не должно быть длиннее 120 символов",
    },
  ]);
});

test("company API error reader never exposes INVALID_BODY", () => {
  assert.equal(
    readCompanyApiErrorMessage(
      {
        error: "INVALID_BODY",
        issues: [{ path: ["name"], message: "Название компании не должно быть длиннее 120 символов" }],
      },
      "Не удалось сохранить данные компании. Попробуйте ещё раз."
    ),
    "Название компании не должно быть длиннее 120 символов"
  );

  assert.equal(
    readCompanyApiErrorMessage({ error: "INVALID_BODY" }, "Не удалось сохранить данные компании. Попробуйте ещё раз."),
    "Проверьте название компании."
  );
});

test("company settings form mirrors server company name limit", () => {
  const source = readFileSync(join(process.cwd(), "app/(dashboard)/dashboard/settings/page.tsx"), "utf8");
  const saveCompanySource = source.slice(source.indexOf("const saveCompany"), source.indexOf("const loadHhStatus"));

  assert.match(source, /maxLength=\{120\}/);
  assert.doesNotMatch(saveCompanySource, /description:\s*String\(json\?\.error/);
  assert.match(saveCompanySource, /readCompanyApiErrorMessage\(json,/);
});

test("company validation message falls back to friendly copy for legacy raw zod text", () => {
  assert.equal(
    getCompanyValidationMessage([
      {
        path: ["name"],
        message: "Too big: expected string to have <=120 characters",
      },
    ]),
    "Название компании не должно быть длиннее 120 символов"
  );
});
