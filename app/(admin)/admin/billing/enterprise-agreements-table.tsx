"use client";

import * as React from "react";
import { CreditCard, Loader2, Play, RotateCcw, Save, Search, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { EnterpriseAgreementStatus } from "@/lib/billing/enterprise-billing";
import {
  MANUAL_INVOICE_DESCRIPTION_MAX_LENGTH,
  MANUAL_INVOICE_FISCAL_ITEM_NAME_MAX_LENGTH,
  MANUAL_INVOICE_PAYER_EMAIL_MAX_LENGTH,
  MAX_MANUAL_INVOICE_AMOUNT_KOPECKS,
} from "@/lib/billing/manual-invoices";

export type EnterpriseAgreementTableRow = {
  id: string;
  companyId: string;
  companyName?: string | null;
  sourceRequestId?: string | null;
  replacesAgreementId?: string | null;
  status: EnterpriseAgreementStatus;
  startsAt: string;
  endsAt: string | null;
  isOpenEnded: boolean;
  creditsLimit: number | null;
  termsSummary: string | null;
  internalNote: string | null;
  activatedAt?: string | null;
  endedAt?: string | null;
  endedReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  rows: EnterpriseAgreementTableRow[];
  emptyMessage?: string;
};

type DraftState = {
  startsAt: string;
  endsAt: string;
  isOpenEnded: boolean;
  creditsLimit: string;
  termsSummary: string;
  internalNote: string;
};

type InvoiceState = {
  amountRub: string;
  description: string;
  payerEmail: string;
  servicePeriodStart: string;
  servicePeriodEnd: string;
  fiscalItemName: string;
  tax: string;
};

const ERROR_COPY: Record<string, string> = {
  INVALID_BODY: "Проверьте заполненные поля.",
  AGREEMENT_NOT_FOUND: "Договорённость не найдена. Обновите страницу.",
  AGREEMENT_NOT_ACTIVATABLE: "Эту договорённость нельзя активировать.",
  AGREEMENT_NOT_ACTIVE: "Завершить можно только активную договорённость.",
  ACTIVE_AGREEMENT_EXISTS: "У компании уже есть активная Enterprise-договорённость.",
  REPLACED_AGREEMENT_NOT_FOUND: "Договорённость, которую нужно заменить, не найдена.",
  REPLACED_AGREEMENT_COMPANY_MISMATCH: "Договорённость относится к другой компании.",
  REPLACED_AGREEMENT_NOT_ACTIVE: "Заменить можно только активную договорённость.",
  SOURCE_REQUEST_REQUIRED: "Для договорённости нужна одобренная заявка. Создайте её из заявки на тариф.",
  SOURCE_REQUEST_LOOKUP_FAILED: "Не удалось проверить заявку по договорённости. Попробуйте ещё раз.",
  SOURCE_REQUEST_NOT_FOUND: "Заявка по договорённости не найдена. Обновите список заявок.",
  SOURCE_REQUEST_COMPANY_MISMATCH: "Заявка относится к другой компании.",
  SOURCE_REQUEST_STATUS_INVALID: "Сначала одобрите заявку по договорённости.",
  SOURCE_REQUEST_TARGET_PLAN_INVALID: "Заявка должна быть на Enterprise.",
  SOURCE_REQUEST_KIND_INVALID: "Эта заявка не подходит для Enterprise-договорённости.",
  SOURCE_REQUEST_CURRENT_PLAN_INVALID: "Текущий тариф в заявке не подходит для этой договорённости.",
  SOURCE_REQUEST_APPLY_FAILED: "Не удалось активировать Enterprise и закрыть заявку. Обновите страницу и проверьте статус.",
  STARTS_AT_INVALID: "Укажите корректную дату начала.",
  ENDS_AT_REQUIRED: "Укажите дату окончания или сделайте доступ бессрочным.",
  ENDS_AT_MUST_BE_AFTER_STARTS_AT: "Дата окончания должна быть позже даты начала.",
  CREDITS_LIMIT_INVALID: "Лимит credits должен быть целым числом от 0.",
  TERMS_SUMMARY_REQUIRED: "Кратко опишите условия.",
  END_REASON_REQUIRED: "Укажите причину завершения.",
  TARGET_PLAN_INVALID: "Выберите Starter или Professional.",
  REQUEST_NOT_FOUND: "Заявка не найдена. Обновите страницу.",
  REQUEST_COMPANY_MISMATCH: "Заявка относится к другой компании.",
  REQUEST_KIND_INVALID: "Эта заявка не подходит для завершения Enterprise.",
  REQUEST_STATUS_INVALID: "Сначала одобрите заявку на выход из Enterprise.",
  REQUEST_CURRENT_PLAN_INVALID: "Заявка должна быть создана с текущего Enterprise.",
  REQUEST_TARGET_PLAN_INVALID: "В заявке должен быть выбран Starter или Professional.",
  TARGET_PLAN_MISMATCH: "Выбранный тариф не совпадает с заявкой.",
  AGREEMENT_NOT_EDITABLE: "Условия можно менять только до выставления счёта.",
  AGREEMENT_UPDATE_FAILED: "Не удалось сохранить условия. Попробуйте ещё раз.",
  AGREEMENT_ACTIVATE_FAILED: "Не удалось активировать договорённость. Попробуйте ещё раз.",
  AGREEMENT_END_FAILED: "Не удалось завершить договорённость. Попробуйте ещё раз.",
  AGREEMENT_NOT_CANCELABLE: "Отменить можно только черновик договорённости.",
  AGREEMENT_HAS_OPEN_INVOICE: "Сначала отмените или разберите счёт по этой договорённости.",
  INVOICE_LOOKUP_FAILED: "Не удалось проверить счета по договорённости. Попробуйте ещё раз.",
  AGREEMENT_CANCEL_FAILED: "Не удалось отменить договорённость. Попробуйте ещё раз.",
  AGREEMENT_CANCEL_CONFLICT: "Договорённость изменилась. Обновите страницу и проверьте статус.",
  COMPANY_PLAN_UPDATE_FAILED: "Не удалось обновить тариф компании. Попробуйте ещё раз.",
  REQUEST_APPLY_FAILED: "Тариф активирован, но заявку не удалось закрыть автоматически.",
  PAID_INVOICE_REQUIRED: "Активировать Enterprise можно после оплаты счёта.",
  AGREEMENT_NOT_RESTORABLE: "Вернуть в черновик можно только договорённость, ожидающую оплату.",
  AGREEMENT_HAS_PAYABLE_INVOICE: "Сначала разберите активный или оплаченный счёт по этой договорённости.",
  AGREEMENT_RESTORE_FAILED: "Не удалось вернуть договорённость в черновик. Попробуйте ещё раз.",
  AMOUNT_REQUIRED: "Укажите сумму счёта.",
  AMOUNT_TOO_LARGE: "Сумма счёта слишком большая.",
  DESCRIPTION_REQUIRED: "Укажите описание счёта.",
  DESCRIPTION_TOO_LONG: "Описание счёта слишком длинное.",
  FISCAL_ITEM_NAME_TOO_LONG: "Наименование услуги для чека слишком длинное.",
  PAYER_EMAIL_REQUIRED: "Укажите email для чека.",
  PAYER_EMAIL_TOO_LONG: "Email для чека слишком длинный.",
  PAYER_EMAIL_INVALID: "Проверьте email для счёта.",
  INVOICE_INV_ID_INVALID: "Не удалось подготовить номер счёта. Попробуйте ещё раз.",
  INVOICE_CREATE_FAILED: "Не удалось создать счёт. Попробуйте ещё раз.",
  INVOICE_PROVIDER_NOT_CONFIGURED: "Выставление счетов через Robokassa пока не подключено.",
  INVOICE_PROVIDER_FAILED: "Не удалось выставить счёт в Robokassa. Попробуйте ещё раз.",
  INVOICE_ISSUE_UPDATE_FAILED: "Счёт создан, но его статус не удалось обновить. Проверьте список счетов.",
  INVOICE_STATE_REPAIR_FAILED: "Не удалось восстановить состояние счёта. Обновите страницу и проверьте список счетов.",
  INVOICE_REVIEW_MARK_FAILED: "Не удалось перевести счёт на проверку. Обновите страницу и проверьте список счетов.",
  INVOICE_STATUS_CHANGED: "Статус счёта изменился. Обновите страницу и проверьте список счетов.",
  AGREEMENT_NOT_INVOICEABLE: "Счёт можно выставить только для черновика договорённости.",
  AGREEMENT_STATUS_CHANGED: "Статус договорённости изменился. Обновите страницу и проверьте список счетов.",
  INTERNAL_ERROR: "Что-то пошло не так. Попробуйте ещё раз.",
};

function statusBadge(status: EnterpriseAgreementStatus) {
  if (status === "draft") return <Badge variant="outline">Черновик</Badge>;
  if (status === "pending_payment") return <Badge className="bg-amber-600 hover:bg-amber-600">Ожидает оплаты</Badge>;
  if (status === "active") return <Badge className="bg-green-600 hover:bg-green-600">Активна</Badge>;
  if (status === "ended") return <Badge variant="secondary">Завершена</Badge>;
  return <Badge variant="destructive">Отменена</Badge>;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ru-RU");
}

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function initialDraft(row: EnterpriseAgreementTableRow): DraftState {
  return {
    startsAt: toDateTimeLocal(row.startsAt),
    endsAt: toDateTimeLocal(row.endsAt),
    isOpenEnded: row.isOpenEnded,
    creditsLimit: row.creditsLimit === null ? "" : String(row.creditsLimit),
    termsSummary: row.termsSummary ?? "",
    internalNote: row.internalNote ?? "",
  };
}

function initialInvoice(row: EnterpriseAgreementTableRow): InvoiceState {
  return {
    amountRub: "",
    description: row.termsSummary ?? "Enterprise hiiire",
    payerEmail: "",
    servicePeriodStart: toDateTimeLocal(row.startsAt),
    servicePeriodEnd: toDateTimeLocal(row.endsAt),
    fiscalItemName: row.termsSummary ?? "Enterprise hiiire",
    tax: "none",
  };
}

function errorMessage(code: unknown) {
  return ERROR_COPY[String(code ?? "")] ?? "Не удалось выполнить действие. Попробуйте ещё раз.";
}

async function readApiError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return errorMessage(body?.error);
}

function parseRubToKopecks(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const amountKopecks = Math.round(amount * 100);
  if (amountKopecks > MAX_MANUAL_INVOICE_AMOUNT_KOPECKS) return null;
  return amountKopecks;
}

function includesSearch(parts: Array<string | number | null | undefined>, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return parts.some((part) => String(part ?? "").toLowerCase().includes(normalized));
}

export function EnterpriseAgreementsTable({ rows, emptyMessage = "Enterprise-договорённостей пока нет." }: Props) {
  const router = useRouter();
  const [items, setItems] = React.useState(rows);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [drafts, setDrafts] = React.useState<Record<string, DraftState>>(() =>
    Object.fromEntries(rows.map((row) => [row.id, initialDraft(row)])),
  );
  const [invoiceForms, setInvoiceForms] = React.useState<Record<string, InvoiceState>>(() =>
    Object.fromEntries(rows.map((row) => [row.id, initialInvoice(row)])),
  );
  const [pending, setPending] = React.useState<string | null>(null);

  React.useEffect(() => {
    setItems(rows);
    setDrafts(Object.fromEntries(rows.map((row) => [row.id, initialDraft(row)])));
    setInvoiceForms(Object.fromEntries(rows.map((row) => [row.id, initialInvoice(row)])));
  }, [rows]);

  function patchRow(next: EnterpriseAgreementTableRow) {
    setItems((current) =>
      current.map((row) => (row.id === next.id ? { ...next, companyName: next.companyName ?? row.companyName } : row)),
    );
    setDrafts((current) => ({ ...current, [next.id]: initialDraft(next) }));
  }

  const filteredItems = React.useMemo(
    () =>
      items.filter((row) =>
        includesSearch(
          [
            row.companyName,
            row.companyId,
            row.id,
            row.status,
            row.sourceRequestId,
            row.replacesAgreementId,
            row.termsSummary,
            row.internalNote,
            row.creditsLimit,
            row.endedReason,
          ],
          searchQuery,
        ),
      ),
    [items, searchQuery],
  );

  async function saveTerms(row: EnterpriseAgreementTableRow) {
    const draft = drafts[row.id] ?? initialDraft(row);
    const startsAt = fromDateTimeLocal(draft.startsAt);
    const endsAt = fromDateTimeLocal(draft.endsAt);
    if (!startsAt || (!draft.isOpenEnded && !endsAt)) {
      toast.error("Проверьте даты договорённости.");
      return;
    }

    setPending(`save:${row.id}`);
    try {
      const response = await fetch(`/api/admin/billing/enterprise-agreements/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startsAt,
          endsAt: draft.isOpenEnded ? null : endsAt,
          isOpenEnded: draft.isOpenEnded,
          creditsLimit: draft.creditsLimit.trim() ? Number(draft.creditsLimit) : null,
          termsSummary: draft.termsSummary,
          internalNote: draft.internalNote || null,
        }),
      });

      if (!response.ok) {
        toast.error(await readApiError(response));
        return;
      }

      const body = (await response.json()) as { agreement: EnterpriseAgreementTableRow };
      patchRow(body.agreement);
      toast.success("Условия сохранены.");
    } finally {
      setPending(null);
    }
  }

  async function activate(row: EnterpriseAgreementTableRow) {
    setPending(`activate:${row.id}`);
    try {
      const response = await fetch(`/api/admin/billing/enterprise-agreements/${row.id}/activate`, {
        method: "POST",
      });

      if (!response.ok) {
        toast.error(await readApiError(response));
        return;
      }

      const body = (await response.json()) as { agreement: EnterpriseAgreementTableRow };
      patchRow(body.agreement);
      toast.success("Enterprise активирован.");
    } finally {
      setPending(null);
    }
  }

  async function restoreDraft(row: EnterpriseAgreementTableRow) {
    const confirmed = window.confirm("Вернуть договорённость в черновик? После этого можно будет поправить условия и выставить новый счёт.");
    if (!confirmed) return;

    setPending(`restore:${row.id}`);
    try {
      const response = await fetch(`/api/admin/billing/enterprise-agreements/${row.id}/restore-draft`, {
        method: "POST",
      });

      if (!response.ok) {
        toast.error(await readApiError(response));
        return;
      }

      const body = (await response.json()) as { agreement: EnterpriseAgreementTableRow };
      patchRow(body.agreement);
      toast.success("Договорённость возвращена в черновик.");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function cancelAgreement(row: EnterpriseAgreementTableRow) {
    const confirmed = window.confirm("Отменить договорённость? После этого исходную заявку можно будет закрыть или отклонить.");
    if (!confirmed) return;

    setPending(`cancel:${row.id}`);
    try {
      const response = await fetch(`/api/admin/billing/enterprise-agreements/${row.id}/cancel`, {
        method: "POST",
      });

      if (!response.ok) {
        toast.error(await readApiError(response));
        return;
      }

      const body = (await response.json()) as { agreement: EnterpriseAgreementTableRow };
      patchRow(body.agreement);
      toast.success("Договорённость отменена.");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function issueInvoice(row: EnterpriseAgreementTableRow) {
    const form = invoiceForms[row.id] ?? initialInvoice(row);
    const amountKopecks = parseRubToKopecks(form.amountRub);
    if (!amountKopecks) {
      toast.error("Укажите сумму счёта.");
      return;
    }
    if (!form.description.trim()) {
      toast.error("Укажите описание счёта.");
      return;
    }
    if (!form.payerEmail.trim()) {
      toast.error("Укажите email для чека.");
      return;
    }

    setPending(`invoice:${row.id}`);
    try {
      const response = await fetch(`/api/admin/billing/enterprise-agreements/${row.id}/issue-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountKopecks,
          description: form.description,
          payerEmail: form.payerEmail || null,
          servicePeriodStart: fromDateTimeLocal(form.servicePeriodStart),
          servicePeriodEnd: fromDateTimeLocal(form.servicePeriodEnd),
          fiscalItemName: form.fiscalItemName || form.description,
          tax: form.tax || "none",
        }),
      });

      if (!response.ok) {
        toast.error(await readApiError(response));
        return;
      }

      toast.success("Счёт выставлен.");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{filteredItems.length} из {items.length}</span>
        <div className="relative w-full sm:w-[320px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Поиск по компании или условиям"
            aria-label="Поиск по Enterprise Agreements"
            maxLength={120}
            className="h-9 pl-9"
          />
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Компания</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Период</TableHead>
              <TableHead>Credits</TableHead>
              <TableHead>Условия</TableHead>
              <TableHead className="min-w-[420px]">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length ? (
              filteredItems.map((row) => {
              const draft = drafts[row.id] ?? initialDraft(row);
              const canEdit = row.status === "draft";
              const canActivate = row.status === "pending_payment";
              const canRestoreDraft = row.status === "pending_payment";
              const canIssueInvoice = row.status === "draft";
              const canCancelAgreement = row.status === "draft";
              const saving = pending === `save:${row.id}`;
              const canceling = pending === `cancel:${row.id}`;
              const activating = pending === `activate:${row.id}`;
              const restoring = pending === `restore:${row.id}`;
              const invoicePending = pending === `invoice:${row.id}`;
              const invoiceForm = invoiceForms[row.id] ?? initialInvoice(row);

              return (
                <TableRow key={row.id}>
                  <TableCell className="min-w-[220px] align-top">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{row.companyName || row.companyId}</span>
                      {row.sourceRequestId ? (
                        <span className="font-mono text-xs text-muted-foreground">{row.sourceRequestId}</span>
                      ) : null}
                      {row.replacesAgreementId ? (
                        <span className="font-mono text-xs text-muted-foreground">Заменяет: {row.replacesAgreementId}</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="space-y-1">
                      {statusBadge(row.status)}
                      <div className="text-xs text-muted-foreground">Обновлено: {formatDate(row.updatedAt)}</div>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[220px] align-top text-sm">
                    <div className="space-y-1">
                      <div>С: {formatDate(row.startsAt)}</div>
                      <div>До: {row.isOpenEnded ? "бессрочно" : formatDate(row.endsAt)}</div>
                    </div>
                  </TableCell>
                  <TableCell className="align-top font-mono text-sm">{row.creditsLimit ?? "-"}</TableCell>
                  <TableCell className="min-w-[260px] align-top text-sm text-muted-foreground">
                    {row.termsSummary ? <span className="line-clamp-4">{row.termsSummary}</span> : "-"}
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="space-y-3">
                      {canEdit ? (
                        <div className="grid gap-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs" htmlFor={`starts-${row.id}`}>
                                Начало
                              </Label>
                              <Input
                                id={`starts-${row.id}`}
                                type="datetime-local"
                                value={draft.startsAt}
                                disabled={Boolean(pending)}
                                onChange={(event) =>
                                  setDrafts((current) => ({
                                    ...current,
                                    [row.id]: { ...draft, startsAt: event.target.value },
                                  }))
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs" htmlFor={`ends-${row.id}`}>
                                Окончание
                              </Label>
                              <Input
                                id={`ends-${row.id}`}
                                type="datetime-local"
                                value={draft.endsAt}
                                disabled={Boolean(pending) || draft.isOpenEnded}
                                onChange={(event) =>
                                  setDrafts((current) => ({
                                    ...current,
                                    [row.id]: { ...draft, endsAt: event.target.value },
                                  }))
                                }
                              />
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <label className="flex items-center gap-2 text-xs">
                              <Checkbox
                                checked={draft.isOpenEnded}
                                disabled={Boolean(pending)}
                                onCheckedChange={(checked) =>
                                  setDrafts((current) => ({
                                    ...current,
                                    [row.id]: { ...draft, isOpenEnded: checked === true },
                                  }))
                                }
                              />
                              Бессрочно
                            </label>
                            <Input
                              className="h-8 w-32"
                              inputMode="numeric"
                              placeholder="Credits"
                              value={draft.creditsLimit}
                              disabled={Boolean(pending)}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [row.id]: { ...draft, creditsLimit: event.target.value },
                                }))
                              }
                            />
                          </div>
                          <Textarea
                            value={draft.termsSummary}
                            placeholder="Условия"
                            className="min-h-[64px]"
                            maxLength={5000}
                            disabled={Boolean(pending)}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [row.id]: { ...draft, termsSummary: event.target.value },
                              }))
                            }
                          />
                          <Textarea
                            value={draft.internalNote}
                            placeholder="Внутренняя заметка"
                            className="min-h-[52px]"
                            maxLength={5000}
                            disabled={Boolean(pending)}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [row.id]: { ...draft, internalNote: event.target.value },
                              }))
                            }
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" variant="secondary" disabled={Boolean(pending)} onClick={() => saveTerms(row)}>
                              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                              Сохранить
                            </Button>
                            {canCancelAgreement ? (
                              <Button type="button" size="sm" variant="destructive" disabled={Boolean(pending)} onClick={() => cancelAgreement(row)}>
                                {canceling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                                Отменить договорённость
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}

                      {canActivate || canRestoreDraft ? (
                        <div className="flex flex-wrap gap-2 border-t pt-3">
                          {canActivate ? (
                            <Button type="button" size="sm" disabled={Boolean(pending)} onClick={() => activate(row)}>
                              {activating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                              Активировать
                            </Button>
                          ) : null}
                          {canRestoreDraft ? (
                            <Button type="button" size="sm" variant="secondary" disabled={Boolean(pending)} onClick={() => restoreDraft(row)}>
                              {restoring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                              Вернуть в черновик
                            </Button>
                          ) : null}
                        </div>
                      ) : null}

                      {canIssueInvoice ? (
                        <div className="grid gap-2 border-t pt-3">
                          <div className="grid gap-2 lg:grid-cols-2">
                            <div className="space-y-1">
                              <Label className="text-xs" htmlFor={`invoice-amount-${row.id}`}>
                                Сумма, ₽
                              </Label>
                              <Input
                                id={`invoice-amount-${row.id}`}
                                inputMode="decimal"
                                maxLength={11}
                                value={invoiceForm.amountRub}
                                disabled={Boolean(pending)}
                                onChange={(event) =>
                                  setInvoiceForms((current) => ({
                                    ...current,
                                    [row.id]: { ...invoiceForm, amountRub: event.target.value },
                                  }))
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs" htmlFor={`invoice-email-${row.id}`}>
                                Email для счёта
                              </Label>
                              <Input
                                id={`invoice-email-${row.id}`}
                                type="email"
                                required
                                maxLength={MANUAL_INVOICE_PAYER_EMAIL_MAX_LENGTH}
                                value={invoiceForm.payerEmail}
                                disabled={Boolean(pending)}
                                onChange={(event) =>
                                  setInvoiceForms((current) => ({
                                    ...current,
                                    [row.id]: { ...invoiceForm, payerEmail: event.target.value },
                                  }))
                                }
                              />
                            </div>
                          </div>
                          <Textarea
                            value={invoiceForm.description}
                            placeholder="Описание счёта"
                            className="min-h-[52px]"
                            maxLength={MANUAL_INVOICE_DESCRIPTION_MAX_LENGTH}
                            disabled={Boolean(pending)}
                            onChange={(event) =>
                              setInvoiceForms((current) => ({
                                ...current,
                                [row.id]: { ...invoiceForm, description: event.target.value },
                              }))
                            }
                          />
                          <div className="grid gap-2 lg:grid-cols-2">
                            <Input
                              type="datetime-local"
                              value={invoiceForm.servicePeriodStart}
                              disabled={Boolean(pending)}
                              aria-label="Начало периода услуги"
                              onChange={(event) =>
                                setInvoiceForms((current) => ({
                                  ...current,
                                  [row.id]: { ...invoiceForm, servicePeriodStart: event.target.value },
                                }))
                              }
                            />
                            <Input
                              type="datetime-local"
                              value={invoiceForm.servicePeriodEnd}
                              disabled={Boolean(pending)}
                              aria-label="Окончание периода услуги"
                              onChange={(event) =>
                                setInvoiceForms((current) => ({
                                  ...current,
                                  [row.id]: { ...invoiceForm, servicePeriodEnd: event.target.value },
                                }))
                              }
                            />
                          </div>
                          <Input
                            value={invoiceForm.fiscalItemName}
                            placeholder="Наименование услуги для чека"
                            maxLength={MANUAL_INVOICE_FISCAL_ITEM_NAME_MAX_LENGTH}
                            disabled={Boolean(pending)}
                            onChange={(event) =>
                              setInvoiceForms((current) => ({
                                ...current,
                                [row.id]: { ...invoiceForm, fiscalItemName: event.target.value },
                              }))
                            }
                          />
                          <Button type="button" size="sm" variant="secondary" disabled={Boolean(pending)} onClick={() => issueInvoice(row)}>
                            {invoicePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                            Выставить счёт
                          </Button>
                        </div>
                      ) : null}

                      {row.status === "active" ? (
                        <span className="max-w-[220px] text-sm text-muted-foreground">
                          Выход из Enterprise оформляется через заявку в разделе Plan Change Requests.
                        </span>
                      ) : null}

                      {!canEdit && !canActivate && !canRestoreDraft && row.status !== "active" ? (
                        <span className="text-sm text-muted-foreground">-</span>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="text-sm text-muted-foreground">
                  {items.length ? "Поиск ничего не нашёл." : emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
