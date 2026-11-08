import Link from "next/link";

import { UtmLinkBuilder } from "@/components/admin/utm-link-builder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/admin/platform-guard";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type SearchParams = Record<string, string | string[] | undefined>;

type MarketingReportTotals = {
  visits: number;
  visitors: number;
  signups: number;
  companies: number;
  payments: number;
  revenueKopecks: number;
};

type MarketingReportSourceRow = {
  key: string;
  source: string;
  medium: string;
  campaign: string;
  visits: number;
  visitors: number;
  signups: number;
  companies: number;
  payments: number;
  revenueKopecks: number;
};

type MarketingReportConversionRow = {
  userId: string;
  companyId: string | null;
  signedUpAt: string;
  source: string;
  medium: string;
  campaign: string;
  profileName: string | null;
  profileEmail: string | null;
  companyName: string | null;
};

type MarketingAdminReport = {
  totals: MarketingReportTotals;
  sources: MarketingReportSourceRow[];
  recentConversions: MarketingReportConversionRow[];
};

const PERIOD_OPTIONS = [7, 30, 90] as const;
const RECENT_CONVERSIONS_PAGE_SIZE = 50;
const EMPTY_TOTALS: MarketingReportTotals = {
  visits: 0,
  visitors: 0,
  signups: 0,
  companies: 0,
  payments: 0,
  revenueKopecks: 0,
};

function parseDays(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const days = Number(raw ?? 30);
  return PERIOD_OPTIONS.includes(days as (typeof PERIOD_OPTIONS)[number]) ? days : 30;
}

function parsePage(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number(raw ?? 1);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function buildMarketingHref(days: number, page = 1) {
  const params = new URLSearchParams();
  if (days !== 30) params.set("days", String(days));
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/marketing?${query}` : "/admin/marketing";
}

function formatRub(kopecks: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(kopecks / 100);
}

function conversionRate(numerator: number, denominator: number) {
  if (denominator <= 0) return "—";
  return `${Math.round((numerator / denominator) * 1000) / 10}%`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function asNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizeMarketingReport(value: unknown): MarketingAdminReport {
  const root = typeof value === "string" ? asRecord(JSON.parse(value)) : asRecord(value);
  const totalsRaw = asRecord(root.totals);
  const sourcesRaw = Array.isArray(root.sources) ? root.sources : [];
  const conversionsRaw = Array.isArray(root.recentConversions) ? root.recentConversions : [];

  const sources = sourcesRaw.map((row) => {
    const item = asRecord(row);
    const source = asString(item.source, "direct");
    const medium = asString(item.medium, "none");
    const campaign = asString(item.campaign, "not set");
    return {
      key: asString(item.key, `${source}||${medium}||${campaign}`),
      source,
      medium,
      campaign,
      visits: asNumber(item.visits),
      visitors: asNumber(item.visitors),
      signups: asNumber(item.signups),
      companies: asNumber(item.companies),
      payments: asNumber(item.payments),
      revenueKopecks: asNumber(item.revenueKopecks),
    };
  });

  const recentConversions = conversionsRaw.map((row) => {
    const item = asRecord(row);
    return {
      userId: asString(item.userId),
      companyId: asNullableString(item.companyId),
      signedUpAt: asString(item.signedUpAt),
      source: asString(item.source, "direct"),
      medium: asString(item.medium, "none"),
      campaign: asString(item.campaign, "not set"),
      profileName: asNullableString(item.profileName),
      profileEmail: asNullableString(item.profileEmail),
      companyName: asNullableString(item.companyName),
    };
  });

  return {
    totals: {
      visits: asNumber(totalsRaw.visits),
      visitors: asNumber(totalsRaw.visitors),
      signups: asNumber(totalsRaw.signups),
      companies: asNumber(totalsRaw.companies),
      payments: asNumber(totalsRaw.payments),
      revenueKopecks: asNumber(totalsRaw.revenueKopecks),
    },
    sources,
    recentConversions,
  };
}

export default async function AdminMarketingPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const { isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) return null;

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const days = parseDays(resolvedSearchParams.days);
  const page = parsePage(resolvedSearchParams.page);
  const recentOffset = (page - 1) * RECENT_CONVERSIONS_PAGE_SIZE;
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startIso = start.toISOString();

  const supabaseAdmin = getSupabaseAdminClient();
  const adminAny = supabaseAdmin as any;
  const reportRes = await adminAny.rpc("get_marketing_admin_report", {
    p_start_at: startIso,
    p_recent_limit: RECENT_CONVERSIONS_PAGE_SIZE,
    p_recent_offset: recentOffset,
    p_source_limit: 200,
  });

  if (reportRes.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Маркетинг</CardTitle>
          <CardDescription>Воронка по источникам трафика.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-destructive">
          Не удалось загрузить маркетинговую аналитику. Обновите страницу или попробуйте позже.
        </CardContent>
      </Card>
    );
  }

  const report = normalizeMarketingReport(reportRes.data);
  const totals = report.totals ?? EMPTY_TOTALS;
  const rows = report.sources;
  const recentConversions = report.recentConversions;
  const totalConversionPages = Math.max(1, Math.ceil(totals.signups / RECENT_CONVERSIONS_PAGE_SIZE));
  const canGoBack = page > 1;
  const canGoForward = page < totalConversionPages;
  const firstVisibleConversion = recentConversions.length ? recentOffset + 1 : 0;
  const lastVisibleConversion = recentOffset + recentConversions.length;
  const previousPage = Math.max(1, page - 1);
  const nextPage = page + 1;
  const conversionPageText = totals.signups === 0
    ? "За выбранный период ещё нет регистраций."
    : recentConversions.length
      ? `Показаны ${firstVisibleConversion}-${lastVisibleConversion} из ${totals.signups}. Страница ${page} из ${totalConversionPages}.`
      : `На этой странице нет регистраций. Страница ${page} из ${totalConversionPages}.`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Маркетинг</h1>
          <p className="text-muted-foreground">Воронка источников: Визиты, Регистрации, Компании, Оплаты и Выручка.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PERIOD_OPTIONS.map((option) => (
            <Button key={option} asChild size="sm" variant={days === option ? "default" : "outline"}>
              <Link href={buildMarketingHref(option)}>{option} дней</Link>
            </Button>
          ))}
        </div>
      </div>

      <UtmLinkBuilder />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Визиты</CardDescription>
            <CardTitle className="font-mono text-3xl">{totals.visits}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Уникальных посетителей: {totals.visitors}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Регистрации</CardDescription>
            <CardTitle className="font-mono text-3xl">{totals.signups}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Конверсия из визитов: {conversionRate(totals.signups, totals.visits)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Компании</CardDescription>
            <CardTitle className="font-mono text-3xl">{totals.companies}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Компаний на регистрацию: {conversionRate(totals.companies, totals.signups)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Оплаты</CardDescription>
            <CardTitle className="font-mono text-3xl">{totals.payments}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">Оплат на компанию: {conversionRate(totals.payments, totals.companies)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Выручка</CardDescription>
            <CardTitle className="font-mono text-3xl">{formatRub(totals.revenueKopecks)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">По completed payments за период.</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Источники</CardTitle>
          <CardDescription>First-touch атрибуция по utm_source / utm_medium / utm_campaign.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Источник</TableHead>
                  <TableHead className="text-right">Визиты</TableHead>
                  <TableHead className="text-right">Регистрации</TableHead>
                  <TableHead className="text-right">Компании</TableHead>
                  <TableHead className="text-right">Оплаты</TableHead>
                  <TableHead className="text-right">Выручка</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length ? (
                  rows.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="min-w-[280px]">
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="truncate font-medium">{row.source}</span>
                          <div className="flex min-w-0 flex-wrap gap-1">
                            <Badge variant="secondary" className="max-w-[180px] truncate">
                              {row.medium}
                            </Badge>
                            <Badge variant="outline" className="max-w-[240px] truncate">
                              {row.campaign}
                            </Badge>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{row.visits}</TableCell>
                      <TableCell className="text-right font-mono">{row.signups}</TableCell>
                      <TableCell className="text-right font-mono">{row.companies}</TableCell>
                      <TableCell className="text-right font-mono">{row.payments}</TableCell>
                      <TableCell className="text-right font-mono">{formatRub(row.revenueKopecks)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-sm text-muted-foreground">
                      За выбранный период ещё нет маркетинговых событий.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-lg">Кто пришёл</CardTitle>
              <CardDescription>Регистрации за выбранный период с пользователем, компанией и первым источником.</CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {canGoBack ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={buildMarketingHref(days, previousPage)}>Назад</Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled>
                  Назад
                </Button>
              )}
              {canGoForward ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={buildMarketingHref(days, nextPage)}>Вперёд</Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled>
                  Вперёд
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-3 text-sm text-muted-foreground">{conversionPageText}</div>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Пользователь</TableHead>
                  <TableHead>Компания</TableHead>
                  <TableHead>Источник</TableHead>
                  <TableHead className="text-right">Дата регистрации</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentConversions.length ? (
                  recentConversions.map((conversion) => (
                    <TableRow key={`${conversion.userId}-${conversion.signedUpAt}`}>
                      <TableCell className="min-w-[260px] max-w-[360px]">
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{conversion.profileName || "Без имени"}</span>
                          <span className="truncate text-xs text-muted-foreground">{conversion.profileEmail || conversion.userId}</span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[220px] max-w-[340px]">
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{conversion.companyName || "Компания не указана"}</span>
                          {conversion.companyId ? (
                            <span className="truncate text-xs text-muted-foreground">{conversion.companyId}</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[260px]">
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="truncate font-medium">{conversion.source}</span>
                          <div className="flex min-w-0 flex-wrap gap-1">
                            <Badge variant="secondary" className="max-w-[160px] truncate">
                              {conversion.medium}
                            </Badge>
                            <Badge variant="outline" className="max-w-[220px] truncate">
                              {conversion.campaign}
                            </Badge>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-sm text-muted-foreground">
                        {formatDateTime(conversion.signedUpAt)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-sm text-muted-foreground">
                      За выбранный период ещё нет регистраций с маркетинговой атрибуцией.
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
