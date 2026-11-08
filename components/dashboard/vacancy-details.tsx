"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { Briefcase, Clock, ExternalLink, MapPin, MoreHorizontal, Pencil, RefreshCcw, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";

import type { Vacancy } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { EditVacancyDialog } from "@/components/dashboard/edit-vacancy-dialog";
import { syncVacancyFromHh } from "@/services/data/vacancies";
import { VacancyStatusControl } from "@/components/dashboard/vacancy-status-control";
import { EMPLOYMENT_FORM_LABELS, normalizeEmploymentForms } from "@/lib/vacancies/employment-forms";

const statusLabels: Record<Vacancy["status"], string> = {
  draft: "Черновик",
  active: "Активна",
  paused: "На паузе",
  closed: "Закрыта",
};

const statusClass: Record<Vacancy["status"], string> = {
  draft: "bg-gray-500 text-white border-gray-500",
  active: "bg-green-600 text-white border-green-600",
  paused: "bg-yellow-500 text-white border-yellow-500",
  closed: "bg-red-600 text-white border-red-600",
};

const employmentLabels: Record<Vacancy["employmentType"], string> = {
  "full-time": "Полная занятость",
  "part-time": "Частичная занятость",
  contract: "Проект / контракт",
  internship: "Стажировка",
};

const levelLabels: Record<Vacancy["experienceLevel"], string> = {
  trainee: "Стажер (Trainee)",
  junior: "Начальный (Junior)",
  middle: "Средний (Middle)",
  senior: "Высокий (Senior)",
  lead: "Ведущий (Lead)",
};

const salaryPeriodLabels: Record<NonNullable<Vacancy["salaryPeriod"]>, string> = {
  month: "в месяц",
  hour: "в час",
  shift: "за смену",
};

const salaryTaxLabels: Record<NonNullable<Exclude<Vacancy["salaryTax"], null>>, string> = {
  gross: "gross",
  net: "net",
};

type VacancyComparableSnapshot = {
  title: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  salary: { min: number | null; max: number | null; currency: string } | null;
  location: string;
  employmentType: Vacancy["employmentType"];
  employmentForms: Vacancy["employmentForms"];
  experienceLevel: Vacancy["experienceLevel"];
  status: Vacancy["status"];
  hhruVacancyId: string | null;
};

type VacancyHhSyncMeta = {
  lastSyncedAt: string; // ISO
  snapshot: VacancyComparableSnapshot;
};

const HH_SYNC_META_STORAGE_KEY = "hiiire-vacancy-hh-sync-meta";

function safeParseJson<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function getHhSyncMeta(vacancyId: string): VacancyHhSyncMeta | null {
  if (typeof window === "undefined") return null;
  const all = safeParseJson<Record<string, VacancyHhSyncMeta>>(localStorage.getItem(HH_SYNC_META_STORAGE_KEY)) ?? {};
  const v = all[vacancyId];
  if (!v || typeof v !== "object") return null;
  if (!v.lastSyncedAt || typeof v.lastSyncedAt !== "string") return null;
  if (!v.snapshot || typeof v.snapshot !== "object") return null;
  return v;
}

function setHhSyncMeta(vacancyId: string, meta: VacancyHhSyncMeta) {
  if (typeof window === "undefined") return;
  const all = safeParseJson<Record<string, VacancyHhSyncMeta>>(localStorage.getItem(HH_SYNC_META_STORAGE_KEY)) ?? {};
  all[vacancyId] = meta;
  localStorage.setItem(HH_SYNC_META_STORAGE_KEY, JSON.stringify(all));
}

function normalizeText(v: unknown): string {
  return String(v ?? "").trim();
}

function normalizeList(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items.map((x) => normalizeText(x)).filter(Boolean);
}

function buildComparableSnapshot(v: Vacancy): VacancyComparableSnapshot {
  return {
    title: normalizeText(v.title),
    description: normalizeText(v.description),
    requirements: normalizeList(v.requirements),
    responsibilities: normalizeList(v.responsibilities),
    salary: v.salary
      ? {
          min: typeof v.salary.min === "number" ? v.salary.min : null,
          max: typeof v.salary.max === "number" ? v.salary.max : null,
          currency: normalizeText(v.salary.currency) || "RUB",
        }
      : null,
    location: normalizeText(v.location),
    employmentType: v.employmentType,
    employmentForms: normalizeEmploymentForms(v.employmentForms),
    experienceLevel: v.experienceLevel,
    status: v.status,
    hhruVacancyId: v.hhruVacancyId ? normalizeText(v.hhruVacancyId) : null,
  };
}

function snapshotsEqual(a: VacancyComparableSnapshot, b: VacancyComparableSnapshot): boolean {
  // Stable JSON comparison; our snapshot format is deterministic.
  return JSON.stringify(a) === JSON.stringify(b);
}

function formatHhHeaderMetaTokens({
  hhruVacancyId,
  lastSyncedAt,
  isDirtyFromLastSync,
}: {
  hhruVacancyId: string | null;
  lastSyncedAt: string | null;
  isDirtyFromLastSync: boolean;
}): string[] {
  if (!hhruVacancyId) return [];
  const syncStateLabel = !lastSyncedAt ? "Не синхронизировано" : isDirtyFromLastSync ? "Есть правки" : "Синхронизировано";
  const syncTimeLabel = lastSyncedAt ? formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true, locale: ru }) : "—";
  return ["HH.ru", syncStateLabel, syncTimeLabel, `ID: ${hhruVacancyId}`];
}

function nlJoin(items: string[]): string {
  return (items ?? []).filter(Boolean).join("\n");
}

function VacancyMetaCard({
  icon,
  title,
  value,
  valueClassName,
}: {
  icon: React.ReactNode;
  title: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <Card className="p-4 bg-muted/30 border-border/40">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p>
          <div className={valueClassName ?? "text-sm font-medium break-words [overflow-wrap:anywhere]"}>{value}</div>
        </div>
      </div>
    </Card>
  );
}

export function VacancyDetails({
  vacancy,
  onClose,
  onUpdated,
  onStatusChange,
  statusSaving,
}: {
  vacancy: Vacancy;
  onClose?: () => void;
  onUpdated?: (next: Vacancy) => void;
  onStatusChange?: (vacancyId: string, nextStatus: Vacancy["status"]) => void | Promise<void>;
  statusSaving?: boolean;
}) {
  const [syncOpen, setSyncOpen] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [hhMeta, setHhMeta] = React.useState<VacancyHhSyncMeta | null>(() => getHhSyncMeta(vacancy.id));

  React.useEffect(() => {
    // Keep in sync when panel opens on another vacancy.
    setHhMeta(getHhSyncMeta(vacancy.id));
  }, [vacancy.id]);

  const comparableNow = React.useMemo(() => buildComparableSnapshot(vacancy), [vacancy]);
  const isHh = Boolean(vacancy.hhruVacancyId);
  const isDirtyFromLastSync = React.useMemo(() => {
    if (!isHh) return false;
    if (!hhMeta?.snapshot) return false;
    return !snapshotsEqual(comparableNow, hhMeta.snapshot);
  }, [comparableNow, hhMeta, isHh]);
  const hhHeaderMetaTokens = React.useMemo(
    () =>
      formatHhHeaderMetaTokens({
        hhruVacancyId: vacancy.hhruVacancyId ?? null,
        lastSyncedAt: hhMeta?.lastSyncedAt ?? null,
        isDirtyFromLastSync,
      }),
    [vacancy.hhruVacancyId, hhMeta?.lastSyncedAt, isDirtyFromLastSync],
  );

  async function runSync() {
    try {
      setSyncing(true);
      toast.loading("Синхронизирую с HH.ru…", { description: undefined, id: `vac-sync-${vacancy.id}` });
      const next = await syncVacancyFromHh(vacancy.id);
      onUpdated?.(next);
      if (next.hhruVacancyId) {
        const meta: VacancyHhSyncMeta = {
          lastSyncedAt: new Date().toISOString(),
          snapshot: buildComparableSnapshot(next),
        };
        setHhSyncMeta(next.id, meta);
        setHhMeta(meta);
      }
      toast.success("Вакансия обновлена данными из HH.ru", { description: undefined, id: `vac-sync-${vacancy.id}` });
      setSyncOpen(false);
    } catch (e) {
      toast.error("Не удалось синхронизировать", {
        id: `vac-sync-${vacancy.id}`,
        description: e instanceof Error ? e.message : "Попробуйте ещё раз",
      });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="relative border-b bg-gradient-to-b from-muted/50 to-background">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute top-4 right-4 inline-flex h-8 w-8 items-center justify-center rounded-full p-0 text-muted-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
        <div className="px-5 py-5 pr-14 space-y-3">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 shadow-sm">
              <Briefcase className="h-6 w-6 text-primary" aria-hidden="true" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold tracking-tight truncate">{vacancy.title}</h2>
                  <p className="text-sm text-muted-foreground truncate">{vacancy.location}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {onStatusChange ? (
                    <VacancyStatusControl
                      status={vacancy.status}
                      onChange={(nextStatus) => onStatusChange(vacancy.id, nextStatus)}
                      disabled={Boolean(statusSaving)}
                    />
                  ) : (
                    <Badge variant="outline" className={`${statusClass[vacancy.status]} shadow-none`}>
                      {statusLabels[vacancy.status]}
                    </Badge>
                  )}
                </div>
              </div>

              {isHh ? <div className="mt-2 text-xs text-muted-foreground">{hhHeaderMetaTokens.join(" · ")}</div> : null}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <EditVacancyDialog
                vacancy={vacancy}
                trigger={
                  <Button variant="outline" size="sm" className="gap-2">
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                    Редактировать
                  </Button>
                }
                onUpdated={onUpdated}
              />

              {vacancy.hhruVacancyId ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2" aria-label="Еще действия по вакансии">
                      <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                      Еще
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52" data-prevent-details="true">
                    <DropdownMenuItem onSelect={() => setSyncOpen(true)} disabled={syncing} className="gap-2">
                      <RefreshCcw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} aria-hidden="true" />
                      {syncing ? "Синхронизируем…" : "Синхронизировать"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        window.open(
                          `https://hh.ru/vacancy/${encodeURIComponent(vacancy.hhruVacancyId ?? "")}`,
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                      className="gap-2"
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      Открыть на HH.ru
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <Tabs defaultValue="about" className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden">
        <div className="px-5 pt-4 border-b">
          <TabsList className="w-full justify-start h-10 bg-transparent p-0 gap-4">
            <TabsTrigger
              value="about"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-3 px-0"
            >
              О вакансии
            </TabsTrigger>
            <TabsTrigger
              value="details"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-3 px-0"
            >
              Детали
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="min-h-0 min-w-0 max-w-full flex-1">
          <div className="min-w-0 max-w-full px-5 py-5 space-y-5">
            <TabsContent value="about" className="mt-0 min-w-0 max-w-full space-y-5">
              <Card className="min-w-0 max-w-full overflow-hidden p-4 bg-muted/30 border-border/40">
                <p className="min-w-0 text-sm leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{vacancy.description}</p>
              </Card>

              {vacancy.requirements?.length || vacancy.responsibilities?.length ? (
                <div className="grid min-w-0 max-w-full gap-4 sm:grid-cols-2">
                  {vacancy.requirements?.length ? (
                    <Card className="min-w-0 max-w-full overflow-hidden p-4 bg-muted/30 border-border/40">
                      <p className="text-sm font-semibold mb-2">Требования</p>
                      <pre className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm font-sans text-muted-foreground leading-relaxed">
                        {nlJoin(vacancy.requirements)}
                      </pre>
                    </Card>
                  ) : null}

                  {vacancy.responsibilities?.length ? (
                    <Card className="min-w-0 max-w-full overflow-hidden p-4 bg-muted/30 border-border/40">
                      <p className="text-sm font-semibold mb-2">Обязанности</p>
                      <pre className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm font-sans text-muted-foreground leading-relaxed">
                        {nlJoin(vacancy.responsibilities)}
                      </pre>
                    </Card>
                  ) : null}
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="details" className="mt-0 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <VacancyMetaCard
                  icon={<MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                  title="Локация"
                  value={vacancy.location}
                />
                <VacancyMetaCard
                  icon={<Briefcase className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                  title="Формат"
                  value={`${employmentLabels[vacancy.employmentType]} · ${levelLabels[vacancy.experienceLevel]}`}
                />
                <VacancyMetaCard
                  icon={<Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                  title="Создана"
                  value={formatDistanceToNow(vacancy.createdAt, { addSuffix: true, locale: ru })}
                />
                <VacancyMetaCard
                  icon={<Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                  title="Обновлена"
                  value={formatDistanceToNow(vacancy.updatedAt, { addSuffix: true, locale: ru })}
                />
                {vacancy.department ? (
                  <VacancyMetaCard
                    icon={<Briefcase className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                    title="Подразделение"
                    value={vacancy.department}
                  />
                ) : null}
                {vacancy.hiringManager ? (
                  <VacancyMetaCard
                    icon={<Briefcase className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                    title="Руководитель"
                    value={vacancy.hiringManager}
                  />
                ) : null}
                {typeof vacancy.headcount === "number" && vacancy.headcount !== 1 ? (
                  <VacancyMetaCard
                    icon={<Briefcase className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                    title="План найма"
                    value={`${vacancy.headcount} чел.`}
                  />
                ) : null}
                {vacancy.workSchedule ? (
                  <VacancyMetaCard
                    icon={<Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                    title="График"
                    value={vacancy.workSchedule}
                  />
                ) : null}
                {vacancy.employmentForms.length > 0 ? (
                  <VacancyMetaCard
                    icon={<Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                    title="Оформление"
                    value={
                      <div className="flex flex-wrap gap-1">
                        {vacancy.employmentForms.map((employmentForm) => (
                          <Badge key={employmentForm} variant="secondary">
                            {EMPLOYMENT_FORM_LABELS[employmentForm]}
                          </Badge>
                        ))}
                      </div>
                    }
                    valueClassName="flex flex-wrap gap-1"
                  />
                ) : null}
                {typeof vacancy.probationMonths === "number" && vacancy.probationMonths > 0 ? (
                  <VacancyMetaCard
                    icon={<Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                    title="Испытательный срок"
                    value={`${vacancy.probationMonths} мес.`}
                  />
                ) : null}
                {typeof vacancy.travelPercent === "number" && vacancy.travelPercent > 0 ? (
                  <VacancyMetaCard
                    icon={<Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                    title="Командировки"
                    value={`${vacancy.travelPercent}%`}
                  />
                ) : null}
              </div>

              <Separator />

              {(() => {
                const hasSalaryRange = Boolean(vacancy.salary?.min || vacancy.salary?.max);
                const hasSalaryTax = Boolean(vacancy.salaryTax);
                const salaryPeriod = vacancy.salaryPeriod ?? "month";
                const hasSalaryPeriod = salaryPeriod !== "month";
                const shouldShow = hasSalaryRange || hasSalaryTax || hasSalaryPeriod;

                if (!shouldShow) return null;

                return (
                  <Card className="p-4 bg-muted/30 border-border/40">
                    <p className="text-sm font-semibold mb-2">Зарплата</p>
                    <p className="text-sm text-muted-foreground">
                      {hasSalaryRange ? (
                        <>
                          {vacancy.salary?.min?.toLocaleString()} – {vacancy.salary?.max?.toLocaleString()} {vacancy.salary?.currency}
                        </>
                      ) : (
                        <>—</>
                      )}
                      {" · "}
                      {salaryPeriodLabels[salaryPeriod]}
                      {vacancy.salaryTax ? ` · ${salaryTaxLabels[vacancy.salaryTax]}` : ""}
                    </p>
                  </Card>
                );
              })()}

              {vacancy.benefits || vacancy.bonus ? (
                <Card className="p-4 bg-muted/30 border-border/40">
                  <p className="text-sm font-semibold mb-2">Условия</p>
                  <div className="space-y-3">
                    {vacancy.benefits ? (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Льготы / бонусы</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{vacancy.benefits}</p>
                      </div>
                    ) : null}
                    {vacancy.bonus ? (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Переменная часть</p>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{vacancy.bonus}</p>
                      </div>
                    ) : null}
                  </div>
                </Card>
              ) : null}

              {vacancy.mandatoryRequirements ? (
                <Card className="p-4 bg-muted/30 border-border/40">
                  <p className="text-sm font-semibold mb-2">Обязательные требования</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{vacancy.mandatoryRequirements}</p>
                </Card>
              ) : null}

              {vacancy.hiringProcess ? (
                <Card className="p-4 bg-muted/30 border-border/40">
                  <p className="text-sm font-semibold mb-2">Процесс найма</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{vacancy.hiringProcess}</p>
                </Card>
              ) : null}
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>

      <AlertDialog open={syncOpen} onOpenChange={setSyncOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" aria-hidden="true" />
              Перезаписать правки данными из HH.ru?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-2">
                <p>
                  Это действие подтянет данные вакансии из HH.ru и <strong>заменит</strong> ваши локальные изменения (название,
                  описание, требования, условия и т.д.).
                </p>
                <p>Если вы хотите сохранить правки — нажмите «Отмена».</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={syncing}>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runSync()} disabled={syncing}>
              {syncing ? "Синхронизируем…" : "Синхронизировать"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
