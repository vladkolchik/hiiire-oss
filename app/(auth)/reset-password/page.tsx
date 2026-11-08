"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LockKeyhole } from "lucide-react";
import { toast } from "sonner";

import { clearPasswordResetContext } from "@/lib/auth/password-reset-context.client";
import { getPasswordValidationMessage } from "@/lib/validation/password";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

type ResetState = "checking" | "ready" | "invalid";

function ResetPasswordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isRecoveryFlow = useMemo(() => searchParams.get("recovery") === "1", [searchParams]);

  const [state, setState] = useState<ResetState>("checking");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (!isRecoveryFlow) {
        if (mounted) setState("invalid");
        return;
      }

      try {
        const response = await fetch("/api/auth/session", { method: "GET", cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as { user?: unknown } | null;
        const contextResponse = await fetch("/api/auth/password-reset", { method: "GET", cache: "no-store" });
        const contextPayload = (await contextResponse.json().catch(() => null)) as {
          recoveryVerified?: boolean;
        } | null;
        if (!mounted) return;
        setState(response.ok && payload?.user && contextResponse.ok && contextPayload?.recoveryVerified ? "ready" : "invalid");
      } catch {
        if (mounted) setState("invalid");
      }
    };

    void init();
    return () => {
      mounted = false;
    };
  }, [isRecoveryFlow]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setError("");

    const passwordError = getPasswordValidationMessage(formData.password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }

    setIsLoading(true);
    try {
      if (state !== "ready") {
        setError("Ссылка восстановления недействительна или истекла.");
        return;
      }

      const response = await fetch("/api/auth/password-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: formData.password }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        setError(payload?.message ?? "Не удалось обновить пароль");
        toast.error("Не удалось обновить пароль");
        return;
      }

      await clearPasswordResetContext().catch(() => undefined);
      toast.success("Пароль обновлён");
      router.replace("/dashboard");
    } catch {
      setError("Не удалось обновить пароль");
      toast.error("Не удалось обновить пароль");
    } finally {
      setIsLoading(false);
    }
  };

  if (state === "checking") {
    return (
      <div className="container mx-auto flex min-h-screen items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state === "invalid") {
    return (
      <div className="container mx-auto flex min-h-screen items-center justify-center py-16">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl font-bold">Ссылка недействительна</CardTitle>
            <CardDescription>Сессия восстановления отсутствует или истекла.</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>Запросите новую ссылку восстановления пароля.</AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button asChild className="w-full">
              <Link href="/forgot-password">Запросить новую ссылку</Link>
            </Button>
            <div className="text-sm text-center text-muted-foreground">
              Вернуться к{" "}
              <Link href="/login" className="text-primary hover:underline">
                входу
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto flex min-h-screen items-center justify-center py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-5 w-5 text-primary" />
            <CardTitle className="text-2xl font-bold">Новый пароль</CardTitle>
          </div>
          <CardDescription>Введите новый пароль для вашего аккаунта.</CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <CardContent className="space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="password">Новый пароль</Label>
              <PasswordInput
                id="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                maxLength={72}
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Подтвердите пароль</Label>
              <PasswordInput
                id="confirmPassword"
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={(e) => setFormData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                maxLength={72}
                required
                disabled={isLoading}
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Обновить пароль
            </Button>
            <div className="text-sm text-center text-muted-foreground">
              Вернуться ко{" "}
              <Link href="/login" className="text-primary hover:underline">
                входу
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

function ResetPasswordFallback() {
  return (
    <div className="container mx-auto flex min-h-screen items-center justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordPageContent />
    </Suspense>
  );
}
