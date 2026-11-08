"use client";

import * as React from "react";
import {
  Brain,
  FileText,
  Mail,
  Phone,
  Copy,
  ExternalLink,
  Pencil,
  Trash2,
  AtSign,
  MessageCircle,
  Link as LinkIcon,
  Github,
  Sparkles,
  User,
  Calendar,
  Briefcase,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  MapPin,
  MessageSquare,
  Wallet,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import Link from "next/link";

import type { Candidate, Vacancy } from "@/types";
import { canOpenCandidateResume, getResumeDisabledTooltip } from "@/lib/candidates/resume-links";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { normalizeDisplayText } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { createCandidateContact, deleteCandidateContact, updateCandidateContact } from "@/services/data/candidate-contacts";
import { updateCandidateName } from "@/services/data/candidates";
import { getPhoneValidationMessage, PHONE_MAX_LENGTH, sanitizePhoneInput } from "@/lib/validation/phone";
import { readUserFacingApiErrorMessage } from "@/lib/api/user-facing-errors";
import { FIRST_AI_ONBOARDING_REFRESH_EVENT, notifyFirstAiOnboardingChanged } from "@/lib/onboarding/first-ai-client-events";
import type { FirstAiOnboardingClientEventDetail } from "@/lib/onboarding/first-ai-client-events";

const statusLabels: Record<string, string> = {
  new: "Новый",
  reviewing: "Рассмотрение",
  "security-check": "Проверка СБ",
  "interview-scheduled": "Собеседование",
  interviewed: "Опрошен",
  offer: "Оффер",
  hired: "Принят",
  rejected: "Отклонён",
};

const statusColors: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  reviewing: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  "security-check": "bg-amber-500/10 text-amber-600 border-amber-500/20",
  "interview-scheduled": "bg-purple-500/10 text-purple-600 border-purple-500/20",
  interviewed: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  offer: "bg-green-500/10 text-green-600 border-green-500/20",
  hired: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-600 border-red-500/20",
};

const sourceLabels: Record<string, string> = {
  "hh.ru": "HeadHunter",
  manual: "Вручную",
  referral: "Реферал",
  other: "Другое",
};

const HH_RAW_JSON_MARKER = "Полные данные HH.ru (JSON):";
const CANDIDATE_PHONE_MIN_DIGITS = 10;

function stripHhRawJsonForDisplay(input: string | undefined): string {
  const text = String(input ?? "").trim();
  if (!text) return "";

  const markerIndex = text.indexOf(HH_RAW_JSON_MARKER);
  if (markerIndex < 0) return text;

  return text.slice(0, markerIndex).trim();
}

function getScoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 85) return "text-green-600";
  if (score >= 70) return "text-yellow-600";
  return "text-red-600";
}

function getScoreLabel(score: number | null): string {
  if (score === null) return "Не оценен";
  if (score >= 85) return "Отлично подходит";
  if (score >= 70) return "Хорошо подходит";
  return "Низкое соответствие";
}

function Section({
  title,
  icon,
  children,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="flex items-center gap-2 mb-3">
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function BulletList({
  items,
  variant = "neutral",
}: {
  items: string[];
  variant?: "positive" | "negative" | "neutral";
}) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Нет данных.</p>;

  const bulletColor =
    variant === "positive"
      ? "bg-green-500"
      : variant === "negative"
        ? "bg-red-500"
        : "bg-muted-foreground/60";

  return (
    <ul className="space-y-2">
      {items.map((t, idx) => (
        <li key={`${idx}-${t}`} className="flex gap-2.5 text-sm leading-relaxed">
          <span
            className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${bulletColor}`}
            aria-hidden="true"
          />
          <span className="min-w-0">{t}</span>
        </li>
      ))}
    </ul>
  );
}

function getCategoryLabel(key: string): string {
  const labels: Record<string, string> = {
    skills: "Навыки",
    experience: "Опыт",
    education: "Образование",
    achievements: "Достижения",
    cultural_fit: "Культурное соответствие",
  };

  return labels[key] ?? key;
}

function isCategoryExcludedFromMatch(
  key: string,
  val:
    | {
        includedInMatch?: boolean;
        criterionState?: "required" | "optional" | "not_required";
        criterionEvidence?: string[];
      }
    | undefined
): boolean {
  if (key !== "education") return false;

  const hasEducationMatchMetadata =
    typeof val?.includedInMatch === "boolean" ||
    typeof val?.criterionState === "string" ||
    Array.isArray(val?.criterionEvidence);

  if (!hasEducationMatchMetadata) return false;

  const hasEducationEvidence =
    Array.isArray(val?.criterionEvidence) && val.criterionEvidence.some((item) => item.trim().length > 0);

  return !(val?.criterionState === "required" && val?.includedInMatch === true && hasEducationEvidence);
}

function CategoryBar({
  label,
  score,
  feedback,
  details,
  excludedFromMatch,
}: {
  label: string;
  score: number;
  feedback: string;
  details?: string[];
  excludedFromMatch?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="min-w-0 space-y-1">
          <span className="block break-words font-medium">{label}</span>
          {excludedFromMatch ? (
            <p className="break-words text-xs text-muted-foreground">Не учитывалось в итоговой оценке</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {excludedFromMatch ? (
            <Badge variant="outline" className="shrink-0 text-xs">
              Не учитывалось
            </Badge>
          ) : null}
          {!excludedFromMatch ? <span className={`shrink-0 text-sm font-semibold ${getScoreColor(score)}`}>{score}%</span> : null}
        </div>
      </div>
      {!excludedFromMatch ? <Progress value={score} className="h-2" /> : null}
      <p className="min-w-0 break-words text-xs text-muted-foreground">{feedback}</p>
      {Array.isArray(details) && details.length > 0 ? (
        <ul className="min-w-0 space-y-1 pl-4 text-xs text-muted-foreground">
          {details.map((detail, idx) => (
            <li key={`${idx}-${detail}`} className="min-w-0 list-disc break-words">
              {detail}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function CandidateDetails({
  candidate,
  vacancy,
  desiredSalaryText,
  jobStatus,
  creditsBlocked,
  canManageBilling = false,
  retrySubmitting,
  onOpenResume,
  onScheduleInterview,
  onRetryAnalysis,
  onContactsChanged,
  onNameChanged,
  statusControl,
  commentEditor,
  onClose,
}: {
  candidate: Candidate;
  vacancy?: Vacancy;
  desiredSalaryText?: string | null;
  jobStatus?: "queued" | "processing" | "done" | "failed" | "canceled";
  creditsBlocked: boolean;
  canManageBilling?: boolean;
  retrySubmitting?: boolean;
  onOpenResume: (candidate: Candidate) => void;
  onScheduleInterview?: (candidate: Candidate) => void;
  onRetryAnalysis: (candidateId: string) => void;
  onContactsChanged?: (candidateId: string, nextContacts: NonNullable<Candidate["contacts"]>) => void;
  onNameChanged?: (candidateId: string, nextName: string) => void;
  statusControl?: React.ReactNode;
  commentEditor?: React.ReactNode;
  onClose?: () => void;
}) {
  const ai = candidate.aiAnalysis;
  const displayResumeText = stripHhRawJsonForDisplay(candidate.resumeText);
  const hasResumeText = Boolean(displayResumeText);
  const hhAutoSurveyText = stripHhRawJsonForDisplay(candidate.hhAutoSurveyText);
  const score = candidate.matchPercentage;
  const isFinalizing = jobStatus === "done" && score === null;
  const isActiveJob = jobStatus === "queued" || jobStatus === "processing" || isFinalizing;
  const isUnscoredNoJob = score === null && !isActiveJob && jobStatus !== "failed";
  const retryDisabled = Boolean(creditsBlocked || retrySubmitting);
  const creditsBlockedText = canManageBilling
    ? "Пополните баланс или обновите тариф, чтобы запустить анализ."
    : "Кредиты закончились. Обратитесь к администратору аккаунта, чтобы продолжить AI-анализ.";
  const canOpenResume = canOpenCandidateResume(candidate);
  const resumeDisabledTooltip = getResumeDisabledTooltip(candidate);
  const [displayName, setDisplayName] = React.useState<string>(() => candidate.name);
  const [contacts, setContacts] = React.useState<NonNullable<Candidate["contacts"]>>(() => candidate.contacts ?? []);
  const contactsRef = React.useRef<NonNullable<Candidate["contacts"]>>(contacts);

  const [contactDialogOpen, setContactDialogOpen] = React.useState(false);
  const [contactSubmitting, setContactSubmitting] = React.useState(false);
  const [editingContactId, setEditingContactId] = React.useState<string | null>(null);
  const [formType, setFormType] = React.useState<string>("email");
  const [formValue, setFormValue] = React.useState<string>("");
  const [formLabel, setFormLabel] = React.useState<string>("");

  const [nameDialogOpen, setNameDialogOpen] = React.useState(false);
  const [nameSubmitting, setNameSubmitting] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState<string>(() => candidate.name);
  const [firstAiPromptVisible, setFirstAiPromptVisible] = React.useState(false);
  const [firstAiPromptSaving, setFirstAiPromptSaving] = React.useState(false);
  const [firstAiOpenResultPending, setFirstAiOpenResultPending] = React.useState(false);
  const [firstAiPromptError, setFirstAiPromptError] = React.useState<string | null>(null);
  const firstAiPromptClosedRef = React.useRef(false);

  React.useEffect(() => {
    firstAiPromptClosedRef.current = false;
    setFirstAiPromptVisible(false);
    setFirstAiPromptError(null);
    setFirstAiOpenResultPending(false);
    setDisplayName(candidate.name);
    setNameDraft(candidate.name);

    const next = candidate.contacts ?? [];
    setContacts(next);
    contactsRef.current = next;
  }, [candidate.id, candidate.name, candidate.contacts]);

  const recordFirstAiOpenResult = React.useCallback(async () => {
    const res = await fetch("/api/onboarding/first-ai", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "open_result", candidateId: candidate.id }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(readUserFacingApiErrorMessage(json, "Не удалось обновить подсказку знакомства. Попробуйте ещё раз."));
    }
    setFirstAiOpenResultPending(false);
  }, [candidate.id]);

  const refreshFirstAiPrompt = React.useCallback(async () => {
    // score-only results also count as completed if the backend marks this candidate as the first result.
    if (!ai && score === null) {
      setFirstAiPromptVisible(false);
      setFirstAiPromptError(null);
      return;
    }
    if (firstAiPromptClosedRef.current) return;

    const res = await fetch("/api/onboarding/first-ai", { method: "GET", cache: "no-store" });
    const json = (await res.json().catch(() => null)) as { progress?: { visible?: boolean; step?: string; candidateId?: string | null } } | null;
    if (firstAiPromptClosedRef.current) return;
    if (!res.ok || !json?.progress) {
      setFirstAiPromptError(readUserFacingApiErrorMessage(json, "Не удалось обновить подсказку знакомства. Попробуйте ещё раз."));
      return;
    }

    setFirstAiPromptError(null);
    const isFirstResult = Boolean(
      json.progress.visible &&
        json.progress.step === "result_ready" &&
        (!json.progress.candidateId || json.progress.candidateId === candidate.id)
    );
    setFirstAiPromptVisible(isFirstResult);
    if (isFirstResult) {
      await recordFirstAiOpenResult().catch(() => setFirstAiOpenResultPending(true));
    }
  }, [ai, candidate.id, recordFirstAiOpenResult, score]);

  React.useEffect(() => {
    void refreshFirstAiPrompt();
  }, [refreshFirstAiPrompt]);

  React.useEffect(() => {
    const refresh = (event: Event) => {
      const detail = event instanceof CustomEvent ? (event.detail as FirstAiOnboardingClientEventDetail | undefined) : undefined;
      if (detail?.completed || detail?.dismissed) {
        firstAiPromptClosedRef.current = true;
        setFirstAiPromptVisible(false);
        setFirstAiPromptError(null);
        setFirstAiOpenResultPending(false);
        return;
      }
      void refreshFirstAiPrompt();
    };
    window.addEventListener(FIRST_AI_ONBOARDING_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(FIRST_AI_ONBOARDING_REFRESH_EVENT, refresh);
  }, [refreshFirstAiPrompt]);

  React.useEffect(() => {
    if (!firstAiOpenResultPending || !firstAiPromptVisible) return;

    const retry = () => {
      if (document.visibilityState === "visible") void recordFirstAiOpenResult().catch(() => setFirstAiOpenResultPending(true));
    };
    window.addEventListener("focus", retry);
    document.addEventListener("visibilitychange", retry);
    const timer = window.setTimeout(retry, 10000);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", retry);
      document.removeEventListener("visibilitychange", retry);
    };
  }, [firstAiOpenResultPending, firstAiPromptVisible, recordFirstAiOpenResult]);

  async function acknowledgeFirstAiResult() {
    try {
      setFirstAiPromptSaving(true);
      const res = await fetch("/api/onboarding/first-ai", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "acknowledge_result", candidateId: candidate.id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(readUserFacingApiErrorMessage(json, "Не удалось сохранить завершение знакомства. Попробуйте ещё раз."));
      }
      setFirstAiOpenResultPending(false);
      setFirstAiPromptVisible(false);
      setFirstAiPromptError(null);
      firstAiPromptClosedRef.current = true;
      notifyFirstAiOnboardingChanged({ completed: true });
      toast.success("Знакомство завершено");
    } catch (e) {
      toast.error("Не удалось завершить знакомство", {
        description: e instanceof Error ? e.message : "Попробуйте ещё раз",
      });
    } finally {
      setFirstAiPromptSaving(false);
    }
  }

  function renderFirstAiPrompt() {
    if (firstAiPromptError) {
      return (
        <Card className="border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
          <div className="space-y-3">
            <div>
              <p className="font-medium">Не удалось обновить подсказку знакомства</p>
              <p className="mt-1 break-words text-sm text-muted-foreground">{firstAiPromptError}</p>
            </div>
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => void refreshFirstAiPrompt()}>
              Повторить
            </Button>
          </div>
        </Card>
      );
    }

    if (!firstAiPromptVisible) return null;

    return (
      <Card className="border-primary/20 bg-primary/5 p-4">
        <div className="space-y-3">
          <div>
            <p className="font-medium">Готово! Так выглядит карточка кандидата</p>
            <div className="mt-1 space-y-2 break-words text-sm text-muted-foreground">
              <p>
                Когда вся информация проанализирована ИИ, во вкладке «AI анализ» можно увидеть итоги и причины оценки. Во вкладке «Резюме» можно посмотреть резюме кандидата, а во вкладке «Данные» - все контакты, которые указал кандидат.
              </p>
              <p>
                Чтобы завершить знакомство с сервисом, нажмите «Понятно». Приглашаем вас опробовать сервис на своих процессах найма. Вы также можете записаться на демо с основателем сервиса, посмотреть Базу знаний или оставить обратную связь.
              </p>
              <p>Желаем адекватных кандидатов и продуктивной работы!</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="button" size="sm" onClick={() => void acknowledgeFirstAiResult()} disabled={firstAiPromptSaving}>
              {firstAiPromptSaving ? "Сохраняем…" : "Понятно"}
            </Button>
            <Button asChild type="button" size="sm" variant="outline">
              <Link href="/knowledge-base">База знаний</Link>
            </Button>
            <Button asChild type="button" size="sm" variant="outline">
              <Link href="/dashboard/feedback">Оставить обратную связь</Link>
            </Button>
            <Button asChild type="button" size="sm" variant="outline">
              <Link href="/request-access?demo=true" target="_blank" rel="noopener noreferrer">
                Записаться на демо
              </Link>
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  function syncContacts(next: NonNullable<Candidate["contacts"]>) {
    setContacts(next);
    contactsRef.current = next;
    onContactsChanged?.(candidate.id, next);
  }

  function openNameDialog() {
    setNameDraft(displayName);
    setNameDialogOpen(true);
  }

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      toast.error("Введите имя кандидата");
      return;
    }
    if (trimmed.length > 120) {
      toast.error("Слишком длинное имя", { description: "Максимум 120 символов." });
      return;
    }

    try {
      setNameSubmitting(true);
      await updateCandidateName(candidate.id, trimmed);
      setDisplayName(trimmed);
      onNameChanged?.(candidate.id, trimmed);
      setNameDialogOpen(false);
      toast.success("Имя обновлено");
    } catch (e) {
      toast.error("Не удалось обновить имя", { description: e instanceof Error ? e.message : "Попробуйте ещё раз" });
    } finally {
      setNameSubmitting(false);
    }
  }

  function normalizeContactInput(type: string, value: string): { type: string; value: string } {
    const t = type.trim();
    let v = value.trim();
    if (t === "email") v = v.toLowerCase();
    if (t === "telegram") {
      // Accept @username and t.me links; normalize to @username when possible.
      const m = v.match(/@([A-Za-z0-9_]{5,32})/);
      if (m) v = `@${m[1]}`;
      const link = v.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{5,32})/i);
      if (link) v = `@${link[1]}`;
    }
    if (t === "phone") {
      v = sanitizePhoneInput(v);
    }
    if (t === "whatsapp") {
      // Store digits only.
      const digits = v.replace(/[^\d]/g, "");
      v = digits;
    }
    if (
      t === "website" ||
      t === "linkedin" ||
      t === "github" ||
      t === "vk" ||
      t === "instagram" ||
      t === "discord" ||
      t === "habr_career"
    ) {
      if (v && !/^https?:\/\//i.test(v)) v = `https://${v}`;
    }
    return { type: t, value: v };
  }

  function isValidContact(type: string, value: string): string | null {
    const t = type.trim();
    const v = value.trim();
    if (!t) return "Выберите тип контакта.";
    if (!v) return "Введите значение контакта.";
    if (t === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(v)) return "Некорректный email.";
    }
    if (t === "telegram") {
      if (!/^@?[A-Za-z0-9_]{5,32}$/.test(v) && !/(?:t\.me|telegram\.me)\//i.test(v)) return "Введите @username или ссылку t.me.";
    }
    if (t === "phone") {
      const phoneError = getPhoneValidationMessage(v, { minDigits: CANDIDATE_PHONE_MIN_DIGITS });
      if (phoneError) return phoneError;
    }
    if (t === "whatsapp") {
      const digits = v.replace(/[^\d]/g, "");
      if (digits.length < 10) return "WhatsApp: нужен номер (минимум 10 цифр).";
    }
    if (
      t === "website" ||
      t === "linkedin" ||
      t === "github" ||
      t === "vk" ||
      t === "instagram" ||
      t === "discord" ||
      t === "habr_career"
    ) {
      if (!/^https?:\/\//i.test(v) && !/^[a-z0-9.-]+\.[a-z]{2,}/i.test(v)) return "Введите ссылку.";
    }
    return null;
  }

  function contactIcon(type: string) {
    const t = type.toLowerCase();
    if (t === "email") return <Mail className="h-4 w-4 text-primary" aria-hidden="true" />;
    if (t === "phone") return <Phone className="h-4 w-4 text-primary" aria-hidden="true" />;
    if (t === "telegram") return <AtSign className="h-4 w-4 text-primary" aria-hidden="true" />;
    if (t === "whatsapp") return <MessageCircle className="h-4 w-4 text-primary" aria-hidden="true" />;
    if (t === "github") return <Github className="h-4 w-4 text-primary" aria-hidden="true" />;
    if (
      t === "website" ||
      t === "linkedin" ||
      t === "vk" ||
      t === "instagram" ||
      t === "discord" ||
      t === "habr_career"
    ) {
      return <LinkIcon className="h-4 w-4 text-primary" aria-hidden="true" />;
    }
    return <User className="h-4 w-4 text-primary" aria-hidden="true" />;
  }

  function contactTitle(type: string): string {
    const t = type.toLowerCase();
    if (t === "email") return "Email";
    if (t === "phone") return "Телефон";
    if (t === "telegram") return "Telegram";
    if (t === "whatsapp") return "WhatsApp";
    if (t === "linkedin") return "LinkedIn";
    if (t === "github") return "GitHub";
    if (t === "website") return "Сайт";
    if (t === "vk") return "VK";
    if (t === "instagram") return "Instagram";
    if (t === "discord") return "Discord";
    if (t === "habr_career") return "Habr Career";
    if (t === "other") return "Контакт";
    return type;
  }

  function contactOpenUrl(type: string, value: string): string | null {
    const t = type.toLowerCase();
    const v = value.trim();
    if (!v) return null;
    if (t === "email") return `mailto:${v}`;
    if (t === "phone") return `tel:${v}`;
    if (t === "telegram") {
      const m = v.match(/^@([A-Za-z0-9_]{5,32})$/);
      if (m) return `https://t.me/${m[1]}`;
      if (/^https?:\/\//i.test(v)) return v;
      const link = v.match(/^(?:t\.me|telegram\.me)\/.+/i);
      if (link) return `https://${v}`;
      return null;
    }
    if (t === "whatsapp") {
      const digits = v.replace(/[^\d]/g, "");
      if (!digits) return null;
      return `https://wa.me/${digits}`;
    }
    if (
      t === "website" ||
      t === "linkedin" ||
      t === "github" ||
      t === "vk" ||
      t === "instagram" ||
      t === "discord" ||
      t === "habr_career"
    ) {
      if (/^https?:\/\//i.test(v)) return v;
      return `https://${v}`;
    }
    if (/^https?:\/\//i.test(v)) return v;
    return null;
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Скопировано");
    } catch {
      toast.error("Не удалось скопировать");
    }
  }

  function openContactDialog(contact?: NonNullable<Candidate["contacts"]>[number]) {
    if (!contact) {
      setEditingContactId(null);
      setFormType("email");
      setFormValue("");
      setFormLabel("");
      setContactDialogOpen(true);
      return;
    }
    setEditingContactId(contact.id);
    setFormType(contact.type);
    setFormValue(contact.value);
    setFormLabel(contact.label ?? "");
    setContactDialogOpen(true);
  }

  function handleContactTypeChange(value: string) {
    setFormType(value);
    setFormValue((prev) => {
      if (value === "phone") return sanitizePhoneInput(prev);
      if (value === "whatsapp") return prev.replace(/[^\d]/g, "");
      return prev;
    });
  }

  function handleContactValueChange(value: string) {
    if (formType === "phone") {
      setFormValue(sanitizePhoneInput(value));
      return;
    }

    if (formType === "whatsapp") {
      setFormValue(value.replace(/[^\d]/g, ""));
      return;
    }

    setFormValue(value);
  }

  async function saveContact() {
    const err = isValidContact(formType, formValue);
    if (err) {
      toast.error("Проверьте контакт", { description: err });
      return;
    }

    const normalized = normalizeContactInput(formType, formValue);

    try {
      setContactSubmitting(true);
      if (editingContactId) {
        const updated = await updateCandidateContact({
          candidateId: candidate.id,
          id: editingContactId,
          type: normalized.type,
          value: normalized.value,
          label: formLabel.trim() ? formLabel.trim() : undefined,
        });
        const next = contactsRef.current.map((c) => (c.id === updated.id ? updated : c));
        syncContacts(next);
        toast.success("Контакт обновлён");
      } else {
        const created = await createCandidateContact({
          candidateId: candidate.id,
          type: normalized.type,
          value: normalized.value,
          label: formLabel.trim() ? formLabel.trim() : undefined,
        });
        syncContacts([...contactsRef.current, created]);
        toast.success("Контакт добавлен");
      }
      setContactDialogOpen(false);
    } catch (e) {
      toast.error("Не удалось сохранить контакт", { description: e instanceof Error ? e.message : "Попробуйте ещё раз" });
    } finally {
      setContactSubmitting(false);
    }
  }

  async function removeContact(id: string) {
    try {
      await deleteCandidateContact(candidate.id, id);
      syncContacts(contactsRef.current.filter((c) => c.id !== id));
      toast.success("Контакт удалён");
    } catch (e) {
      toast.error("Не удалось удалить контакт", { description: e instanceof Error ? e.message : "Попробуйте ещё раз" });
    }
  }

  // Главный вывод: берём verdict, или формируем из summary, или генерируем дефолт
  const mainVerdict = React.useMemo(() => {
    if (ai?.verdict) return ai.verdict;
    if (ai?.summary) return ai.summary;
    if (score !== null) {
      if (score >= 85) return "Кандидат отлично подходит под требования вакансии. Рекомендуется пригласить на собеседование.";
      if (score >= 70) return "Кандидат хорошо подходит, но есть области для уточнения на интервью.";
      return "Кандидат требует дополнительного внимания. Рекомендуется детальный разбор резюме.";
    }
    return null;
  }, [ai, score]);
  const displayNameNormalized = React.useMemo(() => normalizeDisplayText(displayName), [displayName]);
  const positionNormalized = React.useMemo(() => normalizeDisplayText(candidate.position), [candidate.position]);

  return (
    <div className="flex h-full min-w-0 max-w-full flex-col overflow-y-auto sm:overflow-hidden bg-background">
      {/* Header with gradient */}
      <div className="relative border-b bg-gradient-to-b from-muted/50 to-background">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute top-4 right-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full p-0 text-muted-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
        <div className="px-4 py-4 sm:px-5 sm:py-5">
          {/* Top row: avatar + info */}
          <div className="flex items-start gap-3 pr-8 sm:gap-4 sm:pr-9">
            <Avatar className="h-12 w-12 shrink-0 border-2 border-background shadow-md sm:h-14 sm:w-14">
              <AvatarImage src={candidate.avatar} alt={displayNameNormalized} />
              <AvatarFallback className="text-lg font-semibold bg-primary/10 text-primary">
                {displayNameNormalized
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)}
              </AvatarFallback>
            </Avatar>

            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h2 className="text-lg font-semibold tracking-tight truncate" title={displayNameNormalized}>
                    {displayNameNormalized}
                  </h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={openNameDialog}
                    aria-label="Изменить имя кандидата"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground truncate" title={positionNormalized}>{positionNormalized}</p>
                {vacancy?.title ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Briefcase className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{vacancy.title}</span>
                  </div>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                {statusControl ? (
                  <div className="max-w-full sm:max-w-[13rem]">{statusControl}</div>
                ) : (
                  <Badge
                    variant="outline"
                    className={`max-w-full whitespace-nowrap ${statusColors[candidate.status] ?? ""}`}
                  >
                    {statusLabels[candidate.status] ?? candidate.status}
                  </Badge>
                )}

                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {onScheduleInterview ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onScheduleInterview(candidate)}
                      className="gap-1.5"
                      aria-label="Назначить собеседование"
                    >
                      <Calendar className="h-4 w-4" aria-hidden="true" />
                      <span className="hidden sm:inline">Назначить</span>
                    </Button>
                  ) : null}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        {canOpenResume ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenResume(candidate)}
                            className="gap-1.5"
                            aria-label="Открыть резюме"
                          >
                            <FileText className="h-4 w-4" aria-hidden="true" />
                            <span className="hidden sm:inline">Резюме</span>
                          </Button>
                        ) : (
                          <span className="inline-flex">
                            <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled aria-label="Резюме недоступно">
                              <FileText className="h-4 w-4" aria-hidden="true" />
                              <span className="hidden sm:inline">Резюме</span>
                            </Button>
                          </span>
                        )}
                      </TooltipTrigger>
                      {!canOpenResume ? (
                        <TooltipContent side="top" className="max-w-sm">
                          {resumeDisabledTooltip}
                        </TooltipContent>
                      ) : null}
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </div>
          </div>

          {/* Score block */}
          <div className="mt-4 min-w-0 max-w-full overflow-hidden rounded-lg bg-muted/30 border border-border/40 p-4">
            <div className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Brain className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="whitespace-nowrap text-xs text-muted-foreground">Соответствие вакансии</p>
                  <p className={`text-xl font-bold ${getScoreColor(score)}`}>
                    {jobStatus === "queued" || jobStatus === "processing"
                      ? "Анализ..."
                      : isFinalizing
                        ? "Финализация..."
                        : jobStatus === "failed"
                          ? "Ошибка"
                          : score !== null
                            ? `${score}%`
                            : "—"}
                  </p>
                </div>
              </div>

              {score !== null && jobStatus !== "failed" ? (
                <div className="w-full sm:w-auto sm:shrink-0 sm:text-right">
                  <Badge variant="secondary" className="w-full justify-center whitespace-normal text-center leading-tight sm:w-auto sm:max-w-[9rem]">
                    {getScoreLabel(score)}
                  </Badge>
                </div>
              ) : jobStatus === "failed" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onRetryAnalysis(candidate.id)}
                  disabled={retryDisabled}
                  className="w-full sm:w-auto"
                >
                  {retrySubmitting ? "Запускаю…" : "Повторить"}
                </Button>
              ) : isUnscoredNoJob ? (
                creditsBlocked && canManageBilling ? (
                  <Button asChild type="button" variant="outline" size="sm" className="w-full sm:w-auto">
                    <Link href="/dashboard/settings?tab=plan">Тариф</Link>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onRetryAnalysis(candidate.id)}
                    disabled={retryDisabled}
                    className="w-full sm:w-auto"
                  >
                    {retrySubmitting ? "Запускаю…" : "Запустить AI анализ"}
                  </Button>
                )
              ) : null}
            </div>

            {score !== null && jobStatus !== "failed" ? (
              <div className="mt-3">
                <div className="h-2 w-full rounded-full bg-primary/20 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all bg-primary"
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
            ) : null}

            {isUnscoredNoJob ? (
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {creditsBlocked ? creditsBlockedText : "AI анализ не запускался — можно запустить сейчас."}
                </p>
              </div>
            ) : null}
          </div>

          {/* Main Verdict / Summary - главный вывод */}
          {mainVerdict && jobStatus !== "queued" && jobStatus !== "processing" && jobStatus !== "failed" ? (
            <div className="mt-4 min-w-0 max-w-full overflow-hidden rounded-lg bg-primary/5 border border-primary/20 p-4">
              <div className="flex min-w-0 gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <MessageSquare className="h-4 w-4 text-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-primary mb-1">Главный вывод</p>
                  <p className="text-sm leading-relaxed break-words [overflow-wrap:anywhere]">{mainVerdict}</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Content */}
      <Tabs defaultValue="ai" className="flex min-h-0 min-w-0 max-w-full flex-col overflow-visible sm:flex-1 sm:overflow-hidden">
        <div className="px-4 pt-4 border-b sm:px-5">
          <TabsList className="max-w-full justify-start h-10 bg-transparent p-0 gap-3 overflow-x-auto sm:gap-4">
            <TabsTrigger
              value="ai"
              className="shrink-0 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-3 px-0"
            >
              <Brain className="h-4 w-4 mr-1.5" aria-hidden="true" />
              AI анализ
            </TabsTrigger>
            <TabsTrigger
              value="resume"
              className="shrink-0 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-3 px-0"
            >
              <FileText className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Резюме
            </TabsTrigger>
            <TabsTrigger
              value="data"
              className="shrink-0 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-3 px-0"
            >
              <User className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Данные
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="min-h-0 min-w-0 max-w-full overflow-visible [&>[data-radix-scroll-area-viewport]]:h-auto sm:flex-1 sm:overflow-hidden sm:[&>[data-radix-scroll-area-viewport]]:h-full">
          <div className="min-w-0 max-w-full px-4 py-5 sm:px-5">
            {/* AI Tab */}
            <TabsContent value="ai" className="mt-0 min-w-0 max-w-full space-y-6">
              {jobStatus === "queued" || jobStatus === "processing" || isFinalizing ? (
                <Card className="min-w-0 max-w-full overflow-hidden p-5 bg-muted/30 border-border/40">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Clock className="h-5 w-5 text-primary animate-pulse" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium">
                        {jobStatus === "queued"
                          ? "AI анализ в очереди"
                          : isFinalizing
                            ? "Финализация результата"
                            : "AI анализ выполняется"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Детальная информация появится после финализации.
                      </p>
                    </div>
                  </div>
                </Card>
              ) : jobStatus === "failed" ? (
                <Card className="min-w-0 max-w-full overflow-hidden p-5 bg-red-500/5 border-red-500/20">
                  <div className="flex min-w-0 flex-col items-start gap-4 sm:flex-row sm:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10">
                        <AlertCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium">AI анализ завершился ошибкой</p>
                        <p className="text-sm text-muted-foreground">
                          {creditsBlocked
                            ? "Недостаточно кредитов для повторного анализа."
                            : "Можно запустить повторно."}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onRetryAnalysis(candidate.id)}
                      disabled={retryDisabled}
                    >
                      {retrySubmitting ? "Запускаю…" : "Повторить"}
                    </Button>
                  </div>
                </Card>
              ) : !ai ? (
                <>
                  {score !== null ? renderFirstAiPrompt() : null}
                  <Card className="min-w-0 max-w-full overflow-hidden p-5 bg-muted/30 border-border/40">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Sparkles className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        {score === null ? (
                          <>
                            <p className="font-medium">AI анализ не выполнен</p>
                            <p className="text-sm text-muted-foreground">
                              {creditsBlocked
                                ? creditsBlockedText
                                : "Можно запустить анализ сейчас."}
                            </p>
                            <div className="pt-2">
                              {creditsBlocked && canManageBilling ? (
                                <Button asChild type="button" variant="outline" size="sm">
                                  <Link href="/dashboard/settings?tab=plan">Перейти к тарифу</Link>
                                </Button>
                              ) : creditsBlocked ? (
                                <p className="text-sm text-muted-foreground">Администратор сможет пополнить кредиты в настройках тарифа.</p>
                              ) : (
                                <Button type="button" variant="outline" size="sm" onClick={() => onRetryAnalysis(candidate.id)} disabled={retryDisabled}>
                                  {retrySubmitting ? "Запускаю…" : "Запустить AI анализ"}
                                </Button>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="font-medium">Детальный AI вывод пока недоступен</p>
                            <p className="text-sm text-muted-foreground">
                              Показывается только % соответствия вакансии. После обновления промпта добавим
                              расширенную аналитику.
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                </>
              ) : (
                <div className="min-w-0 max-w-full space-y-6">
                  {renderFirstAiPrompt()}

                  {/* Reasons - почему такая оценка */}
                  {Array.isArray(ai.reasons) && ai.reasons.length > 0 ? (
                    <Section title="Почему такая оценка" icon={<Brain className="h-4 w-4" />}>
                      <div className="min-w-0 space-y-2">
                        {ai.reasons.slice(0, 3).map((reason, idx) => (
                          <div
                            key={idx}
                            className="flex min-w-0 gap-3 overflow-hidden p-3 rounded-lg bg-muted/30 border border-border/40"
                          >
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {idx + 1}
                            </div>
                            <p className="min-w-0 break-words [overflow-wrap:anywhere] text-sm leading-relaxed">{reason}</p>
                          </div>
                        ))}
                      </div>
                    </Section>
                  ) : null}

                  {/* Strengths & Weaknesses - оставляем цветными */}
                  <div className="grid min-w-0 max-w-full gap-4 sm:grid-cols-2">
                    <Card className="min-w-0 max-w-full overflow-hidden p-4 bg-green-500/5 border-green-500/20">
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingUp className="h-4 w-4 text-green-600" aria-hidden="true" />
                        <h3 className="text-sm font-semibold text-green-600">Сильные стороны</h3>
                      </div>
                      <BulletList items={ai.strengths ?? []} variant="positive" />
                    </Card>

                    <Card className="min-w-0 max-w-full overflow-hidden p-4 bg-red-500/5 border-red-500/20">
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingDown className="h-4 w-4 text-red-600" aria-hidden="true" />
                        <h3 className="text-sm font-semibold text-red-600">Слабые стороны</h3>
                      </div>
                      <BulletList items={ai.weaknesses ?? []} variant="negative" />
                    </Card>
                  </div>

                  {/* Recommendations */}
                  {(ai.recommendations ?? []).length > 0 ? (
                    <Section title="Рекомендации" icon={<CheckCircle2 className="h-4 w-4" />}>
                      <Card className="min-w-0 max-w-full overflow-hidden p-4 bg-muted/30 border-border/40">
                        <BulletList items={ai.recommendations ?? []} />
                      </Card>
                    </Section>
                  ) : null}

                  {/* Categories - нейтральные progress bars, цветные только цифры */}
                  <Section title="Оценка по категориям" icon={<Brain className="h-4 w-4" />}>
                    <Card className="min-w-0 max-w-full overflow-hidden p-4 bg-muted/30 border-border/40 space-y-4">
                      {Object.entries(ai.categories ?? {}).map(([key, val]) => (
                        <CategoryBar
                          key={key}
                          label={getCategoryLabel(key)}
                          score={val.score}
                          feedback={val.feedback}
                          details={val.details}
                          excludedFromMatch={isCategoryExcludedFromMatch(key, val)}
                        />
                      ))}
                    </Card>
                  </Section>
                </div>
              )}
            </TabsContent>

            {/* Resume Tab */}
            <TabsContent value="resume" className="mt-0 min-w-0 max-w-full">
              {!hasResumeText ? (
                <Card className="min-w-0 max-w-full overflow-hidden p-5 bg-muted/30 border-border/40">
                  <div className="flex min-w-0 items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                      <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium">Текст резюме не сохранён</p>
                      <p className="text-sm text-muted-foreground">
                        Если кандидат добавлен через PDF, убедитесь что извлечение текста прошло
                        успешно.
                      </p>
                    </div>
                  </div>
                </Card>
              ) : (
                <Card className="min-w-0 max-w-full overflow-hidden p-5 bg-muted/30 border-border/40">
                  <div className="min-w-0 overflow-x-auto">
                    <pre className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-relaxed font-sans">
                      {displayResumeText}
                    </pre>
                  </div>
                </Card>
              )}
            </TabsContent>

            {/* Data Tab */}
            <TabsContent value="data" className="mt-0 min-w-0 max-w-full space-y-4">
              {/* Contact info */}
              <Section title="Контакты" icon={<User className="h-4 w-4" />}>
                <div className="min-w-0 space-y-3">
                  <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="min-w-0 text-xs text-muted-foreground">
                      Контакты можно дополнять и корректировать вручную.
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={() => openContactDialog()} className="shrink-0">
                      Добавить контакт
                    </Button>
                  </div>

                  {contacts.length === 0 ? (
                    <Card className="min-w-0 max-w-full overflow-hidden p-4 bg-muted/30 border-border/40">
                      <p className="text-sm text-muted-foreground">Контактов пока нет.</p>
                    </Card>
                  ) : (
                    <div className="grid min-w-0 max-w-full gap-3 sm:grid-cols-2">
                      {contacts.map((c) => {
                        const openUrl = contactOpenUrl(c.type, c.value);
                        return (
                          <Card key={c.id} className="min-w-0 max-w-full overflow-hidden p-4 bg-muted/30 border-border/40">
                            <div className="space-y-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                                  {contactIcon(c.type)}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs text-muted-foreground">
                                    {contactTitle(c.type)}
                                    {c.label ? <span className="text-muted-foreground/60"> · {c.label}</span> : null}
                                  </p>
                                  <p className="text-sm font-medium truncate">{c.value}</p>
                                </div>
                              </div>

                              {/* Actions moved to bottom to avoid overlap on narrow cards */}
                              <div className="flex items-center justify-end gap-1 border-t border-border/40 pt-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => void copyToClipboard(c.value)}
                                  aria-label="Скопировать контакт"
                                >
                                  <Copy className="h-4 w-4" aria-hidden="true" />
                                </Button>
                                {openUrl ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => window.open(openUrl, "_blank", "noopener,noreferrer")}
                                    aria-label="Открыть"
                                  >
                                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                                  </Button>
                                ) : null}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => openContactDialog(c)}
                                  aria-label="Изменить контакт"
                                >
                                  <Pencil className="h-4 w-4" aria-hidden="true" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => void removeContact(c.id)}
                                  aria-label="Удалить контакт"
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </Button>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Section>

              <Separator />

              {/* Meta info */}
              <Section title="Информация" icon={<Briefcase className="h-4 w-4" />}>
                <div className="grid min-w-0 max-w-full gap-3 sm:grid-cols-2">
                  <Card className="min-w-0 max-w-full overflow-hidden p-4 bg-muted/30 border-border/40">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Дата подачи</p>
                        <p className="text-sm font-medium">
                          {formatDistanceToNow(candidate.appliedAt, { addSuffix: true, locale: ru })}
                        </p>
                      </div>
                    </div>
                  </Card>
                  <Card className="min-w-0 max-w-full overflow-hidden p-4 bg-muted/30 border-border/40">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                        <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">Источник</p>
                        <p className="text-sm font-medium">
                          {sourceLabels[candidate.source] ?? candidate.source}
                        </p>
                      </div>
                    </div>
                  </Card>
                  {desiredSalaryText ? (
                    <Card className="min-w-0 max-w-full overflow-hidden p-4 bg-muted/30 border-border/40">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                          <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground">Желаемая зарплата</p>
                          <p className="text-sm font-medium break-words">{desiredSalaryText}</p>
                        </div>
                      </div>
                    </Card>
                  ) : null}
                </div>
              </Section>

              {candidate.source === "hh.ru" && hhAutoSurveyText ? (
                <>
                  <Separator />
                  <Section title="HH автоопрос" icon={<MessageSquare className="h-4 w-4" />}>
                    <Card className="min-w-0 max-w-full overflow-hidden p-4 bg-muted/30 border-border/40">
                      <div className="min-w-0 overflow-x-auto">
                        <pre className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-relaxed font-sans">
                          {hhAutoSurveyText}
                        </pre>
                      </div>
                    </Card>
                  </Section>
                </>
              ) : null}

              {/* Comment */}
              {commentEditor ? (
                <>
                  <Separator />
                  <Section title="Заметка" icon={<FileText className="h-4 w-4" />}>
                    {commentEditor}
                  </Section>
                </>
              ) : candidate.comment ? (
                <>
                  <Separator />
                  <Section title="Заметка" icon={<FileText className="h-4 w-4" />}>
                    <Card className="min-w-0 max-w-full overflow-hidden p-4 bg-muted/30 border-border/40">
                      <p className="break-words [overflow-wrap:anywhere] text-sm leading-relaxed">{candidate.comment}</p>
                    </Card>
                  </Section>
                </>
              ) : null}
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>

      <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingContactId ? "Редактировать контакт" : "Добавить контакт"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Тип</p>
                <Select value={formType} onValueChange={handleContactTypeChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите тип" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Телефон</SelectItem>
                    <SelectItem value="telegram">Telegram</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="linkedin">LinkedIn</SelectItem>
                    <SelectItem value="github">GitHub</SelectItem>
                    <SelectItem value="website">Сайт</SelectItem>
                    <SelectItem value="other">Другое</SelectItem>
                    <SelectItem value="vk">VK</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="discord">Discord</SelectItem>
                    <SelectItem value="habr_career">Habr Career</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Метка (опционально)</p>
                <Input value={formLabel} onChange={(e) => setFormLabel(e.target.value)} placeholder="Напр. личный" />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Значение</p>
              <Input
                type={formType === "phone" || formType === "whatsapp" ? "tel" : "text"}
                inputMode={formType === "phone" || formType === "whatsapp" ? "tel" : undefined}
                maxLength={formType === "phone" ? PHONE_MAX_LENGTH : undefined}
                value={formValue}
                onChange={(e) => handleContactValueChange(e.target.value)}
                placeholder={
                  formType === "telegram"
                    ? "@username или t.me/username"
                    : formType === "whatsapp"
                      ? "номер телефона (только цифры допустимы)"
                      : formType === "phone"
                        ? "+7..."
                        : formType === "email"
                          ? "name@example.com"
                          : "ссылка или текст"
                }
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setContactDialogOpen(false)} disabled={contactSubmitting}>
                Отмена
              </Button>
              <Button type="button" onClick={() => void saveContact()} disabled={contactSubmitting}>
                {contactSubmitting ? "Сохраняю…" : "Сохранить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Редактировать имя</DialogTitle>
            <DialogDescription>Имя отображается в списке и в карточке кандидата.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Имя кандидата</p>
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Напр. Иван Петров"
                maxLength={120}
                autoFocus
              />
              <p className="text-xs text-muted-foreground text-right">{nameDraft.trim().length} / 120</p>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setNameDialogOpen(false)} disabled={nameSubmitting}>
                Отмена
              </Button>
              <Button type="button" onClick={() => void saveName()} disabled={nameSubmitting}>
                {nameSubmitting ? "Сохраняю…" : "Сохранить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
