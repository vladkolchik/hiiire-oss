"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, CheckCircle2, ArrowLeft, ExternalLink } from "lucide-react";
import { readUserFacingApiErrorMessage } from "@/lib/api/user-facing-errors";
import { getEnterpriseRequestStatusContent } from "@/lib/leads/enterprise-request";
import { toast } from "sonner";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { applyEmailInputValidity, EMAIL_INPUT_PATTERN, isEmailLike } from "@/lib/validation/email";
import { getPhoneValidationMessage, PHONE_MAX_LENGTH, sanitizePhoneInput } from "@/lib/validation/phone";

const PLANERKA_BOOKING_URL = "https://planerka.app/hiiire-com/30min";
const PLANERKA_EMBED_SCRIPT_SRC = "https://planerka.app/meet/assets/external/embed.js";
const CALENDAR_LOAD_TIMEOUT_MS = 15_000;
const CALENDAR_READY_FALLBACK_MS = 1_200;
const CALENDAR_MIN_SPINNER_MS = 2_000;
const DASHBOARD_SETTINGS_PLAN_SOURCE = "dashboard-settings-plan";
const LEAD_PHONE_MIN_DIGITS = 10;

type RequestAccessSource = typeof DASHBOARD_SETTINGS_PLAN_SOURCE | null;
type SuccessCta = {
  href: string;
  label: string;
};
type SuccessState = {
  title: string;
  description: string;
  cta: SuccessCta;
};
type ExitCta = {
  href: string;
  label: string;
};
type EnterpriseLeadDto = {
  status: "new" | "contacted" | "qualified" | "rejected";
  decisionNote: string | null;
  createdAt: string;
  handledAt: string | null;
};
type BillingRequestDto = {
  statusDescription?: string | null;
};

const SETTINGS_PLAN_CTA: SuccessCta = {
  href: "/dashboard/settings?tab=plan",
  label: "Вернуться к настройкам",
};
const ADMIN_BILLING_REQUEST_ERROR = "PLAN_CHANGE_REQUIRES_ADMIN";
const PLAN_ALREADY_ACTIVE_ERROR = "PLAN_ALREADY_ACTIVE";
const BILLING_REQUEST_SUCCESS_DESCRIPTION = "Мы получили заявку. Статус можно проверить в настройках тарифа.";
const PLAN_ALREADY_ACTIVE_DESCRIPTION = "Тариф Enterprise уже активен. Изменить условия можно в настройках тарифа.";
const AUTHENTICATED_ENTERPRISE_REQUEST_DESCRIPTION =
  "Оставьте заявку, и мы рассмотрим подключение корпоративного тарифа на индивидуальных условиях для вашей компании.";
const DEFAULT_REQUEST_ACCESS_DESCRIPTION =
  "Заполните форму, и мы свяжемся с вами для предоставления доступа к платформе";
const ADMIN_BILLING_REQUEST_MESSAGE =
  "Заявку на изменение тарифа может отправить администратор компании.";

function getPrefillName(rawName: string | undefined, email: string | undefined) {
  const name = (rawName ?? "").trim();
  if (!name) return "";
  if (name.toLowerCase() === "user") return "";
  if (isEmailLike(name)) return "";
  if (email && name.toLowerCase() === email.trim().toLowerCase()) return "";
  return name;
}

function getPrefillCompany(rawCompany: string | undefined) {
  const company = (rawCompany ?? "").trim();
  if (!company) return "";
  if (company.toLowerCase() === "компания") return "";
  return company;
}

function getRequestAccessSource(rawSource: string | null): RequestAccessSource {
  return rawSource === DASHBOARD_SETTINGS_PLAN_SOURCE ? DASHBOARD_SETTINGS_PLAN_SOURCE : null;
}

function getSuccessCta({
  requestedPlan,
  source,
}: {
  requestedPlan: "starter" | "professional" | "enterprise";
  source: RequestAccessSource;
}): SuccessCta {
  if (requestedPlan === "enterprise" && source === DASHBOARD_SETTINGS_PLAN_SOURCE) {
    return {
      href: "/dashboard/settings?tab=plan",
      label: "Вернуться к тарифам",
    };
  }

  return {
    href: "/",
    label: "На главную",
  };
}

function getExitCta({
  requestedPlan,
  source,
}: {
  requestedPlan: "starter" | "professional" | "enterprise";
  source: RequestAccessSource;
}): ExitCta {
  if (requestedPlan === "enterprise" && source === DASHBOARD_SETTINGS_PLAN_SOURCE) {
    return {
      href: "/dashboard/settings?tab=plan",
      label: "Вернуться к тарифам",
    };
  }

  if (requestedPlan === "enterprise") {
    return {
      href: "/#pricing",
      label: "Вернуться к тарифам",
    };
  }

  return {
    href: "/",
    label: "На главную",
  };
}

function getLeadRequestErrorMessage(json: unknown) {
  return readUserFacingApiErrorMessage(json, "Проверьте поля заявки.");
}

function RequestAccessPageContent() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const searchParams = useSearchParams();
  const isDemoMode = searchParams.get("demo") === "true";
  const rawPlan = useMemo(() => (searchParams.get("plan") ?? "").toLowerCase(), [searchParams]);
  const requestedPlan = useMemo<"starter" | "professional" | "enterprise">(() => {
    if (rawPlan === "starter" || rawPlan === "professional" || rawPlan === "enterprise") return rawPlan;
    return "enterprise";
  }, [rawPlan]);
  const source = useMemo(
    () => getRequestAccessSource(searchParams.get("source")),
    [searchParams]
  );
  const successCta = useMemo(
    () => getSuccessCta({ requestedPlan, source }),
    [requestedPlan, source]
  );
  const exitCta = useMemo(
    () => getExitCta({ requestedPlan, source }),
    [requestedPlan, source]
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successState, setSuccessState] = useState<SuccessState | null>(null);
  const [error, setError] = useState("");
  const [enterpriseLead, setEnterpriseLead] = useState<EnterpriseLeadDto | null>(null);
  const [isEnterpriseLeadLoading, setIsEnterpriseLeadLoading] = useState(false);
  const [isCalendarReady, setIsCalendarReady] = useState(false);
  const [calendarLoadTimedOut, setCalendarLoadTimedOut] = useState(false);
  const [isMinSpinnerElapsed, setIsMinSpinnerElapsed] = useState(false);
  const embedContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isDemoMode) return;

    let isDisposed = false;
    let isReady = false;
    let loadTimeoutId: number | undefined;
    let readyFallbackTimeoutId: number | undefined;
    let minSpinnerTimeoutId: number | undefined;
    let observer: MutationObserver | null = null;
    let watchedIframe: HTMLIFrameElement | null = null;

    const markReady = () => {
      if (isDisposed || isReady) return;
      isReady = true;
      setIsCalendarReady(true);
      setCalendarLoadTimedOut(false);
      if (loadTimeoutId !== undefined) window.clearTimeout(loadTimeoutId);
      if (readyFallbackTimeoutId !== undefined) window.clearTimeout(readyFallbackTimeoutId);
    };

    const markTimedOut = () => {
      if (isDisposed || isReady) return;
      setCalendarLoadTimedOut(true);
    };

    const handleIframeLoad = () => {
      markReady();
    };

    const watchIframe = (iframe: HTMLIFrameElement | null) => {
      if (!iframe || watchedIframe === iframe) return;

      if (watchedIframe) {
        watchedIframe.removeEventListener("load", handleIframeLoad);
      }

      watchedIframe = iframe;
      watchedIframe.addEventListener("load", handleIframeLoad, { once: true });

      if (readyFallbackTimeoutId !== undefined) window.clearTimeout(readyFallbackTimeoutId);
      readyFallbackTimeoutId = window.setTimeout(() => {
        if (!isDisposed && !isReady) {
          markReady();
        }
      }, CALENDAR_READY_FALLBACK_MS);
    };

    const tryAttachIframe = () => {
      const iframe = embedContainerRef.current?.querySelector("iframe") ?? null;
      watchIframe(iframe);
    };

    setIsCalendarReady(false);
    setCalendarLoadTimedOut(false);
    setIsMinSpinnerElapsed(false);

    minSpinnerTimeoutId = window.setTimeout(() => {
      if (!isDisposed) {
        setIsMinSpinnerElapsed(true);
      }
    }, CALENDAR_MIN_SPINNER_MS);

    const script = document.createElement("script");
    script.src = PLANERKA_EMBED_SCRIPT_SRC;
    script.async = true;
    script.onload = tryAttachIframe;
    script.onerror = markTimedOut;
    document.body.appendChild(script);

    tryAttachIframe();

    const container = embedContainerRef.current;
    if (container) {
      observer = new MutationObserver(() => {
        tryAttachIframe();
      });
      observer.observe(container, { childList: true, subtree: true });
    }

    loadTimeoutId = window.setTimeout(() => {
      markTimedOut();
    }, CALENDAR_LOAD_TIMEOUT_MS);

    return () => {
      isDisposed = true;
      if (observer) observer.disconnect();
      if (watchedIframe) watchedIframe.removeEventListener("load", handleIframeLoad);
      if (loadTimeoutId !== undefined) window.clearTimeout(loadTimeoutId);
      if (readyFallbackTimeoutId !== undefined) window.clearTimeout(readyFallbackTimeoutId);
      if (minSpinnerTimeoutId !== undefined) window.clearTimeout(minSpinnerTimeoutId);
      script.remove();
    };
  }, [isDemoMode]);

  const isCalendarLoading =
    isDemoMode && !calendarLoadTimedOut && (!isCalendarReady || !isMinSpinnerElapsed);
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    companySize: "",
    message: "",
  });
  const prefilledUserIdRef = useRef<string | null>(null);
  const isAuthenticated = Boolean(user);
  const shouldCheckEnterpriseLeadStatus = requestedPlan === "enterprise" && !isAuthenticated;
  const enterpriseLeadStatus = useMemo(
    () =>
      shouldCheckEnterpriseLeadStatus
        ? getEnterpriseRequestStatusContent(
            enterpriseLead
              ? {
                  status: enterpriseLead.status,
                  decision_note: enterpriseLead.decisionNote,
                }
              : null
          )
        : null,
    [enterpriseLead, shouldCheckEnterpriseLeadStatus]
  );
  const isEnterpriseLeadBlockingSubmit = Boolean(
    requestedPlan === "enterprise" &&
      enterpriseLeadStatus &&
      !enterpriseLeadStatus.canResubmit
  );
  const isEnterpriseLeadStatusPending = Boolean(
      requestedPlan === "enterprise" &&
      shouldCheckEnterpriseLeadStatus &&
      !isAuthLoading &&
      isEnterpriseLeadLoading
  );

  useEffect(() => {
    if (isAuthLoading || !user) return;
    if (prefilledUserIdRef.current === user.id) return;

    const prefillName = getPrefillName(user.name, user.email);
    const prefillEmail = (user.email ?? "").trim();
    const prefillPhone = (user.phone ?? "").trim();
    const prefillCompany = getPrefillCompany(user.company);

    setFormData((prev) => ({
      ...prev,
      name: prev.name || prefillName,
      email: prev.email || prefillEmail,
      phone: prev.phone || prefillPhone,
      company: prev.company || prefillCompany,
    }));

    prefilledUserIdRef.current = user.id;
  }, [isAuthLoading, user]);

  useEffect(() => {
    if (!shouldCheckEnterpriseLeadStatus) {
      setEnterpriseLead(null);
      setIsEnterpriseLeadLoading(false);
      return;
    }

    if (isAuthLoading) {
      return;
    }

    if (!user) {
      setEnterpriseLead(null);
      setIsEnterpriseLeadLoading(false);
      return;
    }

    let isDisposed = false;
    setIsEnterpriseLeadLoading(true);

    void fetch("/api/leads?requestedPlan=enterprise", { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { lead?: EnterpriseLeadDto | null } | null;
        if (isDisposed) return;
        if (!res.ok) {
          setEnterpriseLead(null);
          return;
        }
        setEnterpriseLead(json?.lead ?? null);
      })
      .catch(() => {
        if (!isDisposed) {
          setEnterpriseLead(null);
        }
      })
      .finally(() => {
        if (!isDisposed) {
          setIsEnterpriseLeadLoading(false);
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [isAuthLoading, shouldCheckEnterpriseLeadStatus, user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const nextValue = e.target.name === "phone" ? sanitizePhoneInput(e.target.value) : e.target.value;
    setFormData(prev => ({
      ...prev,
      [e.target.name]: nextValue
    }));
  };

  const handleSelectChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      companySize: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (isEnterpriseLeadStatusPending) {
      const message = "Подождите немного: мы проверяем статус прошлой заявки.";
      setError(message);
      toast.error("Статус ещё загружается", { description: message });
      return;
    }

    if (isEnterpriseLeadBlockingSubmit && enterpriseLeadStatus) {
      setError(enterpriseLeadStatus.description);
      toast.error(enterpriseLeadStatus.title, { description: enterpriseLeadStatus.description });
      return;
    }

    const phoneError = getPhoneValidationMessage(formData.phone, { minDigits: LEAD_PHONE_MIN_DIGITS });
    if (phoneError) {
      setError(phoneError);
      toast.error("Проверьте телефон", { description: phoneError });
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: formData.name,
          email: formData.email,
          phone: formData.phone,
          company: formData.company,
          companySize: formData.companySize || undefined,
          message: formData.message || undefined,
          requestedPlan,
        }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        const validationMessage = getLeadRequestErrorMessage(json);
        if (
          res.status === 403 &&
          (String(json?.error) === ADMIN_BILLING_REQUEST_ERROR ||
            String(json?.error) === "ENTERPRISE_REQUIRES_ADMIN")
        ) {
          throw new Error(ADMIN_BILLING_REQUEST_MESSAGE);
        }
        if (res.status === 409 && String(json?.error) === PLAN_ALREADY_ACTIVE_ERROR) {
          setSuccessState({
            title: "Enterprise уже подключён",
            description: PLAN_ALREADY_ACTIVE_DESCRIPTION,
            cta: SETTINGS_PLAN_CTA,
          });
          setIsSuccess(true);
          toast.success("Enterprise уже подключён");
          return;
        }
        if (res.status === 409 && String(json?.error) === "DUPLICATE_EMAIL") {
          throw new Error(validationMessage || "Заявка уже отправлена");
        }
        if (res.status === 400 && String(json?.error) === "INVALID_BODY" && validationMessage) {
          throw new Error(validationMessage);
        }
        throw new Error("Ошибка отправки заявки");
      }
      if (json?.request && typeof json.request === "object") {
        const request = json.request as BillingRequestDto;
        const description = request.statusDescription?.trim() || BILLING_REQUEST_SUCCESS_DESCRIPTION;
        setSuccessState({
          title: "Заявка на изменение тарифа отправлена",
          description,
          cta: SETTINGS_PLAN_CTA,
        });
        setIsSuccess(true);
        toast.success("Заявка на изменение тарифа отправлена");
        return;
      }
      
      if (requestedPlan === "enterprise") {
        setEnterpriseLead({
          status: "new",
          decisionNote: null,
          createdAt: new Date().toISOString(),
          handledAt: null,
        });
      }
      setSuccessState(null);
      setIsSuccess(true);
      toast.success("Заявка успешно отправлена!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ошибка отправки заявки";
      setError(message);
      toast.error("Не удалось отправить заявку", { description: message });
    } finally {
      setIsLoading(false);
    }
  };

  if (isDemoMode) {
    return (
      <div className="container py-10 sm:py-16">
        <div className="mx-auto max-w-5xl">
          <Card className="border-primary/20">
            <CardHeader className="space-y-3">
              <CardTitle className="text-2xl font-bold sm:text-3xl">Запись на демо</CardTitle>
              <CardDescription className="text-sm sm:text-base">
                Выберите удобное время, и мы проведем 30-минутную демонстрацию hiiire.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="app-planerka-embed"
                data-planerka-embed="default"
                data-planerka-url="https://planerka.app/meet"
                data-planerka-user="hiiire-com"
                data-planerka-event="30min"
                data-planerka-bg="transparent"
                data-planerka-shadow="none"
                style={{ width: "100%", minHeight: "720px" }}
              />

              <p className="text-xs text-muted-foreground sm:text-sm">
                Предпочитаете открыть календарь в новой вкладке?{" "}
                <Link
                  href={PLANERKA_BOOKING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline underline-offset-4 hover:no-underline"
                >
                  Перейти к записи
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="container mx-auto flex min-h-screen items-center justify-center py-16">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-bold">{successState?.title ?? "Заявка отправлена!"}</CardTitle>
            <CardDescription>
              {successState?.description ?? "Спасибо за ваш интерес к hiiire. Мы свяжемся с вами в ближайшее время."}
            </CardDescription>
          </CardHeader>
          {successState ? null : (
            <CardContent className="space-y-4">
              <Alert>
                <AlertDescription className="text-sm">
                  <strong>Что дальше?</strong><br />
                  Наша команда рассмотрит вашу заявку и отправит вам письмо с инструкциями по доступу к платформе.
                  Обычно это занимает 1-2 рабочих дня.
                </AlertDescription>
              </Alert>
            </CardContent>
          )}
          <CardFooter>
            <Button variant="outline" className="w-full" asChild>
              <Link href={(successState?.cta ?? successCta).href}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {(successState?.cta ?? successCta).label}
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto flex min-h-screen items-center justify-center py-16">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <Button variant="ghost" size="sm" className="-ml-2 w-fit px-2" asChild>
            <Link href={exitCta.href}>
              <ArrowLeft className="h-4 w-4" />
              {exitCta.label}
            </Link>
          </Button>
          <CardTitle className="text-2xl font-bold">Оставить заявку</CardTitle>
          <CardDescription>
            {isAuthenticated && requestedPlan === "enterprise"
              ? AUTHENTICATED_ENTERPRISE_REQUEST_DESCRIPTION
              : DEFAULT_REQUEST_ACCESS_DESCRIPTION}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {enterpriseLeadStatus ? (
              <Alert variant={enterpriseLeadStatus.tone === "destructive" ? "destructive" : undefined}>
                <AlertDescription className="text-sm">
                  <strong>{enterpriseLeadStatus.title}</strong>
                  <br />
                  {enterpriseLeadStatus.description}
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="name">Имя и Фамилия *</Label>
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
              <Label htmlFor="email">Email *</Label>
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
                maxLength={200}
                required
                readOnly={isAuthenticated}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Телефон *</Label>
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
              <Label htmlFor="company">Компания *</Label>
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
              <Label htmlFor="companySize">Размер компании</Label>
              <Select 
                value={formData.companySize} 
                onValueChange={handleSelectChange}
                disabled={isLoading}
              >
                <SelectTrigger id="companySize">
                  <SelectValue placeholder="Выберите размер" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-10">1-10 сотрудников</SelectItem>
                  <SelectItem value="11-50">11-50 сотрудников</SelectItem>
                  <SelectItem value="51-200">51-200 сотрудников</SelectItem>
                  <SelectItem value="201-500">201-500 сотрудников</SelectItem>
                  <SelectItem value="500+">500+ сотрудников</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Сообщение (опционально)</Label>
              <Textarea
                id="message"
                name="message"
                placeholder="Расскажите немного о ваших потребностях в подборе персонала..."
                value={formData.message}
                onChange={handleChange}
                maxLength={2000}
                disabled={isLoading}
                rows={4}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button
              type="submit"
              className="w-full"
              disabled={
                isLoading ||
                isEnterpriseLeadBlockingSubmit ||
                isEnterpriseLeadStatusPending
              }
            >
              {(isLoading || isEnterpriseLeadStatusPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEnterpriseLeadStatusPending
                ? "Проверяем статус…"
                : enterpriseLeadStatus?.canResubmit
                ? enterpriseLeadStatus.submitLabel
                : "Отправить заявку"}
            </Button>

            <Button type="button" variant="outline" className="w-full" asChild>
              <Link href={exitCta.href}>{exitCta.label}</Link>
            </Button>

            {isAuthLoading ? null : isAuthenticated ? (
              <div className="text-sm text-center text-muted-foreground">
                Вы вошли как {user?.email}.{" "}
                <Link href="/dashboard" className="text-primary hover:underline">
                  Перейти в дашборд
                </Link>
              </div>
            ) : (
              <div className="text-sm text-center text-muted-foreground">
                Уже есть аккаунт?{" "}
                <Link href="/login" className="text-primary hover:underline">
                  Войти
                </Link>
              </div>
            )}

            <div className="text-xs text-center text-muted-foreground">
              Отправляя заявку, вы соглашаетесь с{" "}
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
  );
}

function RequestAccessFallback() {
  return (
    <div className="container mx-auto flex min-h-screen items-center justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function RequestAccessPage() {
  return (
    <AuthProvider>
      <Suspense fallback={<RequestAccessFallback />}>
        <RequestAccessPageContent />
      </Suspense>
    </AuthProvider>
  );
}
