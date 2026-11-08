export type FirstAiOnboardingPath = "manual" | "hh";
export type FirstAiOnboardingStartedPath = FirstAiOnboardingPath | null;
export type FirstAiJobStatus = "queued" | "processing" | "done" | "failed" | "canceled";
export const FIRST_AI_ONBOARDING_REFRESH_TIMEOUT_MS = 17 * 60 * 1000;
export type FirstAiOnboardingStep =
  | "hidden"
  | "choose_start"
  | "hh_waiting"
  | "hh_error"
  | "hh_no_data"
  | "vacancy_ready"
  | "candidate_ready"
  | "analysis_running"
  | "analysis_failed"
  | "result_ready";

export type FirstAiOnboardingActionKind =
  | "manual_start"
  | "hh_start"
  | "add_candidate"
  | "open_candidates"
  | "open_candidate"
  | "start_ai_analysis"
  | "open_billing"
  | "open_result"
  | "retry_hh"
  | "finish";

export type FirstAiOnboardingPersistedState = {
  completedAt: string | null;
  dismissedAt: string | null;
  resultOpenedAt: string | null;
  resultAcknowledgedAt: string | null;
  hhOauthErrorAt: string | null;
  hhStartedAt: string | null;
  startedPath: FirstAiOnboardingPath | null;
};

export type FirstAiOnboardingVacancySummary = {
  id: string;
  isHh: boolean;
  createdAt: string;
};

export type FirstAiOnboardingCandidateSummary = {
  id: string;
  source: "manual" | "hh.ru" | "referral" | "other" | null;
  matchPercentage: number | null;
  hasAiAnalysis: boolean;
  latestJobStatus: FirstAiJobStatus | null;
  createdAt: string;
};

export type FirstAiOnboardingHhSummary = {
  isConnected: boolean;
  lastSyncedAt: string | null;
  lastSyncErrorAt?: string | null;
  hasSyncError: boolean;
  hasOauthError?: boolean;
  hasCompletedSync?: boolean;
};

export type FirstAiOnboardingBillingSummary = {
  canStartAi: boolean;
  canManageBilling: boolean;
  blockedReason: string | null;
};

export type FirstAiOnboardingAction = {
  kind: FirstAiOnboardingActionKind;
  href: string;
  label: string;
  candidateId?: string;
};

export type FirstAiOnboardingProgress = {
  visible: boolean;
  step: FirstAiOnboardingStep;
  stepNumber: number;
  totalSteps: 4;
  title: string;
  description: string;
  primaryAction: FirstAiOnboardingAction;
  availableActions: FirstAiOnboardingAction[];
  candidateId: string | null;
  startedPath: FirstAiOnboardingPath | null;
  refreshAfterMs: number | null;
};

type Input = {
  state: FirstAiOnboardingPersistedState;
  vacancies: FirstAiOnboardingVacancySummary[];
  candidates: FirstAiOnboardingCandidateSummary[];
  hh: FirstAiOnboardingHhSummary;
  billing?: FirstAiOnboardingBillingSummary;
};

function byNewest<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function isAtOrAfter(value: string | null | undefined, baseline: string | null | undefined): boolean {
  if (!value) return false;
  if (!baseline) return true;
  return value >= baseline;
}

function isCurrentHhSyncError(input: Input): boolean {
  if (!input.hh.hasSyncError) return false;
  if (!input.state.hhStartedAt) return true;
  if (!input.hh.lastSyncErrorAt) return true;
  return input.hh.lastSyncErrorAt >= input.state.hhStartedAt;
}

function action(kind: FirstAiOnboardingActionKind, label: string, href: string, candidateId?: string): FirstAiOnboardingAction {
  return candidateId ? { kind, label, href, candidateId } : { kind, label, href };
}

function hidden(startedPath: FirstAiOnboardingPath | null): FirstAiOnboardingProgress {
  return {
    visible: false,
    step: "hidden",
    stepNumber: 4,
    totalSteps: 4,
    title: "Знакомство завершено",
    description: "",
    primaryAction: action("finish", "Понятно", "/dashboard"),
    availableActions: [],
    candidateId: null,
    startedPath,
    refreshAfterMs: null,
  };
}

export function deriveFirstAiOnboardingProgress(input: Input): FirstAiOnboardingProgress {
  const startedPath = input.state.startedPath;
  if (input.state.completedAt || input.state.dismissedAt) {
    return hidden(startedPath);
  }

  const newestCandidates = byNewest(input.candidates);
  const resultCandidate = newestCandidates.find((candidate) => candidate.hasAiAnalysis || candidate.matchPercentage !== null);
  const hasCurrentHhSyncError = isCurrentHhSyncError(input);
  const hasCurrentCompletedHhSync = Boolean(input.hh.hasCompletedSync && isAtOrAfter(input.hh.lastSyncedAt, input.state.hhStartedAt));

  if (resultCandidate) {
    return {
      visible: true,
      step: "result_ready",
      stepNumber: 4,
      totalSteps: 4,
      title: "Первый AI-анализ готов",
      description: "Откройте результат, чтобы посмотреть оценку соответствия, главный вывод и детали разбора.",
      primaryAction: action("open_result", "Открыть первый AI-анализ", `/dashboard/candidates?candidate=${encodeURIComponent(resultCandidate.id)}`, resultCandidate.id),
      availableActions: [action("open_result", "Открыть первый AI-анализ", `/dashboard/candidates?candidate=${encodeURIComponent(resultCandidate.id)}`, resultCandidate.id)],
      candidateId: resultCandidate.id,
      startedPath,
      refreshAfterMs: null,
    };
  }

  const activeCandidate = newestCandidates.find((candidate) =>
    candidate.latestJobStatus === "queued" || candidate.latestJobStatus === "processing" || candidate.latestJobStatus === "done"
  );
  if (activeCandidate) {
    return {
      visible: true,
      step: "analysis_running",
      stepNumber: 3,
      totalSteps: 4,
      title: "AI-анализ запущен",
      description: "Результат появится в карточке кандидата. Можно открыть карточку и следить за статусом.",
      primaryAction: action("open_candidate", "Открыть кандидата", `/dashboard/candidates?candidate=${encodeURIComponent(activeCandidate.id)}`, activeCandidate.id),
      availableActions: [action("open_candidate", "Открыть кандидата", `/dashboard/candidates?candidate=${encodeURIComponent(activeCandidate.id)}`, activeCandidate.id)],
      candidateId: activeCandidate.id,
      startedPath,
      refreshAfterMs: 10000,
    };
  }

  const failedCandidate = newestCandidates.find((candidate) => candidate.latestJobStatus === "failed");
  if (failedCandidate) {
    return {
      visible: true,
      step: "analysis_failed",
      stepNumber: 3,
      totalSteps: 4,
      title: "AI-анализ не завершился",
      description: "Откройте кандидата и попробуйте запустить анализ повторно.",
      primaryAction: action("open_candidate", "Открыть кандидата", `/dashboard/candidates?candidate=${encodeURIComponent(failedCandidate.id)}`, failedCandidate.id),
      availableActions: [action("open_candidate", "Открыть кандидата", `/dashboard/candidates?candidate=${encodeURIComponent(failedCandidate.id)}`, failedCandidate.id)],
      candidateId: failedCandidate.id,
      startedPath,
      refreshAfterMs: null,
    };
  }

  const candidateWithoutJob = newestCandidates[0];
  if (candidateWithoutJob) {
    const isHhCandidate = candidateWithoutJob.source === "hh.ru";
    if (input.billing && !input.billing.canStartAi) {
      const blockedDescription =
        input.billing.blockedReason ??
        (input.billing.canManageBilling
          ? "Проверьте тариф и AI-кредиты, чтобы запустить анализ."
          : "AI-анализ сейчас недоступен. Обратитесь к администратору, чтобы проверить тариф или AI-кредиты.");
      const blockedAction = input.billing.canManageBilling
        ? action("open_billing", "Проверить тариф и кредиты", "/dashboard/settings?tab=plan", candidateWithoutJob.id)
        : action("open_candidate", "Открыть кандидата", `/dashboard/candidates?candidate=${encodeURIComponent(candidateWithoutJob.id)}`, candidateWithoutJob.id);

      return {
        visible: true,
        step: "candidate_ready",
        stepNumber: 2,
        totalSteps: 4,
        title: "Кандидат готов к AI-анализу",
        description: blockedDescription,
        primaryAction: blockedAction,
        availableActions: [blockedAction],
        candidateId: candidateWithoutJob.id,
        startedPath,
        refreshAfterMs: null,
      };
    }

    const primary = action(
      isHhCandidate ? "start_ai_analysis" : "open_candidate",
      isHhCandidate ? "Запустить AI-анализ" : "Открыть кандидата",
      `/dashboard/candidates?candidate=${encodeURIComponent(candidateWithoutJob.id)}`,
      candidateWithoutJob.id,
    );

    return {
      visible: true,
      step: "candidate_ready",
      stepNumber: 2,
      totalSteps: 4,
      title: isHhCandidate ? "Кандидат импортирован из HH.ru" : "Кандидат добавлен",
      description: isHhCandidate
        ? "Откройте карточку кандидата и запустите AI-анализ."
        : "Если анализ не запустился автоматически, его можно запустить из карточки кандидата.",
      primaryAction: primary,
      availableActions: [primary],
      candidateId: candidateWithoutJob.id,
      startedPath,
      refreshAfterMs: null,
    };
  }

  if (startedPath === "hh") {
    if (input.hh.hasOauthError || input.state.hhOauthErrorAt || (input.hh.isConnected && hasCurrentHhSyncError)) {
      return {
        visible: true,
        step: "hh_error",
        stepNumber: 1,
        totalSteps: 4,
        title: input.hh.isConnected ? "HH.ru не удалось обновить данные" : "HH.ru не удалось подключить",
        description: "Попробуйте подключить HH.ru ещё раз или продолжите вручную.",
        primaryAction: action("retry_hh", "Повторить подключение", "/api/integrations/hh/start?from=first-ai-onboarding"),
        availableActions: [
          action("retry_hh", "Повторить подключение", "/api/integrations/hh/start?from=first-ai-onboarding"),
          action("manual_start", "Создать вручную", "/dashboard/vacancies?create=1"),
        ],
        candidateId: null,
        startedPath,
        refreshAfterMs: null,
      };
    }
  }

  if (input.vacancies.length > 0) {
    const isHhVacancyWaitingForCandidates = startedPath === "hh" && input.hh.isConnected && input.vacancies.some((vacancy) => vacancy.isHh);
    return {
      visible: true,
      step: "vacancy_ready",
      stepNumber: 1,
      totalSteps: 4,
      title: "Вакансия готова",
      description: input.vacancies.some((vacancy) => vacancy.isHh)
        ? "Дождитесь откликов из HH.ru или добавьте кандидата вручную."
        : "Теперь добавьте резюме кандидата, чтобы получить первый AI-анализ.",
      primaryAction: isHhVacancyWaitingForCandidates
        ? action("open_candidates", "Открыть кандидатов", "/dashboard/candidates")
        : action("add_candidate", "Добавить кандидата", "/dashboard/candidates?add=1"),
      availableActions: isHhVacancyWaitingForCandidates
        ? [
            action("open_candidates", "Открыть кандидатов", "/dashboard/candidates"),
            action("add_candidate", "Добавить кандидата вручную", "/dashboard/candidates?add=1"),
            action("retry_hh", "Повторить подключение", "/api/integrations/hh/start?from=first-ai-onboarding"),
          ]
        : [action("add_candidate", "Добавить кандидата", "/dashboard/candidates?add=1")],
      candidateId: null,
      startedPath,
      refreshAfterMs: isHhVacancyWaitingForCandidates ? 15000 : null,
    };
  }

  if (startedPath === "hh" && input.hh.isConnected) {
    if (hasCurrentCompletedHhSync && input.vacancies.length === 0 && input.candidates.length === 0) {
      return {
        visible: true,
        step: "hh_no_data",
        stepNumber: 1,
        totalSteps: 4,
        title: "В HH.ru не нашли активные данные",
        description: "Активные вакансии и отклики не загрузились. Можно создать вакансию вручную и добавить резюме.",
        primaryAction: action("manual_start", "Создать вручную", "/dashboard/vacancies?create=1"),
        availableActions: [
          action("manual_start", "Создать вручную", "/dashboard/vacancies?create=1"),
          action("retry_hh", "Повторить подключение", "/api/integrations/hh/start?from=first-ai-onboarding"),
        ],
        candidateId: null,
        startedPath,
        refreshAfterMs: null,
      };
    }

    return {
      visible: true,
      step: "hh_waiting",
      stepNumber: 1,
      totalSteps: 4,
      title: "Загружаем данные из HH.ru",
      description: "После подключения мы автоматически загрузим активные вакансии и отклики.",
      primaryAction: action("open_candidates", "Открыть кандидатов", "/dashboard/candidates"),
      availableActions: [
        action("open_candidates", "Открыть кандидатов", "/dashboard/candidates"),
        action("manual_start", "Создать вручную", "/dashboard/vacancies?create=1"),
        action("retry_hh", "Повторить подключение", "/api/integrations/hh/start?from=first-ai-onboarding"),
      ],
      candidateId: null,
      startedPath,
      refreshAfterMs: 15000,
    };
  }

  return {
    visible: true,
    step: "choose_start",
    stepNumber: 0,
    totalSteps: 4,
    title: "Получите первый AI-анализ",
    description:
      startedPath === "manual"
        ? "Создайте вакансию вручную или загрузите активные вакансии и отклики из HH.ru."
        : "Подключите HH.ru, чтобы импортировать активные вакансии и отклики, или создайте вакансию вручную.",
    primaryAction:
      startedPath === "manual"
        ? action("manual_start", "Создать вручную", "/dashboard/vacancies?create=1")
        : action("hh_start", "Подключить HH.ru", "/api/integrations/hh/start?from=first-ai-onboarding"),
    availableActions:
      startedPath === "manual"
        ? [
            action("manual_start", "Создать вручную", "/dashboard/vacancies?create=1"),
            action("hh_start", "Загрузить с HH.ru", "/api/integrations/hh/start?from=first-ai-onboarding"),
          ]
        : [
            action("hh_start", "Подключить HH.ru", "/api/integrations/hh/start?from=first-ai-onboarding"),
            action("manual_start", "Создать вручную", "/dashboard/vacancies?create=1"),
          ],
    candidateId: null,
    startedPath,
    refreshAfterMs: null,
  };
}
