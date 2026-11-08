"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { emailVerificationLinkLifetimeCopy } from "@/lib/auth/email-verification.constants";
import { readMarketingAttribution } from "@/lib/marketing/attribution";
import { applyEmailInputValidity, EMAIL_INPUT_PATTERN } from "@/lib/validation/email";
import { getPasswordValidationMessage } from "@/lib/validation/password";
import { getPhoneValidationMessage, PHONE_MAX_LENGTH, sanitizePhoneInput } from "@/lib/validation/phone";

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const rawPlan = useMemo(() => (searchParams.get("plan") ?? "").toLowerCase(), [searchParams]);
  const isEnterpriseIntent = rawPlan === "enterprise";
  const intendedPlan: "starter" | "professional" = rawPlan === "professional" ? "professional" : "starter";

  useEffect(() => {
    if (!isEnterpriseIntent) return;
    router.replace("/request-access?plan=enterprise");
  }, [isEnterpriseIntent, router]);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    password: "",
    confirmPassword: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.name === "phone" ? sanitizePhoneInput(e.target.value) : e.target.value;
    setFormData(prev => ({
      ...prev,
      [e.target.name]: nextValue
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const name = formData.name.trim();
    const company = formData.company.trim();
    const phone = formData.phone.trim();
    const phoneError = getPhoneValidationMessage(phone);

    if (!name) {
      setError("Введите имя");
      return;
    }

    if (!company) {
      setError("Введите название компании");
      return;
    }

    if (phoneError) {
      setError(phoneError);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }

    const passwordError = getPasswordValidationMessage(formData.password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setIsLoading(true);

    try {
      if (isEnterpriseIntent) {
        router.replace("/request-access?plan=enterprise");
        return;
      }

      const result = await register({
        name,
        email: formData.email.trim(),
        phone,
        company,
        password: formData.password,
        intendedPlan,
        marketingAttribution: readMarketingAttribution(),
      });

      if (result.status === "email_confirmation_required") {
        if (result.reason === "existing_unconfirmed") {
          toast("Этот email уже зарегистрирован", {
            description: `Подтвердите почту или запросите новое письмо для входа. ${emailVerificationLinkLifetimeCopy}`,
          });
          router.replace("/verify-email?reason=existing_unconfirmed");
          return;
        }

        toast.success("Письмо отправлено", {
          description: emailVerificationLinkLifetimeCopy,
        });
        router.replace("/verify-email");
        return;
      }

      toast.success("Аккаунт создан");
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка регистрации");
      toast.error("Не удалось зарегистрироваться");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-4">
        <Button variant="ghost" className="px-0 text-muted-foreground hover:text-foreground" asChild>
          <Link href="/#pricing">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Вернуться к тарифам
          </Link>
        </Button>

        <Card className="w-full">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">Создать аккаунт</CardTitle>
            <CardDescription>
              Начните использовать hiiire бесплатно
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

            <div className="space-y-2">
              <Label htmlFor="name">Имя</Label>
              <Input
                id="name"
                name="name"
                type="text"
                placeholder="Анна Иванова"
                value={formData.name}
                onChange={handleChange}
                maxLength={200}
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                pattern={EMAIL_INPUT_PATTERN}
                placeholder="anna@company.com"
                value={formData.email}
                onChange={handleChange}
                onInput={(e) => applyEmailInputValidity(e.currentTarget)}
                onInvalid={(e) => applyEmailInputValidity(e.currentTarget)}
                maxLength={320}
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Телефон</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="+7 (999) 123-45-67"
                value={formData.phone}
                onChange={handleChange}
                maxLength={PHONE_MAX_LENGTH}
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="company">Компания</Label>
              <Input
                id="company"
                name="company"
                type="text"
                placeholder="Хайр Софт"
                value={formData.company}
                onChange={handleChange}
                maxLength={200}
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <PasswordInput
                id="password"
                name="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                maxLength={72}
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Подтвердите пароль</Label>
              <PasswordInput
                id="confirmPassword"
                name="confirmPassword"
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={handleChange}
                maxLength={72}
                required
                disabled={isLoading}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Создать аккаунт
            </Button>

            <div className="text-sm text-center text-muted-foreground">
              Уже есть аккаунт?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Войти
              </Link>
            </div>

            <div className="text-xs text-center text-muted-foreground">
              Регистрируясь, вы соглашаетесь с{" "}
              <Link href="/terms" className="text-primary hover:underline">
                условиями использования
              </Link>{" "}
              и{" "}
              <Link href="/privacy" className="text-primary hover:underline">
                политикой конфиденциальности
              </Link>
            </div>
          </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}

function SignupFallback() {
  return (
    <div className="container mx-auto flex min-h-screen items-center justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<SignupFallback />}>
      <SignupPageContent />
    </Suspense>
  );
}
