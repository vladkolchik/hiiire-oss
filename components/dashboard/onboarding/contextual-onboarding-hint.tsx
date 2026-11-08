"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { Brain, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { readUserFacingApiErrorMessage } from "@/lib/api/user-facing-errors";
import { FIRST_AI_ONBOARDING_REFRESH_EVENT, notifyFirstAiOnboardingChanged } from "@/lib/onboarding/first-ai-client-events";
import type { FirstAiOnboardingClientEventDetail } from "@/lib/onboarding/first-ai-client-events";
import { FIRST_AI_ONBOARDING_REFRESH_TIMEOUT_MS } from "@/lib/onboarding/first-ai";
import type { FirstAiOnboardingAction, FirstAiOnboardingProgress } from "@/lib/onboarding/first-ai";

type ApiResponse = {
  progress?: FirstAiOnboardingProgress;
};

type Props = {
  surface: "vacancies" | "settings_integrations" | "candidates";
};

function isTimedOutHhImport(progress: FirstAiOnboardingProgress, refreshTimedOut: boolean) {
  return refreshTimedOut && (progress.step === "hh_waiting" || (progress.step === "vacancy_ready" && progress.startedPath === "hh"));
}

function actionForSurface(action: FirstAiOnboardingAction, surface: Props["surface"]): FirstAiOnboardingAction {
  if (action.kind === "add_candidate") {
    return { ...action, href: "/dashboard/candidates?add=1" };
  }
  if (action.kind === "hh_start" && surface === "vacancies") {
    return { ...action, label: "Загрузить с HH.ru" };
  }
  if (action.kind === "manual_start" && surface === "settings_integrations") {
    return { ...action, label: "Создать вручную" };
  }
  return action;
}

function actionByKind(progress: FirstAiOnboardingProgress, kind: FirstAiOnboardingAction["kind"]): FirstAiOnboardingAction | null {
  return progress.availableActions.find((action) => action.kind === kind) ?? (progress.primaryAction.kind === kind ? progress.primaryAction : null);
}

function compactActions(actions: Array<FirstAiOnboardingAction | null | undefined>): FirstAiOnboardingAction[] {
  const seen = new Set<string>();
  const result: FirstAiOnboardingAction[] = [];
  for (const action of actions) {
    if (!action || seen.has(action.kind)) continue;
    seen.add(action.kind);
    result.push(action);
  }
  return result;
}

function contextualActions(surface: Props["surface"], progress: FirstAiOnboardingProgress, refreshTimedOut: boolean): FirstAiOnboardingAction[] {
  if (surface === "vacancies" && progress.step === "choose_start") {
    const manual = actionByKind(progress, "manual_start");
    const hh = actionByKind(progress, "hh_start");
    return compactActions(progress.startedPath === "manual" ? [manual, hh] : [hh, manual]).map((action) => actionForSurface(action, surface));
  }

  if (surface === "candidates" && progress.step === "vacancy_ready") {
    const addCandidate = actionByKind(progress, "add_candidate");
    const retryHh = progress.startedPath === "hh" ? actionByKind(progress, "retry_hh") : null;
    return compactActions([addCandidate, retryHh]).map((action) => actionForSurface(action, surface));
  }

  if (surface === "settings_integrations" && (progress.step === "hh_waiting" || progress.step === "hh_error" || progress.step === "hh_no_data")) {
    return progress.availableActions.map((action) => actionForSurface(action, surface));
  }

  if (progress.startedPath === "hh" && (progress.step === "hh_waiting" || progress.step === "hh_error" || progress.step === "hh_no_data")) {
    return progress.availableActions.map((action) => actionForSurface(action, surface));
  }

  if (isTimedOutHhImport(progress, refreshTimedOut)) {
    return progress.availableActions.map((action) => actionForSurface(action, surface));
  }

  return [actionForSurface(progress.primaryAction, surface)];
}

function contextualPrimaryActionKind(surface: Props["surface"], progress: FirstAiOnboardingProgress): FirstAiOnboardingAction["kind"] {
  if (surface === "vacancies" && progress.step === "choose_start" && progress.startedPath === "manual") return "manual_start";
  if (surface === "candidates" && progress.step === "vacancy_ready") return "add_candidate";
  return progress.primaryAction.kind;
}

function surfaceCopy(surface: Props["surface"], progress: FirstAiOnboardingProgress, refreshTimedOut = false): { title: string; description: string } {
  if (surface === "settings_integrations") {
    if (progress.step === "vacancy_ready" && progress.startedPath === "hh") {
      return {
        title: "HH.ru загрузил вакансии",
        description: "Откройте кандидатов, чтобы дождаться откликов, добавить резюме вручную или запустить следующий шаг.",
      };
    }
    if (isTimedOutHhImport(progress, refreshTimedOut)) {
      return {
        title: "Загрузка занимает больше обычного",
        description: "HH.ru подключён, но вакансии и отклики ещё не появились. Можно открыть кандидатов, создать вакансию вручную или повторить подключение позже.",
      };
    }
    if (progress.step === "hh_error") {
      return {
        title: "HH.ru не удалось обновить данные",
        description: "Попробуйте подключить HH.ru ещё раз или продолжите вручную.",
      };
    }
    if (progress.step === "hh_no_data") {
      return {
        title: "В HH.ru не нашли активные данные",
        description: "Активные вакансии и отклики не загрузились. Можно создать вакансию вручную.",
      };
    }
    return {
      title: "Загружаем вакансии и отклики из HH.ru",
      description: "Когда активные вакансии и отклики появятся в hiiire, подсказка обновится сама.",
    };
  }

  if (surface === "vacancies") {
    if (progress.step === "vacancy_ready") {
      return {
        title: "Шаг 2: добавьте кандидата",
        description: "Вакансия готова. Перейдите к кандидатам и добавьте резюме, чтобы запустить первый AI-анализ.",
      };
    }
    return {
      title: "Шаг 1: подготовьте вакансию",
      description:
        progress.step === "choose_start"
          ? progress.startedPath === "manual"
            ? "Создайте вакансию вручную. Если активные вакансии уже есть на HH.ru, можно загрузить их вместо ручного ввода."
            : "Загрузите активные вакансии из HH.ru или создайте вакансию вручную."
          : progress.description,
    };
  }

  if (surface === "candidates" && progress.step === "vacancy_ready") {
    return {
      title: "Шаг 2: добавьте кандидата",
      description:
        progress.startedPath === "hh"
          ? "Дождитесь откликов из HH.ru или добавьте резюме вручную, чтобы перейти к AI-анализу."
          : "Добавьте резюме кандидата вручную, чтобы запустить первый AI-анализ.",
    };
  }

  if (progress.step === "candidate_ready") {
    return {
      title: "Шаг 3: запустите AI-анализ",
      description: "Откройте кандидата и нажмите «Запустить AI-анализ», если анализ ещё не начался.",
    };
  }

  if (progress.step === "analysis_running") {
    return {
      title: "Шаг 3: просмотр результатов",
      description: "AI-анализ уже запущен. Откройте кандидата и дождитесь результата в карточке.",
    };
  }

  return {
    title: "Шаг к первому AI-анализу",
    description: progress.description,
  };
}

function isProgressEligibleForSurface(surface: Props["surface"], progress: FirstAiOnboardingProgress | null): progress is FirstAiOnboardingProgress {
  if (!progress?.visible) return false;
  if (progress.step === "result_ready" && surface !== "candidates") return false;
  if (
    surface === "settings_integrations" &&
    progress.step !== "hh_waiting" &&
    progress.step !== "hh_error" &&
    progress.step !== "hh_no_data" &&
    !(progress.step === "vacancy_ready" && progress.startedPath === "hh")
  ) {
    return false;
  }
  return true;
}

export function FirstAiContextualOnboardingHint({ surface }: Props) {
  const router = useRouter();
  const [progress, setProgress] = useState<FirstAiOnboardingProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);
  const [dismissErrorMessage, setDismissErrorMessage] = useState<string | null>(null);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshTimedOut, setRefreshTimedOut] = useState(false);
  const [hadEligibleHint, setHadEligibleHint] = useState(false);
  const refreshStartedAtRef = useRef<number | null>(null);
  const refreshScopeKeyRef = useRef<string | null>(null);
  const hadEligibleHintRef = useRef(false);
  const locallyClosedRef = useRef(false);

  const clearDismissError = useCallback(() => setDismissErrorMessage(null), []);

  const load = useCallback(async () => {
    if (locallyClosedRef.current) return;
    try {
      const res = await fetch("/api/onboarding/first-ai", { method: "GET", cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse | null;
      if (locallyClosedRef.current) return;
      if (!res.ok || !json?.progress) {
        if (hadEligibleHintRef.current) setErrorMessage(readUserFacingApiErrorMessage(json, "Не удалось обновить подсказку. Попробуйте ещё раз."));
        return;
      }

      const eligible = isProgressEligibleForSurface(surface, json.progress);
      hadEligibleHintRef.current = hadEligibleHintRef.current || eligible;
      setHadEligibleHint((current) => current || eligible);
      setErrorMessage(null);
      setActionErrorMessage(null);
      setProgress(json.progress);
    } catch {
      if (hadEligibleHintRef.current) setErrorMessage("Не удалось обновить подсказку. Попробуйте ещё раз.");
    }
  }, [surface]);

  const dismiss = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/onboarding/first-ai", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setDismissErrorMessage(readUserFacingApiErrorMessage(json, "Не удалось скрыть знакомство. Попробуйте ещё раз."));
        return;
      }
      clearDismissError();
      locallyClosedRef.current = true;
      setProgress(null);
      setErrorMessage(null);
      setActionErrorMessage(null);
      hadEligibleHintRef.current = false;
      setHadEligibleHint(false);
      setDismissOpen(false);
      notifyFirstAiOnboardingChanged({ dismissed: true });
    } catch {
      setDismissErrorMessage("Не удалось скрыть знакомство. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  }, [clearDismissError]);

  const startPathBeforeNavigate = useCallback(
    async (event: MouseEvent<HTMLAnchorElement>, action: FirstAiOnboardingAction) => {
      if (action.kind !== "manual_start" && action.kind !== "hh_start") return;
      event.preventDefault();

      const onboardingAction = action.kind === "manual_start" ? "start_manual" : "start_hh";
      try {
        const res = await fetch("/api/onboarding/first-ai", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: onboardingAction }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setActionErrorMessage(readUserFacingApiErrorMessage(json, "Не удалось сохранить выбор. Попробуйте ещё раз."));
          return;
        }
        setActionErrorMessage(null);
        if (action.href.startsWith("/api/")) window.location.assign(action.href);
        else router.push(action.href);
      } catch {
        setActionErrorMessage("Не удалось сохранить выбор. Попробуйте ещё раз.");
      }
    },
    [router],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = event instanceof CustomEvent ? (event.detail as FirstAiOnboardingClientEventDetail | undefined) : undefined;
      if (detail?.completed || detail?.dismissed) {
        locallyClosedRef.current = true;
        hadEligibleHintRef.current = false;
        setHadEligibleHint(false);
        setErrorMessage(null);
        setActionErrorMessage(null);
        setDismissErrorMessage(null);
        setProgress(null);
        setDismissOpen(false);
        return;
      }
      void load();
    };
    window.addEventListener(FIRST_AI_ONBOARDING_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(FIRST_AI_ONBOARDING_REFRESH_EVENT, refresh);
  }, [load]);

  useEffect(() => {
    if (!progress?.refreshAfterMs) {
      refreshStartedAtRef.current = null;
      refreshScopeKeyRef.current = null;
      setRefreshTimedOut(false);
      return;
    }

    const refreshScopeKey = `${progress.step}:${progress.candidateId ?? ""}:${progress.startedPath ?? ""}`;
    if (refreshScopeKeyRef.current !== refreshScopeKey) {
      refreshScopeKeyRef.current = refreshScopeKey;
      refreshStartedAtRef.current = Date.now();
      setRefreshTimedOut(false);
    }

    refreshStartedAtRef.current ??= Date.now();
    if (Date.now() - refreshStartedAtRef.current > FIRST_AI_ONBOARDING_REFRESH_TIMEOUT_MS) {
      setRefreshTimedOut(true);
      return;
    }

    let cancelled = false;
    const refreshIfVisible = () => {
      if (!cancelled && document.visibilityState === "visible") void load();
    };
    const timer = window.setTimeout(refreshIfVisible, progress.refreshAfterMs);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [load, progress?.candidateId, progress?.refreshAfterMs, progress?.startedPath, progress?.step]);

  if (errorMessage && hadEligibleHint && isProgressEligibleForSurface(surface, progress)) {
    return (
      <Alert className="border-primary/20 bg-primary/5">
        <Brain className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>Не удалось обновить подсказку</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="min-w-0 break-words">{errorMessage}</span>
          <Button type="button" size="sm" variant="outline" className="w-full shrink-0 sm:w-auto" onClick={() => void load()}>
            Повторить
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!isProgressEligibleForSurface(surface, progress)) return null;

  const copy = surfaceCopy(surface, progress, refreshTimedOut);
  const actions = contextualActions(surface, progress, refreshTimedOut);
  const primaryActionKind = contextualPrimaryActionKind(surface, progress);

  return (
    <>
      <Alert className="border-primary/20 bg-primary/5">
        <Brain className="h-4 w-4" aria-hidden="true" />
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <AlertTitle>{copy.title}</AlertTitle>
            <AlertDescription className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0 break-words">{copy.description}</span>
              <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
                {actions.map((action) => (
                  <Button key={action.kind} asChild size="sm" variant={action.kind === primaryActionKind ? "default" : "outline"} className="w-full sm:w-auto">
                    <Link href={action.href} onClick={(event) => void startPathBeforeNavigate(event, action)}>
                      {action.label}
                    </Link>
                  </Button>
                ))}
              </div>
              {actionErrorMessage ? <span className="min-w-0 break-words text-destructive">{actionErrorMessage}</span> : null}
            </AlertDescription>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setDismissOpen(true)} aria-label="Скрыть знакомство">
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </Alert>

      <AlertDialog open={dismissOpen} onOpenChange={setDismissOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Завершить знакомство?</AlertDialogTitle>
            <AlertDialogDescription>
              Это завершит знакомство с сервисом. Подсказки больше не появятся, но все разделы останутся доступны.
              {dismissErrorMessage ? <span className="mt-2 block text-destructive">{dismissErrorMessage}</span> : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Продолжить знакомство</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(event) => {
                event.preventDefault();
                void dismiss();
              }}
            >
              {saving ? "Сохраняем…" : "Завершить знакомство"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
