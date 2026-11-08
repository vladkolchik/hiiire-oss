import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("candidate details exposes schedule interview action", () => {
  const source = readFileSync("components/dashboard/candidate-details.tsx", "utf8");

  assert.match(source, /onScheduleInterview/);
  assert.match(source, /Назначить собеседование/);
});

test("candidates page uses shared interview form for candidate scheduling", () => {
  const source = readFileSync("app/(dashboard)/dashboard/candidates/page.tsx", "utf8");

  assert.match(source, /InterviewFormDialog/);
  assert.match(source, /createInterview/);
  assert.match(source, /InterviewConflictError/);
  assert.match(source, /initialCandidate/);
  assert.match(source, /initialVacancy/);
  assert.match(source, /lockCandidateAndVacancy/);
});

test("candidate scheduling refresh preserves current list on refresh failure", () => {
  const source = readFileSync("app/(dashboard)/dashboard/candidates/page.tsx", "utf8");

  assert.match(source, /preserveOnError/);
  assert.match(source, /loadCandidatesPage\(\{ asInitial: false, preserveOnError: true \}\)/);
  assert.match(source, /Обновите список кандидатов, чтобы увидеть свежие изменения/);
  assert.doesNotMatch(source, /description: error instanceof Error \? error\.message/);
});

test("candidate list schedule buttons open the shared interview form", () => {
  const source = readFileSync("app/(dashboard)/dashboard/candidates/page.tsx", "utf8");

  assert.match(source, /function openScheduleInterview\(candidate: Candidate\)/);
  assert.ok((source.match(/openScheduleInterview\(candidate\)/g) ?? []).length >= 2);
  assert.ok((source.match(/onScheduleInterview=\{openScheduleInterview\}/g) ?? []).length >= 2);
  assert.doesNotMatch(source, /Функция в разработке/);
});
