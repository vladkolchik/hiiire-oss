"use client";

import * as React from "react";
import { CheckCircle2, Copy, ExternalLink, Loader2, RefreshCw, Search, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ManualInvoiceStatus } from "@/lib/billing/enterprise-billing";

export type ManualInvoiceTableRow = {
  id: string;
  company_id?: string | null;
  companyName?: string | null;
  request_id?: string | null;
  agreement_id?: string | null;
  amount: number;
  currency: string;
  description: string;
  payer_email?: string | null;
  status: ManualInvoiceStatus;
  provider_invoice_id?: string | null;
  provider_invoice_url?: string | null;
  provider_status?: string | null;
  issued_at?: string | null;
  paid_at?: string | null;
  canceled_at?: string | null;
  created_at: string;
};

type Props = {
  rows: ManualInvoiceTableRow[];
};

const STATUS_COPY: Record<ManualInvoiceStatus, string> = {
  draft: "Черновик",
  issued: "Выставлен",
  paid: "Оплачен",
  expired: "Истёк",
  canceled: "Отменён",
  refunded: "Возврат",
  requires_review: "Проверить",
};

const ACTION_ERROR_COPY: Record<string, string> = {
  FORBIDDEN: "Нет доступа к этому действию.",
  INVOICE_NOT_FOUND: "Счёт не найден. Обновите страницу.",
  INVOICE_PROVIDER_NOT_CONFIGURED: "Проверка оплаты пока не подключена.",
  INVOICE_PROVIDER_REFRESH_FAILED: "Не удалось получить статус у платёжного провайдера. Попробуйте позже.",
  INVOICE_REFRESH_NOT_ALLOWED: "Этот счёт уже нельзя обновить через платёжного провайдера.",
  INVOICE_REFRESH_UPDATE_FAILED: "Не удалось сохранить статус счёта. Попробуйте ещё раз.",
  INVOICE_REFRESH_CONFLICT: "Статус счёта изменился. Обновите страницу.",
  INVOICE_CANNOT_BE_CANCELED: "Этот счёт уже нельзя отменить.",
  INVOICE_PROVIDER_CANCEL_FAILED: "Не удалось отменить ссылку оплаты у провайдера. Попробуйте позже.",
  INVOICE_NOT_REVIEWABLE: "Этот счёт уже не требует ручной проверки.",
  INVOICE_PAYMENT_EVIDENCE_REQUIRED: "Для подтверждения оплаты нужна ссылка счёта или платёжный callback.",
  INVOICE_AGREEMENT_REQUIRED: "Счёт не связан с договорённостью.",
  AGREEMENT_NOT_PENDING_PAYMENT: "Договорённость уже не ожидает оплату.",
  INVOICE_NOT_CURRENT: "Этот счёт относится к прошлому циклу оплаты. Проверьте последний выставленный счёт.",
  INVOICE_PROVIDER_LINK_ACTIVE: "У счёта есть ссылка оплаты или платёжный callback. Его можно подтвердить после проверки оплаты.",
  INVOICE_REVIEW_RESOLVE_FAILED: "Не удалось обновить результат проверки. Попробуйте ещё раз.",
  INVOICE_REVIEW_CONFLICT: "Статус счёта изменился. Обновите страницу.",
  INVOICE_CANCEL_FAILED: "Не удалось отменить счёт. Попробуйте ещё раз.",
  INVOICE_LOOKUP_FAILED: "Не удалось найти счёт. Попробуйте ещё раз.",
  INTERNAL_ERROR: "Не удалось выполнить действие. Попробуйте ещё раз.",
};

function statusBadge(status: ManualInvoiceStatus) {
  if (status === "paid") return <Badge className="bg-green-600 hover:bg-green-600">{STATUS_COPY[status]}</Badge>;
  if (status === "issued") return <Badge className="bg-blue-600 hover:bg-blue-600">{STATUS_COPY[status]}</Badge>;
  if (status === "requires_review") return <Badge className="bg-amber-600 hover:bg-amber-600">{STATUS_COPY[status]}</Badge>;
  if (status === "canceled" || status === "expired") return <Badge variant="secondary">{STATUS_COPY[status]}</Badge>;
  if (status === "refunded") return <Badge variant="outline">{STATUS_COPY[status]}</Badge>;
  return <Badge variant="outline">{STATUS_COPY[status]}</Badge>;
}

function formatAmount(amountKopecks: number, currency: string) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: currency || "RUB",
    maximumFractionDigits: 2,
  }).format(amountKopecks / 100);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

function actionErrorMessage(code: unknown) {
  if (typeof code === "string" && ACTION_ERROR_COPY[code]) return ACTION_ERROR_COPY[code];
  return "Не удалось выполнить действие. Попробуйте ещё раз.";
}

function shortId(value: string | null | undefined) {
  if (!value) return null;
  return value.slice(0, 8);
}

function includesSearch(parts: Array<string | null | undefined>, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return parts.some((part) => String(part ?? "").toLowerCase().includes(normalized));
}

export function ManualInvoicesTable({ rows }: Props) {
  const router = useRouter();
  const [pendingById, setPendingById] = React.useState<Record<string, "refresh" | "cancel" | "mark-paid" | "reject-review" | undefined>>({});
  const [localRows, setLocalRows] = React.useState(rows);
  const [searchQuery, setSearchQuery] = React.useState("");

  React.useEffect(() => {
    setLocalRows(rows);
  }, [rows]);

  const latestInvoiceIdByAgreement = React.useMemo(() => {
    const latest = new Map<string, ManualInvoiceTableRow>();
    for (const row of localRows) {
      if (!row.agreement_id) continue;
      const current = latest.get(row.agreement_id);
      if (
        !current ||
        row.created_at > current.created_at ||
        (row.created_at === current.created_at && row.id > current.id)
      ) {
        latest.set(row.agreement_id, row);
      }
    }
    return new Map(Array.from(latest, ([agreementId, row]) => [agreementId, row.id]));
  }, [localRows]);
  const filteredRows = React.useMemo(
    () =>
      localRows.filter((row) =>
        includesSearch(
          [
            row.companyName,
            row.company_id,
            row.payer_email,
            row.description,
            STATUS_COPY[row.status],
            row.provider_invoice_id,
            row.provider_status,
            row.agreement_id,
            row.request_id,
            row.id,
          ],
          searchQuery,
        ),
      ),
    [localRows, searchQuery],
  );

  async function copyInvoiceLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Ссылка на счёт скопирована.");
    } catch {
      toast.error("Не удалось скопировать ссылку. Скопируйте её вручную.");
    }
  }

  async function runInvoiceAction(id: string, action: "refresh" | "cancel" | "mark-paid" | "reject-review") {
    if (action === "cancel") {
      const confirmed = window.confirm("Отменить этот счёт?");
      if (!confirmed) return;
    }
    if (action === "mark-paid") {
      const confirmed = window.confirm("Подтвердить оплату после ручной проверки?");
      if (!confirmed) return;
    }
    if (action === "reject-review") {
      const confirmed = window.confirm("Отклонить счёт после ручной проверки?");
      if (!confirmed) return;
    }

    setPendingById((current) => ({ ...current, [id]: action }));
    try {
      const response =
        action === "mark-paid" || action === "reject-review"
          ? await fetch(`/api/admin/billing/manual-invoices/${encodeURIComponent(id)}/resolve-review`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: action === "mark-paid" ? "mark_paid" : "reject" }),
            })
          : await fetch(`/api/admin/billing/manual-invoices/${encodeURIComponent(id)}/${action}`, {
              method: "POST",
            });
      const payload = (await response.json().catch(() => null)) as { error?: unknown; invoice?: Partial<ManualInvoiceTableRow> } | null;

      if (!response.ok) {
        toast.error(actionErrorMessage(payload?.error));
        return;
      }

      if (payload?.invoice) {
        setLocalRows((current) =>
          current.map((row) => (row.id === id ? { ...row, ...payload.invoice, id: row.id } : row)),
        );
      }

      const successMessage =
        action === "refresh"
          ? "Статус счёта обновлён."
          : action === "mark-paid"
            ? "Оплата подтверждена."
            : action === "reject-review"
              ? "Счёт отклонён."
              : "Счёт отменён.";
      toast.success(successMessage);
      router.refresh();
    } catch {
      toast.error("Не удалось выполнить действие. Попробуйте ещё раз.");
    } finally {
      setPendingById((current) => ({ ...current, [id]: undefined }));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-[360px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Поиск по компании, email, описанию или статусу"
            aria-label="Поиск по ручным счетам"
            maxLength={120}
            className="h-9 pl-9"
          />
        </div>
        <span className="text-sm text-muted-foreground">{filteredRows.length} из {localRows.length}</span>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">Создан</TableHead>
              <TableHead className="w-[120px]">Статус</TableHead>
              <TableHead className="min-w-[220px]">Компания</TableHead>
              <TableHead className="w-[140px] text-right">Сумма</TableHead>
              <TableHead className="min-w-[260px]">Описание</TableHead>
              <TableHead className="min-w-[220px]">Ссылка</TableHead>
              <TableHead className="w-[170px]">Оплата</TableHead>
              <TableHead className="w-[180px] text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length ? (
              filteredRows.map((row) => {
              const pending = pendingById[row.id];
              const canCancel =
                row.status === "draft" ||
                ((row.status === "issued" || row.status === "requires_review") && Boolean(row.provider_invoice_url));
              const canRefresh =
                (row.status === "issued" || row.status === "requires_review") && Boolean(row.provider_invoice_url);
              const canResolveReview = row.status === "requires_review";
              const isLatestAgreementInvoice = row.agreement_id
                ? latestInvoiceIdByAgreement.get(row.agreement_id) === row.id
                : true;
              const canMarkPaidReview =
                canResolveReview &&
                isLatestAgreementInvoice &&
                (Boolean(row.provider_invoice_url) || row.provider_status === "paid_requires_review");
              const canRejectReview =
                canResolveReview &&
                !row.provider_invoice_url &&
                (row.provider_status !== "paid_requires_review" || !isLatestAgreementInvoice);
              const cancelActionLabel = canRejectReview ? "Отклонить счёт после проверки" : "Отменить счёт";
              return (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDate(row.created_at)}
                  </TableCell>
                  <TableCell>{statusBadge(row.status)}</TableCell>
                  <TableCell className="min-w-[220px]">
                    <div className="flex flex-col gap-1">
                      <span className="break-words font-medium">{row.companyName || "Компания без названия"}</span>
                      {row.company_id ? <span className="font-mono text-xs text-muted-foreground">{row.company_id}</span> : null}
                      {row.payer_email ? <span className="break-words text-xs text-muted-foreground">Плательщик: {row.payer_email}</span> : null}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-medium">
                    {formatAmount(row.amount, row.currency)}
                  </TableCell>
                  <TableCell className="min-w-[260px]">
                    <div className="flex flex-col gap-1">
                      <span className="line-clamp-2 text-sm">{row.description}</span>
                      {row.agreement_id ? (
                        <span className="font-mono text-xs text-muted-foreground">Договорённость: {shortId(row.agreement_id)}</span>
                      ) : null}
                      {row.request_id ? <span className="font-mono text-xs text-muted-foreground">Заявка: {shortId(row.request_id)}</span> : null}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[220px]">
                    {row.provider_invoice_url ? (
                      <div className="flex items-center gap-1">
                        <Button asChild variant="ghost" size="sm" className="h-8 px-2">
                          <a href={row.provider_invoice_url} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-4 w-4" />
                            Открыть
                          </a>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Скопировать ссылку на счёт"
                          onClick={() => void copyInvoiceLink(row.provider_invoice_url ?? "")}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Ссылка появится после выставления.</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {row.paid_at ? formatDate(row.paid_at) : row.issued_at ? `Выставлен ${formatDate(row.issued_at)}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Обновить статус счёта"
                        disabled={Boolean(pending) || !canRefresh}
                        onClick={() => void runInvoiceAction(row.id, "refresh")}
                      >
                        {pending === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Подтвердить оплату после проверки"
                        disabled={Boolean(pending) || !canMarkPaidReview}
                        onClick={() => void runInvoiceAction(row.id, "mark-paid")}
                      >
                        {pending === "mark-paid" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={cancelActionLabel}
                        disabled={Boolean(pending) || (!canCancel && !canRejectReview)}
                        onClick={() => void runInvoiceAction(row.id, canRejectReview ? "reject-review" : "cancel")}
                      >
                        {pending === "cancel" || pending === "reject-review" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
              })
            ) : localRows.length ? (
              <TableRow>
                <TableCell colSpan={8} className="text-sm text-muted-foreground">
                  Поиск ничего не нашёл.
                </TableCell>
              </TableRow>
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="text-sm text-muted-foreground">
                  Ручных счетов пока нет.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
