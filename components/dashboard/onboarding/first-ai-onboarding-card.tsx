"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { Brain, CheckCircle2, Loader2, X } from "lucide-react";

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { readUserFacingApiErrorMessage } from "@/lib/api/user-facing-errors";
import { FIRST_AI_ONBOARDING_REFRESH_TIMEOUT_MS } from "@/lib/onboarding/first-ai";
import type { FirstAiOnboardingProgress } from "@/lib/onboarding/first-ai";

type ApiResponse = {
  progress?: FirstAiOnboardingProgress;
};

async function patchOnboarding(action: "start_manual" | "start_hh" | "dismiss") {
  const res = await fetch("/api/onboarding/first-ai", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(readUserFacingApiErrorMessage(json, "Не удалось сохранить выбор. Попробуйте ещё раз."));
}

export function FirstAiOnboardingCard() {
  const router = useRouter();
  const [progress, setProgress] = useState<FirstAiOnboardingProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshTimedOut, setRefreshTimedOut] = useState(false);
  const refreshStartedAtRef = useRef<number | null>(null);
  const refreshScopeKeyRef = useRef<string | null>(null);

  const clearError = useCallback(() => setErrorMessage(null), []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/onboarding/first-ai", { method: "GET", cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiResponse | null;
      if (!res.ok || !json?.progress) {
        setErrorMessage(readUserFacingApiErrorMessage(json, "Не удалось обновить знакомство. Попробуйте ещё раз."));
        return;
      }
      setErrorMessage(null);
      setProgress(json.progress);
    } catch {
      setErrorMessage("Не удалось обновить знакомство. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
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

  if (loading) return null;

  if (!progress?.visible && errorMessage) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="break-words text-base">Не удалось обновить знакомство</CardTitle>
          <p className="mt-1 break-words text-sm text-muted-foreground">{errorMessage}</p>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => void load()}>
            Повторить
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!progress?.visible) return null;

  const pct = Math.round((progress.stepNumber / progress.totalSteps) * 100);
  const manualAction = progress.availableActions.find((action) => action.kind === "manual_start");
  const hhAction = progress.availableActions.find((action) => action.kind === "hh_start");
  const startActions = progress.availableActions.filter((action) => action.kind === "manual_start" || action.kind === "hh_start");
  const isTimedOutHhImport =
    refreshTimedOut && (progress.step === "hh_waiting" || (progress.step === "vacancy_ready" && progress.startedPath === "hh"));
  const shouldShowHhFallbackActions =
    progress.startedPath === "hh" && (progress.step === "hh_waiting" || progress.step === "hh_error" || progress.step === "hh_no_data");
  const displayTitle = isTimedOutHhImport ? "Загрузка занимает больше обычного" : progress.title || "Получите первый AI-анализ";
  const displayDescription = isTimedOutHhImport
    ? "HH.ru подключён, но вакансии и отклики ещё не появились. Можно открыть кандидатов, создать вакансию вручную или повторить подключение позже."
    : progress.description;

  async function startAndNavigate(event: MouseEvent<HTMLAnchorElement>, action: "start_manual" | "start_hh", href: string) {
    event.preventDefault();
    try {
      await patchOnboarding(action);
      clearError();
      if (href.startsWith("/api/")) window.location.assign(href);
      else router.push(href);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось сохранить выбор. Попробуйте ещё раз.");
    }
  }

  async function dismiss() {
    try {
      setSaving(true);
      await patchOnboarding("dismiss");
      clearError();
      setProgress(null);
      setDismissOpen(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось скрыть знакомство. Попробуйте ещё раз.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="space-y-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                {progress.step === "analysis_running" ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                ) : progress.step === "result_ready" ? (
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Brain className="h-5 w-5" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <CardTitle className="break-words text-base">{displayTitle}</CardTitle>
                <p className="mt-1 break-words text-sm text-muted-foreground">{displayDescription}</p>
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setDismissOpen(true)} aria-label="Скрыть знакомство">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {errorMessage ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <p className="break-words">{errorMessage}</p>
              <Button type="button" size="sm" variant="outline" className="mt-2 w-full sm:w-auto" onClick={() => void load()}>
                Повторить
              </Button>
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{progress.stepNumber}/4</span>
              <span>Первый AI-анализ</span>
            </div>
            <Progress value={pct} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {isTimedOutHhImport || shouldShowHhFallbackActions ? (
            progress.availableActions.map((action) => (
              <Button key={action.kind} asChild variant={action.kind === progress.primaryAction.kind ? "default" : "outline"} className="w-full sm:w-auto">
                <Link
                  href={action.href}
                  onClick={(event) => {
                    if (action.kind !== "manual_start" && action.kind !== "hh_start") return;
                    void startAndNavigate(event, action.kind === "manual_start" ? "start_manual" : "start_hh", action.href);
                  }}
                >
                  {action.label}
                </Link>
              </Button>
            ))
          ) : manualAction && hhAction ? (
            startActions.map((action) => (
              <Button key={action.kind} asChild variant={action.kind === progress.primaryAction.kind ? "default" : "outline"} className="w-full sm:w-auto">
                <Link
                  href={action.href}
                  onClick={(event) => void startAndNavigate(event, action.kind === "manual_start" ? "start_manual" : "start_hh", action.href)}
                >
                  {action.label}
                </Link>
              </Button>
            ))
          ) : (
            <Button asChild className="w-full sm:w-auto">
              <Link href={progress.primaryAction.href}>{progress.primaryAction.label}</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={dismissOpen} onOpenChange={setDismissOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Завершить знакомство?</AlertDialogTitle>
            <AlertDialogDescription>
              Это завершит знакомство с сервисом. Подсказки больше не появятся, но все разделы останутся доступны.
              {errorMessage ? <span className="mt-2 block text-destructive">{errorMessage}</span> : null}
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
