"use client";

import * as React from "react";
import { Check, ChevronsUpDown, FilePlus2, Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  CLIENT_RESPONSE_PLACEHOLDER,
  DECISION_DESCRIPTION,
  ENTERPRISE_TERMS_DESCRIPTION,
  REQUEST_KIND_LABEL,
  REQUEST_SOURCE_LABEL,
  WORK_DESCRIPTION,
  currentStageKey,
  currentStageLabel,
  decisionPrimaryAction,
  decisionSecondaryDescription,
  flowStages,
  isEnterpriseTermsRequest,
  isTerminalStatus,
  type EditablePlanChangeRequestStatus,
  type FlowStage,
  type PlanChangeRequestKind,
  type PlanChangeRequestStatus,
  type PlanKey,
} from "./plan-change-request-flow";

export type PlanChangeRequestAdminRow = {
  id: string;
  company_id: string;
  companyName?: string | null;
  requested_by: string;
  current_plan: PlanKey;
  target_plan: Exclude<PlanKey, "trial">;
  request_kind: PlanChangeRequestKind;
  source: keyof typeof REQUEST_SOURCE_LABEL;
  status: PlanChangeRequestStatus;
  user_message: string | null;
  admin_note: string | null;
  public_response: string | null;
  handled_by: string | null;
  handled_at: string | null;
  approved_at: string | null;
  applied_at: string | null;
  rejected_at: string | null;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
};

type Props = {
  initialRows: PlanChangeRequestAdminRow[];
  enterpriseAgreements: EnterpriseAgreementSummary[];
  activeEnterpriseAgreements: EnterpriseAgreementSummary[];
};

type EnterpriseAgreementSummary = {
  id: string;
  companyId: string;
  companyName?: string | null;
  sourceRequestId?: string | null;
  status: "draft" | "pending_payment" | "active" | "ended" | "canceled";
};

type AgreementDraft = {
  startsAt: string;
  endsAt: string;
  isOpenEnded: boolean;
  creditsLimit: string;
  termsSummary: string;
};

type ExitRequestDraft = {
  companyId: string;
  targetPlan: "starter" | "professional";
  userMessage: string;
};

type RequestNoteDraft = {
  requestId: string;
  sourceUpdatedAt: string;
  adminNote: string;
  publicResponse: string;
};

const EXIT_REASON_MAX_LENGTH = 2000;

const STATUS_LABEL: Record<PlanChangeRequestStatus, string> = {
  submitted: "Новая",
  in_review: "На рассмотрении",
  contacted: "Ответ сохранён",
  approved: "Одобрена",
  applied: "Применена",
  rejected: "Отклонена",
  canceled: "Закрыта",
};

const PLAN_CHANGE_STATUS_ERROR_COPY: Record<string, string> = {
  INVALID_ID: "Не удалось найти заявку. Обновите страницу.",
  INVALID_BODY: "Проверьте комментарий и выбранное действие.",
  UNAUTHORIZED: "Войдите в админку заново.",
  FORBIDDEN: "У вас нет доступа к управлению billing-заявками.",
  REQUEST_NOT_FOUND: "Заявка не найдена. Обновите страницу.",
  TRANSITION_INVALID: "Этот этап уже нельзя изменить выбранным образом. Обновите таблицу.",
  REQUEST_STATUS_CHANGED: "Заявка изменилась. Обновите таблицу.",
  SOURCE_REQUEST_HAS_OPEN_AGREEMENT: "По заявке уже созданы условия Enterprise. Сначала закройте их.",
  AGREEMENT_LOOKUP_FAILED: "Не удалось проверить условия по заявке. Попробуйте ещё раз.",
  REQUEST_STATUS_UPDATE_FAILED: "Не удалось обновить заявку. Попробуйте ещё раз.",
  INTERNAL_ERROR: "Не удалось обновить заявку. Попробуйте ещё раз.",
};

const AGREEMENT_CREATE_ERROR_COPY: Record<string, string> = {
  INVALID_BODY: "Проверьте условия Enterprise.",
  AMENDMENT_REQUIRES_SOURCE_REQUEST: "Новые условия Enterprise нужно создавать из одобренной заявки.",
  AGREEMENT_REQUIRES_SOURCE_REQUEST: "Условия Enterprise нужно создавать из одобренной заявки.",
  AGREEMENT_ALREADY_EXISTS: "По этой заявке условия Enterprise уже созданы.",
  REQUEST_NOT_FOUND: "Заявка не найдена. Обновите страницу.",
  REQUEST_NOT_APPROVED_FOR_ENTERPRISE: "Сначала одобрите заявку на Enterprise.",
  REQUEST_KIND_INVALID_FOR_ENTERPRISE_AGREEMENT: "Условия Enterprise можно создать только из заявки на переход на Enterprise.",
  REQUEST_NOT_APPROVED_FOR_ENTERPRISE_TERMS_CHANGE: "Сначала одобрите заявку на изменение условий Enterprise.",
  SOURCE_REQUEST_NOT_FOUND: "Заявка не найдена. Обновите страницу.",
  SOURCE_REQUEST_STATUS_INVALID: "Заявка уже не одобрена. Обновите таблицу.",
  SOURCE_REQUEST_TARGET_PLAN_INVALID: "Целевой тариф в заявке не подходит. Обновите таблицу.",
  SOURCE_REQUEST_KIND_INVALID: "Условия Enterprise можно создать только из заявки на Enterprise.",
  SOURCE_REQUEST_CURRENT_PLAN_INVALID: "Текущий тариф в заявке не подходит. Обновите таблицу.",
  SOURCE_REQUEST_HAS_OPEN_AGREEMENT: "По заявке уже созданы условия Enterprise. Обновите таблицу.",
  REQUEST_STATUS_CHANGED: "Заявка изменилась. Обновите таблицу.",
  ACTIVE_AGREEMENT_REQUIRED: "Активные условия Enterprise не найдены. Обновите таблицу.",
  ACTIVE_AGREEMENT_LOOKUP_FAILED: "Не удалось проверить активные условия Enterprise. Попробуйте ещё раз.",
  ACTIVE_ENTERPRISE_AGREEMENT_NOT_FOUND: "Активные условия Enterprise не найдены. Обновите таблицу.",
  COMPANY_PLAN_LOOKUP_FAILED: "Не удалось проверить текущий тариф компании. Попробуйте ещё раз.",
  COMPANY_PLAN_ENTERPRISE_REQUIRED: "Текущий тариф компании уже не Enterprise. Обновите таблицу.",
  ACTIVE_REQUEST_LOOKUP_FAILED: "Не удалось проверить активные заявки. Попробуйте ещё раз.",
  ACTIVE_REQUEST_EXISTS: "У компании уже есть активная заявка на изменение тарифа.",
  ACTIVE_REQUEST_RELOAD_FAILED: "Заявка уже появилась, но не удалось загрузить её состояние. Обновите таблицу.",
  REQUEST_CREATE_FAILED: "Не удалось создать заявку. Попробуйте ещё раз.",
  REPLACED_AGREEMENT_NOT_FOUND: "Активные условия Enterprise не найдены. Обновите таблицу.",
  REPLACED_AGREEMENT_NOT_ACTIVE: "Изменить можно только активные условия Enterprise.",
  STARTS_AT_INVALID: "Укажите корректную дату начала.",
  ENDS_AT_REQUIRED: "Укажите дату окончания или выберите бессрочный доступ.",
  ENDS_AT_MUST_BE_AFTER_STARTS_AT: "Дата окончания должна быть позже даты начала.",
  CREDITS_LIMIT_INVALID: "Укажите credits целым числом.",
  TERMS_SUMMARY_REQUIRED: "Кратко опишите условия.",
  AGREEMENT_CREATE_FAILED: "Не удалось создать условия Enterprise. Попробуйте ещё раз.",
  INTERNAL_ERROR: "Не удалось создать условия Enterprise. Попробуйте ещё раз.",
};

const EXIT_REQUEST_CREATE_ERROR_COPY: Record<string, string> = {
  INVALID_BODY: "Проверьте комментарий к заявке на выход.",
  FORBIDDEN: "У вас нет доступа к управлению billing-заявками.",
  ACTIVE_AGREEMENT_LOOKUP_FAILED: "Не удалось проверить активные условия Enterprise. Попробуйте ещё раз.",
  ACTIVE_ENTERPRISE_AGREEMENT_NOT_FOUND: "Активные условия Enterprise не найдены. Обновите таблицу.",
  COMPANY_PLAN_LOOKUP_FAILED: "Не удалось проверить текущий тариф компании. Попробуйте ещё раз.",
  COMPANY_PLAN_ENTERPRISE_REQUIRED: "Текущий тариф компании уже не Enterprise. Обновите таблицу.",
  ACTIVE_REQUEST_LOOKUP_FAILED: "Не удалось проверить активные заявки. Попробуйте ещё раз.",
  ACTIVE_REQUEST_EXISTS: "У компании уже есть активная заявка на изменение тарифа.",
  ACTIVE_REQUEST_RELOAD_FAILED: "Заявка уже появилась, но не удалось загрузить её состояние. Обновите таблицу.",
  REQUEST_CREATE_FAILED: "Не удалось создать заявку на выход. Попробуйте ещё раз.",
  INTERNAL_ERROR: "Не удалось создать заявку на выход. Попробуйте ещё раз.",
};

const ENTERPRISE_EXIT_ERROR_COPY: Record<string, string> = {
  AGREEMENT_NOT_FOUND: "Активные условия Enterprise не найдены. Обновите таблицу.",
  AGREEMENT_NOT_ACTIVE: "Отключить можно только активный Enterprise.",
  REQUEST_NOT_FOUND: "Заявка не найдена. Обновите страницу.",
  REQUEST_NOT_APPROVED: "Сначала одобрите заявку на выход из Enterprise.",
  REQUEST_LOOKUP_FAILED: "Не удалось проверить заявку. Попробуйте ещё раз.",
  REQUEST_STATUS_CHANGED: "Заявка изменилась. Обновите таблицу.",
  REQUEST_STATUS_INVALID: "Статус заявки изменился. Обновите таблицу.",
  TARGET_PLAN_INVALID: "Выбранный тариф для перехода не подходит.",
  TARGET_PLAN_MISMATCH: "Тариф в заявке изменился. Обновите таблицу.",
  COMPANY_PLAN_ENTERPRISE_REQUIRED: "Текущий тариф компании уже не Enterprise. Обновите таблицу.",
  AGREEMENT_END_FAILED: "Не удалось завершить Enterprise. Попробуйте ещё раз.",
  INTERNAL_ERROR: "Не удалось завершить Enterprise. Попробуйте ещё раз.",
};

function dateLabel(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ru-RU");
}

function statusBadgeVariant(status: PlanChangeRequestStatus) {
  if (status === "rejected" || status === "canceled") return "destructive" as const;
  return "outline" as const;
}

function errorMessage(errorCode: unknown) {
  return PLAN_CHANGE_STATUS_ERROR_COPY[String(errorCode)] ?? PLAN_CHANGE_STATUS_ERROR_COPY.INTERNAL_ERROR;
}

function agreementErrorMessage(errorCode: unknown) {
  return AGREEMENT_CREATE_ERROR_COPY[String(errorCode)] ?? AGREEMENT_CREATE_ERROR_COPY.INTERNAL_ERROR;
}

function exitRequestErrorMessage(errorCode: unknown) {
  return EXIT_REQUEST_CREATE_ERROR_COPY[String(errorCode)] ?? EXIT_REQUEST_CREATE_ERROR_COPY.INTERNAL_ERROR;
}

function exitErrorMessage(errorCode: unknown) {
  return ENTERPRISE_EXIT_ERROR_COPY[String(errorCode)] ?? ENTERPRISE_EXIT_ERROR_COPY.INTERNAL_ERROR;
}

function exitReasonFromDraft(draft: RequestNoteDraft) {
  const reason = draft.adminNote.trim() || draft.publicResponse.trim() || "Заявка на выход из Enterprise одобрена";
  return reason.slice(0, EXIT_REASON_MAX_LENGTH);
}

function activeRequestConflictMessage(existingRequest: PlanChangeRequestAdminRow) {
  return `У компании уже есть активная заявка: ${REQUEST_KIND_LABEL[existingRequest.request_kind]} - ${STATUS_LABEL[existingRequest.status]}.`;
}

function defaultAgreementDraft(row: PlanChangeRequestAdminRow): AgreementDraft {
  return {
    startsAt: "",
    endsAt: "",
    isOpenEnded: true,
    creditsLimit: "",
    termsSummary: row.user_message ?? "",
  };
}

function fromDateTimeLocal(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function includesSearch(parts: Array<string | null | undefined>, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return parts.some((part) => String(part ?? "").toLowerCase().includes(normalized));
}

function StageDot({ stage }: { stage: FlowStage }) {
  if (stage.state === "done") {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] text-background">
        ✓
      </span>
    );
  }
  if (stage.state === "current") return <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-foreground" />;
  return <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border bg-background" />;
}

function StageProgress({ stages }: { stages: FlowStage[] }) {
  return (
    <div className="grid gap-2 border-b px-5 py-4">
      {stages.map((stage) => (
        <div
          key={stage.key}
          className={cn(
            "grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 text-sm",
            stage.state === "future" ? "text-muted-foreground/70" : "text-foreground",
          )}
        >
          <StageDot stage={stage} />
          <span className="min-w-0 truncate font-medium">{stage.label}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {stage.state === "done" ? "готово" : stage.state === "current" ? "сейчас" : stage.helper ?? "позже"}
          </span>
        </div>
      ))}
    </div>
  );
}

function CurrentStageCard({ children, title }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border p-4">
      <div className="mb-3">
        <div className="text-xs text-muted-foreground">Текущий этап</div>
        <div className="font-semibold">{title}</div>
      </div>
      <div className="grid gap-3">{children}</div>
    </div>
  );
}

function TerminalDecisionActions({
  row,
  pending,
  formId,
}: {
  row: PlanChangeRequestAdminRow;
  pending: boolean;
  formId: string;
}) {
  if (isTerminalStatus(row.status)) return null;
  return (
    <div className="grid gap-2 border-t pt-4">
      <div className="text-xs text-muted-foreground">Если не продолжаем по этой заявке</div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button form={formId} type="submit" name="status" value="canceled" variant="outline" size="sm" disabled={pending}>
          Закрыть без решения
        </Button>
        <Button form={formId} type="submit" name="status" value="rejected" variant="destructive" size="sm" disabled={pending}>
          Отклонить
        </Button>
      </div>
    </div>
  );
}

function DecisionStageForm({
  row,
  draft,
  pending,
  onSubmit,
  onSaveNotes,
  onDraftChange,
}: {
  row: PlanChangeRequestAdminRow;
  draft: RequestNoteDraft;
  pending: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>, requestId: string) => void;
  onSaveNotes: (event: React.FormEvent<HTMLFormElement>, requestId: string) => void;
  onDraftChange: (draft: RequestNoteDraft) => void;
}) {
  const primaryAction = decisionPrimaryAction(row);
  const secondaryDescription = decisionSecondaryDescription(row);
  const formId = `decision-form-${row.id}`;

  return (
    <form
      id={formId}
      className="grid gap-3"
      onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.name === "action" && submitter.value === "save-notes") {
          onSaveNotes(event, row.id);
          return;
        }
        onSubmit(event, row.id);
      }}
    >
      <CurrentStageCard title={row.status === "submitted" ? "В работе" : "Решение по заявке"}>
        <input type="hidden" name="updatedAt" value={draft.sourceUpdatedAt} />
        <p className="text-sm text-muted-foreground">
          {row.status === "submitted" ? WORK_DESCRIPTION : DECISION_DESCRIPTION}
        </p>
        {secondaryDescription ? <p className="text-sm text-muted-foreground">{secondaryDescription}</p> : null}
        <Label htmlFor={`drawer-admin-note-${row.id}`} className="text-xs text-muted-foreground">
          Комментарий для команды
        </Label>
        <Textarea
          id={`drawer-admin-note-${row.id}`}
          name="adminNote"
          value={draft.adminNote}
          maxLength={4000}
          disabled={pending}
          className="min-h-[72px]"
          placeholder="Например: клиент готов продолжить"
          onChange={(event) => onDraftChange({ ...draft, adminNote: event.target.value })}
        />
        <Label htmlFor={`drawer-public-response-${row.id}`} className="text-xs text-muted-foreground">
          Сообщение клиенту в кабинете
        </Label>
        <Textarea
          id={`drawer-public-response-${row.id}`}
          name="publicResponse"
          value={draft.publicResponse}
          maxLength={4000}
          disabled={pending}
          className="min-h-[72px]"
          placeholder={CLIENT_RESPONSE_PLACEHOLDER[row.request_kind]}
          onChange={(event) => onDraftChange({ ...draft, publicResponse: event.target.value })}
        />
        <Button type="submit" name="status" value={primaryAction.status} disabled={pending}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {primaryAction.label}
        </Button>
        <Button type="submit" name="action" value="save-notes" variant="outline" disabled={pending}>
          Сохранить комментарии
        </Button>
        <TerminalDecisionActions row={row} pending={pending} formId={formId} />
      </CurrentStageCard>
    </form>
  );
}

function TerminalRequestActionsForm({
  row,
  draft,
  pending,
  onSubmit,
  onSaveNotes,
  onDraftChange,
}: {
  row: PlanChangeRequestAdminRow;
  draft: RequestNoteDraft;
  pending: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>, requestId: string) => void;
  onSaveNotes: (event: React.FormEvent<HTMLFormElement>, requestId: string) => void;
  onDraftChange: (draft: RequestNoteDraft) => void;
}) {
  const formId = `terminal-form-${row.id}`;

  return (
    <form
      id={formId}
      className="grid gap-3 rounded-md border p-4"
      onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.name === "action" && submitter.value === "save-notes") {
          onSaveNotes(event, row.id);
          return;
        }
        onSubmit(event, row.id);
      }}
    >
      <input type="hidden" name="updatedAt" value={draft.sourceUpdatedAt} />
      <div>
        <div className="text-xs text-muted-foreground">Если не продолжаем по этой заявке</div>
        <div className="font-semibold">Закрытие заявки</div>
      </div>
      <Label htmlFor={`terminal-admin-note-${row.id}`} className="text-xs text-muted-foreground">
        Комментарий для команды
      </Label>
      <Textarea
        id={`terminal-admin-note-${row.id}`}
        name="adminNote"
        value={draft.adminNote}
        maxLength={4000}
        disabled={pending}
        className="min-h-[72px]"
        placeholder="Например: клиент передумал или условия больше не актуальны"
        onChange={(event) => onDraftChange({ ...draft, adminNote: event.target.value })}
      />
      <Label htmlFor={`terminal-public-response-${row.id}`} className="text-xs text-muted-foreground">
        Сообщение клиенту в кабинете
      </Label>
      <Textarea
        id={`terminal-public-response-${row.id}`}
        name="publicResponse"
        value={draft.publicResponse}
        maxLength={4000}
        disabled={pending}
        className="min-h-[72px]"
        placeholder={CLIENT_RESPONSE_PLACEHOLDER[row.request_kind]}
        onChange={(event) => onDraftChange({ ...draft, publicResponse: event.target.value })}
      />
      <Button type="submit" name="action" value="save-notes" variant="outline" disabled={pending}>
        Сохранить комментарии
      </Button>
      <TerminalDecisionActions row={row} pending={pending} formId={formId} />
    </form>
  );
}

function EnterpriseTermsStage({
  row,
  draft,
  pending,
  agreementPending,
  onDraftChange,
  onCreate,
}: {
  row: PlanChangeRequestAdminRow;
  draft: AgreementDraft;
  pending: boolean;
  agreementPending: boolean;
  onDraftChange: (draft: AgreementDraft) => void;
  onCreate: () => void;
}) {
  return (
    <CurrentStageCard title="Условия Enterprise">
      <p className="text-sm text-muted-foreground">{ENTERPRISE_TERMS_DESCRIPTION}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`drawer-agreement-starts-${row.id}`} className="text-xs text-muted-foreground">
            Начало Enterprise
          </Label>
          <Input
            id={`drawer-agreement-starts-${row.id}`}
            type="datetime-local"
            value={draft.startsAt}
            disabled={pending}
            onChange={(event) => onDraftChange({ ...draft, startsAt: event.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`drawer-agreement-ends-${row.id}`} className="text-xs text-muted-foreground">
            Окончание
          </Label>
          <Input
            id={`drawer-agreement-ends-${row.id}`}
            type="datetime-local"
            value={draft.endsAt}
            disabled={pending || draft.isOpenEnded}
            onChange={(event) => onDraftChange({ ...draft, endsAt: event.target.value })}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <Checkbox
          checked={draft.isOpenEnded}
          disabled={pending}
          onCheckedChange={(checked) => onDraftChange({ ...draft, isOpenEnded: checked === true })}
        />
        Бессрочно
      </label>
      <Input
        className="h-9"
        inputMode="numeric"
        maxLength={9}
        placeholder="Credits"
        value={draft.creditsLimit}
        disabled={pending}
        onChange={(event) => {
          const nextValue = event.target.value.replace(/\D/g, "").slice(0, 9);
          onDraftChange({ ...draft, creditsLimit: nextValue });
        }}
      />
      <Textarea
        value={draft.termsSummary}
        placeholder="Срок, кредиты и дополнительные опции"
        className="min-h-[96px]"
        maxLength={5000}
        disabled={pending}
        onChange={(event) => onDraftChange({ ...draft, termsSummary: event.target.value })}
      />
      <Button type="button" disabled={pending} onClick={onCreate}>
        {agreementPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FilePlus2 className="mr-2 h-4 w-4" />}
        {row.request_kind === "enterprise_terms_change" ? "Создать новые условия Enterprise" : "Создать условия Enterprise"}
      </Button>
    </CurrentStageCard>
  );
}

function EnterpriseExitStage({
  pending,
  exitPending,
  hasActiveAgreement,
  onEnd,
}: {
  pending: boolean;
  exitPending: boolean;
  hasActiveAgreement: boolean;
  onEnd: () => void;
}) {
  return (
    <CurrentStageCard title="Отключение Enterprise">
      <p className="text-sm text-muted-foreground">Подтвердите выход, чтобы отключить Enterprise и сменить тариф.</p>
      {!hasActiveAgreement ? (
        <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
          Активные условия Enterprise не найдены. Обновите таблицу перед продолжением.
        </div>
      ) : null}
      <Button type="button" variant="destructive" disabled={pending || !hasActiveAgreement} onClick={onEnd}>
        {exitPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Завершить Enterprise по заявке
      </Button>
    </CurrentStageCard>
  );
}

function FinishedRequestState({ row }: { row: PlanChangeRequestAdminRow }) {
  const label =
    row.status === "applied"
      ? "Заявка применена."
      : row.status === "rejected"
        ? "Заявка отклонена."
        : "Заявка закрыта без решения.";
  return <div className="rounded-md border px-4 py-3 text-sm text-muted-foreground">{label}</div>;
}

function ManualPlanChangeState({
  pending,
  applyPending,
  onApply,
}: {
  pending: boolean;
  applyPending: boolean;
  onApply: () => void;
}) {
  return (
    <CurrentStageCard title="Ручное изменение тарифа">
      <p className="text-sm text-muted-foreground">
        Проверьте заявку, примените нужный тариф вручную и отметьте заявку применённой.
      </p>
      <Button type="button" disabled={pending} onClick={onApply}>
        {applyPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Отметить как применено
      </Button>
    </CurrentStageCard>
  );
}

export function PlanChangeRequestsTable({ initialRows, enterpriseAgreements, activeEnterpriseAgreements }: Props) {
  const router = useRouter();
  const [rows, setRows] = React.useState(initialRows);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [companyPickerOpen, setCompanyPickerOpen] = React.useState(false);
  const [selectedRequestId, setSelectedRequestId] = React.useState<string | null>(null);
  const [requestNoteDraft, setRequestNoteDraft] = React.useState<RequestNoteDraft | null>(null);
  const [agreementDrafts, setAgreementDrafts] = React.useState<Record<string, AgreementDraft>>(() =>
    Object.fromEntries(initialRows.map((row) => [row.id, defaultAgreementDraft(row)])),
  );
  const [exitRequestDraft, setExitRequestDraft] = React.useState<ExitRequestDraft>({
    companyId: activeEnterpriseAgreements[0]?.companyId ?? "",
    targetPlan: "professional",
    userMessage: "",
  });

  React.useEffect(() => {
    setRows(initialRows);
    setAgreementDrafts(Object.fromEntries(initialRows.map((row) => [row.id, defaultAgreementDraft(row)])));
  }, [initialRows]);

  React.useEffect(() => {
    setExitRequestDraft((current) => {
      if (current.companyId && activeEnterpriseAgreements.some((agreement) => agreement.companyId === current.companyId)) {
        return current;
      }
      return { ...current, companyId: activeEnterpriseAgreements[0]?.companyId ?? "" };
    });
  }, [activeEnterpriseAgreements]);

  const activeAgreementByCompany = React.useMemo(
    () =>
      new Map(
        activeEnterpriseAgreements
          .filter((agreement) => agreement.status === "active")
          .map((agreement) => [agreement.companyId, agreement.id]),
      ),
    [activeEnterpriseAgreements],
  );

  const agreementBySourceRequest = React.useMemo(
    () =>
      new Map(
        enterpriseAgreements
          .filter(
            (agreement) =>
              agreement.sourceRequestId &&
              (agreement.status === "draft" || agreement.status === "pending_payment" || agreement.status === "active"),
          )
          .map((agreement) => [agreement.sourceRequestId as string, agreement]),
      ),
    [enterpriseAgreements],
  );
  const selectedActiveAgreement = React.useMemo(
    () => activeEnterpriseAgreements.find((agreement) => agreement.companyId === exitRequestDraft.companyId) ?? null,
    [activeEnterpriseAgreements, exitRequestDraft.companyId],
  );
  const selectedRequest = React.useMemo(
    () => rows.find((row) => row.id === selectedRequestId) ?? null,
    [rows, selectedRequestId],
  );
  const selectedExistingAgreement = selectedRequest ? agreementBySourceRequest.get(selectedRequest.id) : undefined;
  const selectedActiveAgreementId = selectedRequest ? activeAgreementByCompany.get(selectedRequest.company_id) ?? null : null;
  const selectedAgreementDraft = selectedRequest ? agreementDrafts[selectedRequest.id] ?? defaultAgreementDraft(selectedRequest) : null;
  const selectedStageKey = selectedRequest ? currentStageKey(selectedRequest, Boolean(selectedExistingAgreement)) : null;
  const selectedCanCreateTerms = Boolean(
    selectedRequest &&
      selectedRequest.status === "approved" &&
      selectedRequest.target_plan === "enterprise" &&
      isEnterpriseTermsRequest(selectedRequest) &&
      !selectedExistingAgreement &&
      (selectedRequest.request_kind !== "enterprise_terms_change" || selectedActiveAgreementId),
  );
  const selectedTermsChangeMissingActiveAgreement = Boolean(
    selectedRequest &&
      selectedRequest.status === "approved" &&
      selectedRequest.request_kind === "enterprise_terms_change" &&
      selectedRequest.target_plan === "enterprise" &&
      !selectedExistingAgreement &&
      !selectedActiveAgreementId,
  );
  const filteredRows = React.useMemo(
    () =>
      rows.filter((row) =>
        includesSearch(
          [
            row.companyName,
            row.company_id,
            row.requested_by,
            row.current_plan,
            row.target_plan,
            REQUEST_KIND_LABEL[row.request_kind],
            REQUEST_SOURCE_LABEL[row.source],
            STATUS_LABEL[row.status],
            row.user_message,
            row.admin_note,
            row.public_response,
            row.id,
          ],
          searchQuery,
        ),
      ),
    [rows, searchQuery],
  );

  function openRequestDrawer(row: PlanChangeRequestAdminRow) {
    setSelectedRequestId(row.id);
    setRequestNoteDraft({
      requestId: row.id,
      sourceUpdatedAt: row.updated_at,
      adminNote: row.admin_note ?? "",
      publicResponse: row.public_response ?? "",
    });
  }

  function updateRow(updatedRequest: PlanChangeRequestAdminRow) {
    setRows((current) =>
      current.map((row) =>
        row.id === updatedRequest.id ? { ...updatedRequest, companyName: updatedRequest.companyName ?? row.companyName } : row,
      ),
    );
    setRequestNoteDraft({
      requestId: updatedRequest.id,
      sourceUpdatedAt: updatedRequest.updated_at,
      adminNote: updatedRequest.admin_note ?? "",
      publicResponse: updatedRequest.public_response ?? "",
    });
  }

  async function updateStatus(event: React.FormEvent<HTMLFormElement>, requestId: string) {
    event.preventDefault();

    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const status = submitter?.value as EditablePlanChangeRequestStatus | undefined;
    if (!status) return;

    const formData = new FormData(event.currentTarget);
    setPendingId(requestId);

    try {
      const res = await fetch(`/api/admin/billing/plan-change-requests/${requestId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          adminNote: String(formData.get("adminNote") ?? ""),
          publicResponse: String(formData.get("publicResponse") ?? ""),
          updatedAt: String(formData.get("updatedAt") ?? ""),
        }),
      });

      const json = (await res.json().catch(() => null)) as { request?: PlanChangeRequestAdminRow; error?: string } | null;
      if (!res.ok || !json?.request) {
        toast.error(errorMessage(json?.error));
        return;
      }

      updateRow(json.request);
      toast.success(
        status === "in_review"
          ? "Заявка взята в работу"
          : status === "approved"
            ? "Заявка одобрена"
            : status === "rejected"
              ? "Заявка отклонена"
              : "Заявка закрыта без решения",
      );
    } catch {
      toast.error(PLAN_CHANGE_STATUS_ERROR_COPY.INTERNAL_ERROR);
    } finally {
      setPendingId(null);
    }
  }

  async function saveRequestNotes(event: React.FormEvent<HTMLFormElement>, requestId: string) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPendingId(requestId);

    try {
      const res = await fetch(`/api/admin/billing/plan-change-requests/${requestId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminNote: String(formData.get("adminNote") ?? ""),
          publicResponse: String(formData.get("publicResponse") ?? ""),
          updatedAt: String(formData.get("updatedAt") ?? ""),
        }),
      });

      const json = (await res.json().catch(() => null)) as { request?: PlanChangeRequestAdminRow; error?: string } | null;
      if (!res.ok || !json?.request) {
        toast.error(errorMessage(json?.error));
        return;
      }

      updateRow(json.request);
      toast.success("Комментарии сохранены.");
    } catch {
      toast.error(PLAN_CHANGE_STATUS_ERROR_COPY.INTERNAL_ERROR);
    } finally {
      setPendingId(null);
    }
  }

  async function applyManualRequest(row: PlanChangeRequestAdminRow) {
    if (requestNoteDraft?.requestId !== row.id) {
      toast.error("Заявка изменилась. Обновите таблицу.");
      return;
    }

    setPendingId(`manual:${row.id}`);
    try {
      const res = await fetch(`/api/admin/billing/plan-change-requests/${row.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "applied",
          adminNote: requestNoteDraft.adminNote,
          publicResponse: requestNoteDraft.publicResponse,
          updatedAt: requestNoteDraft.sourceUpdatedAt,
        }),
      });

      const json = (await res.json().catch(() => null)) as { request?: PlanChangeRequestAdminRow; error?: string } | null;
      if (!res.ok || !json?.request) {
        toast.error(errorMessage(json?.error));
        return;
      }

      updateRow(json.request);
      toast.success("Заявка отмечена применённой.");
    } catch {
      toast.error(PLAN_CHANGE_STATUS_ERROR_COPY.INTERNAL_ERROR);
    } finally {
      setPendingId(null);
    }
  }

  async function createAgreement(row: PlanChangeRequestAdminRow) {
    const draft = agreementDrafts[row.id] ?? defaultAgreementDraft(row);
    const startsAt = fromDateTimeLocal(draft.startsAt);
    const endsAt = fromDateTimeLocal(draft.endsAt);
    if (!startsAt) {
      toast.error("Укажите дату начала Enterprise.");
      return;
    }
    if (!draft.isOpenEnded && !endsAt) {
      toast.error("Укажите дату окончания или выберите бессрочный доступ.");
      return;
    }
    const trimmedCredits = draft.creditsLimit.trim();
    if (trimmedCredits && !/^\d{1,9}$/.test(trimmedCredits)) {
      toast.error("Укажите credits целым числом.");
      return;
    }
    if (!draft.isOpenEnded && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      toast.error("Дата окончания должна быть позже даты начала.");
      return;
    }
    if (!draft.termsSummary.trim()) {
      toast.error("Кратко опишите условия.");
      return;
    }
    if (requestNoteDraft?.requestId !== row.id) {
      toast.error("Заявка изменилась. Обновите таблицу.");
      return;
    }
    const replacesAgreementId =
      row.request_kind === "enterprise_terms_change" ? activeAgreementByCompany.get(row.company_id) ?? null : null;
    if (row.request_kind === "enterprise_terms_change" && !replacesAgreementId) {
      toast.error("Активные условия Enterprise не найдены. Обновите таблицу.");
      return;
    }

    setPendingId(`agreement:${row.id}`);
    try {
      const res = await fetch("/api/admin/billing/enterprise-agreements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startsAt,
          endsAt: draft.isOpenEnded ? null : endsAt,
          isOpenEnded: draft.isOpenEnded,
          creditsLimit: trimmedCredits ? Number(trimmedCredits) : null,
          termsSummary: draft.termsSummary.trim(),
          internalNote: null,
          sourceRequestId: row.id,
          sourceRequestUpdatedAt: requestNoteDraft.sourceUpdatedAt,
          replacesAgreementId,
        }),
      });

      const json = (await res.json().catch(() => null)) as { error?: unknown } | null;
      if (!res.ok) {
        toast.error(agreementErrorMessage(json?.error));
        return;
      }

      toast.success(row.request_kind === "enterprise_terms_change" ? "Новые условия Enterprise созданы." : "Условия Enterprise созданы.");
      setSelectedRequestId(null);
      setRequestNoteDraft(null);
      router.refresh();
    } catch {
      toast.error(AGREEMENT_CREATE_ERROR_COPY.INTERNAL_ERROR);
    } finally {
      setPendingId(null);
    }
  }

  async function createExitRequest() {
    if (!exitRequestDraft.companyId) {
      toast.error("Выберите компанию с активным Enterprise.");
      return;
    }
    if (exitRequestDraft.userMessage.length > 4000) {
      toast.error(EXIT_REQUEST_CREATE_ERROR_COPY.INVALID_BODY);
      return;
    }

    setPendingId("exit-request:create");
    try {
      const response = await fetch("/api/admin/billing/plan-change-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyId: exitRequestDraft.companyId,
          targetPlan: exitRequestDraft.targetPlan,
          userMessage: exitRequestDraft.userMessage,
        }),
      });
      const json = (await response.json().catch(() => null)) as {
        request?: PlanChangeRequestAdminRow;
        error?: string;
      } | null;

      if (!response.ok) {
      if (json?.error === "ACTIVE_REQUEST_EXISTS" && json.request) {
          toast.error(activeRequestConflictMessage(json.request));
          return;
        }
        toast.error(exitRequestErrorMessage(json?.error));
        return;
      }

      if (json?.request) {
        const createdRequest = {
          ...(json.request as PlanChangeRequestAdminRow),
          companyName: json.request.companyName ?? selectedActiveAgreement?.companyName ?? null,
        };
        setRows((current) => [createdRequest, ...current]);
      }
      toast.success("Заявка на выход из Enterprise создана.");
      router.refresh();
    } catch {
      toast.error(EXIT_REQUEST_CREATE_ERROR_COPY.INTERNAL_ERROR);
    } finally {
      setPendingId(null);
    }
  }

  async function endEnterpriseFromRequest(row: PlanChangeRequestAdminRow) {
    const agreementId = activeAgreementByCompany.get(row.company_id);
    if (!agreementId) {
      toast.error("Активные условия Enterprise не найдены. Обновите таблицу.");
      return;
    }
    if (requestNoteDraft?.requestId !== row.id) {
      toast.error("Заявка изменилась. Обновите таблицу.");
      return;
    }

    setPendingId(`exit:${row.id}`);
    try {
      const res = await fetch(`/api/admin/billing/enterprise-agreements/${agreementId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: exitReasonFromDraft(requestNoteDraft),
          targetPlan: row.target_plan,
          requestId: row.id,
          sourceRequestUpdatedAt: requestNoteDraft.sourceUpdatedAt,
        }),
      });

      const json = (await res.json().catch(() => null)) as { error?: unknown } | null;
      if (!res.ok) {
        toast.error(exitErrorMessage(json?.error));
        return;
      }

      toast.success("Enterprise завершён, заявка закрыта.");
      setSelectedRequestId(null);
      setRequestNoteDraft(null);
      router.refresh();
    } catch {
      toast.error(ENTERPRISE_EXIT_ERROR_COPY.INTERNAL_ERROR);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 rounded-md border p-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_minmax(260px,1fr)_auto]">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Активная Enterprise-компания</Label>
            <Popover open={companyPickerOpen} onOpenChange={setCompanyPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={companyPickerOpen}
                  className="h-10 w-full justify-between px-3 font-normal"
                  disabled={Boolean(pendingId) || activeEnterpriseAgreements.length === 0}
                >
                  {selectedActiveAgreement ? (
                    <span className="flex min-w-0 flex-1 flex-col items-start text-left">
                      <span className="truncate">{selectedActiveAgreement.companyName || "Компания без названия"}</span>
                      <span className="truncate font-mono text-xs text-muted-foreground">{selectedActiveAgreement.companyId}</span>
                    </span>
                  ) : (
                    "Выберите компанию"
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder="Поиск по компании или company id" />
                  <CommandList>
                    <CommandEmpty>Компании не найдены.</CommandEmpty>
                    <CommandGroup>
                      {activeEnterpriseAgreements.map((agreement) => (
                        <CommandItem
                          key={agreement.companyId}
                          value={[agreement.companyName, agreement.companyId].filter(Boolean).join(" ")}
                          onSelect={() => {
                            setExitRequestDraft((current) => ({ ...current, companyId: agreement.companyId }));
                            setCompanyPickerOpen(false);
                          }}
                        >
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate">{agreement.companyName || "Компания без названия"}</span>
                            <span className="truncate font-mono text-xs text-muted-foreground">{agreement.companyId}</span>
                          </div>
                          <Check
                            className={cn("h-4 w-4 shrink-0", exitRequestDraft.companyId === agreement.companyId ? "opacity-100" : "opacity-0")}
                            aria-hidden="true"
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Тариф после выхода</Label>
            <Select
              value={exitRequestDraft.targetPlan}
              disabled={Boolean(pendingId)}
              onValueChange={(targetPlan) =>
                setExitRequestDraft((current) => ({
                  ...current,
                  targetPlan: targetPlan as ExitRequestDraft["targetPlan"],
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="enterprise-exit-message" className="text-xs text-muted-foreground">
              Комментарий
            </Label>
                <Input
                  id="enterprise-exit-message"
                  value={exitRequestDraft.userMessage}
                  disabled={Boolean(pendingId)}
                  maxLength={4000}
                  onChange={(event) => setExitRequestDraft((current) => ({ ...current, userMessage: event.target.value }))}
                />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              disabled={pendingId === "exit-request:create" || activeEnterpriseAgreements.length === 0}
              onClick={() => void createExitRequest()}
            >
              {pendingId === "exit-request:create" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Создать заявку на выход
            </Button>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-[360px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Поиск по компании, id, статусу или тексту"
            aria-label="Поиск по заявкам на изменение тарифа"
            maxLength={120}
            className="h-9 pl-9"
          />
        </div>
        <span className="text-sm text-muted-foreground">
          {filteredRows.length} из {rows.length}
        </span>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Создано</TableHead>
              <TableHead>Компания</TableHead>
              <TableHead>Переход</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Сообщение</TableHead>
              <TableHead className="min-w-[220px]">Управление</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length ? (
              filteredRows.map((row) => {
                const existingAgreement = agreementBySourceRequest.get(row.id);

                return (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{dateLabel(row.created_at)}</TableCell>
                    <TableCell className="min-w-[220px]">
                      <div className="flex flex-col gap-1">
                        <span className="break-words font-medium">{row.companyName || "Компания без названия"}</span>
                        <span className="font-mono text-xs text-muted-foreground">{row.company_id}</span>
                        <span className="text-xs text-muted-foreground">Запросил: {row.requested_by}</span>
                        <span className="text-xs text-muted-foreground">Источник: {REQUEST_SOURCE_LABEL[row.source]}</span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="font-medium">{row.current_plan}</span>
                      <span className="px-1 text-muted-foreground">→</span>
                      <span className="font-medium">{row.target_plan}</span>
                      <div className="text-xs text-muted-foreground">{REQUEST_KIND_LABEL[row.request_kind]}</div>
                    </TableCell>
                    <TableCell className="min-w-[170px]">
                      <div className="flex flex-col gap-1">
                        <Badge variant={statusBadgeVariant(row.status)}>{STATUS_LABEL[row.status]}</Badge>
                        <span className="text-xs text-muted-foreground">Обновлено: {dateLabel(row.updated_at)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[240px] max-w-[360px] text-sm text-muted-foreground">
                      <div className="space-y-2">
                        <p className="line-clamp-3">{row.user_message ?? "-"}</p>
                        {row.public_response ? <p className="line-clamp-2 text-foreground">{row.public_response}</p> : null}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[220px]">
                      <div className="flex min-w-0 flex-col gap-2">
                        <div className="text-sm font-medium">{currentStageLabel(row, Boolean(existingAgreement))}</div>
                        <div className="text-xs text-muted-foreground">
                          {isTerminalStatus(row.status) ? "Заявка завершена." : "Откройте управление, чтобы изменить этап."}
                        </div>
                        <Button type="button" size="sm" variant="outline" onClick={() => openRequestDrawer(row)}>
                          Управлять
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : rows.length ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-sm text-muted-foreground">
                  Поиск ничего не нашёл.
                </TableCell>
              </TableRow>
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-sm text-muted-foreground">
                  Заявок на изменение тарифа пока нет.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <Sheet
        open={Boolean(selectedRequest)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRequestId(null);
            setRequestNoteDraft(null);
          }
        }}
      >
        {selectedRequest ? (
          <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
            <SheetHeader className="border-b px-5 py-4 pr-12 text-left">
              <SheetDescription>{REQUEST_KIND_LABEL[selectedRequest.request_kind]}</SheetDescription>
              <SheetTitle className="break-words">{selectedRequest.companyName || "Компания без названия"}</SheetTitle>
              <div className="text-sm text-muted-foreground">
                {selectedRequest.current_plan} <span className="px-1">→</span> {selectedRequest.target_plan}
              </div>
            </SheetHeader>
            <StageProgress stages={flowStages(selectedRequest, Boolean(selectedExistingAgreement))} />
            <div className="grid gap-4 px-5 py-4">
              {["work", "decision"].includes(selectedStageKey ?? "") && requestNoteDraft?.requestId === selectedRequest.id ? (
                <DecisionStageForm
                  row={selectedRequest}
                  draft={requestNoteDraft}
                  pending={pendingId === selectedRequest.id}
                  onSubmit={updateStatus}
                  onSaveNotes={saveRequestNotes}
                  onDraftChange={setRequestNoteDraft}
                />
              ) : null}
                  {selectedCanCreateTerms && selectedAgreementDraft ? (
                    <EnterpriseTermsStage
                  row={selectedRequest}
                  draft={selectedAgreementDraft}
                  pending={Boolean(pendingId)}
                  agreementPending={pendingId === `agreement:${selectedRequest.id}`}
                  onDraftChange={(draft) =>
                    setAgreementDrafts((current) => ({
                      ...current,
                      [selectedRequest.id]: draft,
                    }))
                  }
                      onCreate={() => void createAgreement(selectedRequest)}
                    />
                  ) : null}
                  {selectedTermsChangeMissingActiveAgreement ? (
                    <div className="rounded-md border px-4 py-3 text-sm text-muted-foreground">
                      Активные условия Enterprise не найдены. Обновите таблицу перед созданием новых условий.
                    </div>
                  ) : null}
                  {selectedExistingAgreement ? (
                <div className="rounded-md border px-4 py-3 text-sm text-muted-foreground">
                  {selectedRequest.request_kind === "enterprise_terms_change"
                    ? "Новые условия Enterprise созданы. Следующий этап: Обновление условий."
                    : "Условия Enterprise созданы."}
                </div>
              ) : null}
              {selectedRequest.status === "approved" && selectedRequest.request_kind === "enterprise_exit" ? (
                    <EnterpriseExitStage
                      pending={Boolean(pendingId)}
                      exitPending={pendingId === `exit:${selectedRequest.id}`}
                      hasActiveAgreement={Boolean(selectedActiveAgreementId)}
                      onEnd={() => void endEnterpriseFromRequest(selectedRequest)}
                    />
              ) : null}
              {selectedStageKey === "manual" ? (
                <ManualPlanChangeState
                  pending={Boolean(pendingId)}
                  applyPending={pendingId === `manual:${selectedRequest.id}`}
                  onApply={() => void applyManualRequest(selectedRequest)}
                />
              ) : null}
              {!["work", "decision", "finished"].includes(selectedStageKey ?? "") &&
              requestNoteDraft?.requestId === selectedRequest.id &&
              !isTerminalStatus(selectedRequest.status) ? (
                <TerminalRequestActionsForm
                  row={selectedRequest}
                  draft={requestNoteDraft}
                  pending={pendingId === selectedRequest.id}
                  onSubmit={updateStatus}
                  onSaveNotes={saveRequestNotes}
                  onDraftChange={setRequestNoteDraft}
                />
              ) : null}
              {isTerminalStatus(selectedRequest.status) ? <FinishedRequestState row={selectedRequest} /> : null}
            </div>
          </SheetContent>
        ) : null}
      </Sheet>
    </div>
  );
}
