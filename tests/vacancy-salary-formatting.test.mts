import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import * as salary from "../lib/vacancies/salary.ts";
import { mapVacancyValidationIssues } from "../lib/vacancies/validation.ts";

test("vacancy salary parser treats dot, comma, and spaces as thousands separators", () => {
  assert.equal(salary.parseVacancySalaryValue("500.500"), 500500);
  assert.equal(salary.parseVacancySalaryValue("500,500"), 500500);
  assert.equal(salary.parseVacancySalaryValue("1.200.000"), 1200000);
  assert.equal(salary.parseVacancySalaryValue("1 200 000"), 1200000);
});

test("vacancy salary input is formatted with spaces after normalization", () => {
  assert.equal(typeof salary.formatVacancySalaryInput, "function");
  assert.equal(salary.formatVacancySalaryInput("500.500"), "500 500");
  assert.equal(salary.formatVacancySalaryInput("1,200,000"), "1 200 000");
  assert.equal(salary.formatVacancySalaryInput("120000.75"), "120000.75");
});

test("vacancy salary validation rejects real fractional amounts with readable copy", () => {
  const schema = z
    .object({
      salaryMin: z.union([z.string().trim(), z.number()]).optional(),
      salaryMax: z.union([z.string().trim(), z.number()]).optional(),
    })
    .superRefine((val, ctx) => salary.addVacancySalaryIssues(val, ctx));

  const parsed = schema.safeParse({ salaryMin: "120000.75", salaryMax: "100,5" });

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.deepEqual(mapVacancyValidationIssues(parsed.error), [
      { path: ["salaryMin"], message: "Введите целую сумму без копеек" },
      { path: ["salaryMax"], message: "Введите целую сумму без копеек" },
    ]);
  }
});

test("vacancy salary validation allows up to 15 digits and rejects larger amounts", () => {
  const schema = z
    .object({
      salaryMin: z.union([z.string().trim(), z.number()]).optional(),
      salaryMax: z.union([z.string().trim(), z.number()]).optional(),
    })
    .superRefine((val, ctx) => salary.addVacancySalaryIssues(val, ctx));

  assert.equal(schema.safeParse({ salaryMin: "999999999999999" }).success, true);

  const parsed = schema.safeParse({ salaryMax: "1000000000000000" });

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.deepEqual(mapVacancyValidationIssues(parsed.error), [
      { path: ["salaryMax"], message: "Зарплата не может быть больше 15 цифр" },
    ]);
  }
});

test("vacancy salary input guard preserves formatting separators but limits digits", () => {
  assert.equal(typeof salary.limitVacancySalaryInput, "function");
  assert.deepEqual(salary.limitVacancySalaryInput("999 999 999 999 999"), {
    value: "999 999 999 999 999",
    exceeded: false,
  });
  assert.deepEqual(salary.limitVacancySalaryInput("1234567890123456"), {
    value: "123456789012345",
    exceeded: true,
  });
  assert.deepEqual(salary.limitVacancySalaryInput("123 456 789 012 345 6"), {
    value: "123 456 789 012 345 ",
    exceeded: true,
  });
});

test("vacancy salary input length allows formatted 15 digit amounts only", () => {
  assert.equal(salary.VACANCY_SALARY_MAX_INPUT_LENGTH, "999 999 999 999 999".length);
  assert.equal(salary.limitVacancySalaryInput("9999999999999999999").value.length, salary.VACANCY_SALARY_MAX_DIGITS);
});

test("vacancy API validation maps integer type errors to readable salary copy", () => {
  const schema = z.object({
    salaryMin: z.number().int().nullable().optional(),
  });

  const parsed = schema.safeParse({ salaryMin: 500.5 });

  assert.equal(parsed.success, false);
  if (!parsed.success) {
    assert.deepEqual(mapVacancyValidationIssues(parsed.error), [
      { path: ["salaryMin"], message: "Введите целую сумму без копеек" },
    ]);
  }
});
