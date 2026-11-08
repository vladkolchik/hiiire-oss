"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";

import { loadPasswordResetContext } from "@/lib/auth/password-reset-context.client";
import { getPasswordResetRequestErrorMessage } from "@/lib/auth/user-facing-errors";
import { formatMinutesAndSeconds } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CONTEXT_POLL_MS = 15_000;

type PasswordResetRequestResult = {
  ok: boolean;
  maskedEmail?: string;
  cooldownLeftSeconds?: number;
  retryAfterSeconds?: number;
  error?: string;
  message?: string;
};

function readPositiveSeconds(value: unknown) {
  return typeof value === "number" ? Math.max(0, Math.floor(value)) : undefined;
}

async function submitPasswordReset(email: string): Promise<PasswordResetRequestResult> {
  const res = await fetch("/api/auth/password-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim() }),
  });

  const json = (await res.json().catch(() => null)) as {
    error?: unknown;
    message?: unknown;
    maskedEmail?: unknown;
    cooldownLeftSeconds?: unknown;
    retryAfterSeconds?: unknown;
  } | null;

  if (res.ok) {
    return {
      ok: true,
      maskedEmail: typeof json?.maskedEmail === "string" ? json.maskedEmail : undefined,
      cooldownLeftSeconds: readPositiveSeconds(json?.cooldownLeftSeconds) ?? 0,
    };
  }

  const error = typeof json?.error === "string" ? json.error : "REQUEST_FAILED";
  const responseMessage = typeof json?.message === "string" ? json.message.trim() : "";
  return {
    ok: false,
    error,
    message: responseMessage ? getPasswordResetRequestErrorMessage({ error, message: responseMessage }) : undefined,
    cooldownLeftSeconds: readPositiveSeconds(json?.cooldownLeftSeconds),
    retryAfterSeconds: readPositiveSeconds(json?.retryAfterSeconds),
  };
}

function maskEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const [localPart = "", domainPart = ""] = normalized.split("@");
  if (!localPart || !domainPart) return normalized;

  const [domainName = "", tld = ""] = domainPart.split(".");
  const maskedLocal = localPart.length <= 2 ? `${localPart[0] ?? "*"}*` : `${localPart.slice(0, 2)}***`;
  const maskedDomain = domainName.length <= 2 ? `${domainName[0] ?? "*"}*` : `${domainName.slice(0, 2)}***`;
  return tld ? `${maskedLocal}@${maskedDomain}.${tld}` : `${maskedLocal}@${maskedDomain}`;
}

function ForgotPasswordPageContent() {
  const searchParams = useSearchParams();
  const callbackError = useMemo(() => (searchParams.get("error") ?? "").trim(), [searchParams]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [retryAfterText, setRetryAfterText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [hasRequested, setHasRequested] = useState(false);

  const refreshContext = useCallback(async () => {
    try {
      const context = await loadPasswordResetContext();
      if (!context.email) {
        setCooldownLeft(0);
        setMaskedEmail("");
        return;
      }

      setHasRequested(true);
      setMaskedEmail(context.maskedEmail ?? maskEmail(context.email));
      setCooldownLeft(Math.max(0, context.cooldownLeftSeconds));
    } catch {
      // Ignore non-critical refresh errors.
    }
  }, []);

  useEffect(() => {
    void refreshContext();

    const onFocus = () => {
      void refreshContext();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshContext();
      }
    };

    const interval = window.setInterval(() => {
      void refreshContext();
    }, CONTEXT_POLL_MS);

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshContext]);

  useEffect(() => {
    if (callbackError !== "invalid_or_expired") return;
    setRetryAfterText("");
    setError("Ссылка восстановления недействительна или истекла. Запросите новую.");
  }, [callbackError]);

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownLeft]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setError("");
    setRetryAfterText("");
    setIsLoading(true);

    try {
      const result = await submitPasswordReset(email);
      if (!result.ok) {
        if (result.message) {
          setError(result.message);
          toast.error("Не удалось отправить ссылку", { description: result.message });
          return;
        }

        const serverError = result.error ?? "REQUEST_FAILED";
        if (serverError === "COOLDOWN" && typeof result.cooldownLeftSeconds === "number") {
          const message = `Повторный запрос доступен через ${result.cooldownLeftSeconds}с.`;
          setCooldownLeft(result.cooldownLeftSeconds);
          setError(message);
          toast.error("Не удалось отправить ссылку", { description: message });
        } else if (serverError === "RATE_LIMIT" && typeof result.retryAfterSeconds === "number") {
          setRetryAfterText(formatMinutesAndSeconds(result.retryAfterSeconds));
          setError("Слишком много попыток.");
          toast.error("Не удалось отправить ссылку", {
            description: `Попробуйте через ${formatMinutesAndSeconds(result.retryAfterSeconds)}.`,
          });
        } else if (serverError === "SUPABASE_RATE_LIMIT") {
          const message = getPasswordResetRequestErrorMessage({ error: "SUPABASE_RATE_LIMIT" });
          setError(message);
          toast.error("Не удалось отправить ссылку", { description: message });
        } else {
          const message = getPasswordResetRequestErrorMessage({ error: "REQUEST_FAILED" });
          setError(message);
          toast.error("Не удалось отправить ссылку", { description: message });
        }
        return;
      }

      setHasRequested(true);
      setMaskedEmail(result.maskedEmail ?? maskEmail(email));
      setCooldownLeft(result.cooldownLeftSeconds ?? 0);
      toast.success("Запрос отправлен");
    } catch {
      const message = getPasswordResetRequestErrorMessage({ error: "REQUEST_FAILED" });
      setError(message);
      toast.error("Не удалось отправить ссылку", { description: message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto flex min-h-screen items-center justify-center py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <MailCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-2xl font-bold">Восстановление пароля</CardTitle>
          </div>
          <CardDescription>Введите email, и мы отправим ссылку для сброса пароля.</CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <CardContent className="space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {error}
                  {retryAfterText ? (
                    <>
                      <br />
                      Попробуйте через{" "}
                      <span className="whitespace-nowrap">{retryAfterText}.</span>
                    </>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}

            {hasRequested ? (
              <Alert>
                <AlertDescription>
                  Если аккаунт существует, мы отправили ссылку для восстановления пароля
                  {maskedEmail ? ` на ${maskedEmail}` : ""}.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="hr@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isLoading || cooldownLeft > 0}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {cooldownLeft > 0 ? `Повторить через ${cooldownLeft}с` : "Отправить ссылку"}
            </Button>

            <div className="text-sm text-center text-muted-foreground">
              Вспомнили пароль?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Войти
              </Link>
            </div>

            <div className="text-sm text-center text-muted-foreground">
              Нет аккаунта?{" "}
              <Link href="/signup" className="text-primary hover:underline">
                Зарегистрироваться
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

function ForgotPasswordFallback() {
  return (
    <div className="container mx-auto flex min-h-screen items-center justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<ForgotPasswordFallback />}>
      <ForgotPasswordPageContent />
    </Suspense>
  );
}
