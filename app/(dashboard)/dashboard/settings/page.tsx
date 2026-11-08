"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeSettingsField } from "@/components/theme/theme-settings-field";
import { FirstAiContextualOnboardingHint } from "@/components/dashboard/onboarding/contextual-onboarding-hint";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Cable, Bell, User, Building, Save, ExternalLink, Check, X, CreditCard, Crown, Send, RefreshCw, Info } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { getEnterpriseRequestStatusContent } from "@/lib/leads/enterprise-request";
import { readCompanyApiErrorMessage } from "@/lib/company/validation";
import { getHhCallbackErrorMessage } from "@/lib/hh/callback";
import { getHhImportSyncState } from "@/lib/hh/sync-status";
import { readUserFacingApiErrorMessage } from "@/lib/api/user-facing-errors";
import {
  CREDIT_TOPUP_MAX_DIGITS,
  CREDIT_TOPUP_PRESETS,
  CREDIT_TOPUP_PRICE_KOPECKS,
  calculateCreditTopupAmountKopecks,
  parseCreditTopupQuantity,
} from "@/lib/billing/credit-topups";
import { getCurrentPlanStatusBadge, getPaidPlanButtonLabel, isMatchingScheduledPlan, type BillingStatus } from "@/lib/billing/status-display";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type PlanKey = "trial" | "starter" | "professional" | "enterprise";
type TrialState = "hidden" | "active" | "expiring" | "expired";
type PlanActionKind = "same" | "upgrade" | "downgrade" | "subscribe";
type BillablePlan = "starter" | "professional";
type PlanChangeRequestTarget = "starter" | "professional" | "enterprise";

function planLabel(p: PlanKey) {
  return p === "trial" ? "Пробный" : p === "starter" ? "Starter" : p === "professional" ? "Professional" : "Enterprise";
}

type CreditsDto = {
  balance: number;
  reserved: number;
  available: number;
};

type TelegramStatusDto =
  | { connected: false }
  | { connected: true; chatId: number; connectedAt: string; telegramEnabled: boolean };

type EmailStatusDto = {
  email: string | null;
  emailEnabled: boolean;
};

type CompanyDto = {
  id: string;
  name: string;
  industry: string | null;
  size: string | null;
  description: string | null;
  website: string | null;
  logoUrl: string | null;
  updatedAt: string | null;
};

type CompanyEmployeeDto = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "hr" | "recruiter";
};

type HhStatusDto =
  | {
      isConnected: false;
      disconnectReason?: string;
      disconnectAt?: string;
    }
  | {
      isConnected: true;
      connectedAt: string;
      lastSyncedAt: string | null;
      syncStartedAt: string | null;
      syncLockExpiresAt: string | null;
      lastSyncErrorAt: string | null;
      hasLastSyncError: boolean;
      tokenExpiresAt: string | null;
      employerName?: string;
      host?: string;
      disconnectReason?: string;
      disconnectAt?: string;
    };

type HhSyncCandidatesMode = "new_only" | "new_and_update";
type HhSyncPreviewDto = {
  newCount: number;
  updatableCount: number;
  totalCandidatesSeen: number;
  vacanciesChecked: number;
};

type CheckoutResultStatus = "pending" | "completed" | "failed" | "refunded" | "requires_review";
type CheckoutResultDto = {
  invId: number;
  paymentId: string;
  status: CheckoutResultStatus;
  plan: PlanKey;
  amount: number;
  periodStart: string | null;
  periodEnd: string | null;
  completedAt: string | null;
  failedAt: string | null;
  failReason: string | null;
};
type CreditTopupResultDto = {
  invId: number;
  paymentId: string;
  status: CheckoutResultStatus;
  credits: number;
  amount: number;
  completedAt: string | null;
  failedAt: string | null;
  failReason: string | null;
};

type EnterpriseLeadDto = {
  status: "new" | "contacted" | "qualified" | "rejected";
  decisionNote: string | null;
  createdAt: string;
  handledAt: string | null;
};

type PlanChangeRequestDto = {
  id: string;
  currentPlan: PlanKey;
  targetPlan: PlanChangeRequestTarget;
  requestKind: string;
  status: string;
  statusTitle: string;
  statusDescription: string;
  publicResponse: string | null;
  createdAt: string;
  updatedAt: string;
};

const PLAN_WEIGHT: Record<PlanKey, number> = {
  trial: 0,
  starter: 1,
  professional: 2,
  enterprise: 3,
};

function toPlanKey(value: unknown): PlanKey | null {
  if (value === "trial" || value === "starter" || value === "professional" || value === "enterprise") {
    return value;
  }
  return null;
}

function humanizeHhSyncError(raw: unknown): string {
  const code = typeof raw === "string" ? raw.trim() : "";
  if (!code) return "Не удалось синхронизировать HH.ru. Попробуйте ещё раз.";
  if (code === "HH_RECONNECT_REQUIRED") {
    return "Доступ к HH.ru потерян. Переподключите интеграцию в настройках.";
  }
  if (code === "HH_RECONNECT_REQUIRED_DEACTIVATION_FAILED") {
    return "Не удалось безопасно отключить интеграцию HH.ru автоматически. Переподключите HH.ru или обратитесь в поддержку.";
  }
  if (code === "HH_HTTP_403" || code === "HH_HTTP_401") {
    return "HH.ru отклонил доступ к аккаунту. Переподключите интеграцию.";
  }
  if (code === "HH_REFRESH_AUTH_FAILED" || code === "HH_TOKEN_MISSING" || code === "HH_REFRESH_TOKEN_MISSING") {
    return "Токен HH.ru недействителен. Переподключите интеграцию.";
  }
  return code;
}

const BILLING_ERROR_COPY: Record<string, string> = {
  INVALID_BODY: "Проверьте данные и попробуйте ещё раз.",
  PLAN_NOT_SUPPORTED: "Этот тариф оформляется через заявку.",
  PAYMENT_ALREADY_EXISTS: "Завершите уже открытую оплату или обновите страницу тарифа.",
  PAID_SCHEDULE_EXISTS: "Будущий тариф уже оплачен и включится в указанную дату.",
  PLAN_PERIOD_END_REQUIRED: "Нужно уточнить дату окончания текущего тарифа. Обратитесь в поддержку.",
  SCHEDULE_DOWNGRADE_REQUIRED: "Starter можно включить после окончания текущего периода.",
  ENTERPRISE_CHANGE_REQUIRES_SUPPORT: "Чтобы сменить Enterprise, оставьте заявку в настройках тарифа.",
  PAYMENT_INV_ID_INVALID: "Не удалось подготовить оплату. Попробуйте ещё раз.",
  PAYMENT_LOOKUP_FAILED: "Не удалось проверить текущую оплату. Попробуйте ещё раз.",
  PAYMENT_EXPIRY_FAILED: "Не удалось обновить ссылку оплаты. Попробуйте ещё раз.",
  PAYMENT_CREATE_FAILED: "Не удалось подготовить оплату. Попробуйте ещё раз.",
  BILLING_EMAIL_REQUIRED: "Не удалось определить email для чека. Обратитесь в поддержку.",
  NOT_DOWNGRADE: "Этот переход недоступен.",
  SCHEDULE_NOT_AVAILABLE: "Для этого сценария требуется автопродление и активный текущий период.",
  SCHEDULE_UPDATE_FAILED: "Не удалось сохранить изменение. Попробуйте ещё раз.",
  PAID_SCHEDULE_CANNOT_CANCEL: "Оплаченный переход уже ожидает даты включения. Если нужно изменить его, обратитесь в поддержку.",
  SCHEDULE_CLEAR_FAILED: "Не удалось отменить изменение. Попробуйте ещё раз.",
  PLAN_NOT_ELIGIBLE: "Автопродление доступно только для платных тарифов.",
  NO_RECURRING_PAYMENT: "Нет привязанного способа оплаты. Оформите подписку заново.",
  RECURRING_DISABLED: "Автопродление сейчас недоступно. Подписку можно продлить новой оплатой.",
  PLAN_EXPIRED: "Подписка истекла. Оформите подписку заново.",
  ALREADY_DISABLED: "Автопродление уже выключено.",
  ALREADY_ENABLED: "Автопродление уже включено.",
  UPDATE_FAILED: "Не удалось сохранить изменение. Попробуйте ещё раз.",
  INTERNAL_ERROR: "Что-то пошло не так. Попробуйте ещё раз.",
};

const PLAN_CHANGE_REQUEST_ERROR_COPY: Record<string, string> = {
  INVALID_BODY: "Проверьте комментарий и попробуйте ещё раз.",
  PLAN_CHANGE_REQUIRES_ADMIN: "Заявку на изменение тарифа может отправить администратор компании.",
  PLAN_ALREADY_ACTIVE: "Этот тариф уже активен.",
  INTERNAL_ERROR: "Не удалось отправить заявку. Попробуйте ещё раз.",
};

type ApiIssue = { message?: string };
type PlanChangeRequestApiError = {
  error?: string;
  message?: string;
  issues?: Array<ApiIssue>;
};

function getBillingErrorCode(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function humanizeBillingError(raw: unknown, fallback: string): string {
  const code = getBillingErrorCode(raw);
  return BILLING_ERROR_COPY[code] ?? fallback;
}

function humanizePlanChangeRequestError(raw: unknown, fallback: string): string {
  const code = getBillingErrorCode(raw);
  return PLAN_CHANGE_REQUEST_ERROR_COPY[code] ?? fallback;
}

function getPlanChangeRequestErrorDescription(error: PlanChangeRequestApiError | null, fallback: string) {
  return (
    error?.message?.trim() ||
    error?.issues?.find((issue) => issue.message?.trim())?.message?.trim() ||
    humanizePlanChangeRequestError(error?.error, fallback)
  );
}

function logBillingError(action: string, raw: unknown): void {
  const code = getBillingErrorCode(raw);
  if (code) console.warn(`[billing] ${action} failed`, { error: code });
}

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hhStatus, setHhStatus] = useState<HhStatusDto | null>(null);
  const [hhLoading, setHhLoading] = useState(false);
  const [hhStatusCheckFailed, setHhStatusCheckFailed] = useState(false);
  const [hhToastShown, setHhToastShown] = useState(false);
  const [hhSyncDialogOpen, setHhSyncDialogOpen] = useState(false);
  const [hhSyncMode, setHhSyncMode] = useState<HhSyncCandidatesMode>("new_only");
  const [hhSyncSubmitting, setHhSyncSubmitting] = useState(false);
  const [hhSyncPreview, setHhSyncPreview] = useState<HhSyncPreviewDto | null>(null);
  const [hhSyncPreviewLoading, setHhSyncPreviewLoading] = useState(false);
  const [hhSyncPreviewError, setHhSyncPreviewError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("profile");

  const allowedTabs = useMemo(() => new Set(["profile", "company", "integrations", "notifications", "plan"]), []);
  const hhCallbackErrorMessage = useMemo(() => {
    if (searchParams.get("hh") !== "error") return null;
    return getHhCallbackErrorMessage(searchParams.get("reason"));
  }, [searchParams]);

  const isCompanyAdmin = user?.role === "admin";
  const isHHConnected = Boolean(hhStatus && "isConnected" in hhStatus && hhStatus.isConnected);
  const isHHStatusUnknown = hhStatus === null;
  const isHHDisconnected = hhStatus !== null && !isHHConnected;
  const hhImportSyncState = getHhImportSyncState(hhStatus);
  const hhImportInProgress = hhImportSyncState === "loading";
  const hhImportFailed = hhImportSyncState === "failed";

  const [currentPlan, setCurrentPlan] = useState<PlanKey>("starter");
  const [trialExpiresAt, setTrialExpiresAt] = useState<string | null>(null);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);
  const [trialState, setTrialState] = useState<TrialState>("hidden");
  const [intendedPlan, setIntendedPlan] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState<string | null>(null);
  const [periodEnd, setPeriodEnd] = useState<string | null>(null);
  const [autoRenew, setAutoRenew] = useState(true);
  const [scheduledPlan, setScheduledPlan] = useState<PlanKey | null>(null);
  const [scheduledPlanEffectiveAt, setScheduledPlanEffectiveAt] = useState<string | null>(null);
  const [scheduledChangePaid, setScheduledChangePaid] = useState(false);
  const [billingStatus, setBillingStatus] = useState<BillingStatus>("active");
  const [isPlanLoading, setIsPlanLoading] = useState(true);
  const [planError, setPlanError] = useState<string | null>(null);
  const [enterpriseLead, setEnterpriseLead] = useState<EnterpriseLeadDto | null>(null);
  const [isEnterpriseLeadLoading, setIsEnterpriseLeadLoading] = useState(false);
  const [planChangeRequest, setPlanChangeRequest] = useState<PlanChangeRequestDto | null>(null);
  const [isPlanChangeRequestLoading, setIsPlanChangeRequestLoading] = useState(false);
  const [planChangeRequestError, setPlanChangeRequestError] = useState<string | null>(null);
  const [checkoutLoadingPlan, setCheckoutLoadingPlan] = useState<BillablePlan | null>(null);
  const [isPlanActionLoading, setIsPlanActionLoading] = useState(false);
  const [downgradeConfirmPlan, setDowngradeConfirmPlan] = useState<BillablePlan | null>(null);
  const [downgradeConfirmOpen, setDowngradeConfirmOpen] = useState(false);
  const [enterprisePlanChangePlan, setEnterprisePlanChangePlan] = useState<PlanChangeRequestTarget | null>(null);
  const [enterprisePlanChangeOpen, setEnterprisePlanChangeOpen] = useState(false);
  const [enterprisePlanChangeMessage, setEnterprisePlanChangeMessage] = useState("");
  const [isEnterprisePlanChangeSubmitting, setIsEnterprisePlanChangeSubmitting] = useState(false);
  const [autoRenewConfirmOpen, setAutoRenewConfirmOpen] = useState(false);
  const [isAutoRenewLoading, setIsAutoRenewLoading] = useState(false);
  const [billingConsent, setBillingConsent] = useState(false);
  const [creditTopupOpen, setCreditTopupOpen] = useState(false);
  const [creditTopupQuantity, setCreditTopupQuantity] = useState("100");
  const [creditTopupConsent, setCreditTopupConsent] = useState(false);
  const [isCreditTopupLoading, setIsCreditTopupLoading] = useState(false);
  const processedPaymentReturnKeyRef = useRef<string | null>(null);
  const isCheckoutLoading = checkoutLoadingPlan !== null;

  const [credits, setCredits] = useState<CreditsDto | null>(null);
  const [isCreditsLoading, setIsCreditsLoading] = useState(false);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [creditsUnauth, setCreditsUnauth] = useState(false);

  const [tgStatus, setTgStatus] = useState<TelegramStatusDto | null>(null);
  const [tgLoading, setTgLoading] = useState(false);
  const [tgLastUpdatedAt, setTgLastUpdatedAt] = useState<number | null>(null);
  const [tgPollUntilMs, setTgPollUntilMs] = useState<number>(0);
  const isTelegramConnected = tgStatus?.connected === true;

  const [emailStatus, setEmailStatus] = useState<EmailStatusDto | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  const [company, setCompany] = useState<CompanyDto | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [companyIndustry, setCompanyIndustry] = useState<string | null>(null);
  const [companySize, setCompanySize] = useState<string | null>(null);
  const [isCompanyLoading, setIsCompanyLoading] = useState(false);
  const [isCompanySaving, setIsCompanySaving] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<CompanyEmployeeDto[]>([]);
  const [isEmployeesLoading, setIsEmployeesLoading] = useState(false);
  const [employeesError, setEmployeesError] = useState<string | null>(null);
  const enterpriseLeadStatus = useMemo(
    () =>
      getEnterpriseRequestStatusContent(
        enterpriseLead
          ? {
              status: enterpriseLead.status,
              decision_note: enterpriseLead.decisionNote,
            }
          : null
      ),
    [enterpriseLead]
  );
  const activePlanChangeRequest = planChangeRequest;
  const activePlanChangeRequestTargetPlan = activePlanChangeRequest?.targetPlan ?? null;
  const enterprisePlanChangeRequest =
    activePlanChangeRequest?.targetPlan === "enterprise" ? activePlanChangeRequest : null;
  const creditTopupCredits = parseCreditTopupQuantity(creditTopupQuantity);
  const creditTopupAmountKopecks = creditTopupCredits ? calculateCreditTopupAmountKopecks(creditTopupCredits) : 0;
  const isCreditTopupAvailable =
    user?.role === "admin"
    && !isPlanLoading
    && !planError
    && billingStatus !== "inactive";

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (!tab) return;
    if (!allowedTabs.has(tab)) return;
    // Keep UI in sync with URL even when page is restored from cache.
    if (tab !== activeTab) setActiveTab(tab);
  }, [searchParams, allowedTabs, activeTab]);

  const loadPlanChangeRequest = useCallback(async () => {
    if (!user) {
      setPlanChangeRequest(null);
      setPlanChangeRequestError(null);
      setIsPlanChangeRequestLoading(false);
      return;
    }

    setIsPlanChangeRequestLoading(true);
    setPlanChangeRequestError(null);
    try {
      const res = await fetch("/api/billing/plan-change-request", {
        method: "GET",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as {
        request?: PlanChangeRequestDto | null;
        reused?: boolean;
        error?: string;
      } | null;
      if (!res.ok) {
        logBillingError("load plan change request", json?.error);
        setPlanChangeRequest(null);
        setPlanChangeRequestError(
          humanizePlanChangeRequestError(json?.error, "Не удалось загрузить статус заявки. Обновите страницу.")
        );
        return;
      }
      setPlanChangeRequest(json?.request ?? null);
    } catch {
      setPlanChangeRequest(null);
      setPlanChangeRequestError("Не удалось загрузить статус заявки. Обновите страницу.");
    } finally {
      setIsPlanChangeRequestLoading(false);
    }
  }, [user]);

  const loadPlan = useCallback(async () => {
    try {
      setPlanError(null);
      const res = await fetch("/api/billing/plan", { method: "GET" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        logBillingError("load plan", json?.error);
        setPlanError(humanizeBillingError(json?.error, "Не удалось загрузить тариф. Попробуйте ещё раз."));
        return;
      }
      const nextPlan = (json?.currentPlan as PlanKey | undefined) ?? "starter";
      setCurrentPlan(nextPlan);
      setTrialExpiresAt(typeof json?.trialExpiresAt === "string" ? json.trialExpiresAt : null);
      setTrialDaysLeft(typeof json?.trialDaysLeft === "number" ? json.trialDaysLeft : null);
      setTrialState(
        json?.trialState === "active" || json?.trialState === "expiring" || json?.trialState === "expired"
          ? json.trialState
          : "hidden"
      );
      setIntendedPlan(typeof json?.intendedPlan === "string" ? json.intendedPlan : null);
      setPeriodStart(typeof json?.periodStart === "string" ? json.periodStart : null);
      setPeriodEnd(typeof json?.periodEnd === "string" ? json.periodEnd : null);
      setAutoRenew(Boolean(json?.autoRenew ?? true));
      setScheduledPlan(toPlanKey(json?.scheduledPlan));
      setScheduledPlanEffectiveAt(typeof json?.scheduledPlanEffectiveAt === "string" ? json.scheduledPlanEffectiveAt : null);
      setScheduledChangePaid(Boolean(json?.scheduledChangePaid ?? false));
      const nextStatus = String(json?.billingStatus ?? "active");
      setBillingStatus(nextStatus === "grace" || nextStatus === "inactive" ? nextStatus : "active");
    } catch {
      setPlanError("Не удалось загрузить тариф");
    } finally {
      setIsPlanLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const loadEnterpriseLead = useCallback(async () => {
    if (!user) {
      setEnterpriseLead(null);
      setIsEnterpriseLeadLoading(false);
      return;
    }

    setIsEnterpriseLeadLoading(true);
    try {
      const res = await fetch("/api/leads?requestedPlan=enterprise", {
        method: "GET",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as { lead?: EnterpriseLeadDto | null } | null;
      if (!res.ok) {
        setEnterpriseLead(null);
        return;
      }
      setEnterpriseLead(json?.lead ?? null);
    } catch {
      setEnterpriseLead(null);
    } finally {
      setIsEnterpriseLeadLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (activeTab !== "plan") return;
    void loadEnterpriseLead();
  }, [activeTab, loadEnterpriseLead]);

  useEffect(() => {
    if (activeTab !== "plan") return;
    void loadPlanChangeRequest();
  }, [activeTab, loadPlanChangeRequest]);

  const loadCredits = useCallback(async () => {
    try {
      setCreditsError(null);
      setCreditsUnauth(false);
      setIsCreditsLoading(true);

      const res = await fetch("/api/credits/balance", { method: "GET" });
      const json: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        // When session is missing we can get 401/403.
        if (res.status === 401 || res.status === 403) {
          setCreditsUnauth(true);
          setCredits(null);
          return;
        }
        setCreditsError("Не удалось загрузить баланс кредитов");
        setCredits(null);
        return;
      }

      const balance =
        json && typeof json === "object" && "balance" in json && typeof (json as { balance?: unknown }).balance === "number"
          ? (json as { balance: number }).balance
          : 0;
      const reserved =
        json && typeof json === "object" && "reserved" in json && typeof (json as { reserved?: unknown }).reserved === "number"
          ? (json as { reserved: number }).reserved
          : 0;
      const available =
        json && typeof json === "object" && "available" in json && typeof (json as { available?: unknown }).available === "number"
          ? (json as { available: number }).available
          : Math.max(0, balance - reserved);

      setCredits({
        balance: typeof balance === "number" ? balance : 0,
        reserved: typeof reserved === "number" ? reserved : 0,
        available: typeof available === "number" ? available : Math.max(0, (balance ?? 0) - (reserved ?? 0)),
      });
    } catch {
      setCreditsError("Не удалось загрузить баланс кредитов");
      setCredits(null);
    } finally {
      setIsCreditsLoading(false);
    }
  }, []);

  useEffect(() => {
    const payment = searchParams.get("payment");
    const invIdRaw = searchParams.get("InvId") ?? searchParams.get("InvoiceID") ?? searchParams.get("invid");
    const shpPaymentIdRaw = searchParams.get("Shp_payment_id");
    const shpPaymentId = shpPaymentIdRaw && shpPaymentIdRaw.trim().length > 0 ? shpPaymentIdRaw.trim() : null;
    const shpCreditTopupIdRaw = searchParams.get("Shp_credit_topup_id");
    const shpCreditTopupId = shpCreditTopupIdRaw && shpCreditTopupIdRaw.trim().length > 0 ? shpCreditTopupIdRaw.trim() : null;
    const isCreditTopupReturn =
      payment === "credit_topup_failed"
      || payment === "credit_topup_success"
      || shpCreditTopupId !== null;
    const invId = (() => {
      if (!invIdRaw) return null;
      const parsed = Number(invIdRaw);
      if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
      return parsed;
    })();

    const hasReturnSignal = payment === "failed" || payment === "success" || isCreditTopupReturn || invId !== null;
    if (!hasReturnSignal) return;

    const returnKey = `${payment ?? ""}|${invId ?? ""}|${shpPaymentId ?? ""}|${shpCreditTopupId ?? ""}`;
    if (processedPaymentReturnKeyRef.current === returnKey) return;
    processedPaymentReturnKeyRef.current = returnKey;

    let cancelled = false;
    const toastId = `billing-return-${invId ?? payment ?? "unknown"}`;

    const cleanBillingParams = () => {
      const sp = new URLSearchParams(searchParams.toString());
      [
        "payment",
        "OutSum",
        "InvId",
        "InvoiceID",
        "invid",
        "Shp_payment_id",
        "Shp_credit_topup_id",
        "SignatureValue",
        "IsTest",
        "Culture",
      ].forEach((key) => sp.delete(key));
      if (!sp.get("tab")) sp.set("tab", "plan");

      const nextQs = sp.toString();
      router.replace(nextQs ? `/dashboard/settings?${nextQs}` : "/dashboard/settings", { scroll: false });
    };

    const run = async () => {
      if (payment === "failed" || payment === "credit_topup_failed") {
        toast.error("Платёж не завершён", { description: undefined, id: toastId });
        void loadPlan();
        void loadCredits();
        cleanBillingParams();
        return;
      }

      if (invId === null) {
        if (payment === "success" || payment === "credit_topup_success") {
          toast.success(
            isCreditTopupReturn ? "Оплата принята. Баланс обновляется…" : "Оплата принята. Подписка обновляется…",
            { description: undefined, id: toastId }
          );
          void loadPlan();
          void loadCredits();
        }
        cleanBillingParams();
        return;
      }

      toast.loading("Проверяем статус оплаты…", { description: undefined, id: toastId });
      let lastStatus: string | null = null;
      for (let attempt = 0; attempt < 15; attempt += 1) {
        if (cancelled) return;

        const qs = new URLSearchParams();
        qs.set("invId", String(invId));
        if (isCreditTopupReturn && shpCreditTopupId) {
          qs.set("paymentId", shpCreditTopupId);
        } else if (shpPaymentId) {
          qs.set("paymentId", shpPaymentId);
        }

        let res: Response;
        try {
          const resultPath = isCreditTopupReturn ? "/api/billing/credit-topup-result" : "/api/billing/checkout-result";
          res = await fetch(`${resultPath}?${qs.toString()}`, { method: "GET", cache: "no-store" });
        } catch {
          toast.error("Не удалось проверить статус оплаты", { description: undefined, id: toastId });
          cleanBillingParams();
          return;
        }

        const json = (await res.json().catch(() => null)) as CheckoutResultDto | CreditTopupResultDto | { error?: string } | null;
        if (!res.ok) {
          const errorCode = typeof json === "object" && json && "error" in json ? String(json.error ?? "") : "";
          toast.error(
            errorCode === "PAYMENT_NOT_FOUND"
              ? "Платёж не найден в вашей компании"
              : "Не удалось проверить статус оплаты",
            { description: undefined, id: toastId }
          );
          cleanBillingParams();
          return;
        }

        const status = typeof json === "object" && json && "status" in json ? String(json.status) : "";
        lastStatus = status;

        if (status === "completed") {
          if (isCreditTopupReturn) {
            const result = json as CreditTopupResultDto;
            toast.success(`Кредиты зачислены: +${result.credits}.`, { description: undefined, id: toastId });
            void loadPlan();
            void loadCredits();
            cleanBillingParams();
            return;
          }

          const result = json as CheckoutResultDto;
          const periodStartMs = result.periodStart ? new Date(result.periodStart).getTime() : NaN;
          const isFutureActivation = Number.isFinite(periodStartMs) && periodStartMs > Date.now() + 30_000;
          toast.success(
            isFutureActivation
              ? `Оплата принята. ${planLabel(result.plan)} включится с ${new Date(result.periodStart as string).toLocaleDateString("ru-RU")}.`
              : "Подписка оформлена и активирована.",
            { description: undefined, id: toastId }
          );
          void loadPlan();
          void loadCredits();
          cleanBillingParams();
          return;
        }
        if (status === "requires_review") {
          toast(
            isCreditTopupReturn
              ? "Оплата принята. Мы проверяем пополнение и скоро обновим баланс."
              : "Оплата принята. Мы проверяем переход и скоро обновим тариф.",
            { description: undefined, id: toastId }
          );
          void loadPlan();
          void loadCredits();
          cleanBillingParams();
          return;
        }
        if (status === "failed" || status === "refunded") {
          toast.error("Платёж не завершён", { description: undefined, id: toastId });
          void loadPlan();
          void loadCredits();
          cleanBillingParams();
          return;
        }

        if (attempt < 14) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      if (cancelled) return;

      if (lastStatus === "pending") {
        toast("Платёж ещё обрабатывается. Обновите страницу через минуту.", { description: undefined, id: toastId });
      } else {
        toast.error("Не удалось определить статус оплаты", { description: undefined, id: toastId });
      }
      void loadPlan();
      void loadCredits();
      cleanBillingParams();
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [loadCredits, loadPlan, router, searchParams]);

  // Credits: load on opening Plan tab (settings UX).
  useEffect(() => {
    if (activeTab !== "plan") return;
    void loadCredits();
  }, [activeTab, loadCredits]);

  // Credits: best-effort refresh when user returns to the tab.
  useEffect(() => {
    if (activeTab !== "plan") return;
    const onFocus = () => void loadCredits();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [activeTab, loadCredits]);

  // Credits: auto-refresh while plan tab is active.
  useEffect(() => {
    if (activeTab !== "plan") return;
    const interval = window.setInterval(() => {
      void loadCredits();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [activeTab, loadCredits]);

  const handleTabChange = (next: string) => {
    setActiveTab(next);
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("tab", next);
    router.replace(`/dashboard/settings?${sp.toString()}`, { scroll: false });
  };

  const loadTelegramStatus = useCallback(async () => {
    setTgLoading(true);
    try {
      const res = await fetch("/api/telegram/status", { method: "GET" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        setTgStatus({ connected: false });
        return;
      }
      if (json && typeof json === "object" && json.connected === true) {
        setTgStatus({
          connected: true,
          chatId: Number(json.chatId ?? 0),
          connectedAt: String(json.connectedAt ?? ""),
          telegramEnabled: Boolean(json.telegramEnabled ?? true),
        });
      } else {
        setTgStatus({ connected: false });
      }
    } finally {
      setTgLoading(false);
      setTgLastUpdatedAt(Date.now());
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "notifications") return;
    void loadTelegramStatus();
  }, [activeTab, loadTelegramStatus]);

  const loadEmailStatus = useCallback(async () => {
    setEmailLoading(true);
    try {
      const res = await fetch("/api/email/status", { method: "GET" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        setEmailStatus({ email: user?.email ?? null, emailEnabled: true });
        return;
      }
      setEmailStatus({
        email: typeof json?.email === "string" ? json.email : (user?.email ?? null),
        emailEnabled: Boolean(json?.emailEnabled ?? true),
      });
    } finally {
      setEmailLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    if (activeTab !== "notifications") return;
    void loadEmailStatus();
  }, [activeTab, loadEmailStatus]);

  // Telegram: refresh on window focus (best-effort).
  useEffect(() => {
    if (activeTab !== "notifications") return;
    const onFocus = () => void loadTelegramStatus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [activeTab, loadTelegramStatus]);

  // Email: refresh on window focus (best-effort).
  useEffect(() => {
    if (activeTab !== "notifications") return;
    const onFocus = () => void loadEmailStatus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [activeTab, loadEmailStatus]);

  // Telegram: short-lived polling after "Connect" (helps UX after /start).
  useEffect(() => {
    if (activeTab !== "notifications") return;
    if (Date.now() >= tgPollUntilMs) return;

    const interval = window.setInterval(() => {
      if (Date.now() >= tgPollUntilMs) return;
      void loadTelegramStatus();
    }, 4000);

    return () => window.clearInterval(interval);
  }, [activeTab, loadTelegramStatus, tgPollUntilMs]);

  const handleConnectTelegram = useCallback(async () => {
    const toastId = "tg-connect";
    toast.loading("Генерируем ссылку…", { description: undefined, id: toastId });
    try {
      const res = await fetch("/api/telegram/connect-link", { method: "POST" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        toast.error("Не удалось подключить Telegram", {
          id: toastId,
          description: readUserFacingApiErrorMessage(json, "Не удалось подготовить ссылку Telegram. Попробуйте ещё раз."),
        });
        return;
      }
      const url = typeof json?.url === "string" ? json.url : null;
      if (!url) {
        toast.error("Не удалось подключить Telegram", { description: undefined, id: toastId });
        return;
      }
      toast.success("Откройте Telegram и нажмите Start", { id: toastId, description: "После подтверждения вернитесь сюда и обновите статус." });
      setTgPollUntilMs(Date.now() + 60_000);
      // NOTE: With `noopener`, some browsers may return `null` even when the tab is opened.
      // So we do NOT rely on return value; instead we keep user on the page and provide a manual link fallback.
      window.open(url, "_blank", "noopener,noreferrer");
      toast.message("Если Telegram не открылся", {
        description: "Проверьте блокировку всплывающих окон и нажмите «Открыть Telegram».",
        action: {
          label: "Открыть Telegram",
          onClick: () => window.open(url, "_blank", "noopener,noreferrer"),
        },
      });
    } catch {
      toast.error("Не удалось подключить Telegram", { description: undefined, id: toastId });
    }
  }, []);

  const handleDisconnectTelegram = useCallback(async () => {
    const toastId = "tg-disconnect";
    toast.loading("Отключаем…", { description: undefined, id: toastId });
    try {
      const res = await fetch("/api/telegram/disconnect", { method: "POST" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        toast.error("Не удалось отключить Telegram", {
          id: toastId,
          description: readUserFacingApiErrorMessage(json, "Не удалось отключить Telegram. Попробуйте ещё раз."),
        });
        return;
      }
      toast.success("Telegram отключён", { description: undefined, id: toastId });
      await loadTelegramStatus();
    } catch {
      toast.error("Не удалось отключить", { description: undefined, id: toastId });
    }
  }, [loadTelegramStatus]);

  const handleToggleTelegramEnabled = useCallback(
    async (next: boolean) => {
      const toastId = "tg-enabled";
      toast.loading("Сохраняем…", { description: undefined, id: toastId });
      try {
        const res = await fetch("/api/telegram/preferences", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ telegramEnabled: next }),
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok) {
          toast.error("Не удалось сохранить", {
            id: toastId,
            description: readUserFacingApiErrorMessage(json, "Проверьте настройку уведомлений и попробуйте ещё раз."),
          });
          return;
        }
        toast.success(next ? "Telegram‑уведомления включены" : "Telegram‑уведомления выключены", { description: undefined, id: toastId });
        setTgStatus((prev) => (prev && "connected" in prev && prev.connected ? { ...prev, telegramEnabled: next } : prev));
      } catch {
        toast.error("Не удалось сохранить", { description: undefined, id: toastId });
      }
    },
    []
  );

  const handleToggleEmailEnabled = useCallback(
    async (next: boolean) => {
      const toastId = "email-enabled";
      toast.loading("Сохраняем…", { description: undefined, id: toastId });
      try {
        const res = await fetch("/api/email/preferences", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ emailEnabled: next }),
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok) {
          toast.error("Не удалось сохранить", {
            id: toastId,
            description: readUserFacingApiErrorMessage(json, "Проверьте настройку уведомлений и попробуйте ещё раз."),
          });
          return;
        }
        toast.success(next ? "Email‑уведомления включены" : "Email‑уведомления выключены", { description: undefined, id: toastId });
        setEmailStatus((prev) => (prev ? { ...prev, emailEnabled: next } : prev));
      } catch {
        toast.error("Не удалось сохранить", { description: undefined, id: toastId });
      }
    },
    []
  );

  const loadCompany = useCallback(async () => {
    setCompanyError(null);

    try {
      setIsCompanyLoading(true);
      const res = await fetch("/api/company", { method: "GET" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        if (res.status === 401) {
          setCompanyError("Нужно войти в систему, чтобы видеть данные компании.");
          setCompany(null);
          return;
        }
        if (res.status === 403) {
          setCompanyError("Нет доступа к данным компании.");
          setCompany(null);
          return;
        }
        setCompanyError(String(json?.error ?? "Не удалось загрузить данные компании"));
        setCompany(null);
        return;
      }

      const c = (json?.company ?? null) as CompanyDto | null;
      if (!c) {
        setCompanyError("Данные компании не найдены");
        setCompany(null);
        return;
      }

      setCompany(c);
      setCompanyName(c.name ?? "");
      setCompanyIndustry(c.industry ?? null);
      setCompanySize(c.size ?? null);
    } catch {
      setCompanyError("Не удалось загрузить данные компании");
      setCompany(null);
    } finally {
      setIsCompanyLoading(false);
    }
  }, []);

  const loadCompanyEmployees = useCallback(async () => {
    if (!isCompanyAdmin) {
      setEmployees([]);
      setEmployeesError(null);
      setIsEmployeesLoading(false);
      return;
    }

    setEmployeesError(null);

    try {
      setIsEmployeesLoading(true);
      const res = await fetch("/api/company/employees", { method: "GET" });
      const json = (await res.json().catch(() => null)) as any;

      if (!res.ok) {
        if (res.status === 401) {
          setEmployeesError("Нужно войти в систему, чтобы видеть сотрудников компании.");
          setEmployees([]);
          return;
        }
        if (res.status === 403) {
          setEmployeesError("Нет доступа к списку сотрудников.");
          setEmployees([]);
          return;
        }
        setEmployeesError(String(json?.error ?? "Не удалось загрузить сотрудников"));
        setEmployees([]);
        return;
      }

      const list: unknown[] = Array.isArray(json?.employees) ? json.employees : [];
      const parsed = list
        .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
        .map(
          (row): CompanyEmployeeDto => ({
            id: String(row.id ?? ""),
            name: String(row.name ?? ""),
            email: String(row.email ?? ""),
            role:
              row.role === "admin" || row.role === "hr" || row.role === "recruiter"
                ? row.role
                : "recruiter",
          })
        );
      setEmployees(parsed);
    } catch {
      setEmployeesError("Не удалось загрузить сотрудников");
      setEmployees([]);
    } finally {
      setIsEmployeesLoading(false);
    }
  }, [isCompanyAdmin]);

  const saveCompany = useCallback(async () => {
    if (!isCompanyAdmin) {
      toast.error("Нет прав", { description: "Изменять данные компании может только администратор компании." });
      return;
    }

    const nextName = companyName.trim();
    if (nextName.length < 2) {
      toast.error("Проверьте название", { description: "Название компании должно быть не короче 2 символов." });
      return;
    }
    if (nextName.length > 120) {
      toast.error("Проверьте название", { description: "Название компании не должно быть длиннее 120 символов" });
      return;
    }

    setIsCompanySaving(true);
    const toastId = "company-save";
    toast.loading("Сохраняем…", { description: undefined, id: toastId });
    try {
      const res = await fetch("/api/company", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: nextName,
          industry: companyIndustry,
          size: companySize,
        }),
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        if (res.status === 403) {
          toast.error("Нет прав", { id: toastId, description: "Изменять данные компании может только администратор компании." });
          return;
        }
        toast.error("Не удалось сохранить", {
          id: toastId,
          description: readCompanyApiErrorMessage(json, "Не удалось сохранить данные компании. Попробуйте ещё раз."),
        });
        return;
      }

      const updated = (json?.company ?? null) as CompanyDto | null;
      if (updated) {
        setCompany(updated);
        setCompanyName(updated.name ?? nextName);
        setCompanyIndustry(updated.industry ?? companyIndustry ?? null);
        setCompanySize(updated.size ?? companySize ?? null);
      }

      toast.success("Данные компании обновлены", { description: undefined, id: toastId });
      await refresh();
    } catch {
      toast.error("Не удалось сохранить", { description: undefined, id: toastId });
    } finally {
      setIsCompanySaving(false);
    }
  }, [companyIndustry, companyName, companySize, isCompanyAdmin, refresh]);

  const loadHhStatus = useCallback(async () => {
    setHhLoading(true);
    try {
      const res = await fetch("/api/integrations/hh/status", { method: "GET", cache: "no-store" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        setHhStatusCheckFailed(true);
        setHhStatus((prev) => prev);
        return;
      }
      if (!json || typeof json !== "object") {
        setHhStatusCheckFailed(true);
        setHhStatus((prev) => prev);
        return;
      }
      setHhStatusCheckFailed(false);
      if (json.isConnected === true) {
        setHhStatus({
          isConnected: true,
          connectedAt: String(json.connectedAt ?? ""),
          lastSyncedAt: (json.lastSyncedAt ?? null) as string | null,
          syncStartedAt: (json.syncStartedAt ?? null) as string | null,
          syncLockExpiresAt: (json.syncLockExpiresAt ?? null) as string | null,
          lastSyncErrorAt: (json.lastSyncErrorAt ?? null) as string | null,
          hasLastSyncError: json.hasLastSyncError === true,
          tokenExpiresAt: (json.tokenExpiresAt ?? null) as string | null,
          employerName: typeof json.employerName === "string" ? json.employerName : undefined,
          host: typeof json.host === "string" ? json.host : undefined,
          disconnectReason: typeof json.disconnectReason === "string" ? json.disconnectReason : undefined,
          disconnectAt: typeof json.disconnectAt === "string" ? json.disconnectAt : undefined,
        });
      } else {
        setHhStatus({
          isConnected: false,
          disconnectReason: typeof json?.disconnectReason === "string" ? json.disconnectReason : undefined,
          disconnectAt: typeof json?.disconnectAt === "string" ? json.disconnectAt : undefined,
        });
      }
    } catch {
      setHhStatusCheckFailed(true);
      setHhStatus((prev) => prev);
    } finally {
      setHhLoading(false);
    }
  }, []);

  const handleConnectHH = () => {
    window.location.assign("/api/integrations/hh/start");
  };

  const handleDisconnectHH = useCallback(async () => {
    const toastId = "hh-disconnect";
    toast.loading("Отключаю HH.ru…", { description: undefined, id: toastId });
    try {
      const res = await fetch("/api/integrations/hh/disconnect", { method: "POST" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        toast.error("Не удалось отключить", { id: toastId, description: String(json?.error ?? "") });
        return;
      }
      toast.success("HH.ru отключён", { description: undefined, id: toastId });
      await loadHhStatus();
    } catch {
      toast.error("Не удалось отключить", { description: undefined, id: toastId });
    }
  }, [loadHhStatus]);

  const handleSyncHhNow = useCallback(async (mode: HhSyncCandidatesMode) => {
    const toastId = "hh-sync";
    setHhSyncSubmitting(true);
    toast.loading(mode === "new_and_update" ? "Синхронизирую и обновляю карточки из HH.ru…" : "Синхронизирую HH.ru…", { description: undefined, id: toastId });
    try {
      const vacRes = await fetch("/api/integrations/hh/sync/vacancies", { method: "POST" });
      const vacJson = (await vacRes.json().catch(() => null)) as any;
      if (!vacRes.ok) throw new Error(humanizeHhSyncError(vacJson?.error ?? "Не удалось синхронизировать вакансии"));

      const candRes = await fetch("/api/integrations/hh/sync/candidates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const candJson = (await candRes.json().catch(() => null)) as any;
      if (!candRes.ok) throw new Error(humanizeHhSyncError(candJson?.error ?? "Не удалось синхронизировать кандидатов"));

      toast.success("Синхронизация завершена", {
        id: toastId,
        description:
          `Вакансии: +${Number(vacJson?.created ?? 0)} / обновлено ${Number(vacJson?.updated ?? 0)}. ` +
          `Кандидаты: +${Number(candJson?.created ?? 0)} / обновлено ${Number(candJson?.updated ?? 0)} / пропущено ${Number(candJson?.skipped ?? 0)}.`,
      });
      await loadHhStatus();
      setHhSyncDialogOpen(false);
    } catch (e) {
      await loadHhStatus();
      toast.error("Не удалось синхронизировать", { id: toastId, description: e instanceof Error ? e.message : "Попробуйте ещё раз" });
    } finally {
      setHhSyncSubmitting(false);
    }
  }, [loadHhStatus]);

  const loadHhSyncPreview = useCallback(async () => {
    setHhSyncPreviewLoading(true);
    setHhSyncPreviewError(null);
    try {
      const res = await fetch("/api/integrations/hh/sync/candidates/preview", { method: "GET" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        setHhSyncPreview(null);
        setHhSyncPreviewError(humanizeHhSyncError(json?.error ?? "Не удалось рассчитать изменения"));
        return;
      }

      setHhSyncPreview({
        newCount: Number(json?.newCount ?? 0),
        updatableCount: Number(json?.updatableCount ?? 0),
        totalCandidatesSeen: Number(json?.totalCandidatesSeen ?? 0),
        vacanciesChecked: Number(json?.vacanciesChecked ?? 0),
      });
    } catch {
      setHhSyncPreview(null);
      setHhSyncPreviewError("Не удалось рассчитать изменения");
    } finally {
      setHhSyncPreviewLoading(false);
    }
  }, []);

  const isTrialExpired = currentPlan === "trial" && trialState === "expired";
  const currentPlanStatusBadge = getCurrentPlanStatusBadge(billingStatus);
  const roleLabel = (r: string | null | undefined) =>
    r === "admin" ? "Администратор" : r === "hr" ? "HR менеджер" : r === "recruiter" ? "Рекрутер" : "—";

  const startCheckout = useCallback(
    async (plan: BillablePlan) => {
      setCheckoutLoadingPlan(plan);
      const toastId = `billing-checkout-${plan}`;
      toast.loading("Подготавливаем оплату…", { description: undefined, id: toastId });
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ plan }),
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok) {
          logBillingError("checkout", json?.error);
          if (res.status === 403) {
            toast.error("Нет прав", { id: toastId, description: "Оформить тариф может только администратор компании." });
            return;
          }
          if (res.status === 409 && String(json?.error ?? "") === "PAYMENT_ALREADY_EXISTS") {
            toast.error("Оплата уже создана", {
              id: toastId,
              description: "Завершите уже открытую оплату или обновите страницу тарифа.",
            });
            return;
          }
          if (res.status === 409 && String(json?.error ?? "") === "PAID_SCHEDULE_EXISTS") {
            toast.error("Переход уже запланирован", {
              id: toastId,
              description: "Будущий тариф уже оплачен и включится в указанную дату.",
            });
            return;
          }
          if (res.status === 409 && String(json?.error ?? "") === "PLAN_PERIOD_END_REQUIRED") {
            toast.error("Не удалось оформить понижение", {
              id: toastId,
              description: "Нужно уточнить дату окончания текущего тарифа. Обратитесь в поддержку.",
            });
            return;
          }
          if (res.status === 409 && String(json?.error ?? "") === "SCHEDULE_DOWNGRADE_REQUIRED") {
            toast.error("Запланируйте переход", {
              id: toastId,
              description: "Starter можно включить после окончания текущего периода.",
            });
            return;
          }
          toast.error("Не удалось создать оплату", {
            id: toastId,
            description: humanizeBillingError(json?.error, "Не удалось подготовить оплату. Попробуйте ещё раз."),
          });
          return;
        }
        const checkoutUrl = typeof json?.checkoutUrl === "string" ? json.checkoutUrl : null;
        if (!checkoutUrl) {
          toast.error("Не удалось создать оплату", { id: toastId, description: "Ссылка оплаты не получена." });
          return;
        }
        toast.success("Перенаправляем на страницу оплаты…", { description: undefined, id: toastId });
        window.location.href = checkoutUrl;
      } catch {
        toast.error("Не удалось создать оплату", { description: undefined, id: toastId });
      } finally {
        setCheckoutLoadingPlan(null);
      }
    },
    []
  );

  const handleCreditTopupQuantityChange = useCallback((value: string) => {
    setCreditTopupQuantity(value.replace(/\D/g, "").slice(0, CREDIT_TOPUP_MAX_DIGITS));
  }, []);

  const startCreditTopup = useCallback(async () => {
    if (user?.role !== "admin") return;
    if (isCreditTopupLoading) return;
    if (!isCreditTopupAvailable) {
      toast.error("Пополнение сейчас недоступно", {
        description: "Сначала активируйте тариф, затем пополните баланс кредитов.",
      });
      return;
    }
    if (!creditTopupConsent) {
      toast.error("Необходимо дать согласие", { description: "Отметьте чекбокс согласия перед оплатой." });
      return;
    }
    if (creditTopupCredits === null) {
      toast.error("Введите количество кредитов", {
        description: "Используйте только цифры, не больше 5 знаков.",
      });
      return;
    }

    setIsCreditTopupLoading(true);
    const toastId = "billing-credit-topup";
    toast.loading("Подготавливаем оплату…", { description: undefined, id: toastId });
    try {
      const res = await fetch("/api/billing/credit-topup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credits: creditTopupCredits }),
      });
      const json = (await res.json().catch(() => null)) as { checkoutUrl?: string; message?: string; error?: string } | null;
      if (!res.ok) {
        logBillingError("credit topup", json?.error);
        if (res.status === 403) {
          toast.error("Нет прав", { id: toastId, description: "Пополнить баланс может только администратор компании." });
          return;
        }
        toast.error("Не удалось создать оплату", {
          id: toastId,
          description: typeof json?.message === "string" ? json.message : "Не удалось подготовить оплату. Попробуйте ещё раз.",
        });
        return;
      }

      const checkoutUrl = typeof json?.checkoutUrl === "string" ? json.checkoutUrl : null;
      if (!checkoutUrl) {
        toast.error("Не удалось создать оплату", { id: toastId, description: "Ссылка оплаты не получена." });
        return;
      }
      toast.success("Перенаправляем на страницу оплаты…", { description: undefined, id: toastId });
      window.location.href = checkoutUrl;
    } catch {
      toast.error("Не удалось создать оплату", { description: undefined, id: toastId });
    } finally {
      setIsCreditTopupLoading(false);
    }
  }, [
    creditTopupConsent,
    creditTopupCredits,
    isCreditTopupAvailable,
    isCreditTopupLoading,
    user?.role,
  ]);

  const getPlanActionKind = useCallback(
    (targetPlan: BillablePlan): PlanActionKind => {
      if (currentPlan === "trial") return "subscribe";
      if (currentPlan === targetPlan) return "same";
      return PLAN_WEIGHT[targetPlan] > PLAN_WEIGHT[currentPlan] ? "upgrade" : "downgrade";
    },
    [currentPlan]
  );

  const getPlanButtonLabel = useCallback(
    (targetPlan: BillablePlan): string => {
      return getPaidPlanButtonLabel({
        targetPlan,
        currentPlan,
        billingStatus,
        userRole: user?.role,
        checkoutLoadingPlan,
        activePlanChangeRequestTargetPlan,
      });
    },
    [activePlanChangeRequestTargetPlan, billingStatus, checkoutLoadingPlan, currentPlan, user?.role]
  );

  const scheduleDowngrade = useCallback(
    async (toPlan: BillablePlan): Promise<boolean> => {
      setIsPlanActionLoading(true);
      const toastId = `billing-schedule-downgrade-${toPlan}`;
      toast.loading("Сохраняем изменение тарифа…", { description: undefined, id: toastId });
      try {
        const res = await fetch("/api/billing/schedule-downgrade", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ toPlan }),
        });
        const json = (await res.json().catch(() => null)) as any;
        if (!res.ok) {
          logBillingError("schedule downgrade", json?.error);
          if (res.status === 403) {
            toast.error("Нет прав", { id: toastId, description: "Изменять тариф может только администратор компании." });
            return false;
          }
          if (res.status === 409) {
            toast.error("Понижение сейчас недоступно", {
              id: toastId,
              description: "Для этого сценария требуется автопродление и активный текущий период.",
            });
            return false;
          }
          toast.error("Не удалось запланировать понижение", {
            id: toastId,
            description: humanizeBillingError(json?.error, "Не удалось сохранить изменение. Попробуйте ещё раз."),
          });
          return false;
        }

        toast.success("Понижение запланировано на следующий период.", { description: undefined, id: toastId });
        await loadPlan();
        return true;
      } catch {
        toast.error("Не удалось запланировать понижение", { description: undefined, id: toastId });
        return false;
      } finally {
        setIsPlanActionLoading(false);
      }
    },
    [loadPlan]
  );

  const cancelScheduledDowngrade = useCallback(async () => {
    setIsPlanActionLoading(true);
    const toastId = "billing-cancel-scheduled-downgrade";
    toast.loading("Отменяем запланированное понижение…", { description: undefined, id: toastId });
    try {
      const res = await fetch("/api/billing/schedule-downgrade", { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        logBillingError("cancel scheduled downgrade", json?.error);
        if (res.status === 403) {
          toast.error("Нет прав", { id: toastId, description: "Изменять тариф может только администратор компании." });
          return;
        }
        toast.error("Не удалось отменить понижение", {
          id: toastId,
          description: humanizeBillingError(json?.error, "Не удалось отменить изменение. Попробуйте ещё раз."),
        });
        return;
      }
      toast.success("Запланированное понижение отменено.", { description: undefined, id: toastId });
      await loadPlan();
    } catch {
      toast.error("Не удалось отменить понижение", { description: undefined, id: toastId });
    } finally {
      setIsPlanActionLoading(false);
    }
  }, [loadPlan]);

  const toggleAutoRenew = useCallback(
    async (enabled: boolean) => {
      setIsAutoRenewLoading(true);
      const toastId = enabled ? "billing-enable-auto-renew" : "billing-disable-auto-renew";
      toast.loading(enabled ? "Включаем автопродление…" : "Отключаем автопродление…", { description: undefined, id: toastId });
      try {
        const res = await fetch("/api/billing/auto-renew", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled }),
        });
        const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        if (!res.ok) {
          logBillingError("auto renew", json?.error);
          if (res.status === 403) {
            toast.error("Нет прав", { id: toastId, description: "Изменять автопродление может только администратор компании." });
            return;
          }
          const desc = humanizeBillingError(json?.error, "Действие сейчас недоступно. Попробуйте ещё раз.");
          toast.error("Невозможно изменить автопродление", { id: toastId, description: desc });
          return;
        }
        toast.success(enabled ? "Автопродление включено." : "Автопродление отключено.", { description: undefined, id: toastId });
        await loadPlan();
      } catch {
        toast.error("Не удалось изменить автопродление", { description: undefined, id: toastId });
      } finally {
        setIsAutoRenewLoading(false);
        setAutoRenewConfirmOpen(false);
      }
    },
    [loadPlan],
  );

  const submitEnterprisePlanChangeRequest = useCallback(async () => {
    if (!enterprisePlanChangePlan) return;
    if (user?.role !== "admin") return;

    setIsEnterprisePlanChangeSubmitting(true);
    const toastId = `enterprise-plan-change-${enterprisePlanChangePlan}`;
    toast.loading("Отправляем заявку…", { description: undefined, id: toastId });
    try {
      const message = enterprisePlanChangeMessage.trim();
      const res = await fetch("/api/billing/plan-change-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetPlan: enterprisePlanChangePlan,
          source: "settings",
          ...(message ? { message } : {}),
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        request?: PlanChangeRequestDto | null;
        reused?: boolean;
        error?: string;
        message?: string;
        issues?: Array<{ message?: string }>;
      } | null;
      if (!res.ok) {
        logBillingError("submit plan change request", json?.error);
        toast.error("Не удалось отправить заявку", {
          id: toastId,
          description: getPlanChangeRequestErrorDescription(json, "Попробуйте ещё раз."),
        });
        return;
      }

      if (json?.request) {
        setPlanChangeRequest(json.request);
      } else {
        await loadPlanChangeRequest();
      }
      toast.success(json?.reused ? "Заявка уже есть" : "Заявка отправлена", { description: undefined, id: toastId });
      setEnterprisePlanChangeOpen(false);
      setEnterprisePlanChangePlan(null);
      setEnterprisePlanChangeMessage("");
    } catch {
      toast.error("Не удалось отправить заявку", { id: toastId, description: "Попробуйте ещё раз." });
    } finally {
      setIsEnterprisePlanChangeSubmitting(false);
    }
  }, [enterprisePlanChangeMessage, enterprisePlanChangePlan, loadPlanChangeRequest, user?.role]);

  const showBillingConsentRequiredToast = useCallback(() => {
    toast.error("Для оплаты нужно согласие", {
      description: "Согласитесь с условиями и поставьте галочку внизу страницы.",
    });
  }, []);

  const handlePlanAction = useCallback(
    (targetPlan: BillablePlan) => {
      if (user?.role !== "admin") return;
      if (checkoutLoadingPlan || isPlanActionLoading) return;
      if (currentPlan === targetPlan && billingStatus === "active") return;
      if (currentPlan === "enterprise") {
        if (activePlanChangeRequest) {
          toast.info("Уже есть активная заявка", {
            description: activePlanChangeRequest.statusDescription,
          });
          return;
        }
        setEnterprisePlanChangePlan(targetPlan);
        setEnterprisePlanChangeMessage("");
        setEnterprisePlanChangeOpen(true);
        return;
      }
      if (!billingConsent) {
        showBillingConsentRequiredToast();
        return;
      }

      const action = getPlanActionKind(targetPlan);
      if (action === "downgrade") {
        setDowngradeConfirmPlan(targetPlan);
        setDowngradeConfirmOpen(true);
        return;
      }
      void startCheckout(targetPlan);
    },
    [activePlanChangeRequest, billingConsent, billingStatus, checkoutLoadingPlan, currentPlan, getPlanActionKind, isPlanActionLoading, showBillingConsentRequiredToast, startCheckout, user?.role]
  );

  const confirmDowngrade = useCallback(async () => {
    if (!downgradeConfirmPlan) return;

    const canSchedule = currentPlan === "professional"
      && downgradeConfirmPlan === "starter"
      && autoRenew
      && typeof periodEnd === "string"
      && periodEnd.length > 0;

    if (canSchedule) {
      if (isMatchingScheduledPlan({
        targetPlan: downgradeConfirmPlan,
        scheduledPlan,
        scheduledPlanEffectiveAt,
        expectedEffectiveAt: periodEnd,
      })) {
        toast.info("Понижение уже запланировано", {
          description: `${planLabel(downgradeConfirmPlan)} включится ${new Date(periodEnd).toLocaleDateString("ru-RU")}.`,
        });
        setDowngradeConfirmOpen(false);
        setDowngradeConfirmPlan(null);
        return;
      }

      const ok = await scheduleDowngrade(downgradeConfirmPlan);
      if (ok) {
        setDowngradeConfirmOpen(false);
        setDowngradeConfirmPlan(null);
      }
      return;
    }

    const paidScheduledDowngradeEffectiveAt = currentPlan === "professional"
      && downgradeConfirmPlan === "starter"
      && !autoRenew
      && typeof periodEnd === "string"
      && periodEnd.length > 0
        ? periodEnd
        : null;

    toast(
      paidScheduledDowngradeEffectiveAt
        ? `После оплаты Starter включится с ${new Date(paidScheduledDowngradeEffectiveAt).toLocaleDateString("ru-RU")}.`
        : "Для этого сценария изменение тарифа выполняется через новую оплату."
    );
    setDowngradeConfirmOpen(false);
    const nextPlan = downgradeConfirmPlan;
    setDowngradeConfirmPlan(null);
    void startCheckout(nextPlan);
  }, [autoRenew, currentPlan, downgradeConfirmPlan, periodEnd, scheduleDowngrade, scheduledPlan, scheduledPlanEffectiveAt, startCheckout]);

  const isDowngradeScheduleMode = downgradeConfirmPlan === "starter"
    && currentPlan === "professional"
    && autoRenew
    && typeof periodEnd === "string"
    && periodEnd.length > 0;

  const isPaidDowngradeScheduleMode = downgradeConfirmPlan === "starter"
    && currentPlan === "professional"
    && !autoRenew
    && typeof periodEnd === "string"
    && periodEnd.length > 0;

  const isPlanButtonNativeDisabled = (targetPlan: BillablePlan) => (
    isPlanLoading
    || !!planError
    || isCheckoutLoading
    || isPlanActionLoading
    || isEnterprisePlanChangeSubmitting
    || (currentPlan === targetPlan && billingStatus === "active")
    || Boolean(currentPlan === "enterprise" && activePlanChangeRequest)
    || user?.role !== "admin"
  );

  const isStarterPlanButtonNativeDisabled = isPlanButtonNativeDisabled("starter");
  const isProfessionalPlanButtonNativeDisabled = isPlanButtonNativeDisabled("professional");
  const isBlockedByBillingConsent = (targetPlan: BillablePlan, nativeDisabled: boolean) => (
    !nativeDisabled
    && user?.role === "admin"
    && currentPlan !== "enterprise"
    && !billingConsent
    && !(currentPlan === targetPlan && billingStatus === "active")
  );

  const isStarterBlockedByBillingConsent = isBlockedByBillingConsent("starter", isStarterPlanButtonNativeDisabled);
  const isProfessionalBlockedByBillingConsent = isBlockedByBillingConsent("professional", isProfessionalPlanButtonNativeDisabled);
  const isStarterPlanButtonDisabled = isStarterPlanButtonNativeDisabled || isStarterBlockedByBillingConsent;
  const isProfessionalPlanButtonDisabled = isProfessionalPlanButtonNativeDisabled || isProfessionalBlockedByBillingConsent;

  // Company: load on opening Company tab (settings UX).
  useEffect(() => {
    if (activeTab !== "company") return;
    if (!user) return;
    void loadCompany();
    if (user.role === "admin") {
      void loadCompanyEmployees();
      return;
    }
    setEmployees([]);
    setEmployeesError(null);
  }, [activeTab, loadCompany, loadCompanyEmployees, user]);

  // HH status: load when opening Integrations tab.
  useEffect(() => {
    if (activeTab !== "integrations") return;
    void loadHhStatus();
    const interval = setInterval(() => void loadHhStatus(), 30000);
    return () => clearInterval(interval);
  }, [activeTab, loadHhStatus]);

  // HH callback UX: show toast once.
  useEffect(() => {
    if (activeTab !== "integrations") return;
    if (hhToastShown) return;
    const hh = searchParams.get("hh");
    if (hh === "connected") {
      setHhToastShown(true);
      toast.success("HH.ru подключён");
    } else if (hh === "error") {
      setHhToastShown(true);
      toast.error("Не удалось подключить HH.ru", {
        description: getHhCallbackErrorMessage(searchParams.get("reason")),
      });
    }
  }, [activeTab, hhToastShown, searchParams]);

  useEffect(() => {
    if (!hhSyncDialogOpen) return;
    void loadHhSyncPreview();
  }, [hhSyncDialogOpen, loadHhSyncPreview]);

  return (
    <div className="flex min-w-0 flex-col gap-4 overflow-hidden sm:gap-6">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Настройки</h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Управляйте вашим профилем и интеграциями
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="min-w-0 space-y-4">
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="profile" className="shrink-0">
            <User className="mr-2 h-4 w-4 shrink-0" />
            Профиль
          </TabsTrigger>
          <TabsTrigger value="company" className="shrink-0">
            <Building className="mr-2 h-4 w-4 shrink-0" />
            Компания
          </TabsTrigger>
          <TabsTrigger value="integrations" className="shrink-0">
            <Cable className="mr-2 h-4 w-4 shrink-0" />
            Интеграции
          </TabsTrigger>
          <TabsTrigger value="notifications" className="shrink-0">
            <Bell className="mr-2 h-4 w-4 shrink-0" />
            Уведомления
          </TabsTrigger>
          <TabsTrigger value="plan" className="shrink-0">
            <CreditCard className="mr-2 h-4 w-4 shrink-0" />
            Тариф
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-4">
          <Card>
              <CardHeader>
                <CardTitle>Личная информация</CardTitle>
                <CardDescription>
                  Просмотр ваших персональных данных
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Имя</Label>
                    <Input id="name" defaultValue={user?.name} readOnly disabled />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" defaultValue={user?.email} readOnly disabled />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Роль</Label>
                  <Input id="role" value={roleLabel(user?.role)} readOnly disabled />
                  <p className="text-xs text-muted-foreground">
                    Роль нельзя изменить самостоятельно. Если нужно изменить роль, обратитесь к администратору сервиса.
                  </p>
                </div>
                <ThemeSettingsField />
              </CardContent>
            </Card>
        </TabsContent>

        {/* Company Tab */}
        <TabsContent value="company" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Информация о компании</CardTitle>
              <CardDescription>
                Управляйте данными вашей компании
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isCompanyAdmin ? (
                <Alert>
                  <AlertDescription className="text-sm">
                    Изменять данные компании может только <strong>администратор вашей компании</strong>. У вас доступ только на просмотр.
                  </AlertDescription>
                </Alert>
              ) : null}

              {companyError ? (
                <Alert variant="destructive">
                  <AlertTitle>Не удалось загрузить</AlertTitle>
                  <AlertDescription className="text-sm">{companyError}</AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="companyName">Название компании</Label>
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value.slice(0, 120))}
                  disabled={!isCompanyAdmin || isCompanyLoading || isCompanySaving}
                  placeholder={company?.name ?? user?.company ?? "Компания"}
                  maxLength={120}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="industry">Индустрия</Label>
                <Select
                  value={companyIndustry ?? ""}
                  onValueChange={(v) => setCompanyIndustry(v === "" ? null : v)}
                  disabled={!isCompanyAdmin || isCompanyLoading || isCompanySaving}
                >
                  <SelectTrigger id="industry">
                    <SelectValue placeholder={isCompanyLoading ? "Загрузка…" : "Выберите индустрию"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tech">Технологии</SelectItem>
                    <SelectItem value="finance">Финансы</SelectItem>
                    <SelectItem value="healthcare">Здравоохранение</SelectItem>
                    <SelectItem value="education">Образование</SelectItem>
                    <SelectItem value="other">Другое</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="companySize">Размер компании</Label>
                <Select
                  value={companySize ?? ""}
                  onValueChange={(v) => setCompanySize(v === "" ? null : v)}
                  disabled={!isCompanyAdmin || isCompanyLoading || isCompanySaving}
                >
                  <SelectTrigger id="companySize">
                    <SelectValue placeholder={isCompanyLoading ? "Загрузка…" : "Выберите размер"} />
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

              <Separator />

              <div className="flex justify-end">
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => void saveCompany()}
                  disabled={!isCompanyAdmin || isCompanyLoading || isCompanySaving}
                >
                  <Save className="mr-2 h-4 w-4 shrink-0" />
                  {isCompanySaving ? "Сохраняем…" : "Сохранить изменения"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {isCompanyAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle>Сотрудники компании</CardTitle>
                <CardDescription>Пользователи, привязанные к вашей компании</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {employeesError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Не удалось загрузить</AlertTitle>
                    <AlertDescription className="text-sm">{employeesError}</AlertDescription>
                  </Alert>
                ) : null}

                {isEmployeesLoading ? (
                  <p className="text-sm text-muted-foreground">Загружаем сотрудников…</p>
                ) : employees.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Сотрудники компании пока не найдены.</p>
                ) : (
                  <div className="max-w-full overflow-x-auto rounded-md border">
                    <Table className="min-w-[40rem]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[16rem]">Имя</TableHead>
                          <TableHead className="w-[18rem]">Email</TableHead>
                          <TableHead className="w-[8rem]">Роль</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {employees.map((employee) => (
                          <TableRow key={employee.id}>
                            <TableCell className="whitespace-nowrap font-medium">{employee.name || "—"}</TableCell>
                            <TableCell className="whitespace-nowrap">{employee.email || "—"}</TableCell>
                            <TableCell className="whitespace-nowrap">{roleLabel(employee.role)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations" className="space-y-4">
          <FirstAiContextualOnboardingHint surface="settings_integrations" />

          {/* HH.ru Integration */}
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <CardTitle>Интеграция с HH.ru</CardTitle>
                  <CardDescription>
                    Подключите ваш аккаунт HH.ru для автоматического импорта откликов
                  </CardDescription>
                </div>
                {isHHConnected ? (
                  <Badge variant="outline" className="w-fit shrink-0 bg-green-500 text-white">
                    <Check className="mr-1 h-3 w-3" />
                    Подключено
                  </Badge>
                ) : isHHStatusUnknown ? (
                  <Badge variant="outline" className="w-fit shrink-0">
                    <Info className="mr-1 h-3 w-3" />
                    Проверяем статус
                  </Badge>
                ) : (
                  <Badge variant="outline" className="w-fit shrink-0 bg-gray-500 text-white">
                    <X className="mr-1 h-3 w-3" />
                    Не подключено
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isHHStatusUnknown ? (
                <div className="space-y-3">
                  {hhStatusCheckFailed ? (
                    <Alert variant="destructive">
                      <AlertTitle>Не удалось проверить статус HH.ru</AlertTitle>
                      <AlertDescription className="text-sm">
                        Обновим статус автоматически. Если нужно срочно синхронизировать отклики, попробуйте открыть настройки чуть позже.
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  <Button className="w-full" disabled>
                    <Cable className="mr-2 h-4 w-4" />
                    Проверяем статус…
                  </Button>
                </div>
              ) : isHHDisconnected ? (
                <div className="space-y-3">
                  {hhCallbackErrorMessage ? (
                    <Alert variant="destructive">
                      <AlertTitle>HH.ru не подключён</AlertTitle>
                      <AlertDescription className="text-sm">{hhCallbackErrorMessage}</AlertDescription>
                    </Alert>
                  ) : null}

                  {(hhStatus as any)?.disconnectReason ? (
                    <Alert variant="destructive">
                      <AlertTitle>Интеграция HH.ru отключена</AlertTitle>
                      <AlertDescription className="text-sm">
                        {humanizeHhSyncError((hhStatus as any)?.disconnectReason)}
                        {(hhStatus as any)?.disconnectAt ? ` (${new Date((hhStatus as any).disconnectAt).toLocaleString()})` : ""}
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  <Button onClick={handleConnectHH} className="w-full" disabled={hhLoading}>
                    <Cable className="mr-2 h-4 w-4" />
                    {hhLoading ? "Проверяем статус…" : "Подключить HH.ru"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                        <Cable className="h-5 w-5 text-red-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">HH.ru аккаунт</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {typeof (hhStatus as any)?.employerName === "string" && (hhStatus as any).employerName
                            ? (hhStatus as any).employerName
                            : user?.email}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full shrink-0 sm:w-auto"
                      onClick={() => void handleDisconnectHH()}
                      disabled={hhLoading}
                    >
                      Отключить
                    </Button>
                  </div>

                  <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-muted-foreground">Последняя синхронизация</span>
                    <span className="break-words sm:text-right">
                      {(hhStatus as any)?.lastSyncedAt ? new Date((hhStatus as any).lastSyncedAt).toLocaleString() : "—"}
                    </span>
                  </div>

                  {hhImportInProgress ? (
                    <Alert>
                      <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <AlertTitle>Загружаем отклики из HH.ru</AlertTitle>
                      <AlertDescription className="text-sm">
                        Большие аккаунты могут синхронизироваться до 15 минут. Кандидаты появятся автоматически, страницу можно не обновлять.
                      </AlertDescription>
                    </Alert>
                  ) : hhImportFailed ? (
                    <Alert variant="destructive">
                      <AlertTitle>HH.ru не удалось загрузить отклики</AlertTitle>
                      <AlertDescription className="text-sm">
                        Попробуйте запустить синхронизацию вручную. Если ошибка повторится, переподключите HH.ru.
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setHhSyncPreview(null);
                      setHhSyncPreviewError(null);
                      setHhSyncMode("new_only");
                      setHhSyncDialogOpen(true);
                    }}
                    disabled={hhLoading || hhSyncSubmitting}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Синхронизировать сейчас
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog
            open={hhSyncDialogOpen}
            onOpenChange={(nextOpen) => {
              if (!nextOpen && hhSyncSubmitting) return;
              setHhSyncDialogOpen(nextOpen);
            }}
          >
            <DialogContent showCloseButton={!hhSyncSubmitting}>
              <DialogHeader>
                <DialogTitle>Синхронизация кандидатов HH.ru</DialogTitle>
                <DialogDescription>
                  Выберите режим синхронизации.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                {hhSyncPreviewLoading ? (
                  <span className="text-muted-foreground">Считаем изменения…</span>
                ) : hhSyncPreview ? (
                  <span>
                    Будет добавлено <strong>{hhSyncPreview.newCount}</strong>, обновлено <strong>{hhSyncPreview.updatableCount}</strong>.
                  </span>
                ) : (
                  <span className="text-muted-foreground">Не удалось заранее посчитать изменения.</span>
                )}
              </div>
              {hhSyncPreviewError ? (
                <Alert variant="destructive">
                  <AlertDescription className="text-sm">
                    {hhSyncPreviewError}
                  </AlertDescription>
                </Alert>
              ) : null}
              <fieldset className="space-y-3" disabled={hhSyncSubmitting}>
                <legend className="sr-only">Режим синхронизации кандидатов HH.ru</legend>

                <label className="block cursor-pointer">
                  <input
                    type="radio"
                    name="hh-sync-mode"
                    value="new_only"
                    checked={hhSyncMode === "new_only"}
                    onChange={() => setHhSyncMode("new_only")}
                    disabled={hhSyncSubmitting}
                    className="peer sr-only"
                  />
                  <span className="block rounded-md border p-3 transition-colors peer-checked:border-primary peer-checked:bg-primary/5 peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                    <span className="block text-sm font-semibold text-foreground">Только новые резюме</span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      Добавятся только кандидаты, которых ещё нет в hiiire. Для существующих HH-кандидатов обновится только блок автоопроса HH
                      (если есть изменения).
                    </span>
                    <span className="mt-2 block text-xs text-muted-foreground">
                      {hhSyncPreview ? `Будет добавлено: ${hhSyncPreview.newCount}` : "Добавляем только новые карточки."}
                    </span>
                  </span>
                </label>

                <label className="block cursor-pointer">
                  <input
                    type="radio"
                    name="hh-sync-mode"
                    value="new_and_update"
                    checked={hhSyncMode === "new_and_update"}
                    onChange={() => setHhSyncMode("new_and_update")}
                    disabled={hhSyncSubmitting}
                    className="peer sr-only"
                  />
                  <span className="block rounded-md border p-3 transition-colors peer-checked:border-primary peer-checked:bg-primary/5 peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                    <span className="block text-sm font-semibold text-foreground">Новые и обновить старые</span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      Существующие карточки HH-кандидатов будут перезаписаны данными из HH.ru (имя, должность, текст резюме, контакты и фото).
                    </span>
                    <span className="mt-2 block text-xs text-muted-foreground">
                      {hhSyncPreview
                        ? `Будет добавлено: ${hhSyncPreview.newCount}, обновлено: ${hhSyncPreview.updatableCount}`
                        : "Обновляем существующие HH-карточки и добавляем новые."}
                    </span>
                  </span>
                </label>
              </fieldset>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setHhSyncDialogOpen(false)}
                  disabled={hhSyncSubmitting}
                >
                  Отмена
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleSyncHhNow(hhSyncMode)}
                  disabled={hhSyncSubmitting}
                >
                  {hhSyncSubmitting ? "Синхронизируем…" : "Синхронизировать"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* MCP Integration */}
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <CardTitle>MCP</CardTitle>
                  <CardDescription>
                    Подключение hiiire к внешним ИИ-агентам
                  </CardDescription>
                </div>
                <Badge variant="outline" className="w-fit shrink-0">
                  Скоро
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
                <p className="break-words text-sm font-medium text-foreground">
                  Если вы привыкли работать со своим ИИ-агентом, у нас хорошие новости!
                </p>
                <p className="break-words text-sm text-muted-foreground">
                  Скоро вы сможете дать вашему ИИ-агенту использовать hiiire через MCP. Это полезно, если вы используете
                  Codex, Claude Code, Hermes или OpenClaw, а также любых других провайдеров и агентов, которые поддерживают
                  MCP.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Google Calendar Integration */}
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <CardTitle>Google Calendar</CardTitle>
                  <CardDescription>
                    Подключение календаря пока недоступно
                  </CardDescription>
                </div>
                <Badge variant="outline" className="w-fit shrink-0 bg-gray-500 text-white">
                  <X className="mr-1 h-3 w-3" />
                  Не подключено
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertDescription className="text-sm">
                  <strong>Функция в разработке</strong>
                  <br />
                  Сейчас приложение не синхронизирует события с Google Calendar. Когда интеграция появится, здесь будет
                  доступно подключение календаря.
                </AlertDescription>
              </Alert>
              <Button disabled className="w-full">
                <Cable className="mr-2 h-4 w-4" />
                Подключить Google Calendar (скоро)
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Настройки уведомлений</CardTitle>
              <CardDescription>
                Управляйте уведомлениями о событиях
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-0.5">
                  <Label>Email‑уведомления</Label>
                  <p className="text-sm text-muted-foreground">
                    Получайте уведомления на{" "}
                    {emailStatus?.email ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="inline cursor-help text-inherit underline decoration-dotted underline-offset-2"
                              aria-label="Показать email для уведомлений"
                            >
                              email
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="break-all">{emailStatus.email}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      "email"
                    )}
                    .
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Switch
                    checked={Boolean(emailStatus?.emailEnabled ?? true)}
                    onCheckedChange={(v) => void handleToggleEmailEnabled(Boolean(v))}
                    disabled={emailLoading || !emailStatus?.email}
                    aria-label="Включить или выключить Email‑уведомления"
                    className="shrink-0"
                  />
                </div>

              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    Telegram
                  </CardTitle>
                  <CardDescription className="mt-2">
                    Получайте моментальные уведомления о важных событиях прямо в Telegram
                  </CardDescription>
                </div>
                {tgStatus?.connected ? (
                  <Badge variant="outline" className="w-fit shrink-0 bg-green-500 text-white">
                    <Check className="mr-1 h-3 w-3" />
                    Подключено
                  </Badge>
                ) : (
                  <Badge variant="outline" className="w-fit shrink-0 bg-gray-500 text-white">
                    <X className="mr-1 h-3 w-3" />
                    Не подключено
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 break-words text-sm text-muted-foreground">
                  {tgStatus?.connected
                    ? `Подключено: ${new Date(tgStatus.connectedAt).toLocaleString("ru-RU")}`
                    : "Не подключено."}
                  {tgLastUpdatedAt ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Обновлено: {new Date(tgLastUpdatedAt).toLocaleTimeString()}
                    </div>
                  ) : null}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => void loadTelegramStatus()}
                  disabled={tgLoading}
                  aria-label="Обновить статус Telegram"
                  title="Обновить статус"
                  className="shrink-0"
                >
                  <RefreshCw className={tgLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                </Button>
              </div>

              {isTelegramConnected ? (
                <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-0.5">
                    <Label>Получать Telegram‑уведомления</Label>
                    <p className="text-sm text-muted-foreground">
                      Можно выключить уведомления, не отключая связку с Telegram
                    </p>
                  </div>
                  <Switch
                    checked={Boolean(tgStatus?.telegramEnabled ?? true)}
                    onCheckedChange={(v) => void handleToggleTelegramEnabled(Boolean(v))}
                    disabled={tgLoading}
                    className="shrink-0"
                  />
                </div>
              ) : null}

              {!tgStatus?.connected ? (
                <Button className="w-full" onClick={() => void handleConnectTelegram()} disabled={tgLoading}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Подключить Telegram
                </Button>
              ) : (
                <Button className="w-full" variant="outline" onClick={() => void handleDisconnectTelegram()} disabled={tgLoading}>
                  Отключить Telegram
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Plan Tab */}
        <TabsContent value="plan" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <CardTitle>Текущий тариф</CardTitle>
                  <CardDescription>
                    Управляйте подпиской и возможностями аккаунта
                  </CardDescription>
                </div>
                {currentPlan === "trial" ? (
                  isTrialExpired ? (
                    <Badge variant="outline" className="w-fit shrink-0">Истёк</Badge>
                  ) : trialDaysLeft !== null ? (
                    <Badge variant="outline" className="w-fit shrink-0">
                      Пробный · {trialDaysLeft} {trialDaysLeft === 1 ? "день" : trialDaysLeft !== null && trialDaysLeft < 5 ? "дня" : "дней"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="w-fit shrink-0">Пробный</Badge>
                  )
                ) : (
                  <Badge variant="outline" className="w-fit shrink-0 uppercase">
                    {planLabel(currentPlan)}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Credits */}
              <div className="mb-5 rounded-lg border bg-card/50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Кредиты (AI анализ)</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label="Как работают кредиты"
                            >
                              <Info className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <div className="space-y-1">
                              <p>Кредиты расходуются на AI-анализ резюме.</p>
                              <p className="tabular-nums">В резерве: {credits ? credits.reserved : "—"}</p>
                              {credits ? <p className="tabular-nums">Всего: {credits.balance}</p> : null}
                              <p>Доступно = всего - резерв</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <div className="min-w-0">
                      <div className="mt-1 flex items-baseline gap-2">
                        <div className="text-2xl font-semibold tabular-nums">
                          {isCreditsLoading ? "…" : credits ? credits.available : "—"}
                        </div>
                        <div className="text-sm text-muted-foreground">доступно</div>
                      </div>
                    </div>
                  </div>
                  {user?.role === "admin" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full shrink-0 sm:w-auto"
                      onClick={() => setCreditTopupOpen(true)}
                      disabled={isPlanLoading || !!planError || billingStatus === "inactive"}
                    >
                      <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
                      Пополнить баланс
                    </Button>
                  ) : null}
                </div>

                {creditsUnauth ? (
                  <Alert className="mt-3">
                    <AlertTitle>Баланс недоступен в демо</AlertTitle>
                    <AlertDescription className="text-sm">
                      Баланс кредитов показывается для пользователей в режиме Supabase. Если вы в демо‑режиме — войдите как реальный пользователь или подключите Supabase окружение.
                    </AlertDescription>
                  </Alert>
                ) : creditsError ? (
                  <Alert variant="destructive" className="mt-3">
                    <AlertTitle>Не удалось загрузить кредиты</AlertTitle>
                    <AlertDescription className="text-sm">{creditsError}</AlertDescription>
                  </Alert>
                ) : null}
              </div>

              {!isPlanLoading && !planError && currentPlan === "trial" && (isTrialExpired || trialDaysLeft !== null) && (
                <Alert className="mb-4">
                  <AlertDescription className="text-sm">
                    {isTrialExpired ? (
                      <>
                        <strong>Пробный период истёк.</strong> Выберите тариф ниже, чтобы продолжить работу с сервисом.
                      </>
                    ) : (
                      <>
                        Пробный период:{" "}
                        <strong>
                          осталось {trialDaysLeft} {trialDaysLeft === 1 ? "день" : trialDaysLeft !== null && trialDaysLeft < 5 ? "дня" : "дней"}
                        </strong>
                        {trialExpiresAt ? ` (до ${new Date(trialExpiresAt).toLocaleDateString("ru-RU")})` : ""}.
                        {intendedPlan ? ` Рекомендованный тариф: ${planLabel(intendedPlan as PlanKey)}.` : ""}
                      </>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {!isPlanLoading && !planError && currentPlan !== "trial" && periodStart && periodEnd ? (
                <Alert className="mb-4">
                  <AlertDescription className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      Период подписки: <strong>{new Date(periodStart).toLocaleDateString("ru-RU")}</strong> —{" "}
                      <strong>{new Date(periodEnd).toLocaleDateString("ru-RU")}</strong>.{" "}
                      {autoRenew ? "Автопродление включено." : "Автопродление выключено."}
                    </span>
                    {user?.role === "admin" && (currentPlan === "starter" || currentPlan === "professional") ? (
                      autoRenew ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full shrink-0 sm:w-auto"
                          onClick={() => setAutoRenewConfirmOpen(true)}
                          disabled={isPlanActionLoading || isAutoRenewLoading || isCheckoutLoading}
                        >
                          {isAutoRenewLoading ? "Отключаем…" : "Отменить автопродление"}
                        </Button>
                      ) : billingStatus !== "inactive" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-full shrink-0 sm:w-auto"
                          onClick={() => void toggleAutoRenew(true)}
                          disabled={isPlanActionLoading || isAutoRenewLoading || isCheckoutLoading}
                        >
                          {isAutoRenewLoading ? "Включаем…" : "Включить автопродление"}
                        </Button>
                      ) : null
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : null}

              {!isPlanLoading && !planError && scheduledPlan && scheduledPlanEffectiveAt ? (
                <Alert className="mb-4">
                  <AlertDescription className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5 break-words">
                      Запланировано понижение до <strong>{planLabel(scheduledPlan)}</strong> с{" "}
                      <strong>{new Date(scheduledPlanEffectiveAt).toLocaleDateString("ru-RU")}</strong>.
                      {scheduledChangePaid ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label="Подробнее о запланированном понижении"
                              >
                                <Info className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              Оплачен переход на {planLabel(scheduledPlan)}. Он вступит в силу с{" "}
                              {new Date(scheduledPlanEffectiveAt).toLocaleDateString("ru-RU")}. До этой даты{" "}
                              {planLabel(currentPlan)} остаётся активным.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : null}
                    </span>
                    {!scheduledChangePaid ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full shrink-0 sm:w-auto"
                        onClick={() => void cancelScheduledDowngrade()}
                        disabled={isPlanActionLoading || user?.role !== "admin"}
                      >
                        {isPlanActionLoading ? "Отменяем…" : "Отменить понижение"}
                      </Button>
                    ) : null}
                  </AlertDescription>
                </Alert>
              ) : null}

              {!isPlanLoading && !planError && planChangeRequest ? (
                <Alert className="mb-4">
                  <AlertTitle>{planChangeRequest.statusTitle}</AlertTitle>
                  <AlertDescription className="space-y-2 text-sm">
                    <p>
                      Заявка на смену тарифа: <strong>{planLabel(planChangeRequest.currentPlan)}</strong> →{" "}
                      <strong>{planLabel(planChangeRequest.targetPlan)}</strong>.
                    </p>
                    <p>{planChangeRequest.statusDescription}</p>
                    {planChangeRequest.publicResponse ? <p>{planChangeRequest.publicResponse}</p> : null}
                  </AlertDescription>
                </Alert>
              ) : null}

              {!isPlanLoading && !planError && planChangeRequestError ? (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription className="text-sm">{planChangeRequestError}</AlertDescription>
                </Alert>
              ) : null}

              {!isPlanLoading && !planError && isPlanChangeRequestLoading && !planChangeRequest ? (
                <div className="mb-4 text-sm text-muted-foreground">Загружаем статус заявки…</div>
              ) : null}

              {isPlanLoading ? (
                <div className="text-sm text-muted-foreground">Загрузка тарифа…</div>
              ) : planError ? (
                <div className="space-y-3">
                  <Alert variant="destructive">
                    <AlertDescription className="text-sm">{planError}</AlertDescription>
                  </Alert>
                  <Button variant="outline" onClick={() => void loadPlan()}>
                    Обновить
                  </Button>
                </div>
              ) : null}

              {!isPlanLoading && !planError && user?.role !== "admin" ? (
                <Alert>
                  <AlertDescription className="text-sm">
                    Изменять тариф может только <strong>администратор вашей компании</strong>.
                  </AlertDescription>
                </Alert>
              ) : null}

              {!isPlanLoading && !planError && billingStatus === "grace" && periodEnd ? (
                <Alert className="mb-4">
                  <AlertDescription className="text-sm">
                    <strong>Платёж не прошёл, действует grace-период.</strong>{" "}
                    AI-функции пока доступны до{" "}
                    <strong>{new Date(new Date(periodEnd).getTime() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString("ru-RU")}</strong>.
                  </AlertDescription>
                </Alert>
              ) : null}

              {!isPlanLoading && !planError && billingStatus === "inactive" && currentPlan !== "trial" ? (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription className="text-sm">
                    Подписка неактивна. CRM остаётся доступной, но AI-функции отключены до оплаты.
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {/* Starter */}
                <Card className={currentPlan === "starter" ? "border-primary" : (intendedPlan === "starter" && currentPlan === "trial") ? "border-primary/40" : undefined}>
                  <CardHeader>
                    <CardTitle className="flex min-w-0 items-center justify-between gap-2">
                      Starter
                      {currentPlan === "starter" ? (
                        <Badge variant="outline" className={currentPlanStatusBadge.className}>
                          {currentPlanStatusBadge.label}
                        </Badge>
                      ) : (intendedPlan === "starter" && currentPlan === "trial") ? (
                        <Badge variant="outline" className="shrink-0">Рекомендован</Badge>
                      ) : null}
                    </CardTitle>
                    <CardDescription>4 990₽/мес</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Безлимит рекрутеров, вакансий и кандидатов</li>
                      <li>500 AI-запросов в месяц</li>
                      <li>Интеграция с HH.ru</li>
                      <li>Telegram и Email уведомления</li>
                      <li>Календарь собеседований и Google Calendar (скоро)</li>
                      <li>AI советы по вакансиям</li>
                      <li>Аналитика и отчёты</li>
                      <li>HR-ассистент</li>
                    </ul>
                    <div className="relative">
                      <Button
                        className="w-full"
                        variant={currentPlan === "starter" || getPlanActionKind("starter") === "downgrade" ? "outline" : "default"}
                        disabled={isStarterPlanButtonDisabled}
                        aria-disabled={isStarterPlanButtonDisabled}
                        onClick={() => handlePlanAction("starter")}
                      >
                        {getPlanButtonLabel("starter")}
                      </Button>
                      {isStarterBlockedByBillingConsent ? (
                        <button
                          type="button"
                          className={cn(
                            "absolute inset-0 z-10 rounded-md bg-transparent text-transparent",
                            "cursor-not-allowed outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                          )}
                          aria-label="Для оплаты Starter согласитесь с условиями и поставьте галочку внизу страницы."
                          onClick={showBillingConsentRequiredToast}
                        >
                          {getPlanButtonLabel("starter")}
                        </button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>

                {/* Professional */}
                <Card className={currentPlan === "professional" ? "border-primary" : (intendedPlan === "professional" && currentPlan === "trial") ? "border-primary/40" : undefined}>
                  <CardHeader>
                    <CardTitle className="flex min-w-0 items-center justify-between gap-2">
                      Professional
                      {currentPlan === "professional" ? (
                        <Badge variant="outline" className={currentPlanStatusBadge.className}>
                          {currentPlanStatusBadge.label}
                        </Badge>
                      ) : (intendedPlan === "professional" && currentPlan === "trial") ? (
                        <Badge variant="outline" className="shrink-0">Рекомендован</Badge>
                      ) : null}
                    </CardTitle>
                    <CardDescription>9 990₽/мес</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Безлимит рекрутеров, вакансий и кандидатов</li>
                      <li>2 000 AI-запросов в месяц</li>
                      <li>Интеграция с HH.ru</li>
                      <li>Telegram и Email уведомления</li>
                      <li>Календарь собеседований и Google Calendar (скоро)</li>
                      <li>AI советы по вакансиям</li>
                      <li>Аналитика и отчёты</li>
                      <li>HR-ассистент</li>
                      <li>Приоритетная поддержка</li>
                    </ul>
                    <div className="relative">
                      <Button
                        className="w-full"
                        variant={currentPlan === "professional" || getPlanActionKind("professional") === "downgrade" ? "outline" : "default"}
                        disabled={isProfessionalPlanButtonDisabled}
                        aria-disabled={isProfessionalPlanButtonDisabled}
                        onClick={() => handlePlanAction("professional")}
                      >
                        {getPlanButtonLabel("professional")}
                      </Button>
                      {isProfessionalBlockedByBillingConsent ? (
                        <button
                          type="button"
                          className={cn(
                            "absolute inset-0 z-10 rounded-md bg-transparent text-transparent",
                            "cursor-not-allowed outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                          )}
                          aria-label="Для оплаты Professional согласитесь с условиями и поставьте галочку внизу страницы."
                          onClick={showBillingConsentRequiredToast}
                        >
                          {getPlanButtonLabel("professional")}
                        </button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>

                {/* Enterprise */}
                <Card className={currentPlan === "enterprise" ? "border-primary" : (intendedPlan === "enterprise" && currentPlan === "trial") ? "border-primary/40" : undefined}>
                  <CardHeader>
                    <CardTitle className="flex min-w-0 items-center justify-between gap-2">
                      Enterprise
                      {currentPlan === "enterprise" ? (
                        <Badge variant="outline" className={currentPlanStatusBadge.className}>
                          {currentPlanStatusBadge.label}
                        </Badge>
                      ) : (
                        <Crown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </CardTitle>
                    <CardDescription>Индивидуально</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Всё из Professional</li>
                      <li>Индивидуальные лимиты AI-запросов со скидкой</li>
                      <li>Выделенный менеджер</li>
                      <li>Обучение команды</li>
                    </ul>
                    {activePlanChangeRequest ? (
                      <Alert>
                        <AlertTitle>{activePlanChangeRequest.statusTitle}</AlertTitle>
                        <AlertDescription className="text-sm">
                          {activePlanChangeRequest.statusDescription}
                        </AlertDescription>
                      </Alert>
                    ) : enterpriseLeadStatus && currentPlan !== "enterprise" ? (
                      <Alert variant={enterpriseLeadStatus.tone === "destructive" ? "destructive" : undefined}>
                        <AlertDescription className="text-sm">
                          <strong>{enterpriseLeadStatus.title}</strong>
                          <br />
                          {enterpriseLeadStatus.description}
                        </AlertDescription>
                      </Alert>
                    ) : null}
                    {user?.role !== "admin" ? (
                      <Button className="w-full" variant="outline" disabled>
                        Недоступно
                      </Button>
                    ) : isPlanChangeRequestLoading ? (
                      <Button className="w-full" variant="outline" disabled>
                        Проверяем статус…
                      </Button>
                    ) : activePlanChangeRequest ? (
                      <Button className="w-full" variant="outline" disabled>
                        Заявка в работе
                      </Button>
                    ) : currentPlan === "enterprise" && billingStatus === "active" ? (
                      <Button
                        className="w-full"
                        variant="outline"
                        disabled={isEnterprisePlanChangeSubmitting}
                        onClick={() => {
                          setEnterprisePlanChangePlan("enterprise");
                          setEnterprisePlanChangeMessage("");
                          setEnterprisePlanChangeOpen(true);
                        }}
                      >
                        Изменить условия
                      </Button>
                    ) : isEnterpriseLeadLoading ? (
                      <Button className="w-full" variant="outline" disabled>
                        Проверяем статус…
                      </Button>
                    ) : enterpriseLeadStatus && !enterpriseLeadStatus.canResubmit ? (
                      <Button className="w-full" variant="outline" disabled>
                        {enterpriseLeadStatus.submitLabel}
                      </Button>
                    ) : (
                      <Button className="w-full" variant="default" asChild>
                        <Link href="/request-access?plan=enterprise&source=dashboard-settings-plan">
                          {enterpriseLeadStatus?.canResubmit ? enterpriseLeadStatus.submitLabel : "Оставить заявку"}
                        </Link>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Consent block required by international payment systems */}
              {user?.role === "admin" && !isPlanLoading && !planError ? (
                <div className="mt-4 flex min-w-0 items-start gap-3 rounded-md border bg-muted/30 p-4">
                  <Checkbox
                    id="billing-consent"
                    checked={billingConsent}
                    onCheckedChange={(v) => setBillingConsent(v === true)}
                    className="mt-0.5 shrink-0"
                  />
                  <label htmlFor="billing-consent" className="min-w-0 cursor-pointer select-none break-words text-xs leading-relaxed text-muted-foreground">
                    Нажимая кнопку оплаты, я даю согласие на регулярные списания в соответствии с выбранным тарифом,
                    на обработку персональных данных и принимаю условия{" "}
                    <Link href="/terms" target="_blank" className="text-primary underline hover:text-primary/80">
                      публичной оферты
                    </Link>
                    {" "}и{" "}
                    <Link href="/privacy" target="_blank" className="text-primary underline hover:text-primary/80">
                      политики конфиденциальности
                    </Link>.
                  </label>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Dialog
            open={creditTopupOpen}
            onOpenChange={(nextOpen) => {
              if (!nextOpen && isCreditTopupLoading) return;
              setCreditTopupOpen(nextOpen);
              if (!nextOpen) setCreditTopupConsent(false);
            }}
          >
            <DialogContent showCloseButton={!isCreditTopupLoading} className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Пополнить баланс</DialogTitle>
                <DialogDescription>
                  {CREDIT_TOPUP_PRICE_KOPECKS / 100} ₽ за кредит. После оплаты кредиты добавятся в общий баланс и останутся на нём.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {CREDIT_TOPUP_PRESETS.map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      variant={creditTopupCredits === preset ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCreditTopupQuantity(String(preset))}
                      disabled={isCreditTopupLoading}
                    >
                      {preset}
                    </Button>
                  ))}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="credit-topup-quantity">Количество кредитов</Label>
                  <Input
                    id="credit-topup-quantity"
                    value={creditTopupQuantity}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={5}
                    onChange={(event) => handleCreditTopupQuantityChange(event.target.value)}
                    disabled={isCreditTopupLoading}
                  />
                </div>

                <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="text-muted-foreground">К оплате</span>
                  <span className="font-medium tabular-nums">
                    {creditTopupCredits ? (creditTopupAmountKopecks / 100).toLocaleString("ru-RU") : "—"} ₽
                  </span>
                </div>

                <div className="flex min-w-0 items-start gap-3 rounded-md border bg-muted/30 p-3">
                  <Checkbox
                    id="topup-consent"
                    checked={creditTopupConsent}
                    onCheckedChange={(v) => setCreditTopupConsent(v === true)}
                    className="mt-0.5 shrink-0"
                    disabled={isCreditTopupLoading}
                  />
                  <label htmlFor="topup-consent" className="min-w-0 cursor-pointer select-none break-words text-xs leading-relaxed text-muted-foreground">
                    Нажимая кнопку оплаты, я принимаю условия{" "}
                    <Link href="/terms" target="_blank" className="text-primary underline hover:text-primary/80">
                      публичной оферты
                    </Link>
                    {" "}и{" "}
                    <Link href="/privacy" target="_blank" className="text-primary underline hover:text-primary/80">
                      политики конфиденциальности
                    </Link>.
                  </label>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreditTopupOpen(false)}
                  disabled={isCreditTopupLoading}
                >
                  Отмена
                </Button>
                <Button
                  type="button"
                  onClick={() => void startCreditTopup()}
                  disabled={
                    isCreditTopupLoading
                    || !isCreditTopupAvailable
                    || creditTopupCredits === null
                    || !creditTopupConsent
                  }
                >
                  {isCreditTopupLoading ? "Переходим к оплате…" : "Оплатить"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={enterprisePlanChangeOpen}
            onOpenChange={(nextOpen) => {
              if (!nextOpen && isEnterprisePlanChangeSubmitting) return;
              setEnterprisePlanChangeOpen(nextOpen);
              if (!nextOpen) {
                setEnterprisePlanChangePlan(null);
                setEnterprisePlanChangeMessage("");
              }
            }}
          >
            <DialogContent showCloseButton={!isEnterprisePlanChangeSubmitting}>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitEnterprisePlanChangeRequest();
                }}
              >
                <DialogHeader>
                  <DialogTitle>
                    {enterprisePlanChangePlan
                      ? enterprisePlanChangePlan === "enterprise"
                        ? "Изменить условия Enterprise"
                        : `Сменить Enterprise на ${planLabel(enterprisePlanChangePlan)}`
                      : "Сменить Enterprise"}
                  </DialogTitle>
                  <DialogDescription>
                    Мы проверим условия Enterprise и свяжемся с вами.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="enterprise-plan-change-message">Комментарий</Label>
                  <Textarea
                    id="enterprise-plan-change-message"
                    value={enterprisePlanChangeMessage}
                    onChange={(e) => setEnterprisePlanChangeMessage(e.target.value)}
                    placeholder="Например, когда удобнее обсудить переход"
                    maxLength={2000}
                    disabled={isEnterprisePlanChangeSubmitting}
                    rows={4}
                  />
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEnterprisePlanChangeOpen(false);
                      setEnterprisePlanChangePlan(null);
                      setEnterprisePlanChangeMessage("");
                    }}
                    disabled={isEnterprisePlanChangeSubmitting}
                  >
                    Отмена
                  </Button>
                  <Button type="submit" disabled={isEnterprisePlanChangeSubmitting || !enterprisePlanChangePlan}>
                    {isEnterprisePlanChangeSubmitting ? "Отправляем…" : "Оставить заявку"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <AlertDialog
            open={downgradeConfirmOpen}
            onOpenChange={(open) => {
              setDowngradeConfirmOpen(open);
              if (!open) setDowngradeConfirmPlan(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Подтвердите понижение тарифа</AlertDialogTitle>
                <AlertDialogDescription>
                  {isDowngradeScheduleMode ? (
                    <>
                      Тариф изменится со следующего периода. Текущие кредиты сохранятся до конца периода
                      {periodEnd ? ` (до ${new Date(periodEnd).toLocaleDateString("ru-RU")})` : ""}.
                    </>
                  ) : isPaidDowngradeScheduleMode ? (
                    <>
                      После оплаты Starter включится со следующего периода
                      {periodEnd ? ` — ${new Date(periodEnd).toLocaleDateString("ru-RU")}` : ""}. До этой даты Professional останется активным.
                    </>
                  ) : (
                    <>
                      Для этого сценария изменение тарифа выполняется через новую оплату.
                      {currentPlan === "professional" && !autoRenew
                        ? " Автопродление выключено, поэтому автоматическое применение в следующий период недоступно."
                        : ""}
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isCheckoutLoading || isPlanActionLoading}>Отмена</AlertDialogCancel>
                <AlertDialogAction
                  disabled={isCheckoutLoading || isPlanActionLoading}
                  onClick={(e) => {
                    e.preventDefault();
                    void confirmDowngrade();
                  }}
                >
                  {isDowngradeScheduleMode ? "Запланировать понижение" : isPaidDowngradeScheduleMode ? "Оплатить Starter" : "Перейти к оплате"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog
            open={autoRenewConfirmOpen}
            onOpenChange={(open) => setAutoRenewConfirmOpen(open)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Отменить автопродление?</AlertDialogTitle>
                <AlertDialogDescription>
                  {billingStatus === "grace" ? (
                    <>
                      <strong>Внимание:</strong> подписка находится в grace-периоде.
                      Если отключить автопродление сейчас, подписка станет неактивной немедленно
                      и AI-функции будут отключены.
                    </>
                  ) : (
                    <>
                      Подписка останется активной до конца оплаченного периода
                      {periodEnd ? ` (${new Date(periodEnd).toLocaleDateString("ru-RU")})` : ""}.
                      После этого AI-функции будут отключены, но CRM останется доступной.
                      {scheduledPlan && !scheduledChangePaid ? " Запланированное понижение тарифа также будет отменено." : ""}
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isAutoRenewLoading}>Назад</AlertDialogCancel>
                <AlertDialogAction
                  disabled={isAutoRenewLoading}
                  onClick={(e) => {
                    e.preventDefault();
                    void toggleAutoRenew(false);
                  }}
                >
                  {isAutoRenewLoading ? "Отключаем…" : "Отключить автопродление"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
