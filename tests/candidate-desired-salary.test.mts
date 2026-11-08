import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  buildDesiredSalaryDbPatchFromHhResume,
  extractDesiredSalaryFromHhResume,
  extractDesiredSalaryFromText,
  extractDesiredSalaryUpdateFromHhResume,
  normalizeDesiredSalaryFields,
} from "../lib/candidates/desired-salary.ts";
import { formatCandidateDesiredSalary } from "../lib/candidates/desired-salary-display.ts";

const projectRoot = resolve(".");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(pathToFileURL(resolve(projectRoot, specifier.slice(2)) + ".ts").href, context);
    }

    return nextResolve(specifier, context);
  },
});

const EMPTY_DESIRED_SALARY = {
  text: null,
  amount: null,
  currency: null,
  source: null,
};

test("candidate desired salary migration adds nullable fields and source constraint", () => {
  const sql = readFileSync("supabase/sql/candidate_desired_salary_v1.sql", "utf8");

  for (const column of [
    "desired_salary_text",
    "desired_salary_amount",
    "desired_salary_currency",
    "desired_salary_source",
  ]) {
    assert.match(sql, new RegExp(`add column if not exists ${column}`, "i"));
  }

  assert.match(sql, /desired_salary_source.*in \('hh', 'ai_parser', 'regex'\)/is);
  assert.match(sql, /desired_salary_amount.*>= 0/is);
  assert.match(sql, /desired_salary_amount.*<= 999999999999999/is);
  assert.match(sql, /char_length\(desired_salary_text\) <= 160/is);
  assert.match(sql, /char_length\(desired_salary_currency\) <= 12/is);
  assert.match(sql, /nullif\(btrim\(desired_salary_text\), ''\) is not null/is);
  assert.match(sql, /desired_salary_source is not null/is);
});

test("candidate create RPC accepts and inserts desired salary fields", () => {
  const sql = readFileSync("supabase/sql/candidate_desired_salary_v1.sql", "utf8");

  for (const param of [
    "p_desired_salary_text",
    "p_desired_salary_amount",
    "p_desired_salary_currency",
    "p_desired_salary_source",
  ]) {
    assert.match(sql, new RegExp(param, "i"));
  }

  assert.match(sql, /desired_salary_text,\s*desired_salary_amount,\s*desired_salary_currency,\s*desired_salary_source/is);
  assert.match(sql, /v_desired_salary_text,\s*v_desired_salary_amount,\s*v_desired_salary_currency,\s*v_desired_salary_source/is);
  assert.match(sql, /if v_desired_salary_text is null and v_desired_salary_amount is not null then/is);
  assert.match(sql, /to_char\(v_desired_salary_amount,\s*'FM999G999G999G999G999'\)/is);
  assert.match(sql, /replace\(replace\(to_char\(v_desired_salary_amount/is);
  assert.match(sql, /if v_desired_salary_text is null or v_desired_salary_source is null then/is);
  assert.match(sql, /revoke all on function public\.create_candidate_with_idempotency/is);
  assert.match(sql, /grant execute on function public\.create_candidate_with_idempotency[\s\S]*to service_role/is);
});

test("app and worker database types expose candidate desired salary fields", () => {
  const appTypes = readFileSync("lib/supabase/database.types.ts", "utf8");
  const workerTypes = readFileSync("worker/src/database.types.ts", "utf8");
  const domainTypes = readFileSync("types/index.ts", "utf8");

  for (const source of [appTypes, workerTypes]) {
    assert.match(source, /desired_salary_text: string \| null/);
    assert.match(source, /desired_salary_amount: number \| null/);
    assert.match(source, /desired_salary_currency: string \| null/);
    assert.match(source, /desired_salary_source: "hh" \| "ai_parser" \| "regex" \| null/);
  }

  assert.match(domainTypes, /desiredSalaryText\?: string \| null/);
  assert.match(domainTypes, /desiredSalaryAmount\?: number \| null/);
  assert.match(domainTypes, /desiredSalaryCurrency\?: string \| null/);
  assert.match(domainTypes, /desiredSalarySource\?: "hh" \| "ai_parser" \| "regex" \| null/);
});

test("candidate row mapper and display use structured desired salary over conflicting resume text", async () => {
  const { mapCandidateRow } = await import("../services/data/mappers.ts");
  const candidate = mapCandidateRow({
    id: "candidate-1",
    name: "Анна Смирнова",
    position: "Product manager",
    vacancy_id: "vacancy-1",
    created_by: "user-1",
    resume_url: null,
    resume_text: "Ожидаемая зарплата: 999 000 ₽",
    resume_file_name: null,
    resume_file_size: null,
    desired_salary_text: "от 250 000 ₽ net",
    desired_salary_amount: 250000,
    desired_salary_currency: "RUB",
    desired_salary_source: "ai_parser",
    avatar_url: null,
    ai_score: null,
    match_percentage: null,
    status: "new",
    source: "manual",
    comment: null,
    applied_at: "2026-05-29T10:00:00.000Z",
    hhru_resume_id: null,
    hh_auto_survey_text: null,
    hh_source_fingerprint: null,
    created_at: "2026-05-29T10:00:00.000Z",
    updated_at: "2026-05-29T10:00:00.000Z",
  });

  assert.equal(candidate.desiredSalaryText, "от 250 000 ₽ net");
  assert.equal(candidate.desiredSalaryAmount, 250000);
  assert.equal(candidate.desiredSalaryCurrency, "RUB");
  assert.equal(candidate.desiredSalarySource, "ai_parser");
  assert.equal(formatCandidateDesiredSalary(candidate), "от 250 000 ₽ net");
  assert.notEqual(formatCandidateDesiredSalary(candidate), "999 000 ₽");
});

test("candidate desired salary UI uses structured fields without resume text parsing", () => {
  const candidatesPage = readFileSync("app/(dashboard)/dashboard/candidates/page.tsx", "utf8");

  assert.doesNotMatch(candidatesPage, /extractDesiredSalaryText/);
  assert.match(candidatesPage, /formatCandidateDesiredSalary/);
  assert.doesNotMatch(candidatesPage, /desiredSalaryText:\s*[^,\n]*resumeText/);
});

test("candidate desired salary display prefers text and formats amount with supported currencies", () => {
  assert.equal(
    formatCandidateDesiredSalary({
      desiredSalaryText: "от 250 000 ₽ net",
      desiredSalaryAmount: 250000,
      desiredSalaryCurrency: "RUB",
    }),
    "от 250 000 ₽ net",
  );
  assert.equal(formatCandidateDesiredSalary({ desiredSalaryAmount: 250000, desiredSalaryCurrency: "RUB" }), "250 000 ₽");
  assert.equal(formatCandidateDesiredSalary({ desiredSalaryAmount: 4500, desiredSalaryCurrency: "USD" }), "4 500 USD");
  assert.equal(formatCandidateDesiredSalary({ desiredSalaryAmount: 4200, desiredSalaryCurrency: "EUR" }), "4 200 EUR");
  assert.equal(formatCandidateDesiredSalary({ desiredSalaryAmount: 900000, desiredSalaryCurrency: "KZT" }), "900 000 KZT");
});

test("candidate desired salary display hides empty and unsupported structured values", () => {
  assert.equal(formatCandidateDesiredSalary({ desiredSalaryText: "   " }), null);
  assert.equal(formatCandidateDesiredSalary({ desiredSalaryAmount: 250000 }), null);
  assert.equal(formatCandidateDesiredSalary({ desiredSalaryAmount: 250000, desiredSalaryCurrency: "GBP" }), null);
  assert.equal(formatCandidateDesiredSalary({ desiredSalaryAmount: Number.NaN, desiredSalaryCurrency: "RUB" }), null);
  assert.equal(formatCandidateDesiredSalary({ desiredSalaryAmount: -1, desiredSalaryCurrency: "RUB" }), null);
});

test("desired salary regex extracts explicit manual desired salary phrases", () => {
  assert.deepEqual(extractDesiredSalaryFromText("Иван\nЗП от 250к net\nОпыт продаж"), {
    text: "от 250к net",
    amount: 250000,
    currency: null,
    source: "regex",
  });
  assert.deepEqual(extractDesiredSalaryFromText("Ожидаемая компенсация: до 300 000 gross"), {
    text: "до 300 000 gross",
    amount: 300000,
    currency: null,
    source: "regex",
  });
  assert.deepEqual(extractDesiredSalaryFromText("Ожидаемая компенсация 300 000 gross"), {
    text: "300 000 gross",
    amount: 300000,
    currency: null,
    source: "regex",
  });
  assert.deepEqual(extractDesiredSalaryFromText("Ожидаемая зарплата: 180 000 ₽"), {
    text: "180 000 ₽",
    amount: 180000,
    currency: "RUB",
    source: "regex",
  });
  assert.deepEqual(extractDesiredSalaryFromText("Ожидаемая зарплата 180 000 ₽"), {
    text: "180 000 ₽",
    amount: 180000,
    currency: "RUB",
    source: "regex",
  });
  assert.deepEqual(extractDesiredSalaryFromText("Ожидаемая зарплата: 300 000 KZT"), {
    text: "300 000 KZT",
    amount: 300000,
    currency: "KZT",
    source: "regex",
  });
  assert.deepEqual(extractDesiredSalaryFromText("Зарплатные ожидания 250 000 RUB"), {
    text: "250 000 RUB",
    amount: 250000,
    currency: "RUB",
    source: "regex",
  });
  assert.deepEqual(extractDesiredSalaryFromText("Ожидания по зарплате 250 000 RUB"), {
    text: "250 000 RUB",
    amount: 250000,
    currency: "RUB",
    source: "regex",
  });
  assert.deepEqual(extractDesiredSalaryFromText("Ожидания по компенсации 300 000 gross"), {
    text: "300 000 gross",
    amount: 300000,
    currency: null,
    source: "regex",
  });
  assert.deepEqual(extractDesiredSalaryFromText("Ожидаемая зарплата: от 250 до 300 тыс RUB"), {
    text: "от 250 до 300 тыс RUB",
    amount: null,
    currency: "RUB",
    source: "regex",
  });
  assert.deepEqual(extractDesiredSalaryFromText("Ожидаемая зарплата: 250-300к"), {
    text: "250-300к",
    amount: null,
    currency: null,
    source: "regex",
  });
  assert.deepEqual(extractDesiredSalaryFromText("Ожидаемая зарплата: от 250к до 300к RUB"), {
    text: "от 250к до 300к RUB",
    amount: null,
    currency: "RUB",
    source: "regex",
  });
  assert.deepEqual(extractDesiredSalaryFromText("Ожидаемая зарплата: 250к до 300к RUB"), {
    text: "250к до 300к RUB",
    amount: null,
    currency: "RUB",
    source: "regex",
  });
  assert.deepEqual(extractDesiredSalaryFromText("Ожидаемая зарплата: 250 тыс до 300 тыс RUB"), {
    text: "250 тыс до 300 тыс RUB",
    amount: null,
    currency: "RUB",
    source: "regex",
  });
  assert.deepEqual(extractDesiredSalaryFromText("Ожидаемая зарплата: 250 k - 300 k USD"), {
    text: "250 k - 300 k USD",
    amount: null,
    currency: "USD",
    source: "regex",
  });
});

test("desired salary regex ignores current and previous salary phrases", () => {
  for (const resumeText of [
    "Текущая зарплата: 250 000 RUB",
    "Доход на прошлом месте: 180 000 ₽",
    "Зарплата была 200 000 gross",
    "Компенсация 300 000 gross",
    "Оклад: 220 000 ₽",
  ]) {
    assert.deepEqual(extractDesiredSalaryFromText(resumeText), EMPTY_DESIRED_SALARY);
  }
});

test("desired salary helper maps HH salary fields", () => {
  assert.deepEqual(extractDesiredSalaryFromHhResume({ salary: { amount: 220000, currency: "RUR" } }), {
    text: "220 000 RUB",
    amount: 220000,
    currency: "RUB",
    source: "hh",
  });
  assert.deepEqual(extractDesiredSalaryFromHhResume({ salary: { amount: 4500, currency: "USD" } }), {
    text: "4 500 USD",
    amount: 4500,
    currency: "USD",
    source: "hh",
  });
  assert.deepEqual(extractDesiredSalaryFromHhResume({ salary: { amount: 4200, currency: "EUR" } }), {
    text: "4 200 EUR",
    amount: 4200,
    currency: "EUR",
    source: "hh",
  });
  assert.deepEqual(extractDesiredSalaryFromHhResume({ salary: { amount: 220000, currency: "KZT" } }), {
    text: "220 000 KZT",
    amount: 220000,
    currency: "KZT",
    source: "hh",
  });
  assert.deepEqual(extractDesiredSalaryFromHhResume({ salary: null }), EMPTY_DESIRED_SALARY);
});

test("desired salary module re-exports the worker shared helper without app-only imports", async () => {
  const appModule = readFileSync("lib/candidates/desired-salary.ts", "utf8");
  const sharedModule = readFileSync("worker/src/shared/candidate-desired-salary.ts", "utf8");
  const reExported = await import("../lib/candidates/desired-salary.ts");

  assert.match(appModule, /export \* from "\.\.\/\.\.\/worker\/src\/shared\/candidate-desired-salary\.ts";/);
  assert.match(sharedModule, /export type CandidateDesiredSalarySource/);
  assert.match(sharedModule, /export function normalizeDesiredSalaryFields/);
  assert.doesNotMatch(sharedModule, /from\s+["'](?:next|@\/|@supabase\/|node:fs|fs|node:path|path)/);
  assert.deepEqual(reExported.extractDesiredSalaryFromText("Ожидаемая зарплата: 180 000 ₽"), {
    text: "180 000 ₽",
    amount: 180000,
    currency: "RUB",
    source: "regex",
  });
  assert.deepEqual(reExported.buildDesiredSalaryDbPatchFromHhResume({ salary: { amount: 220000, currency: "KZT" } }), {
    desired_salary_text: "220 000 KZT",
    desired_salary_amount: 220000,
    desired_salary_currency: "KZT",
    desired_salary_source: "hh",
  });
});

test("desired salary normalization caps text, formats amount-only values, and clears partial currency-only values", () => {
  assert.deepEqual(
    normalizeDesiredSalaryFields({
      amount: 250000,
      currency: "RUB",
      source: "ai_parser",
    }),
    {
      text: "250 000 RUB",
      amount: 250000,
      currency: "RUB",
      source: "ai_parser",
    },
  );

  const longText = "очень ".repeat(40);
  const normalizedLong = normalizeDesiredSalaryFields({
    text: longText,
    amount: 250000,
    currency: "RUB",
    source: "ai_parser",
  });
  assert.equal(normalizedLong.text?.length, 160);
  assert.equal(normalizedLong.source, "ai_parser");

  assert.deepEqual(
    normalizeDesiredSalaryFields({
      currency: "RUB",
      source: "ai_parser",
    }),
    EMPTY_DESIRED_SALARY,
  );
});

test("desired salary HH extraction is DB-safe for malformed bounds", () => {
  assert.deepEqual(
    extractDesiredSalaryFromHhResume({ salary: { amount: 1_000_000_000_000_000, currency: "RUR" } }),
    EMPTY_DESIRED_SALARY,
  );
  assert.deepEqual(
    extractDesiredSalaryFromHhResume({ salary: { amount: 220000, currency: "TOO_LONG_CODE" } }),
    EMPTY_DESIRED_SALARY,
  );
  assert.deepEqual(
    extractDesiredSalaryFromHhResume({ salary: { amount: "220000", currency: "RUR" } }),
    EMPTY_DESIRED_SALARY,
  );
});

test("desired salary HH update preserves absent salary and writes explicit clears", () => {
  assert.deepEqual(extractDesiredSalaryUpdateFromHhResume({ id: "hh-1" }), {
    shouldWrite: false,
    fields: EMPTY_DESIRED_SALARY,
  });
  assert.deepEqual(extractDesiredSalaryUpdateFromHhResume({ salary: null }), {
    shouldWrite: true,
    fields: EMPTY_DESIRED_SALARY,
  });
  assert.deepEqual(extractDesiredSalaryUpdateFromHhResume({ salary: { amount: 220000, currency: "RUR" } }), {
    shouldWrite: true,
    fields: {
      text: "220 000 RUB",
      amount: 220000,
      currency: "RUB",
      source: "hh",
    },
  });
  assert.equal(extractDesiredSalaryUpdateFromHhResume({ salary: { amount: "220000", currency: "RUR" } }).shouldWrite, false);
  assert.equal(extractDesiredSalaryUpdateFromHhResume({ salary: { amount: 220000 } }).shouldWrite, false);
});

test("desired salary HH DB patch returns only clear or valid write patches", () => {
  assert.equal(buildDesiredSalaryDbPatchFromHhResume({ id: "hh-1" }), null);
  assert.deepEqual(buildDesiredSalaryDbPatchFromHhResume({ salary: null }), {
    desired_salary_text: null,
    desired_salary_amount: null,
    desired_salary_currency: null,
    desired_salary_source: null,
  });
  assert.deepEqual(buildDesiredSalaryDbPatchFromHhResume({ salary: { amount: 220000, currency: "RUR" } }), {
    desired_salary_text: "220 000 RUB",
    desired_salary_amount: 220000,
    desired_salary_currency: "RUB",
    desired_salary_source: "hh",
  });
  assert.deepEqual(buildDesiredSalaryDbPatchFromHhResume({ salary: { amount: 220000, currency: "KZT" } }), {
    desired_salary_text: "220 000 KZT",
    desired_salary_amount: 220000,
    desired_salary_currency: "KZT",
    desired_salary_source: "hh",
  });

  for (const resume of [
    { salary: { amount: "220000", currency: "RUR" } },
    { salary: { amount: 220000, currency: "BAD-CURRENCY" } },
    { salary: { currency: "RUR" } },
    { salary: { amount: 220000 } },
    { salary: {} },
  ]) {
    assert.equal(buildDesiredSalaryDbPatchFromHhResume(resume), null);
  }
});
