"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Briefcase, Coins, UserRound } from "lucide-react";

import { PaginationControls } from "@/components/dashboard/pagination-controls";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDashboardActivityOccurredAt } from "@/lib/dashboard/activity-time";
import { cn } from "@/lib/utils";
import {
  listDashboardActivity,
  type DashboardActivityFilter,
  type DashboardActivityItem,
} from "@/services/data/activity";

const ACTIVITY_LOAD_ERROR = "Не удалось загрузить активность. Попробуйте обновить страницу.";
const VALID_PAGE_SIZES = [25, 50, 100] as const;
const SAFE_ACTIVITY_ERROR_MESSAGES = new Set([
  ACTIVITY_LOAD_ERROR,
  "Выберите корректный тип активности.",
  "Проверьте номер страницы.",
  "Проверьте размер страницы.",
]);

const FILTERS: Array<{ value: DashboardActivityFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "candidates", label: "Кандидаты" },
  { value: "vacancies", label: "Вакансии" },
  { value: "credits", label: "Кредиты" },
];

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, Math.trunc(v)));
}

function parsePositiveIntParam(value: string | null, fallback: number, max: number): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  return clampInt(Number.parseInt(value, 10), 1, max);
}

function parseFilter(value: string | null): DashboardActivityFilter {
  if (value === "candidates" || value === "vacancies" || value === "credits") return value;
  return "all";
}

function parsePageSize(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 25;
  const parsed = Number.parseInt(value, 10);
  return VALID_PAGE_SIZES.includes(parsed as (typeof VALID_PAGE_SIZES)[number]) ? parsed : 25;
}

function isSafeActivityErrorMessage(value: unknown): value is string {
  return typeof value === "string" && SAFE_ACTIVITY_ERROR_MESSAGES.has(value);
}

type SearchParamReader = {
  get: (name: string) => string | null;
  toString: () => string;
};

function normalizeActivityQuery(searchParams: SearchParamReader): {
  filter: DashboardActivityFilter;
  page: number;
  pageSize: number;
  href: string;
  changed: boolean;
} {
  const filter = parseFilter(searchParams.get("type"));
  const page = parsePositiveIntParam(searchParams.get("page"), 1, 10_000);
  const pageSize = parsePageSize(searchParams.get("pageSize"));
  const before = searchParams.toString();
  const params = new URLSearchParams(before);

  if (filter === "all") params.delete("type");
  else params.set("type", filter);

  if (page === 1) params.delete("page");
  else params.set("page", String(page));

  if (pageSize === 25) params.delete("pageSize");
  else params.set("pageSize", String(pageSize));

  const after = params.toString();
  return {
    filter,
    page,
    pageSize,
    href: after ? `/dashboard/activity?${after}` : "/dashboard/activity",
    changed: before !== after,
  };
}

function actorName(item: DashboardActivityItem): string {
  return item.actor.name ?? "Участник команды";
}

function creditAmountLabel(item: DashboardActivityItem): string | null {
  if (item.kind === "credits_spent" && typeof item.creditDelta === "number") {
    const amount = Math.abs(item.creditDelta);
    return `${amount} ${creditWord(amount)}`;
  }
  return null;
}

function creditWord(amount: number): string {
  const mod10 = amount % 10;
  const mod100 = amount % 100;
  if (mod10 === 1 && mod100 !== 11) return "кредит";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "кредита";
  return "кредитов";
}

function ActivityIcon({ item }: { item: DashboardActivityItem }) {
  if (item.kind === "candidate_created") return <UserRound className="h-4 w-4" aria-hidden="true" />;
  if (item.kind === "vacancy_created") return <Briefcase className="h-4 w-4" aria-hidden="true" />;
  return <Coins className="h-4 w-4" aria-hidden="true" />;
}

function ActivitySkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, idx) => (
        <Card key={idx}>
          <CardContent className="flex items-start gap-3 p-4">
            <Skeleton className="h-9 w-9 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-8 w-20 shrink-0" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function ActivityPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<DashboardActivityFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [items, setItems] = useState<DashboardActivityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryReady, setQueryReady] = useState(false);

  function replaceQuery(next: Record<string, string | null | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    const suffix = params.toString();
    router.replace(suffix ? `/dashboard/activity?${suffix}` : "/dashboard/activity");
  }

  useEffect(() => {
    const normalized = normalizeActivityQuery(searchParams);

    setFilter((prev) => (prev === normalized.filter ? prev : normalized.filter));
    setPage((prev) => (prev === normalized.page ? prev : normalized.page));
    setPageSize((prev) => (prev === normalized.pageSize ? prev : normalized.pageSize));

    if (normalized.changed) {
      setQueryReady(false);
      router.replace(normalized.href);
    }
    if (normalized.changed) return;

    setQueryReady(true);
  }, [router, searchParams]);

  useEffect(() => {
    if (!queryReady) return;

    let cancelled = false;
    const controller = new AbortController();
    const asInitial = loading && items.length === 0 && total === 0;

    async function run() {
      const normalized = { filter, page, pageSize };

      try {
        if (asInitial) setLoading(true);
        else setPageLoading(true);
        setError(null);

        const result = await listDashboardActivity({
          type: normalized.filter,
          page: normalized.page,
          pageSize: normalized.pageSize,
          signal: controller.signal,
        });

        if (!cancelled) {
          setItems(result.items);
          setTotal(result.pagination.total);
        }
      } catch (e) {
        if (controller.signal.aborted || cancelled) return;
        const message = e instanceof Error ? e.message : null;
        setItems([]);
        setTotal(0);
        setError(isSafeActivityErrorMessage(message) ? message : ACTIVITY_LOAD_ERROR);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setPageLoading(false);
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryReady, filter, page, pageSize]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);

  useEffect(() => {
    if (loading || pageLoading) return;
    const normalized = clampInt(page, 1, totalPages);
    if (normalized === page) return;
    setPage(normalized);
    replaceQuery({ page: String(normalized) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, pageLoading, page, totalPages]);

  function applyFilter(next: DashboardActivityFilter) {
    setFilter(next);
    setPage(1);
    replaceQuery({ type: next === "all" ? null : next, page: "1" });
  }

  function goToPage(nextPage: number) {
    const clamped = clampInt(nextPage, 1, totalPages);
    setPage(clamped);
    replaceQuery({ page: String(clamped) });
  }

  const showEmpty = !loading && !pageLoading && !error && items.length === 0;

  return (
    <div className="flex flex-col gap-6" aria-busy={loading || pageLoading}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Активность</h1>
        <p className="text-muted-foreground">События по вакансиям, кандидатам и расходу кредитов</p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Фильтр активности">
        {FILTERS.map((item) => (
          <Button
            key={item.value}
            type="button"
            variant={filter === item.value ? "default" : "outline"}
            onClick={() => applyFilter(item.value)}
            aria-pressed={filter === item.value}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {error ? (
        <Alert>
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Активность не загрузилась</AlertTitle>
          <AlertDescription>{error || ACTIVITY_LOAD_ERROR}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <ActivitySkeleton />
      ) : showEmpty ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {filter === "all" ? "Пока нет событий." : "По выбранному фильтру событий нет."}
          </CardContent>
        </Card>
      ) : (
        <div className={cn("space-y-3", pageLoading && "opacity-70")} role="list" aria-live="polite">
          {items.map((item) => {
            const creditLabel = creditAmountLabel(item);
            return (
              <Card key={item.id} role="listitem">
                <CardContent className="flex min-w-0 items-start gap-3 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <ActivityIcon item={item} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="break-words text-sm font-medium leading-5 [overflow-wrap:anywhere]">{item.title}</p>
                    {item.description ? (
                      <p className="break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{item.description}</p>
                    ) : null}
                    <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {formatDashboardActivityOccurredAt(item.occurredAt)} · {actorName(item)}
                      {creditLabel ? ` · ${creditLabel}` : ""}
                    </p>
                  </div>
                  {item.entity ? (
                    <Button asChild variant="ghost" size="sm" className="shrink-0">
                      <Link
                        href={item.entity.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Открыть ${item.title}`}
                      >
                        Открыть
                      </Link>
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!loading && !showEmpty && !error ? (
        <PaginationControls
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          isLoading={loading || pageLoading}
          onPageChange={goToPage}
          onPageSizeChange={(nextPageSize) => {
            const next = clampInt(nextPageSize, 1, 200);
            setPageSize(next);
            setPage(1);
            replaceQuery({ pageSize: String(next), page: "1" });
          }}
        />
      ) : null}
    </div>
  );
}
