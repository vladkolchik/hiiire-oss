import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { extractDesiredSalaryUpdateFromHhResume } from "../worker/src/shared/candidate-desired-salary.ts";

test("HH worker keeps candidate contact select batches below Supabase REST overflow and row caps", () => {
  const source = readFileSync("worker/src/hh-sync.ts", "utf8");
  const match = source.match(/const HH_SYNC_CONTACT_SELECT_BATCH = (\d+);/);

  assert.ok(match, "HH_SYNC_CONTACT_SELECT_BATCH should be defined");
  assert.equal(Number(match[1]), 200);
});

test("HH worker paginates candidate contact selects past the Supabase REST row cap", () => {
  const source = readFileSync("worker/src/hh-sync.ts", "utf8");

  assert.match(source, /const HH_SYNC_CONTACT_SELECT_PAGE_SIZE = 1000;/);
  assert.match(source, /\.order\("id"/);
  assert.match(source, /\.range\(contactPageStart, contactPageEnd\)/);
  assert.match(source, /if \(\(data \?\? \[\]\)\.length < HH_SYNC_CONTACT_SELECT_PAGE_SIZE\) break;/);
});

test("HH worker paginates existing candidate selects past the Supabase REST row cap", () => {
  const source = readFileSync("worker/src/hh-sync.ts", "utf8");
  const functionMatch = source.match(/async function fetchExistingCandidates[\s\S]+?async function fetchExistingContacts/);

  assert.match(source, /const HH_SYNC_CANDIDATE_SELECT_PAGE_SIZE = 1000;/);
  assert.ok(functionMatch, "fetchExistingCandidates should be defined before fetchExistingContacts");
  assert.match(functionMatch[0], /let candidatePageStart = 0;/);
  assert.match(functionMatch[0], /\.order\("id"/);
  assert.match(functionMatch[0], /\.range\(candidatePageStart, candidatePageEnd\)/);
  assert.match(functionMatch[0], /if \(\(data \?\? \[\]\)\.length < HH_SYNC_CANDIDATE_SELECT_PAGE_SIZE\) break;/);
});

test("HH worker paginates local vacancy selects past the Supabase REST row cap", () => {
  const source = readFileSync("worker/src/hh-sync.ts", "utf8");
  const functionMatch = source.match(/async function fetchLocalHhVacancies[\s\S]+?async function syncVacancies/);

  assert.match(source, /const HH_SYNC_VACANCY_SELECT_PAGE_SIZE = 1000;/);
  assert.ok(functionMatch, "fetchLocalHhVacancies should be defined before syncVacancies");
  assert.match(functionMatch[0], /let vacancyPageStart = 0;/);
  assert.match(functionMatch[0], /\.order\("id"/);
  assert.match(functionMatch[0], /\.range\(vacancyPageStart, vacancyPageEnd\)/);
  assert.match(functionMatch[0], /if \(\(data \?\? \[\]\)\.length < HH_SYNC_VACANCY_SELECT_PAGE_SIZE\) break;/);
});

test("HH worker keeps desired salary in candidate resume text for UI extraction", () => {
  const source = readFileSync("worker/src/hh-sync.ts", "utf8");
  const functionMatch = source.match(/function resumeToText[\s\S]+?function chunk/);

  assert.ok(functionMatch, "resumeToText should be defined before chunk");
  assert.match(functionMatch[0], /anyResume\.salary\?\.amount/);
  assert.match(functionMatch[0], /anyResume\.salary\?\.currency/);
  assert.match(functionMatch[0], /Ожидаемая зарплата:/);
});

test("HH desired salary update helper distinguishes set, change, clear, preserve, and malformed salary", () => {
  assert.deepEqual(extractDesiredSalaryUpdateFromHhResume({ salary: { amount: 180000, currency: "RUR" } }), {
    shouldWrite: true,
    fields: { text: "180 000 RUB", amount: 180000, currency: "RUB", source: "hh" },
  });
  assert.deepEqual(extractDesiredSalaryUpdateFromHhResume({ salary: { amount: 4500, currency: "USD" } }), {
    shouldWrite: true,
    fields: { text: "4 500 USD", amount: 4500, currency: "USD", source: "hh" },
  });
  assert.deepEqual(extractDesiredSalaryUpdateFromHhResume({ salary: { amount: 4200, currency: "EUR" } }), {
    shouldWrite: true,
    fields: { text: "4 200 EUR", amount: 4200, currency: "EUR", source: "hh" },
  });
  assert.deepEqual(extractDesiredSalaryUpdateFromHhResume({ salary: { amount: 250000, currency: "KZT" } }), {
    shouldWrite: true,
    fields: { text: "250 000 KZT", amount: 250000, currency: "KZT", source: "hh" },
  });
  assert.deepEqual(extractDesiredSalaryUpdateFromHhResume({ salary: null }), {
    shouldWrite: true,
    fields: { text: null, amount: null, currency: null, source: null },
  });
  assert.equal(extractDesiredSalaryUpdateFromHhResume({ id: "resume-without-salary" }).shouldWrite, false);
  assert.equal(extractDesiredSalaryUpdateFromHhResume({ salary: { amount: "180000", currency: "RUR" } }).shouldWrite, false);
  assert.equal(extractDesiredSalaryUpdateFromHhResume({ salary: { amount: 180000, currency: "BAD-CURRENCY" } }).shouldWrite, false);
});

test("HH worker source includes desired salary in fingerprint and delegates candidate writes to payload helper", () => {
  const source = readFileSync("worker/src/hh-sync.ts", "utf8");
  const fingerprintMatch = source.match(/function buildCandidateFingerprintPayload[\s\S]+?function buildVacancyFingerprintPayload/);

  assert.match(source, /from "\.\/shared\/candidate-desired-salary\.js"/);
  assert.match(source, /buildDesiredSalaryDbPatchFromHhResume/);
  assert.match(source, /from "\.\/hh-candidate-write-payload\.js"/);
  assert.match(source, /buildHhCandidateWritePayload/);
  assert.match(source, /splitHhCandidateRowsByDesiredSalaryPatch/);
  assert.ok(fingerprintMatch, "buildCandidateFingerprintPayload should be defined before buildVacancyFingerprintPayload");
  assert.match(fingerprintMatch[0], /desiredSalary\?:/);
  assert.match(fingerprintMatch[0], /desired_salary_text/);
  assert.match(fingerprintMatch[0], /desired_salary_amount/);
  assert.match(fingerprintMatch[0], /desired_salary_currency/);
  assert.match(fingerprintMatch[0], /desired_salary_source/);
});

test("interactive HH sync writes desired salary patch without refreshing profile fields in new_only duplicates", () => {
  const source = readFileSync("app/api/integrations/hh/sync/candidates/route.ts", "utf8");
  const duplicateMatch = source.match(/candidateNewOnlyDuplicatePatch[\s\S]+?\.eq\("id", existingCandidate\.id\)/);

  assert.match(source, /from "@\/lib\/candidates\/desired-salary"/);
  assert.match(source, /const desiredSalaryPatch = buildDesiredSalaryDbPatchFromHhResume\(resume\);/);
  assert.match(source, /const desiredSalaryWritePatch = desiredSalaryPatch \?\? \{\};/);
  assert.match(source, /\.\.\.desiredSalaryWritePatch/);
  assert.ok(duplicateMatch, "new_only duplicate branch should build a focused update patch");
  assert.match(duplicateMatch[0], /hh_auto_survey_text: hhAutoSurveyText/);
  assert.match(duplicateMatch[0], /updated_at: nowIso/);
  assert.match(duplicateMatch[0], /\.\.\.desiredSalaryWritePatch/);
  assert.doesNotMatch(duplicateMatch[0], /resume_text|avatar_url|position|applied_at|name/);
});

test("worker HH sync builds desired salary patch, includes it in writes, and splits mixed update batches", () => {
  const source = readFileSync("worker/src/hh-sync.ts", "utf8");
  const syncMatch = source.match(/async function syncCandidatesForVacancies[\s\S]+?async function syncClaimedIntegration/);
  const updateMatch = source.match(/async function updateCandidateRows[\s\S]+?async function replaceCandidateContactsBatch/);

  assert.ok(syncMatch, "syncCandidatesForVacancies should be defined before syncClaimedIntegration");
  assert.ok(updateMatch, "updateCandidateRows should be defined before replaceCandidateContactsBatch");
  assert.match(syncMatch[0], /const desiredSalaryPatch = buildDesiredSalaryDbPatchFromHhResume\(resume\);/);
  assert.match(syncMatch[0], /const desiredSalaryWritePatch = desiredSalaryPatch \?\? \{\};/);
  assert.match(syncMatch[0], /desiredSalary: desiredSalaryPatch/);
  assert.match(syncMatch[0], /\.\.\.desiredSalaryWritePatch/);
  assert.match(updateMatch[0], /splitHhCandidateRowsByDesiredSalaryPatch\(rowChunk\)/);
  assert.match(updateMatch[0], /withoutDesiredSalaryPatch/);
  assert.match(updateMatch[0], /withDesiredSalaryPatch/);
  assert.match(updateMatch[0], /buildHhCandidateWritePayload\(row\)/);
});

function makeCandidateWriteRow(overrides: Record<string, unknown> = {}) {
  return {
    applied_at: "2026-05-29T10:00:00.000Z",
    avatar_url: null,
    candidate_id: "candidate-1",
    contactKey: "vacancy-1::resume-1",
    created_at: "2026-05-29T10:00:00.000Z",
    created_by: "user-1",
    hh_auto_survey_text: null,
    hh_source_fingerprint: "fingerprint",
    hhru_resume_id: "resume-1",
    name: "Candidate",
    position: "Engineer",
    resume_text: "Resume",
    source: "hh.ru",
    status: "new",
    updated_at: "2026-05-29T10:00:00.000Z",
    vacancy_id: "vacancy-1",
    ...overrides,
  };
}

test("HH candidate write payload omits absent desired salary keys and writes explicit clear or value patches", async () => {
  const { buildHhCandidateWritePayload } = await import("../worker/src/hh-candidate-write-payload.ts");

  const absentPayload = buildHhCandidateWritePayload(makeCandidateWriteRow());
  assert.equal(Object.prototype.hasOwnProperty.call(absentPayload, "desired_salary_text"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(absentPayload, "desired_salary_amount"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(absentPayload, "desired_salary_currency"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(absentPayload, "desired_salary_source"), false);

  const clearPayload = buildHhCandidateWritePayload(
    makeCandidateWriteRow({
      desired_salary_text: null,
      desired_salary_amount: null,
      desired_salary_currency: null,
      desired_salary_source: null,
    })
  );
  assert.deepEqual(
    {
      desired_salary_text: clearPayload.desired_salary_text,
      desired_salary_amount: clearPayload.desired_salary_amount,
      desired_salary_currency: clearPayload.desired_salary_currency,
      desired_salary_source: clearPayload.desired_salary_source,
    },
    {
      desired_salary_text: null,
      desired_salary_amount: null,
      desired_salary_currency: null,
      desired_salary_source: null,
    }
  );

  const valuePayload = buildHhCandidateWritePayload(
    makeCandidateWriteRow({
      desired_salary_text: "220 000 RUB",
      desired_salary_amount: 220000,
      desired_salary_currency: "RUB",
      desired_salary_source: "hh",
    })
  );
  assert.deepEqual(
    {
      desired_salary_text: valuePayload.desired_salary_text,
      desired_salary_amount: valuePayload.desired_salary_amount,
      desired_salary_currency: valuePayload.desired_salary_currency,
      desired_salary_source: valuePayload.desired_salary_source,
    },
    {
      desired_salary_text: "220 000 RUB",
      desired_salary_amount: 220000,
      desired_salary_currency: "RUB",
      desired_salary_source: "hh",
    }
  );
});

test("HH candidate write payload splitter separates absent rows from clear and value patches", async () => {
  const { hasHhDesiredSalaryPatch, splitHhCandidateRowsByDesiredSalaryPatch, buildHhCandidateWritePayload } = await import(
    "../worker/src/hh-candidate-write-payload.ts"
  );
  const absentRow = makeCandidateWriteRow({ candidate_id: "candidate-absent" });
  const clearRow = makeCandidateWriteRow({
    candidate_id: "candidate-clear",
    desired_salary_text: null,
    desired_salary_amount: null,
    desired_salary_currency: null,
    desired_salary_source: null,
  });
  const valueRow = makeCandidateWriteRow({
    candidate_id: "candidate-value",
    desired_salary_text: "220 000 RUB",
    desired_salary_amount: 220000,
    desired_salary_currency: "RUB",
    desired_salary_source: "hh",
  });

  assert.equal(hasHhDesiredSalaryPatch(absentRow), false);
  assert.equal(hasHhDesiredSalaryPatch(clearRow), true);
  assert.equal(hasHhDesiredSalaryPatch(valueRow), true);

  const split = splitHhCandidateRowsByDesiredSalaryPatch([absentRow, clearRow, valueRow]);
  assert.deepEqual(split.withoutDesiredSalaryPatch.map((row) => row.candidate_id), ["candidate-absent"]);
  assert.deepEqual(split.withDesiredSalaryPatch.map((row) => row.candidate_id), ["candidate-clear", "candidate-value"]);
  assert.equal(Object.prototype.hasOwnProperty.call(buildHhCandidateWritePayload(absentRow), "desired_salary_text"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(buildHhCandidateWritePayload(clearRow), "desired_salary_text"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(buildHhCandidateWritePayload(valueRow), "desired_salary_text"), true);
});

test("HH salary sync does not enqueue AI reanalysis in v1", () => {
  const routeSource = readFileSync("app/api/integrations/hh/sync/candidates/route.ts", "utf8");
  const workerSource = readFileSync("worker/src/hh-sync.ts", "utf8");
  const hhSources = `${routeSource}\n${workerSource}`;

  assert.doesNotMatch(hhSources, /jobs_ai/);
  assert.doesNotMatch(hhSources, /resume_analysis/);
  assert.doesNotMatch(hhSources, /ai_job_requeued/);
});
