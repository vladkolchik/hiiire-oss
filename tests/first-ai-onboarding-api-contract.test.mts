import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("first AI onboarding API derives progress and persists user state safely", () => {
  const source = readFileSync("app/api/onboarding/first-ai/route.ts", "utf8");

  assert.match(source, /export async function GET/);
  assert.match(source, /export async function PATCH/);
  assert.match(source, /deriveFirstAiOnboardingProgress/);
  assert.match(source, /first_ai_onboarding_states/);
  assert.match(source, /requireCompanyContext/);
  assert.match(source, /getSupabaseAdminClient/);
  assert.match(source, /startedPath/);
  assert.match(source, /dismissedAt/);
  assert.match(source, /hhOauthErrorAt/);
  assert.match(source, /hhStartedAt/);
  assert.match(source, /lastSyncErrorAt/);
  assert.match(source, /resultOpenedAt/);
  assert.match(source, /resultAcknowledgedAt/);
  assert.match(source, /completedAt/);
  assert.match(source, /readFirstAiCompanyVacancyIds/);
  assert.match(source, /applyCandidateScope/);
  assert.match(source, /VACANCY_SCOPE_CHUNK_SIZE/);
  assert.match(source, /readFirstAiRecentCandidates/);
  assert.doesNotMatch(source, /from\("candidates"\)[\s\S]{0,300}\.eq\("company_id"/);
  assert.doesNotMatch(source, /\.update\(\{\s*onboarding_completed/);
});

test("first AI onboarding API never returns raw HH/provider errors", () => {
  const source = readFileSync("app/api/onboarding/first-ai/route.ts", "utf8");

  assert.match(source, /hasSyncError/);
  assert.doesNotMatch(source, /last_sync_error[^,\n]*return/);
  assert.doesNotMatch(source, /HH_RECONNECT_REQUIRED|INVALID_BODY[^,\n]*message|INTERNAL_ERROR[^,\n]*message/);
});

test("first AI onboarding API uses access-scoped targeted lookups", () => {
  const source = readFileSync("app/api/onboarding/first-ai/route.ts", "utf8");

  assert.match(source, /readFirstAiAccessibleResultCandidate/);
  assert.match(source, /readFirstAiAccessibleVacancy/);
  assert.match(source, /readFirstAiAccessibleCandidate/);
  assert.match(source, /readFirstAiAccessibleJobCandidate/);
  assert.match(source, /readLatestJobsForCandidateIds/);
  assert.match(source, /ai_analyses!inner/);
  assert.match(source, /\.not\("match_percentage", "is", null\)/);
  assert.match(source, /\.select\("id"\)[\s\S]*\.range\(from, from \+ pageSize - 1\)/);
  assert.match(source, /chunks\(vacancyIds, VACANCY_SCOPE_CHUNK_SIZE\)/);
  assert.match(source, /candidate\.created_by|created_by/);
  assert.match(source, /requested_by/);
  assert.doesNotMatch(source, /\.from\("jobs_ai"\)[\s\S]{0,400}\.limit\(50\)/);
  assert.doesNotMatch(source, /\.in\("vacancy_id", vacancyIds\)/);
});

test("first AI onboarding API checks billing and credits through existing helpers", () => {
  const source = readFileSync("app/api/onboarding/first-ai/route.ts", "utf8");

  assert.match(source, /loadCompanyPlanSnapshot/);
  assert.match(source, /isAiAllowed/);
  assert.match(source, /company_credits/);
  assert.match(source, /balance,reserved/);
  assert.match(source, /availableCredits <= 0/);
  assert.match(source, /canManageBilling = ctx\.role === "admin"/);
  assert.match(source, /\/dashboard\/settings\?tab=plan/);
  assert.match(source, /Обратитесь к администратору|администратору/);
  assert.doesNotMatch(source, /canStartAi:\s*true[\s\S]{0,80}blockedReason:\s*null[\s\S]{0,80};\s*\/\/ default/);
});

test("first AI onboarding PATCH verifies completed result before terminal actions", () => {
  const source = readFileSync("app/api/onboarding/first-ai/route.ts", "utf8");

  assert.match(source, /z\.enum\(\["start_manual", "start_hh", "dismiss", "open_result", "acknowledge_result"\]\)/);
  assert.match(source, /requireCandidateAccess/);
  assert.match(source, /candidateId/);
  assert.match(source, /RESULT_NOT_READY/);
  assert.match(source, /record_first_ai_onboarding_open_result/);
  assert.match(source, /record_first_ai_onboarding_acknowledge_result/);
  assert.match(source, /completed_at/);
  assert.match(source, /dismissed_at/);
  assert.match(source, /STATE_UPDATE_FAILED/);
  assert.match(source, /Не удалось сохранить выбор\. Попробуйте ещё раз\./);
});

test("first AI onboarding schema protects service-role-only RPC helpers", () => {
  const migration = readFileSync("supabase/sql/first_ai_onboarding_state_v1.sql", "utf8");

  assert.match(migration, /security definer/);
  assert.match(migration, /revoke execute on function public\.record_first_ai_onboarding_open_result\(uuid, timestamptz\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.record_first_ai_onboarding_open_result\(uuid, timestamptz\) to service_role/);
  assert.match(migration, /revoke execute on function public\.record_first_ai_onboarding_acknowledge_result\(uuid, timestamptz\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.record_first_ai_onboarding_acknowledge_result\(uuid, timestamptz\) to service_role/);
  assert.match(migration, /num_nonnulls\(completed_at, dismissed_at\) <= 1/);
  assert.match(migration, /select p\.id, now\(\), now\(\)[\s\S]*from public\.profiles p/);
});

test("HH OAuth start persists first-AI onboarding context server-side", () => {
  const start = readFileSync("app/api/integrations/hh/start/route.ts", "utf8");
  const callback = readFileSync("app/api/integrations/hh/callback/route.ts", "utf8");

  assert.match(start, /first-ai-onboarding/);
  assert.match(start, /first_ai_onboarding_states/);
  assert.match(start, /started_path/);
  assert.match(start, /hh_started_at/);
  assert.match(start, /hiiire_hh_oauth_return_context/);
  assert.match(start, /buildReturnContextValue\(state\)/);
  assert.match(start, /maxAge: 0/);
  assert.match(callback, /first-ai-onboarding/);
  assert.match(callback, /getTrustedReturnContext/);
  assert.match(callback, /state !== expectedState/);
  const callbackErrorBranchIndex = callback.indexOf("if (error)", callback.indexOf('const error = searchParams.get("error")'));
  assert.ok(callback.indexOf("state !== expectedState") < callbackErrorBranchIndex);
  assert.match(callback, /redirectError/);
  assert.match(callback, /from=first-ai-onboarding|searchParams\.set\("from", "first-ai-onboarding"\)/);
  assert.match(callback, /hh=error|searchParams\.set\("hh", hh\)/);
  assert.match(callback, /hh_started_at/);
  assert.match(callback, /hh_oauth_error_at/);
  assert.doesNotMatch(callback, /CODE_MISSING|STATE_MISMATCH/);
  assert.doesNotMatch(callback, /sync\/candidates|sync\/vacancies/);
});
