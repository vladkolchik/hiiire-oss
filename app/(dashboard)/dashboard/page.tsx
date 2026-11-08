"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Briefcase,
  Calendar,
  Coins,
  Plus,
  TrendingUp,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FirstAiOnboardingCard } from "@/components/dashboard/onboarding/first-ai-onboarding-card";
import { formatDashboardActivityOccurredAt } from "@/lib/dashboard/activity-time";
import { buildDashboardInterviewStatCards } from "@/lib/dashboard/interview-stat-cards";
import { listDashboardActivity, type DashboardActivityItem } from "@/services/data/activity";
import type { DashboardStats } from "@/types";

type ActivityDto = DashboardActivityItem;

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: "Новые", color: "bg-blue-500" },
  reviewing: { label: "На рассмотрении", color: "bg-yellow-500" },
  "security-check": { label: "Проверка СБ", color: "bg-amber-500" },
  "interview-scheduled": { label: "Собеседование назначено", color: "bg-purple-500" },
  interviewed: { label: "Прошли собеседование", color: "bg-indigo-500" },
  offer: { label: "Оффер", color: "bg-green-500" },
  hired: { label: "Приняты", color: "bg-emerald-500" },
  rejected: { label: "Отклонены", color: "bg-red-500" },
};

function emptyStats(): DashboardStats {
  return {
    role: "recruiter",
    activeVacancies: 0,
    totalCandidates: 0,
    interviewsThisWeek: 0,
    ownInterviewsUntilWeekEnd: 0,
    employeeInterviewsUntilWeekEnd: 0,
    avgMatchPercentage: 0,
    avgResponseTime: 0,
    candidatesByStatus: {
      new: 0,
      reviewing: 0,
      "security-check": 0,
      "interview-scheduled": 0,
      interviewed: 0,
      offer: 0,
      hired: 0,
      rejected: 0,
    },
  };
}

function ActivityIcon({ activity }: { activity: ActivityDto }) {
  if (activity.kind === "candidate_created") return <UserRound className="h-4 w-4" aria-hidden="true" />;
  if (activity.kind === "vacancy_created") return <Briefcase className="h-4 w-4" aria-hidden="true" />;
  return <Coins className="h-4 w-4" aria-hidden="true" />;
}

function creditAmountLabel(activity: ActivityDto): string | null {
  if (activity.kind !== "credits_spent" || typeof activity.creditDelta !== "number") return null;
  const amount = Math.abs(activity.creditDelta);
  const mod10 = amount % 10;
  const mod100 = amount % 100;
  if (mod10 === 1 && mod100 !== 11) return `${amount} кредит`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${amount} кредита`;
  return `${amount} кредитов`;
}

function activitySummary(activity: ActivityDto): string {
  const amount = creditAmountLabel(activity);
  if (activity.kind === "credits_spent") {
    return `${activity.actor.name ?? "Участник команды"}: ${amount ? `списано ${amount}` : "списаны кредиты"} на AI-анализ`;
  }

  return activity.description ?? activity.title;
}

type StatCardItem = {
  key: string;
  title: string;
  value: number | string;
  icon: LucideIcon;
  description: string;
  href: string;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<ActivityDto[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activityLoadError, setActivityLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const loadStats = async () => {
      try {
        setStatsLoading(true);
        setLoadError(null);
        const res = await fetch("/api/dashboard/stats", { method: "GET", signal: controller.signal });
        const json: unknown = await res.json().catch(() => null);
        if (!res.ok) throw new Error("STATS_FETCH_FAILED");

        const nextStats =
          json && typeof json === "object" && "stats" in json ? (json as { stats?: unknown }).stats : null;

        if (!cancelled && nextStats && typeof nextStats === "object") {
          setStats(nextStats as DashboardStats);
        }
      } catch {
        if (controller.signal.aborted) return;
        if (!cancelled) {
          setLoadError("Не удалось загрузить статистику. Обновите страницу или попробуйте позже.");
        }
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    };

    const loadActivity = async () => {
      try {
        setActivityLoading(true);
        setActivityLoadError(null);
        const activityPage = await listDashboardActivity({
          type: "all",
          page: 1,
          pageSize: 5,
          signal: controller.signal,
        });

        if (!cancelled) {
          setActivities(activityPage.items);
        }
      } catch {
        if (controller.signal.aborted) return;
        if (!cancelled) {
          setActivities([]);
          setActivityLoadError("Не удалось загрузить последние события.");
        }
      } finally {
        if (!cancelled) setActivityLoading(false);
      }
    };

    void loadStats();
    void loadActivity();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const displayStats = stats ?? emptyStats();
  const statCards: StatCardItem[] = [
    {
      key: "active-vacancies",
      title: "Активные вакансии",
      value: stats ? stats.activeVacancies : "—",
      icon: Briefcase,
      description: stats ? "Открытых позиций" : "Статистика недоступна",
      href: "/dashboard/vacancies",
    },
    {
      key: "candidates",
      title: "Кандидаты",
      value: stats ? stats.totalCandidates : "—",
      icon: Users,
      description: stats ? "В процессе рассмотрения" : "Статистика недоступна",
      href: "/dashboard/candidates",
    },
    ...buildDashboardInterviewStatCards(stats).map((card) => ({ ...card, icon: Calendar, href: "/dashboard/calendar" })),
    {
      key: "avg-match",
      title: "Среднее соответствие",
      value: stats ? `${stats.avgMatchPercentage}%` : "—",
      icon: TrendingUp,
      description: stats ? "Соответствие вакансии" : "Статистика недоступна",
      href: "/dashboard/candidates",
    },
  ];
  const visibleStatusEntries = Object.entries(displayStats.candidatesByStatus).filter(([, count]) => count > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">Главная</h1>
          <p className="break-words text-muted-foreground">Обзор вашей активности по подбору персонала</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button asChild>
            <Link href="/dashboard/vacancies?create=1">
              <Plus className="mr-2 h-4 w-4" />
              Создать вакансию
            </Link>
          </Button>
        </div>
      </div>

      <FirstAiOnboardingCard />

      <div className="grid auto-rows-fr grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.key}
              href={stat.href}
              className="h-full min-w-0 focus:outline-none focus:ring-2 focus:ring-primary/50"
              aria-label={statsLoading ? `${stat.title}: загружается` : `${stat.title}: ${stat.value} ${stat.description}`}
              aria-busy={statsLoading ? true : undefined}
            >
              <Card className="h-full min-w-0 cursor-pointer transition-all hover:border-primary/50 hover:shadow-md">
                <CardHeader className="flex min-w-0 flex-row items-start justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="min-w-0 break-words text-sm font-medium leading-tight">{stat.title}</CardTitle>
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </CardHeader>
                <CardContent className="min-w-0">
                  {statsLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-8 w-20" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                  ) : (
                    <>
                      <div className="text-2xl font-bold" aria-label={`Значение: ${stat.value}`}>
                        {stat.value}
                      </div>
                      <p className="break-words text-xs text-muted-foreground">{stat.description}</p>
                    </>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
      {loadError ? <p className="text-sm text-muted-foreground" role="status">{loadError}</p> : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Последняя активность</CardTitle>
            <CardDescription>Недавние события в системе</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4" role="list" aria-label="Список последней активности">
              {activityLoading ? (
                <div className="space-y-3" aria-hidden="true">
                  {Array.from({ length: 2 }).map((_, idx) => (
                    <div key={idx} className="flex items-start gap-4">
                      <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-28" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activityLoadError ? (
                <p className="text-sm text-muted-foreground">{activityLoadError}</p>
              ) : activities.length === 0 ? (
                <p className="text-sm text-muted-foreground">Пока нет событий.</p>
              ) : (
                activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex min-w-0 items-start gap-4 text-sm"
                    role="listitem"
                    aria-label={`Активность: ${activity.title}. ${activitySummary(activity)}`}
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <ActivityIcon activity={activity} />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="break-words font-medium leading-5 [overflow-wrap:anywhere]">{activity.title}</p>
                      <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                        {activitySummary(activity)}
                      </p>
                      <p
                        className="text-xs text-muted-foreground"
                        aria-label={`Время: ${formatDashboardActivityOccurredAt(activity.occurredAt)}`}
                      >
                        {formatDashboardActivityOccurredAt(activity.occurredAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <Button variant="ghost" className="w-full" asChild>
                <Link href="/dashboard/activity" aria-label="Посмотреть всю активность">
                  Посмотреть всё
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Статистика по кандидатам</CardTitle>
            <CardDescription>Распределение по статусам</CardDescription>
          </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <div className="space-y-3" aria-hidden="true">
                    {Array.from({ length: 4 }).map((_, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-3">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-5 w-8" />
                      </div>
                    ))}
                  </div>
                ) : !stats ? (
                  <p className="text-sm text-muted-foreground">Статистика недоступна. Обновите страницу или попробуйте позже.</p>
                ) : visibleStatusEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Пока нет данных по статусам кандидатов.</p>
                ) : (
              <div className="space-y-3" role="list" aria-label="Статистика кандидатов по статусам">
                {visibleStatusEntries.map(([status, count]) => {
                  const statusInfo = STATUS_LABELS[status] || { label: status, color: "bg-muted-foreground" };

                  return (
                    <div
                      key={status}
                      className="flex min-w-0 items-center justify-between gap-3"
                      role="listitem"
                      aria-label={`${statusInfo.label}: ${count} кандидатов`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <div className={`h-2 w-2 shrink-0 rounded-full ${statusInfo.color}`} aria-hidden="true" />
                        <span className="min-w-0 truncate text-sm">{statusInfo.label}</span>
                      </div>
                      <Badge variant="secondary" className="shrink-0" aria-label={`Количество: ${count}`}>
                        {count}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
