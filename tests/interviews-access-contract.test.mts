import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildCalendarVersion } from "../lib/interviews/calendar-version.ts";

test("interview API routes use company context and explicit access helpers", () => {
  const createRoute = readFileSync("app/api/interviews/route.ts", "utf8");
  const updateRoute = readFileSync("app/api/interviews/[id]/route.ts", "utf8");
  const cancelRoute = readFileSync("app/api/interviews/[id]/cancel/route.ts", "utf8");
  const completeRoute = readFileSync("app/api/interviews/[id]/complete/route.ts", "utf8");

  for (const source of [createRoute, updateRoute, cancelRoute, completeRoute]) {
    assert.match(source, /requireCompanyContext/);
    assert.match(source, /requireInterviewManageAccess|requireInterviewCreateAccess/);
  }
});

test("interview list route supports limited interviewer-only visibility with meeting context", () => {
  const route = readFileSync("app/api/interviews/route.ts", "utf8");
  const snapshot = readFileSync("lib/interviews/calendar-snapshot.ts", "utf8");

  assert.match(route, /loadVisibleCalendarSnapshot/);
  assert.match(snapshot, /requireInterviewReadAccess/);
  assert.match(snapshot, /interviewer_only/);
  assert.match(snapshot, /meetingUrl:\s*row\.meeting_url/);
  assert.match(snapshot, /location:\s*row\.location/);
  assert.match(snapshot, /displayTitle:\s*candidate\?\.name/);
  assert.match(snapshot, /displaySubtitle:\s*vacancy\?\.title/);
});

test("interview create route verifies candidate and vacancy relation", () => {
  const source = readFileSync("lib/interviews/access.ts", "utf8");
  assert.match(source, /candidate\.vacancyId !== accessibleVacancy\.id/);
  assert.match(source, /CANDIDATE_VACANCY_MISMATCH/);
});

test("interview mutation access allows only active or paused vacancies", () => {
  const source = readFileSync("lib/interviews/access.ts", "utf8");
  const sql = readFileSync("supabase/sql/interviews_calendar_qa_fixes_v1.sql", "utf8");

  assert.match(source, /VACANCY_NOT_SCHEDULABLE/);
  assert.match(source, /активной или приостановленной вакансии/);
  assert.match(source, /\.select\("id,status"\)/);
  assert.match(source, /vacancy\.status !== "active" && vacancy\.status !== "paused"/);
  assert.match(sql, /VACANCY_NOT_SCHEDULABLE/);
  assert.match(sql, /v\.status in \('active', 'paused'\)/i);
  assert.match(sql, /CANDIDATE_VACANCY_MISMATCH/);
  assert.match(sql, /c\.vacancy_id = p_vacancy_id/i);
});

test("interview update route validates and persists candidate and vacancy changes", () => {
  const route = readFileSync("app/api/interviews/[id]/route.ts", "utf8");
  const service = readFileSync("services/data/interviews.ts", "utf8");
  const sql = readFileSync("supabase/sql/interviews_calendar_qa_fixes_v1.sql", "utf8");
  const databaseTypes = readFileSync("lib/supabase/database.types.ts", "utf8");

  assert.match(route, /candidateId/);
  assert.match(route, /vacancyId/);
  assert.match(route, /requireInterviewMutationAccess\(admin,\s*ctx,\s*parsed\.data\)/);
  assert.match(route, /p_candidate_id:\s*parsed\.data\.candidateId/);
  assert.match(route, /p_vacancy_id:\s*parsed\.data\.vacancyId/);
  assert.match(service, /export type InterviewUpdateInput = InterviewMutationInput & \{/);
  assert.match(sql, /create or replace function public\.update_interview_mvp\(\s*p_interview_id uuid,\s*p_company_id uuid,\s*p_candidate_id uuid,\s*p_vacancy_id uuid,/i);
  assert.match(sql, /candidate_id = p_candidate_id,\s*vacancy_id = p_vacancy_id,/i);
  assert.match(sql, /public\.update_interview_mvp\(uuid, uuid, uuid, uuid, timestamptz, integer, text, uuid\[\], text, text, text, timestamptz, boolean\)/i);
  assert.match(databaseTypes, /update_interview_mvp:[\s\S]*p_candidate_id:\s*string[\s\S]*p_vacancy_id:\s*string/);
});

test("calendar QA migration tightens interview scheduling contracts", () => {
  const sql = readFileSync("supabase/sql/interviews_calendar_qa_fixes_v1.sql", "utf8");

  assert.match(sql, /drop constraint if exists interviews_duration_minutes_check/i);
  assert.match(sql, /add constraint interviews_duration_minutes_check check \(duration_minutes between 5 and 480\)/i);
  assert.match(sql, /drop function if exists public\.update_interview_mvp\(uuid, uuid, timestamptz, integer, text, uuid\[\], text, text, text, timestamptz, boolean\)/i);
  assert.match(sql, /existing\.candidate_id = p_candidate_id/i);
  assert.match(sql, /grant execute on function public\.update_interview_mvp\(uuid, uuid, uuid, uuid, timestamptz, integer, text, uuid\[\], text, text, text, timestamptz, boolean\) to service_role/i);
});

test("interview manage access checks both candidate and vacancy access", () => {
  const source = readFileSync("lib/interviews/access.ts", "utf8");
  assert.match(source, /requireCandidateAccess\(admin, ctx, data\.candidate_id\)/);
  assert.match(source, /requireVacancyAccess\(admin, ctx, data\.vacancy_id\)/);
  assert.match(source, /candidate\.vacancyId !== vacancy\.id|candidate\.vacancyId !== accessibleVacancy\.id/);
});

test("interviewer lookup route is scoped to company context", () => {
  const source = readFileSync("app/api/interviews/interviewers/route.ts", "utf8");
  assert.match(source, /requireCompanyContext/);
  assert.match(source, /\.eq\("company_id", ctx\.companyId\)/);
});

test("interview SQL blocks direct browser mutations and locks RPC execution", () => {
  const sql = readFileSync("supabase/sql/interviews_mvp_v1.sql", "utf8");
  const policyLines = sql
    .split(/\r?\n/)
    .filter((line) => /create policy/i.test(line) || /\bfor (insert|update|delete)\b/i.test(line));

  assert.equal(policyLines.some((line) => /\bfor insert\b/i.test(line)), false);
  assert.equal(policyLines.some((line) => /\bfor update\b/i.test(line)), false);
  assert.equal(policyLines.some((line) => /\bfor delete\b/i.test(line)), false);
  assert.match(sql, /revoke execute on function public\.create_interview_mvp/i);
  assert.match(sql, /from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.create_interview_mvp[\s\S]+to service_role/i);
  assert.match(sql, /grant execute on function public\.update_interview_mvp\(uuid, uuid, timestamptz, integer, text, uuid\[\], text, text, text, timestamptz, boolean\) to service_role/i);
  assert.match(sql, /p_expected_updated_at/);
  assert.match(sql, /and updated_at = p_expected_updated_at/);
});

test("interview SQL upgrades the legacy empty interviews table shape", () => {
  const sql = readFileSync("supabase/sql/interviews_mvp_v1.sql", "utf8");

  assert.match(sql, /rename column duration to duration_minutes/i);
  assert.match(sql, /rename column interviewers to interviewer_ids/i);
  assert.match(sql, /INTERVIEWS_LEGACY_FEEDBACK_REVIEW_REQUIRED/);
  assert.match(sql, /drop column feedback/i);
  assert.match(sql, /INTERVIEWS_LEGACY_DATA_REVIEW_REQUIRED/);
  assert.match(sql, /external_provider is not null and external_provider not in \('google_calendar'\)/i);
  assert.match(sql, /sync_status not in \('not_connected', 'pending', 'synced', 'failed'\)/i);
  assert.match(sql, /duration_minutes < 15/i);
  assert.match(sql, /not exists \(\s*select 1\s*from public\.companies/i);
  assert.match(sql, /not exists \(\s*select 1\s*from public\.candidates/i);
  assert.match(sql, /not exists \(\s*select 1\s*from public\.vacancies/i);
  assert.match(sql, /not exists \(\s*select 1\s*from public\.profiles/i);
  assert.match(sql, /add column if not exists company_id uuid/i);
  assert.match(sql, /alter column company_id set not null/i);
  assert.match(sql, /drop constraint if exists interviews_status_check/i);
  assert.match(sql, /drop constraint if exists interviews_completion_note_check/i);
  assert.match(sql, /drop constraint if exists interviews_cancel_note_check/i);
  assert.match(sql, /add constraint interviews_status_check check \(status in \('scheduled', 'completed', 'cancelled'\)\)/i);
  assert.match(sql, /add constraint interviews_duration_minutes_check check \(duration_minutes between 15 and 480\)/i);
  assert.match(sql, /drop policy if exists %I on public\.interviews/i);
});

test("interviewer-only API rows are sanitized instead of raw interview rows", () => {
  const snapshot = readFileSync("lib/interviews/calendar-snapshot.ts", "utf8");
  const start = snapshot.indexOf('accessLevel: "interviewer_only"');
  const end = snapshot.indexOf("};", start);
  const limitedBranch = snapshot.slice(start, end);

  assert.notEqual(start, -1);
  assert.doesNotMatch(limitedBranch, /\.\.\.row/);
  assert.match(snapshot, /accessLevel: "interviewer_only"/);
  assert.match(limitedBranch, /displayTitle:\s*candidate\?\.name/);
  assert.match(limitedBranch, /displaySubtitle:\s*vacancy\?\.title/);
  assert.match(limitedBranch, /meetingUrl:\s*row\.meeting_url/);
  assert.match(limitedBranch, /location:\s*row\.location/);
  for (const privateField of [
    "candidate_id",
    "vacancy_id",
    "notes",
    "created_by",
    "external_provider",
    "external_event_id",
    "sync_status",
    "sync_error",
    "last_synced_at",
    "candidateId",
    "vacancyId",
    "createdById",
    "externalProvider",
    "externalEventId",
    "syncStatus",
    "syncError",
    "lastSyncedAt",
  ]) {
    assert.doesNotMatch(limitedBranch, new RegExp(privateField));
  }
});

test("update route passes optimistic updated-at precondition into RPC", () => {
  const route = readFileSync("app/api/interviews/[id]/route.ts", "utf8");
  const mapper = readFileSync("services/data/mappers.ts", "utf8");
  const service = readFileSync("services/data/interviews.ts", "utf8");

  assert.match(route, /expectedUpdatedAt/);
  assert.match(route, /p_expected_updated_at/);
  assert.match(route, /INTERVIEW_CHANGED/);
  assert.match(mapper, /updatedAtRaw: row\.updated_at/);
  assert.match(service, /expectedUpdatedAt: string/);
});

test("state-changing interview routes enforce same-origin guard", () => {
  const createRoute = readFileSync("app/api/interviews/route.ts", "utf8");
  const updateRoute = readFileSync("app/api/interviews/[id]/route.ts", "utf8");
  const cancelRoute = readFileSync("app/api/interviews/[id]/cancel/route.ts", "utf8");
  const completeRoute = readFileSync("app/api/interviews/[id]/complete/route.ts", "utf8");

  for (const source of [createRoute, updateRoute, cancelRoute, completeRoute]) {
    assert.match(source, /requireSameOriginRequest/);
  }
});

test("interview list route requires a bounded valid range", () => {
  const route = readFileSync("app/api/interviews/route.ts", "utf8");
  assert.match(route, /parseRequiredRange/);
  assert.match(route, /INVALID_RANGE/);
  assert.match(route, /45/);
});

test("interview list and changes endpoints expose no-store calendar versions", () => {
  const listRoute = readFileSync("app/api/interviews/route.ts", "utf8");
  const changesRoute = readFileSync("app/api/interviews/changes/route.ts", "utf8");

  assert.match(listRoute, /loadVisibleCalendarSnapshot/);
  assert.match(listRoute, /\{\s*interviews,\s*version\s*\}/);
  assert.match(listRoute, /Cache-Control["']:\s*["']no-store["']/);

  assert.match(changesRoute, /requireCompanyContext/);
  assert.match(changesRoute, /parseRequiredRange/);
  assert.match(changesRoute, /loadVisibleCalendarSnapshot/);
  assert.match(changesRoute, /\{\s*version,\s*checkedAt\s*\}/);
  assert.match(changesRoute, /Cache-Control["']:\s*["']no-store["']/);
  assert.doesNotMatch(changesRoute, /\{\s*interviews/);
  assert.doesNotMatch(changesRoute, /\{\s*id/);
});

test("calendar version is computed from sorted sanitized visible DTOs", () => {
  const baseLimited = {
    id: "interview-1",
    accessLevel: "interviewer_only",
    scheduledAt: "2026-01-10T09:00:00.000Z",
    durationMinutes: 60,
    type: "video",
    status: "scheduled",
    displayTitle: "Собеседование",
    displaySubtitle: "Недоступная вакансия",
    interviewers: [{ id: "user-1", name: "Анна", email: "anna@example.com", avatar_url: null }],
  };
  const fullRow = {
    id: "interview-2",
    accessLevel: "manage",
    scheduled_at: "2026-01-11T09:00:00.000Z",
    duration_minutes: 45,
    type: "phone",
    status: "scheduled",
    candidate_id: "candidate-1",
    vacancy_id: "vacancy-1",
    meeting_url: "https://meet.example.com/a",
    location: null,
    notes: null,
    updated_at: "2026-01-01T12:00:00.000Z",
    candidate: { id: "candidate-1", name: "Иван", avatar_url: null, status: "new" },
    vacancy: { id: "vacancy-1", title: "Frontend" },
    displayTitle: "Иван",
    displaySubtitle: "Frontend",
    interviewers: [],
  };

  const versionA = buildCalendarVersion([
    { ...baseLimited, meeting_url: "https://hidden.example/a", notes: "hidden a", candidate_id: "candidate-a" },
    fullRow,
  ]);
  const versionB = buildCalendarVersion([
    { ...fullRow },
    { ...baseLimited, meeting_url: "https://hidden.example/b", notes: "hidden b", candidate_id: "candidate-b" },
  ]);

  assert.equal(versionA, versionB);

  assert.notEqual(buildCalendarVersion([{ ...baseLimited, displayTitle: "Петр" }, fullRow]), versionA);
  assert.notEqual(buildCalendarVersion([{ ...baseLimited, displaySubtitle: "Backend" }, fullRow]), versionA);
  assert.notEqual(buildCalendarVersion([{ ...baseLimited, meetingUrl: "https://meet.example.com/b" }, fullRow]), versionA);
  assert.notEqual(buildCalendarVersion([{ ...baseLimited, location: "Переговорная 2" }, fullRow]), versionA);
});

test("interview services use no-store fetches for calendar list and fingerprint", () => {
  const service = readFileSync("services/data/interviews.ts", "utf8");

  assert.match(service, /cache:\s*["']no-store["']/);
  assert.match(service, /listInterviewsWithVersion/);
  assert.match(service, /checkInterviewChanges/);
  assert.match(service, /\/api\/interviews\/changes/);
  assert.match(service, /version:\s*z\.string\(\)/);
});

test("cancel and complete routes pass expected updated-at precondition into RPC", () => {
  const cancelRoute = readFileSync("app/api/interviews/[id]/cancel/route.ts", "utf8");
  const completeRoute = readFileSync("app/api/interviews/[id]/complete/route.ts", "utf8");
  const service = readFileSync("services/data/interviews.ts", "utf8");
  const databaseTypes = readFileSync("lib/supabase/database.types.ts", "utf8");

  for (const source of [cancelRoute, completeRoute]) {
    assert.match(source, /expectedUpdatedAt/);
    assert.match(source, /p_expected_updated_at:\s*parsed\.data\.expectedUpdatedAt/);
    assert.match(source, /INTERVIEW_CHANGED/);
    assert.match(source, /Собеседование уже изменилось\. Обновите календарь и попробуйте ещё раз\./);
  }

  assert.match(service, /expectedUpdatedAt:\s*string/);
  assert.match(service, /body:\s*JSON\.stringify\(\{\s*cancelNote:\s*input\.cancelNote,\s*expectedUpdatedAt:\s*input\.expectedUpdatedAt/s);
  assert.match(
    service,
    /body:\s*JSON\.stringify\(\{\s*completionNote:\s*input\.completionNote,\s*expectedUpdatedAt:\s*input\.expectedUpdatedAt/s
  );
  assert.match(databaseTypes, /cancel_interview_mvp:[\s\S]*p_expected_updated_at:\s*string/);
  assert.match(databaseTypes, /complete_interview_mvp:[\s\S]*p_expected_updated_at:\s*string/);
});

test("stale interview precondition outranks not-editable and conflict checks", () => {
  const updateRoute = readFileSync("app/api/interviews/[id]/route.ts", "utf8");
  const cancelRoute = readFileSync("app/api/interviews/[id]/cancel/route.ts", "utf8");
  const completeRoute = readFileSync("app/api/interviews/[id]/complete/route.ts", "utf8");
  const access = readFileSync("lib/interviews/access.ts", "utf8");

  assert.match(access, /updated_at/);
  assert.match(access, /updatedAt:\s*data\.updated_at/);

  for (const source of [updateRoute, cancelRoute, completeRoute]) {
    const staleCheckIndex = source.indexOf("assertFreshInterviewPrecondition(accessRes.data.interview.updatedAt, parsed.data.expectedUpdatedAt)");
    const notEditableIndex = source.indexOf("INTERVIEW_NOT_EDITABLE");
    const rpcIndex = source.indexOf(".rpc(");

    assert.ok(staleCheckIndex > source.indexOf("if (!parsed.success)"), "stale check should run after body validation");
    assert.ok(staleCheckIndex !== -1, "expected explicit stale precondition check");
    assert.ok(notEditableIndex === -1 || staleCheckIndex < notEditableIndex, "stale check should outrank not-editable status");
    assert.ok(rpcIndex === -1 || staleCheckIndex < rpcIndex, "stale check should happen before mutation RPC");
  }

  const updateStaleIndex = updateRoute.indexOf("assertFreshInterviewPrecondition(accessRes.data.interview.updatedAt, parsed.data.expectedUpdatedAt)");
  assert.ok(updateStaleIndex < updateRoute.indexOf("const mutationAccessRes"), "stale update should outrank mutation access checks");
  assert.ok(updateStaleIndex < updateRoute.indexOf("const conflicts = findInterviewConflicts"), "stale update should outrank conflict detection");
});

test("cancel and complete services require object inputs with expectedUpdatedAt", () => {
  const service = readFileSync("services/data/interviews.ts", "utf8");

  assert.match(service, /export async function cancelInterview\(id: string, input: InterviewCancelInput\): Promise<Interview>/);
  assert.match(service, /export async function completeInterview\(id: string, input: InterviewCompleteInput\): Promise<Interview>/);
  assert.doesNotMatch(service, /cancelInterview\(id: string, input\?: InterviewCancelInput\)/);
  assert.doesNotMatch(service, /cancelInterview\(id: string, cancelNote\?: string/);
  assert.doesNotMatch(service, /completeInterview\(id: string, input\?: InterviewCompleteInput\)/);
  assert.doesNotMatch(service, /completeInterview\(id: string, completionNote\?: string/);
  assert.doesNotMatch(service, /inputOrCancelNote|inputOrCompletionNote|expectedUpdatedAtArg/);
  assert.match(service, /body:\s*JSON\.stringify\(\{\s*cancelNote:\s*input\.cancelNote,\s*expectedUpdatedAt:\s*input\.expectedUpdatedAt,\s*\}\)/s);
  assert.match(
    service,
    /body:\s*JSON\.stringify\(\{\s*completionNote:\s*input\.completionNote,\s*expectedUpdatedAt:\s*input\.expectedUpdatedAt,\s*\}\)/s
  );
});

test("application code does not call stale three-argument status RPCs", () => {
  const cancelRoute = readFileSync("app/api/interviews/[id]/cancel/route.ts", "utf8");
  const completeRoute = readFileSync("app/api/interviews/[id]/complete/route.ts", "utf8");
  const cancelArgs = cancelRoute.match(/\.rpc\("cancel_interview_mvp",\s*\{([\s\S]*?)\}\)\s*\.maybeSingle/)?.[1] ?? "";
  const completeArgs = completeRoute.match(/\.rpc\("complete_interview_mvp",\s*\{([\s\S]*?)\}\)\s*\.maybeSingle/)?.[1] ?? "";

  assert.notEqual(cancelArgs, "");
  assert.notEqual(completeArgs, "");
  assert.deepEqual([...cancelArgs.matchAll(/^\s*p_[a-z_]+:/gm)].map((match) => match[0].trim()), [
    "p_interview_id:",
    "p_company_id:",
    "p_cancel_note:",
    "p_expected_updated_at:",
  ]);
  assert.deepEqual([...completeArgs.matchAll(/^\s*p_[a-z_]+:/gm)].map((match) => match[0].trim()), [
    "p_interview_id:",
    "p_company_id:",
    "p_completion_note:",
    "p_expected_updated_at:",
  ]);
});
