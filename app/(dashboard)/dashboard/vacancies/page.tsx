"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, LayoutGrid, LayoutList, MapPin, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";
import type { Vacancy } from "@/types";
import { getVacancyById, listVacanciesPage, updateVacancyStatus } from "@/services/data/vacancies";
import { CreateVacancyDialog } from "@/components/dashboard/create-vacancy-dialog";
import { useAuth } from "@/hooks/use-auth";
import { getProfilesByIds, type ProfileLite } from "@/services/data/profiles";
import { useMediaQuery } from "@/hooks/use-media-query";
import { VacancyDetails } from "@/components/dashboard/vacancy-details";
import { PaginationControls } from "@/components/dashboard/pagination-controls";
import { VacancyStatusControl } from "@/components/dashboard/vacancy-status-control";
import { FirstAiContextualOnboardingHint } from "@/components/dashboard/onboarding/contextual-onboarding-hint";
import { notifyFirstAiOnboardingChanged } from "@/lib/onboarding/first-ai-client-events";

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, Math.trunc(v)));
}

type AnalyticsVacancyDrilldownSearchParams = {
  analyticsVacancyId: string | null;
  analyticsReturnTo: string | null;
  analyticsPeriodStart: string | null;
  analyticsPeriodEnd: string | null;
};

function normalizeAnalyticsTextParam(value: string | null): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "all") return null;
  return normalized.slice(0, 160);
}

function isAnalyticsStatsReturnPath(value: string | null): value is string {
  const normalized = String(value ?? "").trim();
  return normalized === "/dashboard/stats" || normalized.startsWith("/dashboard/stats?");
}

function isVacancyStatusFilter(value: string | null): value is Vacancy["status"] | "all" {
  return value === "all" || value === "active" || value === "paused" || value === "draft" || value === "closed";
}

function parseAnalyticsVacancyDrilldownSearchParams(params: URLSearchParams): AnalyticsVacancyDrilldownSearchParams {
  const vacancy = normalizeAnalyticsTextParam(params.get("vacancy"));
  const rawReturnTo = params.get("returnTo");
  const analyticsVacancyId = isAnalyticsStatsReturnPath(rawReturnTo) ? vacancy : null;

  return {
    analyticsVacancyId,
    analyticsReturnTo: isAnalyticsStatsReturnPath(rawReturnTo) ? rawReturnTo.trim() : null,
    analyticsPeriodStart: normalizeAnalyticsTextParam(params.get("periodStart")),
    analyticsPeriodEnd: normalizeAnalyticsTextParam(params.get("periodEnd")),
  };
}

export default function VacanciesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isCompanyAdmin = user?.role === "admin";
  const isMobileDetails = useMediaQuery("(max-width: 768px)");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [filteredTotalVacancies, setFilteredTotalVacancies] = useState<number>(0);
  const [totalAllVacancies, setTotalAllVacancies] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [autoOpenCreate, setAutoOpenCreate] = useState(false);
  const [createDialogOpenSignal, setCreateDialogOpenSignal] = useState(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [ownersById, setOwnersById] = useState<Map<string, ProfileLite>>(new Map());
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsVacancyId, setDetailsVacancyId] = useState<string | null>(null);
  const [autoOpenedAnalyticsVacancyId, setAutoOpenedAnalyticsVacancyId] = useState<string | null>(null);
  const [linkedDetailsVacancy, setLinkedDetailsVacancy] = useState<Vacancy | null>(null);
  const [statusSavingByVacancyId, setStatusSavingByVacancyId] = useState<Record<string, boolean>>({});
  const analyticsDrilldown = useMemo(() => {
    return parseAnalyticsVacancyDrilldownSearchParams(new URLSearchParams(searchParams.toString()));
  }, [searchParams]);

  function replaceQuery(next: Record<string, string | null | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (!v) params.delete(k);
      else params.set(k, v);
    }
    const suffix = params.toString();
    router.replace(suffix ? `/dashboard/vacancies?${suffix}` : "/dashboard/vacancies");
  }

  function applyStatusFilter(nextStatus: string) {
    setFilterStatus(nextStatus);
    setPage(1);
    replaceQuery({
      status: nextStatus === "all" ? null : nextStatus,
      page: "1",
    });
  }

  function resetStatusFilter() {
    applyStatusFilter("all");
  }

  // Sync URL -> state
  useEffect(() => {
    const nextPage = clampInt(Number.parseInt(searchParams.get("page") ?? "1", 10), 1, 10_000);
    const nextPageSize = clampInt(Number.parseInt(searchParams.get("pageSize") ?? "25", 10), 1, 200);
    const rawStatus = searchParams.get("status");
    const nextStatus = isVacancyStatusFilter(rawStatus) ? rawStatus : "all";

    setPage((prev) => (prev === nextPage ? prev : nextPage));
    setPageSize((prev) => (prev === nextPageSize ? prev : nextPageSize));
    setFilterStatus((prev) => (prev === nextStatus ? prev : nextStatus));
  }, [searchParams]);

  useEffect(() => {
    const linkedVacancyId = searchParams.get("vacancy")?.trim() || null;
    if (!linkedVacancyId) {
      if (detailsOpen) setDetailsOpen(false);
      if (detailsVacancyId) setDetailsVacancyId(null);
      if (linkedDetailsVacancy) setLinkedDetailsVacancy(null);
      return;
    }

    setDetailsVacancyId(linkedVacancyId);
    setDetailsOpen(true);

    if (vacancies.some((vacancy) => vacancy.id === linkedVacancyId)) {
      setLinkedDetailsVacancy(null);
      return;
    }
    if (linkedDetailsVacancy?.id === linkedVacancyId) return;

    let cancelled = false;
    void getVacancyById(linkedVacancyId)
      .then((vacancy) => {
        if (cancelled) return;
        if (!vacancy) {
          setDetailsOpen(false);
          setDetailsVacancyId(null);
          setLinkedDetailsVacancy(null);
          replaceQuery({ vacancy: null });
          toast.error("Вакансия недоступна", {
            description: "Возможно, ссылка устарела или у вас нет доступа.",
          });
          return;
        }
        setLinkedDetailsVacancy(vacancy);
      })
      .catch(() => {
        if (cancelled) return;
        setDetailsOpen(false);
        setDetailsVacancyId(null);
        setLinkedDetailsVacancy(null);
        replaceQuery({ vacancy: null });
        toast.error("Не удалось открыть вакансию", {
          description: "Обновите страницу и попробуйте ещё раз.",
        });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, vacancies, linkedDetailsVacancy, detailsOpen, detailsVacancyId]);

  const creatorIdsKey = useMemo(() => {
    if (!isCompanyAdmin) return "";
    const ids = Array.from(new Set(vacancies.map((v) => v.createdById))).filter(Boolean).sort();
    return ids.join("|");
  }, [vacancies, isCompanyAdmin]);

  // For company admins, show "created by" labels in lists.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!isCompanyAdmin) {
        setOwnersById(new Map());
        return;
      }
      const ids = creatorIdsKey ? creatorIdsKey.split("|").filter(Boolean) : [];
      if (ids.length === 0) {
        setOwnersById(new Map());
        return;
      }
      try {
        const m = await getProfilesByIds(ids);
        if (!cancelled) setOwnersById(m);
      } catch {
        if (!cancelled) setOwnersById(new Map());
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [creatorIdsKey, isCompanyAdmin]);

  async function loadVacanciesPage(opts?: { asInitial?: boolean }) {
    const asInitial = Boolean(opts?.asInitial);
    try {
      if (asInitial) setLoading(true);
      else setIsPageLoading(true);

      const { items, total, totalAllStatuses } = await listVacanciesPage({
        page,
        pageSize,
        status: filterStatus === "all" ? "all" : (filterStatus as Vacancy["status"]),
        vacancyId: analyticsDrilldown.analyticsVacancyId,
      });

      setVacancies(items);
      setFilteredTotalVacancies(total);
      setTotalAllVacancies(totalAllStatuses);
    } catch (e) {
      console.error("Failed to load vacancies:", e);
      setVacancies([]);
      setFilteredTotalVacancies(0);
      setTotalAllVacancies(0);
    } finally {
      if (asInitial) setLoading(false);
      setIsPageLoading(false);
    }
  }

  // Load vacancies page
  useEffect(() => {
    const asInitial = loading && vacancies.length === 0 && filteredTotalVacancies === 0 && totalAllVacancies === 0;
    void loadVacanciesPage({ asInitial });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, filterStatus, analyticsDrilldown.analyticsVacancyId]);

  // Auto-open "Create vacancy" dialog when navigated from dashboard CTA.
  useEffect(() => {
    const shouldOpen = searchParams.get("create") === "1";
    if (!shouldOpen) return;

    setAutoOpenCreate(true);
    setCreateDialogOpenSignal((current) => current + 1);

    // Remove the flag from URL to avoid reopening on refresh/back.
    const next = new URLSearchParams(searchParams.toString());
    next.delete("create");
    const suffix = next.toString();
    router.replace(suffix ? `/dashboard/vacancies?${suffix}` : "/dashboard/vacancies");
  }, [searchParams, router]);

  const filteredVacancies = vacancies;

  const detailsVacancy = useMemo(() => {
    if (!detailsVacancyId) return null;
    return vacancies.find((v) => v.id === detailsVacancyId) ?? (linkedDetailsVacancy?.id === detailsVacancyId ? linkedDetailsVacancy : null);
  }, [vacancies, detailsVacancyId, linkedDetailsVacancy]);

  const analyticsVacancyOnCurrentPage = useMemo(() => {
    if (!analyticsDrilldown.analyticsVacancyId) return null;
    return vacancies.find((v) => v.id === analyticsDrilldown.analyticsVacancyId) ?? null;
  }, [analyticsDrilldown.analyticsVacancyId, vacancies]);

  const hasAnalyticsDrilldownContext = Boolean(
    analyticsDrilldown.analyticsVacancyId ||
      analyticsDrilldown.analyticsReturnTo ||
      analyticsDrilldown.analyticsPeriodStart ||
      analyticsDrilldown.analyticsPeriodEnd
  );

  function setDetailsOpenSafe(next: boolean) {
    setDetailsOpen(next);
    if (!next) {
      setDetailsVacancyId(null);
      setLinkedDetailsVacancy(null);
      replaceQuery({ vacancy: null });
    }
  }

  function shouldIgnoreDetailsOpen(e: MouseEvent<HTMLElement>): boolean {
    const target = e.target as HTMLElement | null;
    if (!target) return false;
    return Boolean(
      target.closest(
        [
          "button",
          "a",
          "input",
          "textarea",
          "[role='menuitem']",
          "[role='dialog']",
          "[data-prevent-details='true']",
        ].join(",")
      )
    );
  }

  function openDetails(vacancy: Vacancy, e?: MouseEvent<HTMLElement>) {
    if (e && shouldIgnoreDetailsOpen(e)) return;
    setDetailsVacancyId(vacancy.id);
    setLinkedDetailsVacancy(null);
    setDetailsOpen(true);
    replaceQuery({ vacancy: vacancy.id });
  }

  useEffect(() => {
    if (!analyticsDrilldown.analyticsVacancyId) return;
    if (autoOpenedAnalyticsVacancyId === analyticsDrilldown.analyticsVacancyId) return;
    if (!analyticsVacancyOnCurrentPage) return;

    setDetailsVacancyId(analyticsDrilldown.analyticsVacancyId);
    setDetailsOpen(true);
    setAutoOpenedAnalyticsVacancyId(analyticsDrilldown.analyticsVacancyId);
  }, [analyticsDrilldown.analyticsVacancyId, analyticsVacancyOnCurrentPage, autoOpenedAnalyticsVacancyId]);

  function applyVacancyUpdate(next: Vacancy) {
    setVacancies((prev) => prev.map((v) => (v.id === next.id ? next : v)));
    setLinkedDetailsVacancy((prev) => (prev?.id === next.id ? next : prev));
  }

  async function handleVacancyStatusChange(vacancyId: string, nextStatus: Vacancy["status"]) {
    const currentStatus = vacancies.find((v) => v.id === vacancyId)?.status ?? (linkedDetailsVacancy?.id === vacancyId ? linkedDetailsVacancy.status : null);
    if (!currentStatus || currentStatus === nextStatus) return;

    setStatusSavingByVacancyId((prev) => ({ ...prev, [vacancyId]: true }));
    toast.loading("Обновляю статус вакансии…", { description: undefined, id: `vac-status-${vacancyId}` });

    try {
      const next = await updateVacancyStatus(vacancyId, nextStatus);
      applyVacancyUpdate(next);
      await loadVacanciesPage({ asInitial: false });
      toast.success("Статус вакансии обновлён", { description: undefined, id: `vac-status-${vacancyId}` });
    } catch (e) {
      toast.error("Не удалось обновить статус вакансии", {
        id: `vac-status-${vacancyId}`,
        description: e instanceof Error ? e.message : "Попробуйте ещё раз",
      });
    } finally {
      setStatusSavingByVacancyId((prev) => ({ ...prev, [vacancyId]: false }));
    }
  }

  const experienceLevelLabels: Record<string, string> = {
    trainee: "Стажер (Trainee)",
    junior: "Начальный (Junior)",
    middle: "Средний (Middle)",
    senior: "Высокий (Senior)",
    lead: "Ведущий (Lead)",
  };

  const employmentTypeLabels: Record<string, string> = {
    "full-time": "Полная занятость",
    "part-time": "Частичная занятость",
    contract: "Проект / контракт",
    internship: "Стажировка",
  };

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredTotalVacancies / pageSize));
  }, [filteredTotalVacancies, pageSize]);
  const hasActiveFilters = filterStatus !== "all";
  const showNoVacanciesState = !loading && totalAllVacancies === 0;
  const showFilteredEmptyState = !loading && !isPageLoading && totalAllVacancies > 0 && filteredTotalVacancies === 0;

  // Canonicalize invalid/out-of-range page in URL after data is loaded.
  useEffect(() => {
    if (loading || isPageLoading) return;
    const normalized = clampInt(page, 1, totalPages);
    if (normalized === page) return;
    setPage(normalized);
    replaceQuery({ page: String(normalized) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isPageLoading, page, totalPages]);

  function goToPage(nextPage: number) {
    const clamped = clampInt(nextPage, 1, totalPages);
    setPage(clamped);
    replaceQuery({ page: String(clamped) });
  }

  return (
    <div className="flex flex-col gap-6" aria-busy={loading} aria-live="polite">
      {loading ? <span className="sr-only">Загрузка…</span> : null}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Вакансии</h1>
          <p className="text-muted-foreground">
            Управляйте вашими открытыми вакансиями
          </p>
        </div>
        <CreateVacancyDialog
          initialOpen={autoOpenCreate}
          openSignal={createDialogOpenSignal}
          trigger={
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Создать вакансию
            </Button>
          }
          onCreated={async () => {
            // Newest vacancy appears on page 1 (created_at desc)
            const nextPage = 1;
            setPage(nextPage);
            replaceQuery({ page: String(nextPage) });
            await loadVacanciesPage({ asInitial: false });
            notifyFirstAiOnboardingChanged();
          }}
        />
      </div>

      {hasAnalyticsDrilldownContext ? (
        <Alert>
          <AlertTitle>Сохранён контекст аналитики</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="min-w-0 break-words">
              {analyticsDrilldown.analyticsPeriodStart || analyticsDrilldown.analyticsPeriodEnd
                ? `Период ${analyticsDrilldown.analyticsPeriodStart ?? "не выбран"} — ${analyticsDrilldown.analyticsPeriodEnd ?? "не выбран"}. `
                : "Переход из аналитики сохранён. "}
              {analyticsVacancyOnCurrentPage
                ? `Открываем вакансию «${analyticsVacancyOnCurrentPage.title}».`
                : analyticsDrilldown.analyticsVacancyId
                  ? "Если нужная вакансия появится на текущей странице, детали откроются автоматически."
                  : "Список вакансий оставлен без дополнительных фильтров."}
            </span>
            {analyticsDrilldown.analyticsReturnTo ? (
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link href={analyticsDrilldown.analyticsReturnTo}>Вернуться в аналитику</Link>
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <FirstAiContextualOnboardingHint surface="vacancies" />

      {showNoVacanciesState && (
        <Card>
          <CardHeader>
            <CardTitle>Пока нет вакансий</CardTitle>
            <CardDescription>Создайте первую вакансию — после этого можно добавлять кандидатов и запускать AI анализ.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTitle>Совет</AlertTitle>
              <AlertDescription>
                Для быстрого старта достаточно статуса <strong>Черновик</strong> или <strong>Активна</strong>.
              </AlertDescription>
            </Alert>
            <CreateVacancyDialog
              trigger={
                <Button className="w-full sm:w-auto">
                  <Plus className="mr-2 h-4 w-4" />
                  Создать первую вакансию
                </Button>
              }
              defaultStatus="draft"
              onCreated={async () => {
                const nextPage = 1;
                setPage(nextPage);
                replaceQuery({ page: String(nextPage) });
                await loadVacanciesPage({ asInitial: false });
                notifyFirstAiOnboardingChanged();
              }}
            />
          </CardContent>
        </Card>
      )}

      {(loading || totalAllVacancies > 0) && (
        <>
          {/* Filters and View Toggle */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex gap-2">
              <Select
                value={filterStatus}
                onValueChange={applyStatusFilter}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все вакансии</SelectItem>
                  <SelectItem value="active">Активные</SelectItem>
                  <SelectItem value="paused">На паузе</SelectItem>
                  <SelectItem value="draft">Черновики</SelectItem>
                  <SelectItem value="closed">Закрытые</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2" role="group" aria-label="Переключение вида отображения">
              <Button
                variant={viewMode === "table" ? "default" : "outline"}
                size="icon"
                onClick={() => setViewMode("table")}
                aria-pressed={viewMode === "table"}
                aria-label="Переключить на табличный вид"
              >
                <LayoutList className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant={viewMode === "grid" ? "default" : "outline"}
                size="icon"
                onClick={() => setViewMode("grid")}
                aria-pressed={viewMode === "grid"}
                aria-label="Переключить на вид сетки"
              >
                <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          {showFilteredEmptyState ? (
            <Card>
              <CardHeader>
                <CardTitle>По выбранному фильтру вакансии не найдены</CardTitle>
                <CardDescription>
                  {hasActiveFilters
                    ? "Сбросьте фильтр по статусу, чтобы снова увидеть все вакансии."
                    : "Попробуйте обновить страницу или изменить параметры списка."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={resetStatusFilter}>
                  Сбросить фильтр
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
          {/* Table View */}
          {viewMode === "table" && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Skeleton className="h-5 w-28" />
                    </span>
                  ) : (
                    <>
                      Показано: {filteredVacancies.length} из {filteredTotalVacancies}
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="max-w-full min-w-0 overflow-x-auto">
                <Table className="min-w-[1180px] table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col" className="w-[29%]">Название</TableHead>
                      <TableHead scope="col" className="w-[13%]">Локация</TableHead>
                      <TableHead scope="col" className="w-[7.5rem] whitespace-nowrap">Уровень</TableHead>
                      <TableHead scope="col" className="w-[9rem] whitespace-nowrap">Статус</TableHead>
                      {isCompanyAdmin ? <TableHead scope="col" className="w-[9%]">Создал</TableHead> : null}
                      <TableHead scope="col" className="w-[11rem] whitespace-nowrap">Создана</TableHead>
                      <TableHead scope="col" className="w-[7.5rem] whitespace-nowrap text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading
                      ? Array.from({ length: 8 }).map((_, idx) => (
                          <TableRow key={`s-${idx}`} aria-hidden="true">
                            <TableCell className="w-[29%] align-top font-medium">
                              <div className="space-y-2">
                                <Skeleton className="h-4 w-56" />
                                <Skeleton className="h-3 w-40" />
                              </div>
                            </TableCell>
                            <TableCell className="w-[13%] align-top">
                              <div className="flex items-center gap-2">
                                <Skeleton className="h-3 w-3 rounded-sm" />
                                <Skeleton className="h-4 w-40" />
                              </div>
                            </TableCell>
                            <TableCell className="w-[7.5rem] align-top">
                              <Skeleton className="h-6 w-16 rounded-md" />
                            </TableCell>
                            <TableCell className="w-[9rem] align-top">
                              <Skeleton className="h-6 w-20 rounded-md" />
                            </TableCell>
                            {isCompanyAdmin ? (
                              <TableCell className="w-[9%] align-top">
                                <Skeleton className="h-4 w-28" />
                              </TableCell>
                            ) : null}
                            <TableCell className="w-[11rem] align-top">
                              <div className="flex items-center gap-2">
                                <Skeleton className="h-3 w-3 rounded-sm" />
                                <Skeleton className="h-4 w-28" />
                              </div>
                            </TableCell>
                            <TableCell className="w-[7.5rem] align-top text-right">
                              <Skeleton className="ml-auto h-8 w-20" />
                            </TableCell>
                          </TableRow>
                        ))
                      : filteredVacancies.map((vacancy) => {
                          const sourceLabel = vacancy.hhruVacancyId ? "HH.ru" : "Вручную";
                          const sourceVariant: "secondary" | "outline" = vacancy.hhruVacancyId ? "secondary" : "outline";
                          return (
                          <TableRow
                            key={vacancy.id}
                            className="cursor-pointer"
                            onClick={(e) => openDetails(vacancy, e)}
                          >
                            <TableCell className="w-[29%] align-top font-medium">
                              <div className="min-w-0 space-y-1">
                                <div className="flex min-w-0 flex-wrap items-start gap-2">
                                  <span className="min-w-0 flex-1 whitespace-normal break-words [overflow-wrap:anywhere]">
                                    {vacancy.title}
                                  </span>
                                  <Badge variant={sourceVariant} className="shrink-0">
                                    {sourceLabel}
                                  </Badge>
                                </div>
                                {vacancy.salary && (
                                  <div className="text-xs text-muted-foreground whitespace-normal break-words">
                                    {vacancy.salary.min?.toLocaleString()} - {vacancy.salary.max?.toLocaleString()} {vacancy.salary.currency}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="w-[13%] align-top">
                              <div className="flex min-w-0 items-start gap-1 text-sm whitespace-normal break-words [overflow-wrap:anywhere]">
                                <MapPin className="h-3 w-3 shrink-0" />
                                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{vacancy.location}</span>
                              </div>
                            </TableCell>
                            <TableCell className="w-[7.5rem] align-top whitespace-nowrap">
                              <Badge variant="outline">{experienceLevelLabels[vacancy.experienceLevel]}</Badge>
                            </TableCell>
                            <TableCell className="w-[9rem] align-top whitespace-nowrap">
                              <VacancyStatusControl
                                status={vacancy.status}
                                disabled={Boolean(statusSavingByVacancyId[vacancy.id])}
                                onChange={(nextStatus) => handleVacancyStatusChange(vacancy.id, nextStatus)}
                              />
                            </TableCell>
                            {isCompanyAdmin ? (
                              <TableCell className="w-[9%] align-top text-sm text-muted-foreground break-words [overflow-wrap:anywhere]">
                                {(() => {
                                  const owner = ownersById.get(vacancy.createdById);
                                  if (owner?.id && owner.id === user?.id) return "Вы";
                                  return owner?.name || owner?.email || vacancy.createdById;
                                })()}
                              </TableCell>
                            ) : null}
                            <TableCell className="w-[11rem] align-top text-sm text-muted-foreground whitespace-nowrap">
                              <div className="flex min-w-0 items-center gap-1">
                                <Clock className="h-3 w-3 shrink-0" />
                                <span className="min-w-0 truncate">
                                  {formatDistanceToNow(vacancy.createdAt, {
                                    addSuffix: true,
                                    locale: ru,
                                  })}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="w-[7.5rem] align-top whitespace-nowrap text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDetails(vacancy);
                                }}
                              >
                                Открыть
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                        })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Grid View */}
          {viewMode === "grid" && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {loading
                ? Array.from({ length: 6 }).map((_, idx) => (
                    <Card key={`sg-${idx}`} className="flex flex-col" aria-hidden="true">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-5 w-3/4" />
                            <div className="flex items-center gap-2">
                              <Skeleton className="h-3 w-3 rounded-sm" />
                              <Skeleton className="h-4 w-1/2" />
                            </div>
                          </div>
                          <Skeleton className="h-6 w-20 rounded-md" />
                        </div>
                      </CardHeader>
                      <CardContent className="flex-1 flex flex-col gap-4">
                        <div className="space-y-2">
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-11/12" />
                          <Skeleton className="h-3 w-4/5" />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Skeleton className="h-6 w-16 rounded-md" />
                          <Skeleton className="h-6 w-24 rounded-md" />
                        </div>
                        <Skeleton className="h-4 w-40" />
                        <div className="mt-auto pt-4 border-t flex justify-between items-center">
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-9 w-20" />
                        </div>
                      </CardContent>
                    </Card>
                  ))
                : filteredVacancies.map((vacancy) => {
                    const sourceLabel = vacancy.hhruVacancyId ? "HH.ru" : "Вручную";
                    const sourceVariant: "secondary" | "outline" = vacancy.hhruVacancyId ? "secondary" : "outline";
                    return (
                    <Card
                      key={vacancy.id}
                      className="flex min-w-0 flex-col hover:shadow-md transition-shadow cursor-pointer"
                      onClick={(e) => openDetails(vacancy, e)}
                    >
                      <CardHeader>
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <CardTitle className="text-lg break-words [overflow-wrap:anywhere]">{vacancy.title}</CardTitle>
                            <CardDescription className="mt-1 flex min-w-0 items-start gap-1 break-words [overflow-wrap:anywhere]">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className="min-w-0 break-words [overflow-wrap:anywhere]">{vacancy.location}</span>
                            </CardDescription>
                            {isCompanyAdmin ? (
                              <div className="mt-1 min-w-0 text-xs text-muted-foreground break-words [overflow-wrap:anywhere]">
                                Создал:{" "}
                                <span className="text-foreground/80 break-words [overflow-wrap:anywhere]">
                                  {(() => {
                                    const owner = ownersById.get(vacancy.createdById);
                                    if (owner?.id && owner.id === user?.id) return "Вы";
                                    return owner?.name || owner?.email || vacancy.createdById;
                                  })()}
                                </span>
                              </div>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            <VacancyStatusControl
                              status={vacancy.status}
                              disabled={Boolean(statusSavingByVacancyId[vacancy.id])}
                              onChange={(nextStatus) => handleVacancyStatusChange(vacancy.id, nextStatus)}
                            />
                            <Badge variant={sourceVariant} className="shrink-0">{sourceLabel}</Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="flex-1 flex min-w-0 flex-col gap-4">
                        <p className="text-sm text-muted-foreground line-clamp-3 break-words [overflow-wrap:anywhere]">{vacancy.description}</p>

                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary" className="shrink-0">{experienceLevelLabels[vacancy.experienceLevel]}</Badge>
                          <Badge variant="secondary" className="shrink-0">{employmentTypeLabels[vacancy.employmentType]}</Badge>
                        </div>

                        {vacancy.salary && (
                          <div className="min-w-0 text-sm font-medium break-words [overflow-wrap:anywhere]">
                            {vacancy.salary.min?.toLocaleString()} - {vacancy.salary.max?.toLocaleString()} {vacancy.salary.currency}
                          </div>
                        )}

                        <div className="mt-auto flex min-w-0 items-center justify-between gap-3 border-t pt-4">
                          <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3 shrink-0" />
                            <span className="min-w-0 truncate">
                              {formatDistanceToNow(vacancy.createdAt, {
                                addSuffix: true,
                                locale: ru,
                              })}
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDetails(vacancy);
                            }}
                          >
                            Открыть
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                    );
                  })}
            </div>
          )}

          <PaginationControls
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            isLoading={loading || isPageLoading}
            onPageChange={goToPage}
            onPageSizeChange={(nextPageSize) => {
              const next = clampInt(nextPageSize, 1, 200);
              setPageSize(next);
              setPage(1);
              replaceQuery({ pageSize: String(next), page: "1" });
            }}
          />
            </>
          )}
        </>
      )}

      {detailsVacancy ? (
        isMobileDetails ? (
          <Drawer open={detailsOpen} onOpenChange={setDetailsOpenSafe}>
            <DrawerContent className="mt-0 h-[100dvh] rounded-none">
              <DrawerTitle className="sr-only">Детали вакансии: {detailsVacancy.title}</DrawerTitle>
              <VacancyDetails
                vacancy={detailsVacancy}
                onUpdated={applyVacancyUpdate}
                onStatusChange={handleVacancyStatusChange}
                statusSaving={Boolean(statusSavingByVacancyId[detailsVacancy.id])}
                onClose={() => setDetailsOpenSafe(false)}
              />
            </DrawerContent>
          </Drawer>
        ) : (
          <Sheet open={detailsOpen} onOpenChange={setDetailsOpenSafe}>
            <SheetContent side="right" className="w-full sm:max-w-xl p-0">
              <SheetTitle className="sr-only">Детали вакансии: {detailsVacancy.title}</SheetTitle>
              <VacancyDetails
                vacancy={detailsVacancy}
                onUpdated={applyVacancyUpdate}
                onStatusChange={handleVacancyStatusChange}
                statusSaving={Boolean(statusSavingByVacancyId[detailsVacancy.id])}
                onClose={() => setDetailsOpenSafe(false)}
              />
            </SheetContent>
          </Sheet>
        )
      ) : null}
    </div>
  );
}
