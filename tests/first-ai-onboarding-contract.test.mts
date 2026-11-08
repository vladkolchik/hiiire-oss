import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  assert.ok(existsSync(path), `Missing expected source file: ${path}`);
  return readFileSync(path, "utf8");
}

test("dashboard home renders first AI onboarding before KPI cards", () => {
  const dashboard = source("app/(dashboard)/dashboard/page.tsx");
  const card = source("components/dashboard/onboarding/first-ai-onboarding-card.tsx");
  const progress = source("lib/onboarding/first-ai.ts");

  assert.match(dashboard, /FirstAiOnboardingCard/);
  assert.ok(dashboard.indexOf("<FirstAiOnboardingCard") < dashboard.indexOf("statCards.map"));
  assert.match(card, /Получите первый AI-анализ/);
  assert.match(progress, /Создать вручную/);
  assert.match(progress, /Подключить HH\.ru/);
  assert.match(card, /startAndNavigate/);
  assert.match(card, /event\.preventDefault\(\)/);
  assert.match(card, /router\.push\(href\)/);
  assert.match(card, /Скрыть знакомство/);
  assert.match(card, /Это завершит знакомство с сервисом/);
  assert.match(card, /\/api\/onboarding\/first-ai/);
  assert.match(card, /refreshAfterMs/);
  assert.match(card, /visibilitychange/);
  assert.match(card, /readUserFacingApiErrorMessage/);
  assert.match(card, /Не удалось обновить знакомство/);
  assert.match(card, /Не удалось скрыть знакомство/);
  assert.match(card, /Загрузка занимает больше обычного/);
  assert.match(progress, /FIRST_AI_ONBOARDING_REFRESH_TIMEOUT_MS\s*=\s*17\s*\*\s*60\s*\*\s*1000/);
  assert.match(card, /FIRST_AI_ONBOARDING_REFRESH_TIMEOUT_MS/);
  assert.doesNotMatch(card, /5\s*\*\s*60\s*\*\s*1000/);
});

test("contextual onboarding hints are wired without replacing existing flows", () => {
  const hint = source("components/dashboard/onboarding/contextual-onboarding-hint.tsx");
  const vacancies = source("app/(dashboard)/dashboard/vacancies/page.tsx");
  const settings = source("app/(dashboard)/dashboard/settings/page.tsx");
  const candidates = source("app/(dashboard)/dashboard/candidates/page.tsx");

  assert.match(hint, /FirstAiContextualOnboardingHint/);
  assert.match(vacancies, /FirstAiContextualOnboardingHint/);
  assert.match(settings, /FirstAiContextualOnboardingHint/);
  assert.match(candidates, /FirstAiContextualOnboardingHint/);
  assert.match(settings, /surface="settings_integrations"/);
  assert.match(hint, /Загружаем вакансии и отклики из HH\.ru/);
  assert.match(hint, /Шаг 2: добавьте кандидата/);
  assert.match(hint, /Шаг 3: просмотр результатов/);
  assert.match(hint, /Запустить AI-анализ/);
  assert.match(hint, /\/dashboard\/candidates\?add=1/);
  assert.match(hint, /startPathBeforeNavigate/);
  assert.match(hint, /refreshAfterMs/);
  assert.match(hint, /progress\.step !== "hh_waiting"/);
  assert.match(hint, /Загрузка занимает больше обычного/);
  assert.match(hint, /HH\.ru загрузил вакансии/);
  assert.match(hint, /Скрыть знакомство/);
  assert.match(hint, /AlertDialog/);
  assert.match(hint, /FIRST_AI_ONBOARDING_REFRESH_EVENT/);
  assert.match(hint, /readUserFacingApiErrorMessage/);
  assert.match(hint, /isProgressEligibleForSurface/);
  assert.match(hint, /hadEligibleHintRef/);
  assert.match(hint, /dismissErrorMessage/);
  assert.match(hint, /notifyFirstAiOnboardingChanged/);
  assert.match(hint, /detail\?\.completed \|\| detail\?\.dismissed/);
  assert.match(hint, /locallyClosedRef/);
  assert.match(hint, /if \(locallyClosedRef\.current\) return/);
  assert.match(hint, /FIRST_AI_ONBOARDING_REFRESH_TIMEOUT_MS/);
  assert.doesNotMatch(hint, /5\s*\*\s*60\s*\*\s*1000/);
  assert.doesNotMatch(hint, /sync\/candidates|sync\/vacancies/);
  assert.doesNotMatch(settings, /onboarding-specific sync/i);
  assert.match(vacancies, /createDialogOpenSignal/);
  assert.match(vacancies, /openSignal=\{createDialogOpenSignal\}/);
  assert.match(candidates, /addCandidateOpenSignal/);
  assert.match(candidates, /openSignal=\{addCandidateOpenSignal\}/);
});

test("local first-ai actions refresh contextual hints without a full reload", () => {
  const events = source("lib/onboarding/first-ai-client-events.ts");
  const vacancies = source("app/(dashboard)/dashboard/vacancies/page.tsx");
  const candidates = source("app/(dashboard)/dashboard/candidates/page.tsx");
  const details = source("components/dashboard/candidate-details.tsx");

  assert.match(events, /FIRST_AI_ONBOARDING_REFRESH_EVENT/);
  assert.match(events, /CustomEvent/);
  assert.match(events, /notifyFirstAiOnboardingChanged/);
  assert.match(vacancies, /notifyFirstAiOnboardingChanged/);
  assert.match(candidates, /notifyFirstAiOnboardingChanged/);
  assert.match(details, /notifyFirstAiOnboardingChanged/);
  assert.match(details, /notifyFirstAiOnboardingChanged\(\{ completed: true \}\)/);
  assert.match(details, /detail\?\.completed \|\| detail\?\.dismissed/);
  assert.match(details, /firstAiPromptClosedRef/);
  assert.match(details, /if \(firstAiPromptClosedRef\.current\) return/);
  assert.match(details, /setFirstAiPromptError\(null\)/);
  assert.match(candidates, /handleCandidatesAdded[\s\S]*notifyFirstAiOnboardingChanged/);
  assert.match(candidates, /handleRetry[\s\S]*notifyFirstAiOnboardingChanged/);
  assert.match(candidates, /bulkStartScoring[\s\S]*notifyFirstAiOnboardingChanged/);
});

test("candidate details final prompt explains finish and help links", () => {
  const details = source("components/dashboard/candidate-details.tsx");

  assert.match(details, /Готово! Так выглядит карточка кандидата/);
  assert.match(details, /Желаем адекватных кандидатов и продуктивной работы/);
  assert.match(details, /Понятно/);
  assert.match(details, /База знаний/);
  assert.match(details, /Оставить обратную связь/);
  assert.match(details, /Записаться на демо/);
  assert.match(details, /acknowledge_result/);
  assert.match(details, /open_result/);
  assert.match(details, /firstAiPromptError/);
  assert.match(details, /Не удалось обновить подсказку знакомства/);
  assert.match(details, /notifyFirstAiOnboardingChanged/);
  assert.match(details, /FIRST_AI_ONBOARDING_REFRESH_EVENT/);
  assert.match(details, /refreshFirstAiPrompt/);
  assert.match(details, /recordFirstAiOpenResult/);
  assert.match(details, /firstAiOpenResultPending/);
  assert.match(details, /readUserFacingApiErrorMessage/);
  assert.match(details, /candidateId: candidate\.id/);
  assert.match(details, /score === null|score-only|scoreOnly/);
  assert.match(details, /visibilitychange/);
  assert.match(details, /window\.addEventListener\("focus"/);
  assert.match(details, /\/knowledge-base/);
  assert.match(details, /\/dashboard\/feedback/);
  assert.match(details, /\/request-access\?demo=true/);
});

test("non-admin credit-blocked candidate surfaces do not show tariff management CTAs", () => {
  const candidates = source("app/(dashboard)/dashboard/candidates/page.tsx");
  const details = source("components/dashboard/candidate-details.tsx");

  assert.match(candidates, /creditsBlockedHint/);
  assert.match(candidates, /Обратитесь к администратору аккаунта/);
  assert.match(candidates, /creditsBalance !== null && creditsBalance <= 0 && isCompanyAdmin/);
  assert.match(candidates, /creditsBlocked \?[\s\S]*isCompanyAdmin \?/);
  assert.match(details, /canManageBilling/);
  assert.match(details, /Обратитесь к администратору аккаунта/);
  assert.match(details, /creditsBlocked && canManageBilling/);
});
