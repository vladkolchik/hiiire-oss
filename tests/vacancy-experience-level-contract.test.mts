import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { mapHhExperienceIdToVacancyLevel } from "../lib/vacancies/hh-experience-level.ts";

const apiCreateSource = readFileSync("app/api/vacancies/route.ts", "utf8");
const apiUpdateSource = readFileSync("app/api/vacancies/[id]/route.ts", "utf8");
const hhListSyncSource = readFileSync("app/api/integrations/hh/sync/vacancies/route.ts", "utf8");
const hhSingleSyncSource = readFileSync("app/api/vacancies/[id]/sync-hh/route.ts", "utf8");
const workerSyncSource = readFileSync("worker/src/hh-sync.ts", "utf8");
const workerSyncDistSource = readFileSync("worker/dist/hh-sync.js", "utf8");
const typesSource = readFileSync("types/index.ts", "utf8");
const databaseTypesSource = readFileSync("lib/supabase/database.types.ts", "utf8");
const qaGuideSource = readFileSync("docs/For_juniors/hiiire_for_junior.md", "utf8");
const migrationPath = "supabase/sql/vacancy_experience_level_trainee.sql";

test("vacancy experience level type accepts trainee", () => {
  assert.match(typesSource, /experienceLevel:\s*'trainee'\s*\|\s*'junior'\s*\|\s*'middle'\s*\|\s*'senior'\s*\|\s*'lead'/);
  assert.match(databaseTypesSource, /experience_level:\s*"trainee"\s*\|\s*"junior"\s*\|\s*"middle"\s*\|\s*"senior"\s*\|\s*"lead"/);
});

test("vacancy API create and update schemas accept trainee", () => {
  assert.match(apiCreateSource, /experienceLevel:\s*z\.enum\(\["trainee",\s*"junior",\s*"middle",\s*"senior",\s*"lead"\]\)/);
  assert.match(apiUpdateSource, /experienceLevel:\s*z\.enum\(\["trainee",\s*"junior",\s*"middle",\s*"senior",\s*"lead"\]\)/);
});

test("HH vacancy sync maps canonical HH experience ids to vacancy levels", () => {
  assert.equal(mapHhExperienceIdToVacancyLevel("noExperience"), "trainee");
  assert.equal(mapHhExperienceIdToVacancyLevel("no_experience"), "trainee");
  assert.equal(mapHhExperienceIdToVacancyLevel("between1And3"), "junior");
  assert.equal(mapHhExperienceIdToVacancyLevel("between3And6"), "middle");
  assert.equal(mapHhExperienceIdToVacancyLevel("moreThan6"), "senior");
  assert.equal(mapHhExperienceIdToVacancyLevel("not_noExperience"), "middle");
  assert.equal(mapHhExperienceIdToVacancyLevel(undefined), "middle");
});

test("HH vacancy sync routes and worker use the shared experience mapping behavior", () => {
  assert.match(hhListSyncSource, /mapHhExperienceIdToVacancyLevel\(d\?\.experience\?\.id\)/);
  assert.match(hhSingleSyncSource, /mapHhExperienceIdToVacancyLevel\(experienceId\)/);
  assert.match(workerSyncSource, /function mapHhExperienceIdToVacancyLevel\(hhExperienceId: string \| undefined\): VacancyExperienceLevel/);
  assert.match(workerSyncSource, /const experienceLevel = mapHhExperienceIdToVacancyLevel\(/);
  assert.match(workerSyncSource, /experience_level: experienceLevel/);
  assert.doesNotMatch(workerSyncSource, /experience_level: "middle"/);
  assert.match(workerSyncSource, /experience_level: update\.experience_level/);
  assert.match(workerSyncSource, /experience_level: input\.experienceLevel/);

  assert.match(workerSyncDistSource, /function mapHhExperienceIdToVacancyLevel\(hhExperienceId\)/);
  assert.match(workerSyncDistSource, /const experienceLevel = mapHhExperienceIdToVacancyLevel\(/);
  assert.match(workerSyncDistSource, /experience_level: experienceLevel/);
  assert.match(workerSyncDistSource, /experience_level: update\.experience_level/);
  assert.match(workerSyncDistSource, /experience_level: input\.experienceLevel/);
  assert.doesNotMatch(workerSyncDistSource, /experience_level: "middle"/);
});

test("database migration expands vacancies experience level check constraint", () => {
  assert.equal(existsSync(migrationPath), true, `${migrationPath} is missing`);

  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /drop constraint if exists vacancies_experience_level_check/i);
  assert.match(sql, /add constraint vacancies_experience_level_check/i);
  assert.match(sql, /'trainee'::text/i);
  assert.match(sql, /'junior'::text/i);
  assert.match(sql, /'middle'::text/i);
  assert.match(sql, /'senior'::text/i);
  assert.match(sql, /'lead'::text/i);
});

test("junior QA guide documents trainee as a vacancy level value", () => {
  assert.match(qaGuideSource, /trainee — Стажер \(Trainee\)/);
  assert.match(qaGuideSource, /junior — Начальный \(Junior\)/);
  assert.match(qaGuideSource, /middle — Средний \(Middle\)/);
  assert.match(qaGuideSource, /senior — Высокий \(Senior\)/);
  assert.match(qaGuideSource, /lead — Ведущий \(Lead\)/);
});
