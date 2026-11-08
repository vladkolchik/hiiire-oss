import { AdjustCreditsForm } from "../../credits/adjust-credits-form";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getRange, getTotalPages, isUuid, normalizeSearch, parsePageParam } from "@/lib/admin/list-query";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/admin/platform-guard";

const BALANCE_PAGE_SIZE = 25;
const LEDGER_PAGE_SIZE = 25;

type SearchParams = Record<string, string | string[] | undefined>;

type CompanyRow = { id: string; name: string };
type CompanyCreditsRow = { company_id: string; balance: number; updated_at: string };
type CreditTopupPaymentRow = {
  id: string;
  company_id: string;
  credits: number;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "refunded" | "requires_review";
  inv_id: number;
  fiscal_receipt: unknown | null;
  provider_payload: unknown | null;
  completed_at: string | null;
  fail_reason: string | null;
  created_at: string;
};
type CreditLedgerRow = {
  id: string;
  company_id: string;
  delta: number;
  reason: "grant" | "manual_adjustment" | "resume_analysis" | "refund";
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

function buildCreditsHref({
  q,
  balancePage,
  ledgerPage,
}: {
  q: string;
  balancePage: number;
  ledgerPage: number;
}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (balancePage > 1) params.set("balancePage", String(balancePage));
  if (ledgerPage > 1) params.set("ledgerPage", String(ledgerPage));
  const query = params.toString();
  return query ? `/admin/credits?${query}` : "/admin/credits";
}

export default async function AdminCreditsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const { isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) return null;

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const q = normalizeSearch(resolvedSearchParams.q);
  const balancePage = parsePageParam(resolvedSearchParams.balancePage, { defaultValue: 1, min: 1, max: 10_000 });
  const ledgerPage = parsePageParam(resolvedSearchParams.ledgerPage, { defaultValue: 1, min: 1, max: 10_000 });
  const searchByCompanyId = q !== "" && isUuid(q);

  const supabaseAdmin = getSupabaseAdminClient();
  const balanceRange = getRange(balancePage, BALANCE_PAGE_SIZE);
  const ledgerRange = getRange(ledgerPage, LEDGER_PAGE_SIZE);

  const { data: companies } = await supabaseAdmin
    .from("companies")
    .select("id,name")
    .order("created_at", { ascending: false });
  const companyNameById = new Map<string, string>(((companies ?? []) as CompanyRow[]).map((c) => [c.id, c.name]));
  const companyOptions = ((companies ?? []) as CompanyRow[]) ?? [];

  let matchedCompanyIds: string[] | null = null;
  if (q) {
    if (searchByCompanyId) {
      matchedCompanyIds = [q];
    } else {
      const { data: matchedCompanies } = await supabaseAdmin.from("companies").select("id").ilike("name", `%${q}%`);
      matchedCompanyIds = (matchedCompanies ?? []).map((c) => c.id);
    }
  }

  const noNameMatches = Boolean(q && !searchByCompanyId && matchedCompanyIds && matchedCompanyIds.length === 0);

  const [
    { data: balancesData, error: balancesError, count: balancesCount },
    { data: topupsData, error: topupsError },
    { data: ledgerData, error: ledgerError, count: ledgerCount },
  ] =
    noNameMatches
      ? [
          { data: [] as CompanyCreditsRow[], error: null, count: 0 },
          { data: [] as CreditTopupPaymentRow[], error: null },
          { data: [] as CreditLedgerRow[], error: null, count: 0 },
        ]
      : await Promise.all([
          (async () => {
            let query = supabaseAdmin
              .from("company_credits")
              .select("company_id,balance,updated_at", { count: "exact" })
              .order("updated_at", { ascending: false });
            if (q) {
              if (searchByCompanyId) {
                query = query.eq("company_id", q);
              } else if (matchedCompanyIds && matchedCompanyIds.length > 0) {
                query = query.in("company_id", matchedCompanyIds);
              }
            }
            return query.range(balanceRange.from, balanceRange.to);
          })(),
          (async () => {
            let query = supabaseAdmin
              .from("credit_topup_payments")
              .select("id,company_id,credits,amount,currency,status,inv_id,fiscal_receipt,provider_payload,completed_at,fail_reason,created_at")
              .order("created_at", { ascending: false })
              .limit(25);
            if (q) {
              if (searchByCompanyId) {
                query = query.eq("company_id", q);
              } else if (matchedCompanyIds && matchedCompanyIds.length > 0) {
                query = query.in("company_id", matchedCompanyIds);
              }
            }
            return query;
          })(),
          (async () => {
            let query = supabaseAdmin
              .from("credit_ledger")
              .select("id,company_id,delta,reason,notes,created_by,created_at", { count: "exact" })
              .order("created_at", { ascending: false });
            if (q) {
              if (searchByCompanyId) {
                query = query.eq("company_id", q);
              } else if (matchedCompanyIds && matchedCompanyIds.length > 0) {
                query = query.in("company_id", matchedCompanyIds);
              }
            }
            return query.range(ledgerRange.from, ledgerRange.to);
          })(),
        ]);

  const balances = (balancesData ?? []) as CompanyCreditsRow[];
  const topups = (topupsData ?? []) as CreditTopupPaymentRow[];
  const ledger = (ledgerData ?? []) as CreditLedgerRow[];
  const totalBalances = typeof balancesCount === "number" ? balancesCount : 0;
  const totalLedger = typeof ledgerCount === "number" ? ledgerCount : 0;
  const balancesTotalPages = getTotalPages(totalBalances, BALANCE_PAGE_SIZE);
  const ledgerTotalPages = getTotalPages(totalLedger, LEDGER_PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Credits</h1>
        <p className="text-muted-foreground">Баланс и история изменений (ledger).</p>
      </div>

      <AdjustCreditsForm companies={companyOptions} />

      <Card>
        <CardContent className="pt-6">
          <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              name="q"
              defaultValue={q}
              placeholder="Поиск по названию компании или точному company id (UUID)"
              className="sm:max-w-md"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm">
                Найти
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/credits">Сброс</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Баланс по компаниям</CardTitle>
          </CardHeader>
          <CardContent>
            {balancesError ? <div className="text-sm text-destructive">Ошибка: {balancesError.message}</div> : null}
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Компания</TableHead>
                    <TableHead className="text-right">Баланс</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balances.length ? (
                    balances.map((b) => (
                      <TableRow key={b.company_id}>
                        <TableCell className="min-w-[260px]">
                          <div className="flex flex-col">
                            <span className="font-medium">{companyNameById.get(b.company_id) ?? "—"}</span>
                            <span className="font-mono text-xs text-muted-foreground">{b.company_id}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">{b.balance}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={2} className="text-sm text-muted-foreground">
                        Нет данных.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                Страница <span className="font-medium text-foreground">{balancePage}</span> из{" "}
                <span className="font-medium text-foreground">{balancesTotalPages}</span>. Всего:{" "}
                <span className="font-medium text-foreground">{totalBalances}</span>
              </div>
              <div className="flex gap-2">
                {balancePage > 1 ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={buildCreditsHref({ q, balancePage: balancePage - 1, ledgerPage })}>Назад</Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled>
                    Назад
                  </Button>
                )}
                {balancePage < balancesTotalPages ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={buildCreditsHref({ q, balancePage: balancePage + 1, ledgerPage })}>Вперёд</Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled>
                    Вперёд
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Последние операции</CardTitle>
          </CardHeader>
          <CardContent>
            {ledgerError ? <div className="text-sm text-destructive">Ошибка: {ledgerError.message}</div> : null}
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Время</TableHead>
                    <TableHead>Компания</TableHead>
                    <TableHead>Причина</TableHead>
                    <TableHead className="text-right">Delta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.length ? (
                    ledger.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(e.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="min-w-[220px]">
                          <div className="flex flex-col">
                            <span className="text-sm">{companyNameById.get(e.company_id) ?? "—"}</span>
                            <span className="font-mono text-xs text-muted-foreground">{e.company_id}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{e.reason}</TableCell>
                        <TableCell className="text-right font-mono">{e.delta}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-sm text-muted-foreground">
                        Операций пока нет.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                Страница <span className="font-medium text-foreground">{ledgerPage}</span> из{" "}
                <span className="font-medium text-foreground">{ledgerTotalPages}</span>. Всего:{" "}
                <span className="font-medium text-foreground">{totalLedger}</span>
              </div>
              <div className="flex gap-2">
                {ledgerPage > 1 ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={buildCreditsHref({ q, balancePage, ledgerPage: ledgerPage - 1 })}>Назад</Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled>
                    Назад
                  </Button>
                )}
                {ledgerPage < ledgerTotalPages ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={buildCreditsHref({ q, balancePage, ledgerPage: ledgerPage + 1 })}>Вперёд</Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled>
                    Вперёд
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Пополнения кредитов</CardTitle>
        </CardHeader>
        <CardContent>
          {topupsError ? <div className="text-sm text-destructive">Ошибка: {topupsError.message}</div> : null}
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Создано</TableHead>
                  <TableHead>Payment ID</TableHead>
                  <TableHead>Компания</TableHead>
                  <TableHead>InvId</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Завершено</TableHead>
                  <TableHead>Причина</TableHead>
                  <TableHead>Чек</TableHead>
                  <TableHead>Callback</TableHead>
                  <TableHead className="text-right">Кредиты</TableHead>
                  <TableHead className="text-right">Сумма</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topups.length ? (
                  topups.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(payment.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{payment.id}</TableCell>
                      <TableCell className="min-w-[220px]">
                        <div className="flex flex-col">
                          <span className="text-sm">{companyNameById.get(payment.company_id) ?? "—"}</span>
                          <span className="font-mono text-xs text-muted-foreground">{payment.company_id}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{payment.inv_id}</TableCell>
                      <TableCell className="font-mono text-xs">{payment.status}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {payment.completed_at ? new Date(payment.completed_at).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate font-mono text-xs">
                        {payment.fail_reason ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {payment.fiscal_receipt ? "Подготовлен" : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {payment.provider_payload ? "Получен" : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">+{payment.credits}</TableCell>
                      <TableCell className="text-right font-mono">
                        {(payment.amount / 100).toLocaleString("ru-RU")} {payment.currency}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={11} className="text-sm text-muted-foreground">
                      Пополнений пока нет.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
