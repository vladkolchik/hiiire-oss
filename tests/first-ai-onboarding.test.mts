import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  deriveFirstAiOnboardingProgress,
  type FirstAiOnboardingCandidateSummary,
  type FirstAiOnboardingPersistedState,
  type FirstAiOnboardingVacancySummary,
} from "../lib/onboarding/first-ai.ts";

const emptyState: FirstAiOnboardingPersistedState = {
  completedAt: null,
  dismissedAt: null,
  resultOpenedAt: null,
  resultAcknowledgedAt: null,
  hhOauthErrorAt: null,
  hhStartedAt: null,
  startedPath: null,
};

function candidate(overrides: Partial<FirstAiOnboardingCandidateSummary>): FirstAiOnboardingCandidateSummary {
  return {
    id: "candidate-1",
    source: "manual",
    matchPercentage: null,
    hasAiAnalysis: false,
    latestJobStatus: null,
    createdAt: "2026-05-29T10:00:00.000Z",
    ...overrides,
  };
}

function vacancy(overrides: Partial<FirstAiOnboardingVacancySummary> = {}): FirstAiOnboardingVacancySummary {
  return {
    id: "vacancy-1",
    isHh: false,
    createdAt: "2026-05-29T09:00:00.000Z",
    ...overrides,
  };
}

test("first AI onboarding is hidden after completion or dismissal", () => {
  assert.equal(
    deriveFirstAiOnboardingProgress({
      state: { ...emptyState, completedAt: "2026-05-29T12:00:00.000Z" },
      vacancies: [],
      candidates: [],
      hh: { isConnected: false, lastSyncedAt: null, hasSyncError: false },
    }).visible,
    false,
  );

  assert.equal(
    deriveFirstAiOnboardingProgress({
      state: { ...emptyState, dismissedAt: "2026-05-29T12:00:00.000Z" },
      vacancies: [],
      candidates: [],
      hh: { isConnected: false, lastSyncedAt: null, hasSyncError: false },
    }).visible,
    false,
  );
});

test("completed_at is the canonical completion field after final acknowledgement", () => {
  const progress = deriveFirstAiOnboardingProgress({
    state: {
      ...emptyState,
      completedAt: "2026-05-29T12:00:00.000Z",
      resultOpenedAt: "2026-05-29T11:59:00.000Z",
      resultAcknowledgedAt: "2026-05-29T12:00:00.000Z",
    },
    vacancies: [vacancy()],
    candidates: [candidate({ matchPercentage: 82, hasAiAnalysis: true, latestJobStatus: "done" })],
    hh: { isConnected: false, lastSyncedAt: null, hasSyncError: false },
  });

  assert.equal(progress.visible, false);
  assert.equal(progress.step, "hidden");
});

test("acknowledged-only legacy row does not hide without canonical completion", () => {
  const progress = deriveFirstAiOnboardingProgress({
    state: {
      ...emptyState,
      resultOpenedAt: "2026-05-29T11:59:00.000Z",
      resultAcknowledgedAt: "2026-05-29T12:00:00.000Z",
    },
    vacancies: [vacancy()],
    candidates: [candidate({ matchPercentage: 82, hasAiAnalysis: true, latestJobStatus: "done" })],
    hh: { isConnected: false, lastSyncedAt: null, hasSyncError: false },
  });

  assert.equal(progress.visible, true);
  assert.equal(progress.step, "result_ready");
});

test("empty account starts at choose-start state", () => {
  const progress = deriveFirstAiOnboardingProgress({
    state: emptyState,
    vacancies: [],
    candidates: [],
    hh: { isConnected: false, lastSyncedAt: null, hasSyncError: false },
  });

  assert.equal(progress.visible, true);
  assert.equal(progress.step, "choose_start");
  assert.equal(progress.stepNumber, 0);
  assert.equal(progress.totalSteps, 4);
  assert.equal(progress.primaryAction.kind, "hh_start");
  assert.deepEqual(progress.availableActions.map((action) => action.kind), ["hh_start", "manual_start"]);
});

test("manual start keeps manual vacancy creation as the next action with HH fallback", () => {
  const progress = deriveFirstAiOnboardingProgress({
    state: { ...emptyState, startedPath: "manual" },
    vacancies: [],
    candidates: [],
    hh: { isConnected: false, lastSyncedAt: null, hasSyncError: false },
  });

  assert.equal(progress.step, "choose_start");
  assert.equal(progress.primaryAction.kind, "manual_start");
  assert.deepEqual(progress.availableActions.map((action) => action.kind), ["manual_start", "hh_start"]);
  assert.match(progress.availableActions[1]?.label ?? "", /HH\.ru/);
});

test("vacancy-only state asks for a candidate", () => {
  const progress = deriveFirstAiOnboardingProgress({
    state: { ...emptyState, startedPath: "manual" },
    vacancies: [vacancy()],
    candidates: [],
    hh: { isConnected: false, lastSyncedAt: null, hasSyncError: false },
  });

  assert.equal(progress.step, "vacancy_ready");
  assert.equal(progress.stepNumber, 1);
  assert.equal(progress.primaryAction.kind, "add_candidate");
  assert.match(progress.primaryAction.href, /\/dashboard\/candidates\?add=1/);
});

test("manual candidate with active job advances to analysis running", () => {
  const progress = deriveFirstAiOnboardingProgress({
    state: { ...emptyState, startedPath: "manual" },
    vacancies: [vacancy()],
    candidates: [candidate({ latestJobStatus: "processing" })],
    hh: { isConnected: false, lastSyncedAt: null, hasSyncError: false },
  });

  assert.equal(progress.step, "analysis_running");
  assert.equal(progress.stepNumber, 3);
  assert.equal(progress.primaryAction.kind, "open_candidate");
});

test("HH imported candidate without a job asks to start AI analysis", () => {
  const progress = deriveFirstAiOnboardingProgress({
    state: { ...emptyState, startedPath: "hh" },
    vacancies: [vacancy({ isHh: true })],
    candidates: [candidate({ source: "hh.ru" })],
    hh: { isConnected: true, lastSyncedAt: "2026-05-29T10:00:00.000Z", hasSyncError: false },
  });

  assert.equal(progress.step, "candidate_ready");
  assert.equal(progress.stepNumber, 2);
  assert.equal(progress.primaryAction.kind, "start_ai_analysis");
});

test("completed result waits for explicit acknowledgement", () => {
  const progress = deriveFirstAiOnboardingProgress({
    state: emptyState,
    vacancies: [vacancy()],
    candidates: [candidate({ matchPercentage: 82, hasAiAnalysis: true, latestJobStatus: "done" })],
    hh: { isConnected: false, lastSyncedAt: null, hasSyncError: false },
  });

  assert.equal(progress.step, "result_ready");
  assert.equal(progress.stepNumber, 4);
  assert.equal(progress.primaryAction.kind, "open_result");
  assert.equal(progress.visible, true);
});

test("open_result is idempotent and preserves first activation timestamp", () => {
  const source = readFileSync("app/api/onboarding/first-ai/route.ts", "utf8");
  const migration = readFileSync("supabase/sql/first_ai_onboarding_state_v1.sql", "utf8");

  assert.match(source, /record_first_ai_onboarding_open_result/);
  assert.match(source, /record_first_ai_onboarding_acknowledge_result/);
  assert.match(migration, /coalesce\(public\.first_ai_onboarding_states\.result_opened_at,\s*excluded\.result_opened_at\)/);
  assert.match(migration, /coalesce\(public\.first_ai_onboarding_states\.completed_at,\s*excluded\.completed_at\)/);
  assert.match(migration, /revoke execute on function public\.record_first_ai_onboarding_open_result\(uuid, timestamptz\) from public, anon, authenticated/);
  assert.match(migration, /revoke execute on function public\.record_first_ai_onboarding_acknowledge_result\(uuid, timestamptz\) from public, anon, authenticated/);
  assert.doesNotMatch(source, /"complete"/);
});

test("HH sync error gives retry and manual fallback instead of waiting forever", () => {
  const progress = deriveFirstAiOnboardingProgress({
    state: { ...emptyState, startedPath: "hh" },
    vacancies: [],
    candidates: [],
    hh: { isConnected: true, lastSyncedAt: null, hasSyncError: true },
  });

  assert.equal(progress.step, "hh_error");
  assert.equal(progress.primaryAction.kind, "retry_hh");
  assert.ok(progress.availableActions.some((action) => action.kind === "manual_start"));
});

test("HH connected with completed sync but no data offers manual fallback", () => {
  const progress = deriveFirstAiOnboardingProgress({
    state: { ...emptyState, startedPath: "hh" },
    vacancies: [],
    candidates: [],
    hh: { isConnected: true, lastSyncedAt: "2026-05-29T10:00:00.000Z", hasSyncError: false, hasCompletedSync: true },
  });

  assert.equal(progress.step, "hh_no_data");
  assert.equal(progress.primaryAction.kind, "manual_start");
});

test("zero credits do not show a misleading start AI action", () => {
  const progress = deriveFirstAiOnboardingProgress({
    state: { ...emptyState, startedPath: "hh" },
    vacancies: [vacancy({ isHh: true })],
    candidates: [candidate({ source: "hh.ru" })],
    hh: { isConnected: true, lastSyncedAt: "2026-05-29T10:00:00.000Z", hasSyncError: false },
    billing: { canStartAi: false, canManageBilling: true, blockedReason: "Пополните AI-кредиты, чтобы запустить анализ." },
  });

  assert.equal(progress.step, "candidate_ready");
  assert.equal(progress.primaryAction.kind, "open_billing");
});

test("zero credits show role-safe guidance for non-admin users", () => {
  const progress = deriveFirstAiOnboardingProgress({
    state: { ...emptyState, startedPath: "manual" },
    vacancies: [vacancy()],
    candidates: [candidate({ source: "manual", latestJobStatus: null })],
    hh: { isConnected: false, lastSyncedAt: null, hasSyncError: false },
    billing: { canStartAi: false, canManageBilling: false, blockedReason: "AI-анализ сейчас недоступен. Обратитесь к администратору, чтобы проверить тариф или AI-кредиты." },
  });

  assert.equal(progress.step, "candidate_ready");
  assert.equal(progress.primaryAction.kind, "open_candidate");
  assert.match(progress.description, /администратору/);
});

test("HH vacancy without imported candidates keeps refreshing", () => {
  const progress = deriveFirstAiOnboardingProgress({
    state: { ...emptyState, startedPath: "hh" },
    vacancies: [vacancy({ isHh: true })],
    candidates: [],
    hh: { isConnected: true, lastSyncedAt: "2026-05-29T10:00:00.000Z", hasSyncError: false },
  });

  assert.equal(progress.step, "vacancy_ready");
  assert.equal(progress.primaryAction.kind, "open_candidates");
  assert.equal(progress.refreshAfterMs, 15000);
});

test("HH sync error wins over HH vacancy waiting copy", () => {
  const progress = deriveFirstAiOnboardingProgress({
    state: { ...emptyState, startedPath: "hh" },
    vacancies: [vacancy({ isHh: true })],
    candidates: [],
    hh: { isConnected: true, lastSyncedAt: "2026-05-29T10:00:00.000Z", hasSyncError: true },
  });

  assert.equal(progress.step, "hh_error");
  assert.equal(progress.primaryAction.kind, "retry_hh");
});

test("HH reconnect ignores stale sync error from an older attempt", () => {
  const progress = deriveFirstAiOnboardingProgress({
    state: { ...emptyState, startedPath: "hh", hhStartedAt: "2026-05-29T11:00:00.000Z" },
    vacancies: [],
    candidates: [],
    hh: {
      isConnected: true,
      lastSyncedAt: null,
      hasSyncError: true,
      lastSyncErrorAt: "2026-05-29T10:00:00.000Z",
    },
  });

  assert.equal(progress.step, "hh_waiting");
  assert.equal(progress.primaryAction.kind, "open_candidates");
});

test("HH reconnect ignores completed empty sync from an older attempt", () => {
  const progress = deriveFirstAiOnboardingProgress({
    state: { ...emptyState, startedPath: "hh", hhStartedAt: "2026-05-29T11:00:00.000Z" },
    vacancies: [],
    candidates: [],
    hh: {
      isConnected: true,
      lastSyncedAt: "2026-05-29T10:00:00.000Z",
      hasSyncError: false,
      hasCompletedSync: true,
    },
  });

  assert.equal(progress.step, "hh_waiting");
});

test("HH reconnect uses current completed empty sync even when older error remains", () => {
  const progress = deriveFirstAiOnboardingProgress({
    state: { ...emptyState, startedPath: "hh", hhStartedAt: "2026-05-29T11:00:00.000Z" },
    vacancies: [],
    candidates: [],
    hh: {
      isConnected: true,
      lastSyncedAt: "2026-05-29T11:05:00.000Z",
      hasSyncError: true,
      lastSyncErrorAt: "2026-05-29T10:00:00.000Z",
      hasCompletedSync: true,
    },
  });

  assert.equal(progress.step, "hh_no_data");
  assert.equal(progress.primaryAction.kind, "manual_start");
});

test("HH OAuth error without connected integration stays in retry guidance", () => {
  const progress = deriveFirstAiOnboardingProgress({
    state: { ...emptyState, startedPath: "hh", hhOauthErrorAt: "2026-05-29T10:00:00.000Z" },
    vacancies: [],
    candidates: [],
    hh: { isConnected: false, lastSyncedAt: null, hasSyncError: false, hasOauthError: true },
  });

  assert.equal(progress.step, "hh_error");
  assert.equal(progress.primaryAction.kind, "retry_hh");
  assert.ok(progress.availableActions.some((action) => action.kind === "manual_start"));
});

test("async states request bounded soft refresh", () => {
  const hhProgress = deriveFirstAiOnboardingProgress({
    state: { ...emptyState, startedPath: "hh" },
    vacancies: [],
    candidates: [],
    hh: { isConnected: true, lastSyncedAt: null, hasSyncError: false },
  });
  const aiProgress = deriveFirstAiOnboardingProgress({
    state: { ...emptyState, startedPath: "manual" },
    vacancies: [vacancy()],
    candidates: [candidate({ latestJobStatus: "processing" })],
    hh: { isConnected: false, lastSyncedAt: null, hasSyncError: false },
  });

  assert.equal(hhProgress.refreshAfterMs, 15000);
  assert.equal(aiProgress.refreshAfterMs, 10000);
});
