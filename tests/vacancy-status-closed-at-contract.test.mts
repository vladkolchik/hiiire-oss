import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("vacancy status route persists closed_at only for closed transitions", () => {
  const source = readFileSync("app/api/vacancies/[id]/status/route.ts", "utf8");

  assert.match(source, /closed_at/);
  assert.match(source, /parsed\.data\.status\s*===\s*"closed"/);
  assert.match(source, /existingVacancy\.status\s*===\s*"closed"/);
  assert.match(source, /existingVacancy\.status\s*===\s*"closed"\s*\?\s*existingVacancy\.closed_at\s*:\s*nowIso/);
  assert.doesNotMatch(source, /existingVacancy\.closed_at\s*\?\?\s*nowIso/);
  assert.doesNotMatch(source, /closed_at:\s*nowIso[\s\S]*status:\s*parsed\.data\.status/);
});

test("vacancy status route returns safe messages and uses observed updated_at precondition", () => {
  const source = readFileSync("app/api/vacancies/[id]/status/route.ts", "utf8");

  assert.match(source, /"Выберите корректный статус вакансии\."/);
  assert.match(source, /"Не удалось проверить вакансию\. Попробуйте ещё раз\."/);
  assert.match(source, /"Не удалось обновить статус вакансии\. Попробуйте ещё раз\."/);
  assert.match(source, /"Вакансия уже изменилась\. Обновите страницу и попробуйте ещё раз\."/);
  assert.match(source, /error:\s*"INVALID_BODY",\s*message:/);
  assert.match(source, /error:\s*"VACANCY_LOOKUP_FAILED",\s*message:/);
  assert.match(source, /error:\s*"VACANCY_STATUS_UPDATE_FAILED",\s*message:/);
  assert.match(source, /error:\s*"VACANCY_CHANGED",\s*message:/);
  assert.match(source, /\{\s*status:\s*409\s*\}/);

  assert.match(source, /\.select\("status,closed_at,updated_at"\)/);
  assert.match(source, /\.eq\("updated_at",\s*existingVacancy\.updated_at\)/);
  assert.match(source, /\.maybeSingle\(\)/);
  assert.doesNotMatch(source, /NextResponse\.json\(\{\s*error:\s*"INVALID_BODY"\s*\}/);
  assert.doesNotMatch(source, /if\s*\(error\s*\|\|\s*!updated\)\s*return\s*NextResponse\.json\([\s\S]*VACANCY_STATUS_UPDATE_FAILED[\s\S]*\{\s*status:\s*500\s*\}/);
});

test("vacancy update and create routes include closed_at in write payloads", () => {
  const createRoute = readFileSync("app/api/vacancies/route.ts", "utf8");
  const updateRoute = readFileSync("app/api/vacancies/[id]/route.ts", "utf8");

  assert.match(createRoute, /closed_at:\s*status\s*===\s*"closed"\s*\?\s*nowIso\s*:\s*null/);
  assert.match(updateRoute, /closed_at:\s*status\s*===\s*"closed"/);
  assert.match(updateRoute, /existingVacancy\.status\s*===\s*"closed"/);
  assert.match(updateRoute, /existingVacancy\.status\s*===\s*"closed"\s*\?\s*existingVacancy\.closed_at\s*:\s*nowIso/);
  assert.doesNotMatch(updateRoute, /existingVacancy\.closed_at\s*\?\?\s*nowIso/);
});

test("vacancy update route uses observed updated_at precondition and returns conflict on stale rows", () => {
  const updateRoute = readFileSync("app/api/vacancies/[id]/route.ts", "utf8");

  assert.match(updateRoute, /\.select\("status,closed_at,updated_at"\)/);
  assert.match(updateRoute, /\.eq\("updated_at",\s*existingVacancy\.updated_at\)/);
  assert.match(updateRoute, /"Вакансия уже изменилась\. Обновите страницу и попробуйте ещё раз\."/);
  assert.match(updateRoute, /error:\s*"VACANCY_CHANGED",\s*message:/);
  assert.match(updateRoute, /\{\s*status:\s*409\s*\}/);
  assert.match(updateRoute, /\.maybeSingle\(\)/);
  assert.doesNotMatch(updateRoute, /if\s*\(error\s*\|\|\s*!updated\)\s*return\s*NextResponse\.json\([\s\S]*VACANCY_UPDATE_FAILED[\s\S]*\{\s*status:\s*500\s*\}/);
});

test("vacancy status service reads user-facing API messages without throwing raw codes", () => {
  const source = readFileSync("services/data/vacancies.ts", "utf8");
  const start = source.indexOf("export async function updateVacancyStatus");
  const end = source.indexOf("export async function syncVacancyFromHh");
  const updateVacancyStatusSource = source.slice(start, end);

  assert.match(updateVacancyStatusSource, /readUserFacingApiErrorMessage\(json,\s*"Не удалось обновить статус вакансии"\)/);
  assert.doesNotMatch(updateVacancyStatusSource, /z\.object\(\{\s*error:\s*z\.string\(\)\.optional\(\)\s*\}\)/);
  assert.doesNotMatch(updateVacancyStatusSource, /err\.data\.error/);
});

test("vacancy data contracts expose closedAt without using updatedAt as a fallback", () => {
  const appTypes = readFileSync("types/index.ts", "utf8");
  const dbTypes = readFileSync("lib/supabase/database.types.ts", "utf8");
  const mapper = readFileSync("services/data/mappers.ts", "utf8");

  assert.match(appTypes, /closedAt\?:\s*string\s*\|\s*null/);
  assert.match(dbTypes, /closed_at:\s*string\s*\|\s*null/);
  assert.match(mapper, /closedAt:\s*row\.closed_at\s*\?\?/);
  assert.doesNotMatch(mapper, /closedAt:[\s\S]{0,120}updated_at/);
});

test("vacancy closed_at SQL artifact keeps production changes additive", () => {
  const source = readFileSync("supabase/sql/vacancy_closed_at_foundation.sql", "utf8");

  assert.match(source, /add column if not exists closed_at/);
  assert.match(source, /create index concurrently if not exists/i);
  assert.doesNotMatch(source, /where status <> 'closed'/);
  assert.doesNotMatch(source, /set closed_at = null/);
  assert.doesNotMatch(source, /set\s+closed_at\s*=\s*updated_at/i);
});
