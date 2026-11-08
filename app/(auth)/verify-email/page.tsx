"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";

import {
  clearVerificationContext,
  getExpectedVerificationContextId,
  loadVerificationContext,
  resendVerificationEmail,
  syncExpectedVerificationContextId,
} from "@/lib/auth/verification-context.client";
import { emailVerificationLinkLifetimeCopy } from "@/lib/auth/email-verification.constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatMinutesAndSeconds } from "@/lib/utils";

const VERIFICATION_CONTEXT_POLL_MS = 15_000;
const VERIFICATION_CONTEXT_MISMATCH_NOTICE =
  "В другой вкладке начата новая регистрация. Показан актуальный email для подтверждения.";
const VERIFICATION_CONTEXT_MISSING_MESSAGE =
  "Не нашли активное подтверждение в этом браузере. Если email уже подтверждён, войдите в аккаунт. Если нет — зарегистрируйтесь снова с тем же email и запросите новое письмо.";
const VERIFICATION_CONTEXT_LOAD_ERROR = "Не удалось обновить данные подтверждения. Попробуйте ещё раз.";
const EMAIL_CONFIRMED_MESSAGE = "Email подтверждён. Теперь можно войти.";

function isContextRefreshError(message: string) {
  return message === VERIFICATION_CONTEXT_MISSING_MESSAGE || message === VERIFICATION_CONTEXT_LOAD_ERROR;
}

function VerifyEmailPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackError = useMemo(() => (searchParams.get("error") ?? "").trim(), [searchParams]);
  const signupReason = useMemo(() => (searchParams.get("reason") ?? "").trim(), [searchParams]);
  const isMountedRef = useRef(true);
  const refreshInFlightRef = useRef(false);
  const emailConfirmedRef = useRef(false);

  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [noticeMessage, setNoticeMessage] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isEmailConfirmed, setIsEmailConfirmed] = useState(false);

  const refreshVerificationContext = useCallback(async () => {
    if (emailConfirmedRef.current) return;
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;

    try {
      const context = await loadVerificationContext();
      if (!isMountedRef.current) return;

      if (context.status === "confirmed") {
        emailConfirmedRef.current = true;
        setIsEmailConfirmed(true);
        syncExpectedVerificationContextId(null);
        setEmail("");
        setCooldownLeft(0);
        setError("");
        setNoticeMessage("");
        setSuccessMessage(EMAIL_CONFIRMED_MESSAGE);
        return;
      }

      const expectedContextId = getExpectedVerificationContextId();
      if (context.contextId && expectedContextId && context.contextId !== expectedContextId) {
        setNoticeMessage(VERIFICATION_CONTEXT_MISMATCH_NOTICE);
      }
      syncExpectedVerificationContextId(context.contextId);

      setEmail(context.email ?? "");
      setCooldownLeft(Math.max(0, context.cooldownLeftSeconds));
      if (!context.email) {
        syncExpectedVerificationContextId(null);
        setError(VERIFICATION_CONTEXT_MISSING_MESSAGE);
        return;
      }

      setError((prev) => (isContextRefreshError(prev) ? "" : prev));
    } catch {
      if (!isMountedRef.current) return;
      setError(VERIFICATION_CONTEXT_LOAD_ERROR);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void refreshVerificationContext();

    const onFocus = () => {
      void refreshVerificationContext();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshVerificationContext();
      }
    };

    const pollInterval = window.setInterval(() => {
      void refreshVerificationContext();
    }, VERIFICATION_CONTEXT_POLL_MS);

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(pollInterval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshVerificationContext]);

  useEffect(() => {
    if (callbackError !== "invalid_or_expired") return;
    setError("Срок действия ссылки истёк. Запросите новое письмо.");
  }, [callbackError]);

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownLeft]);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      try {
        const response = await fetch("/api/auth/session", { method: "GET", cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as { user?: { email?: string } | null } | null;
        if (!mounted) return;
        if (response.ok && payload?.user) {
          await clearVerificationContext().catch(() => undefined);
          router.replace("/dashboard");
        }
      } catch {
        // Ignore on this non-critical check.
      }
    };

    void checkSession();
    return () => {
      mounted = false;
    };
  }, [router]);

  const resendDisabled = !email || isSending || cooldownLeft > 0;
  const isExistingUnconfirmedReason = signupReason === "existing_unconfirmed";

  const handleResend = async () => {
    if (!email || resendDisabled) return;
    setError("");
    setSuccessMessage("");
    setIsSending(true);

    try {
      const result = await resendVerificationEmail();
      if (!result.ok) {
        const serverError = result.error ?? "REQUEST_FAILED";
        if (serverError === "COOLDOWN" && typeof result.cooldownLeftSeconds === "number") {
          setCooldownLeft(result.cooldownLeftSeconds);
          setError(`Повторная отправка доступна через ${result.cooldownLeftSeconds}с.`);
        } else if (serverError === "RATE_LIMIT" && typeof result.retryAfterSeconds === "number") {
          setError(`Слишком много попыток. Попробуйте через ${formatMinutesAndSeconds(result.retryAfterSeconds)}.`);
        } else if (serverError === "CONTEXT_MISSING") {
          setError(VERIFICATION_CONTEXT_MISSING_MESSAGE);
          setEmail("");
          syncExpectedVerificationContextId(null);
        } else {
          setError("Не удалось отправить письмо подтверждения");
        }
        toast.error("Не удалось отправить письмо");
        return;
      }

      setSuccessMessage(`Письмо отправлено повторно. Проверьте входящие и папку "Спам". ${emailVerificationLinkLifetimeCopy}`);
      setCooldownLeft(result.cooldownLeftSeconds ?? 0);
      toast.success("Письмо отправлено");
    } catch {
      setError("Не удалось отправить письмо подтверждения");
      toast.error("Не удалось отправить письмо");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="container mx-auto flex min-h-screen items-center justify-center py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <MailCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-2xl font-bold">{isEmailConfirmed ? "Email подтверждён" : "Проверьте почту"}</CardTitle>
          </div>
          <CardDescription>
            {isEmailConfirmed
              ? EMAIL_CONFIRMED_MESSAGE
              : email
                ? `Email ${email} ожидает подтверждения. Откройте последнее письмо или запросите новое. ${emailVerificationLinkLifetimeCopy}`
                : `Email ожидает подтверждения. Откройте последнее письмо или запросите новое. ${emailVerificationLinkLifetimeCopy}`}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {!isEmailConfirmed && isExistingUnconfirmedReason ? (
            <Alert>
              <AlertDescription>
                Этот email уже зарегистрирован, но пока не подтверждён. Проверьте почту или запросите новое письмо.
                Если не получается войти, откройте{" "}
                <Link href="/forgot-password" className="text-primary hover:underline">
                  восстановление пароля
                </Link>
                .
              </AlertDescription>
            </Alert>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {successMessage ? (
            <Alert>
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          ) : null}

          {noticeMessage ? (
            <Alert>
              <AlertDescription>{noticeMessage}</AlertDescription>
            </Alert>
          ) : null}

          {!isEmailConfirmed && email ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{email}</div>
          ) : null}
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          {isEmailConfirmed ? (
            <Button asChild className="w-full">
              <Link href="/login">Войти</Link>
            </Button>
          ) : (
            <Button type="button" className="w-full" disabled={resendDisabled} onClick={handleResend}>
              {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {cooldownLeft > 0 ? `Отправить повторно через ${cooldownLeft}с` : "Отправить повторно"}
            </Button>
          )}

          {!isEmailConfirmed ? (
            <div className="text-sm text-center text-muted-foreground">
            Уже подтвердили email?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Войти
              </Link>
            </div>
          ) : null}

          <div className="text-sm text-center text-muted-foreground">
            Нет аккаунта?{" "}
            <Link href="/signup" className="text-primary hover:underline">
              Зарегистрироваться
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

function VerifyEmailFallback() {
  return (
    <div className="container mx-auto flex min-h-screen items-center justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyEmailFallback />}>
      <VerifyEmailPageContent />
    </Suspense>
  );
}
