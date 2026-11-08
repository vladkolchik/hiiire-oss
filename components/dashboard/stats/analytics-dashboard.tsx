"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  BarChart3,
  Bot,
  Building2,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Filter,
  Info,
  LineChart,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";

type AnalyticsRole = "admin" | "hr" | "recruiter";

type AnalyticsFilters = {
  periodStart: string;
  periodEnd: string;
  periodMode: "period" | "asOf";
  vacancy: string;
  vacancyStatus: string;
  owner: string;
  department: string;
  location: string;
  source: string;
  status: string;
  scoreThreshold: number;
  riskyOnly: boolean;
  staleOnly: boolean;
};

type AnalyticsSavedView = {
  id: string;
  name: string;
  visibility: "private" | "company";
  filters?: Partial<AnalyticsFilters>;
};

type AnalyticsKpi = {
  id: string;
  label: string;
  value: string;
  detail: string;
  formula: string;
  tone?: "default" | "warning" | "good";
};

type AttentionItem = {
  id: string;
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
  href: string;
};

type FunnelRow = {
  stage: string;
  count: number;
  conversion: number;
  avgDays?: number;
  href: string;
};

type VacancyRow = {
  id: string;
  title: string;
  owner: string;
  status: string;
  daysOpen: number;
  candidatesTotal: number;
  ai70: number;
  ai80: number;
  interviews: number;
  offers: number;
  hires: number;
  conversion: number;
  risk: "high" | "medium" | "low";
  riskReason: string;
  nextAction: string;
  href: string;
};

type SourceRow = {
  source: string;
  candidates: number;
  interviewConversion: number;
  offerConversion: number;
  hireConversion: number;
  avgScore: number;
  highScoreShare: number;
  href: string;
};

type TeamRow = {
  owner: string;
  activeVacancies: number;
  candidatesInWork: number;
  staleCandidates: number;
  aiShortlistWithoutMovement: number;
  hires: number;
};

type AiBucket = {
  label: string;
  count: number;
  href: string;
};

type CompanyAiUsage = {
  used: number;
  quota: number;
  credits: number;
};

type HiringTargetDto = {
  id: string;
  scopeType: "company" | "vacancy" | "department" | "recruiter";
  scopeId: string | null;
  metricName: string;
  periodStart: string;
  periodEnd: string;
  targetHires: number | null;
  targetTimeToFillDays: number | null;
  slaFeedbackHours: number | null;
  minimumPipelineSize: number | null;
};

type HiringTargetDraft = {
  id: string | null;
  scopeType: "company" | "vacancy";
  scopeId: string;
  periodStart: string;
  periodEnd: string;
  targetHires: string;
  targetTimeToFillDays: string;
  slaFeedbackHours: string;
  minimumPipelineSize: string;
};

type AnalyticsDashboardDto = {
  role: "admin" | "hr" | "recruiter";
  filters: AnalyticsFilters;
  savedViews: AnalyticsSavedView[];
  kpis: AnalyticsKpi[];
  needsAttention: AttentionItem[];
  funnel: FunnelRow[];
  vacancies: VacancyRow[];
  sources: SourceRow[];
  team: TeamRow[];
  aiBuckets: AiBucket[];
  aiShortlistConversion: {
    interview: number;
    offer: number;
    hire: number;
  };
  companyAiUsage: CompanyAiUsage | null;
  configuredSlaBreaches: number;
  dataQualityNotes: string[];
};

const today = new Date();
const defaultPeriodEnd = today.toISOString().slice(0, 10);
const defaultPeriodStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

const defaultFilters: AnalyticsFilters = {
  periodStart: defaultPeriodStart,
  periodEnd: defaultPeriodEnd,
  periodMode: "period",
  vacancy: "all",
  vacancyStatus: "all",
  owner: "all",
  department: "all",
  location: "all",
  source: "all",
  status: "all",
  scoreThreshold: 80,
  riskyOnly: false,
  staleOnly: false,
};

function createEmptyDashboard(role: AnalyticsRole, filters: AnalyticsFilters): AnalyticsDashboardDto {
  return {
    role,
    filters,
    savedViews: [{ id: "default-private", name: "Мой рабочий срез", visibility: "private" }],
    kpis: [
      {
        id: "plan",
        label: "План найма",
        value: "Нет цели",
        detail: "Появится после настройки цели на период",
        formula: "Наймы за период сравниваются с настроенной целью.",
      },
      {
        id: "active",
        label: "Открытые вакансии",
        value: "0",
        detail: "Текущий снимок доступных вакансий",
        formula: "Вакансии в работе на момент формирования отчёта.",
      },
      {
        id: "risky",
        label: "Вакансии под риском",
        value: "0",
        detail: "Риск появится по доступным данным",
        formula: "Настроенные цели и мягкие процессные признаки считаются отдельно.",
        tone: "warning",
      },
      {
        id: "ai",
        label: "AI-покрытие",
        value: "0%",
        detail: "Доля кандидатов с рассчитанной оценкой",
        formula: "Кандидаты с AI-оценкой / все кандидаты в выбранном срезе.",
      },
    ],
    needsAttention: [],
    funnel: [],
    vacancies: [],
    sources: [],
    team: [],
  aiBuckets: [
      { label: "80-100", count: 0, href: buildAnalyticsDrilldownHref("/dashboard/candidates", filters, { scoreMin: "80", scoreMax: "100" }) },
      { label: "70-79", count: 0, href: buildAnalyticsDrilldownHref("/dashboard/candidates", filters, { scoreMin: "70", scoreMax: "79" }) },
      { label: "Без оценки", count: 0, href: buildAnalyticsDrilldownHref("/dashboard/candidates", filters, { scoreBucket: "unscored" }) },
    ],
    aiShortlistConversion: { interview: 0, offer: 0, hire: 0 },
    companyAiUsage: null,
    configuredSlaBreaches: 0,
    dataQualityNotes: [
      "Недостаточно истории переходов, чтобы посчитать время на этапах. Новые изменения статусов начнут появляться здесь автоматически.",
    ],
  };
}

function updateFilterValue(filters: AnalyticsFilters, key: keyof AnalyticsFilters, value: string | boolean | number): AnalyticsFilters {
  return { ...filters, [key]: value };
}

function stringifyFilters(filters: AnalyticsFilters) {
  const params = new URLSearchParams();
  params.set("periodStart", filters.periodStart);
  params.set("periodEnd", filters.periodEnd);
  params.set("periodMode", filters.periodMode);
  params.set("vacancy", filters.vacancy);
  params.set("vacancyStatus", filters.vacancyStatus);
  params.set("owner", filters.owner);
  params.set("department", filters.department);
  params.set("location", filters.location);
  params.set("source", filters.source);
  params.set("status", filters.status);
  params.set("scoreThreshold", String(filters.scoreThreshold));
  if (filters.riskyOnly) params.set("riskyOnly", "1");
  if (filters.staleOnly) params.set("staleOnly", "1");
  return params;
}

function buildAnalyticsApiSearchParams(filters: AnalyticsFilters) {
  const params = new URLSearchParams();
  params.set("periodStart", filters.periodStart);
  params.set("periodEnd", filters.periodEnd);
  params.set("periodMode", filters.periodMode === "asOf" ? "as_of_snapshot" : "period_event");
  params.set("asOfDate", filters.periodEnd);
  params.set("vacancyId", filters.vacancy === "all" ? "" : filters.vacancy);
  params.set("vacancyStatus", filters.vacancyStatus);
  params.set("department", filters.department === "all" ? "" : filters.department);
  params.set("location", filters.location === "all" ? "" : filters.location);
  params.set("source", filters.source === "all" ? "" : filters.source);
  params.set("candidateStatus", filters.status === "all" ? "" : filters.status);
  params.set("aiScoreMin", String(filters.scoreThreshold));
  if (filters.owner !== "all" && filters.owner !== "created_by") params.set("ownerId", filters.owner);
  if (filters.riskyOnly) params.set("riskyOnly", "1");
  if (filters.staleOnly) params.set("staleOnly", "1");
  return params;
}

export function buildAnalyticsDrilldownHref(
  targetPath: "/dashboard/candidates" | "/dashboard/vacancies",
  filters: AnalyticsFilters,
  overrides: Partial<Record<"vacancy" | "source" | "status" | "scoreThreshold" | "scoreMin" | "scoreMax" | "scoreBucket", string>> = {}
) {
  const params = new URLSearchParams();
  params.set("periodStart", filters.periodStart);
  params.set("periodEnd", filters.periodEnd);
  params.set("periodMode", filters.periodMode);
  params.set("vacancy", overrides.vacancy ?? filters.vacancy);
  if (targetPath === "/dashboard/candidates") {
    params.set("source", overrides.source ?? filters.source);
    params.set("status", overrides.status ?? filters.status);
    params.set("scoreThreshold", overrides.scoreThreshold ?? String(filters.scoreThreshold));
    if (overrides.scoreMin) params.set("scoreMin", overrides.scoreMin);
    if (overrides.scoreMax) params.set("scoreMax", overrides.scoreMax);
    if (overrides.scoreBucket) params.set("scoreBucket", overrides.scoreBucket);
    params.set("score", overrides.scoreBucket === "unscored" ? "unscored" : "all");
  }
  params.set("returnTo", `/dashboard/stats?${stringifyFilters(filters).toString()}`);
  return `${targetPath}?${params.toString()}`;
}

function captureAnalyticsUiEvent(
  event: "analytics_drilldown_opened" | "analytics_saved_view_applied",
  properties: Record<string, string | number | boolean | null> = {}
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(event, { detail: properties }));
}

function isHiringTargetsPayload(value: unknown): value is { targets: HiringTargetDto[] } {
  return Boolean(value && typeof value === "object" && Array.isArray((value as { targets?: unknown }).targets));
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
}

function targetValue(value: number | null, suffix = "") {
  return typeof value === "number" ? `${value}${suffix}` : "Не задано";
}

function safeDashboardPayload(payload: unknown, role: AnalyticsRole, filters: AnalyticsFilters): AnalyticsDashboardDto {
  if (!payload || typeof payload !== "object") return createEmptyDashboard(role, filters);
  const candidate = payload as Partial<AnalyticsDashboardDto>;
  return {
    ...createEmptyDashboard(role, filters),
    ...candidate,
    role: candidate.role === "admin" || candidate.role === "hr" || candidate.role === "recruiter" ? candidate.role : role,
    filters: { ...filters, ...(candidate.filters ?? {}) },
    savedViews: Array.isArray(candidate.savedViews) ? candidate.savedViews : createEmptyDashboard(role, filters).savedViews,
    kpis: Array.isArray(candidate.kpis) ? candidate.kpis : createEmptyDashboard(role, filters).kpis,
    needsAttention: Array.isArray(candidate.needsAttention) ? candidate.needsAttention : [],
    funnel: Array.isArray(candidate.funnel) ? candidate.funnel : [],
    vacancies: Array.isArray(candidate.vacancies) ? candidate.vacancies : [],
    sources: Array.isArray(candidate.sources) ? candidate.sources : [],
    team: Array.isArray(candidate.team) ? candidate.team : [],
    aiBuckets: Array.isArray(candidate.aiBuckets) ? candidate.aiBuckets : createEmptyDashboard(role, filters).aiBuckets,
    companyAiUsage: candidate.companyAiUsage ?? null,
    configuredSlaBreaches: typeof candidate.configuredSlaBreaches === "number" ? candidate.configuredSlaBreaches : 0,
    dataQualityNotes: Array.isArray(candidate.dataQualityNotes)
      ? candidate.dataQualityNotes
      : createEmptyDashboard(role, filters).dataQualityNotes,
  };
}

function isSavedViewPayload(value: unknown): value is { view: AnalyticsSavedView } {
  if (!value || typeof value !== "object" || !("view" in value)) return false;
  const view = (value as { view?: unknown }).view;
  if (!view || typeof view !== "object") return false;
  const candidate = view as Partial<AnalyticsSavedView>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    (candidate.visibility === "private" || candidate.visibility === "company")
  );
}

function savedViewFilters(current: AnalyticsFilters, view: AnalyticsSavedView): AnalyticsFilters {
  const raw = view.filters;
  if (!raw || typeof raw !== "object") return current;

  return {
    ...current,
    periodStart: typeof raw.periodStart === "string" ? raw.periodStart : current.periodStart,
    periodEnd: typeof raw.periodEnd === "string" ? raw.periodEnd : current.periodEnd,
    periodMode: raw.periodMode === "period" || raw.periodMode === "asOf" ? raw.periodMode : current.periodMode,
    vacancy: typeof raw.vacancy === "string" ? raw.vacancy : current.vacancy,
    vacancyStatus: typeof raw.vacancyStatus === "string" ? raw.vacancyStatus : current.vacancyStatus,
    owner: typeof raw.owner === "string" ? raw.owner : current.owner,
    department: typeof raw.department === "string" ? raw.department : current.department,
    location: typeof raw.location === "string" ? raw.location : current.location,
    source: typeof raw.source === "string" ? raw.source : current.source,
    status: typeof raw.status === "string" ? raw.status : current.status,
    scoreThreshold:
      typeof raw.scoreThreshold === "number" && Number.isFinite(raw.scoreThreshold)
        ? Math.max(0, Math.min(100, Math.round(raw.scoreThreshold)))
        : current.scoreThreshold,
    riskyOnly: typeof raw.riskyOnly === "boolean" ? raw.riskyOnly : current.riskyOnly,
    staleOnly: typeof raw.staleOnly === "boolean" ? raw.staleOnly : current.staleOnly,
  };
}

function KpiCard({ item }: { item: AnalyticsKpi }) {
  return (
    <Card className="min-w-0">
      <CardHeader className="min-w-0 pb-2">
        <CardTitle className="flex min-w-0 items-center justify-between gap-2 text-sm">
          <span className="min-w-0 break-words">{item.label}</span>
          <FormulaTooltip formula={item.formula} />
        </CardTitle>
        <CardDescription className="break-words">{item.detail}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className={item.tone === "warning" ? "text-2xl font-semibold text-amber-600" : "text-2xl font-semibold"}>
          {item.value}
        </div>
      </CardContent>
    </Card>
  );
}

function FormulaTooltip({ formula }: { formula: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Как считается метрика"
          >
            <Info className="h-4 w-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-sm">{formula}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-md border border-dashed p-6 text-sm">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-muted-foreground">{detail}</p>
    </div>
  );
}

function BarMeter({ value }: { value: number }) {
  return (
    <div className="flex min-w-[8rem] items-center gap-2">
      <Progress value={Math.max(0, Math.min(100, value))} className="h-2 min-w-0 flex-1" />
      <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">{value}%</span>
    </div>
  );
}

export function AnalyticsDashboard() {
  const { user } = useAuth();
  const role: AnalyticsRole = user?.role === "admin" || user?.role === "hr" || user?.role === "recruiter" ? user.role : "recruiter";
  const isAdmin = role === "admin";
  const [filters, setFilters] = useState<AnalyticsFilters>(defaultFilters);
  const [selectedSavedViewId, setSelectedSavedViewId] = useState("none");
  const [savedViewName, setSavedViewName] = useState("");
  const [savedViewVisibility, setSavedViewVisibility] = useState<"private" | "company">("private");
  const [csvDataset, setCsvDataset] = useState("candidates");
  const [hiringTargets, setHiringTargets] = useState<HiringTargetDto[]>([]);
  const [targetDraft, setTargetDraft] = useState<HiringTargetDraft>({
    id: null,
    scopeType: "company",
    scopeId: "",
    periodStart: defaultPeriodStart,
    periodEnd: defaultPeriodEnd,
    targetHires: "",
    targetTimeToFillDays: "",
    slaFeedbackHours: "",
    minimumPipelineSize: "",
  });
  const [targetSaving, setTargetSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dashboard, setDashboard] = useState<AnalyticsDashboardDto>(() => createEmptyDashboard(role, defaultFilters));

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadAnalytics() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/analytics?${buildAnalyticsApiSearchParams(filters).toString()}`, {
          method: "GET",
          signal: controller.signal,
        });
        const json: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          if (!cancelled) setLoadError("Не удалось обновить аналитику. Проверьте период и попробуйте ещё раз.");
          return;
        }
        if (!cancelled) setDashboard(safeDashboardPayload(json, role, filters));
      } catch (error) {
        if (!cancelled && !(error instanceof DOMException && error.name === "AbortError")) {
          setLoadError("Не удалось обновить аналитику. Проверьте период и попробуйте ещё раз.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadAnalytics();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [filters, role]);

  useEffect(() => {
    if (!isAdmin) {
      setHiringTargets([]);
      return;
    }

    let cancelled = false;
    async function loadHiringTargets() {
      try {
        const res = await fetch("/api/analytics/hiring-targets", { method: "GET" });
        const json: unknown = await res.json().catch(() => null);
        if (!res.ok || !isHiringTargetsPayload(json)) return;
        if (!cancelled) setHiringTargets(json.targets);
      } catch {
        if (!cancelled) setHiringTargets([]);
      }
    }

    void loadHiringTargets();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const exportParams = useMemo(() => buildAnalyticsApiSearchParams(filters), [filters]);
  const xlsxHref = `/api/analytics/export?format=xlsx&${exportParams.toString()}`;
  const csvHref = `/api/analytics/export?format=csv&dataset=${encodeURIComponent(csvDataset)}&${exportParams.toString()}`;
  const companyAiUsage = dashboard.companyAiUsage;

  function setFilter(key: keyof AnalyticsFilters, value: string | boolean | number) {
    setFilters((current) => updateFilterValue(current, key, value));
  }

  function applySavedView(viewId: string) {
    setSelectedSavedViewId(viewId);
    const view = dashboard.savedViews.find((item) => item.id === viewId);
    if (!view) return;
    captureAnalyticsUiEvent("analytics_saved_view_applied", {
      role,
      analytics_view: "dashboard",
      visibility: view.visibility,
      filter_count: Object.keys(view.filters ?? {}).length,
    });
    setFilters((current) => savedViewFilters(current, view));
  }

  function editHiringTarget(target: HiringTargetDto) {
    setTargetDraft({
      id: target.id,
      scopeType: target.scopeType === "vacancy" ? "vacancy" : "company",
      scopeId: target.scopeType === "vacancy" ? target.scopeId ?? "" : "",
      periodStart: target.periodStart,
      periodEnd: target.periodEnd,
      targetHires: target.targetHires === null ? "" : String(target.targetHires),
      targetTimeToFillDays: target.targetTimeToFillDays === null ? "" : String(target.targetTimeToFillDays),
      slaFeedbackHours: target.slaFeedbackHours === null ? "" : String(target.slaFeedbackHours),
      minimumPipelineSize: target.minimumPipelineSize === null ? "" : String(target.minimumPipelineSize),
    });
  }

  async function saveCurrentView() {
    if (!savedViewName.trim()) return;
    setLoadError(null);

    try {
      const res = await fetch("/api/analytics/saved-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: savedViewName.trim().slice(0, 80),
          visibility: isAdmin ? savedViewVisibility : "private",
          filters,
        }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok || !isSavedViewPayload(json)) {
        setLoadError("Не удалось сохранить вид. Проверьте название и попробуйте ещё раз.");
        return;
      }

      const view = json.view;
      setDashboard((current) => ({
        ...current,
        savedViews: [view, ...current.savedViews.filter((item) => item.id !== view.id)],
      }));
      setSelectedSavedViewId(view.id);
      setSavedViewName("");
    } catch {
      setLoadError("Не удалось сохранить вид. Проверьте название и попробуйте ещё раз.");
    }
  }

  async function deleteSelectedSavedView() {
    if (selectedSavedViewId === "none") return;
    const view = dashboard.savedViews.find((item) => item.id === selectedSavedViewId);
    if (!view) return;
    setLoadError(null);

    try {
      const res = await fetch(`/api/analytics/saved-views?id=${encodeURIComponent(view.id)}`, { method: "DELETE" });
      if (!res.ok) {
        setLoadError("Не удалось удалить сохранённый вид. Попробуйте ещё раз.");
        return;
      }
      setDashboard((current) => ({
        ...current,
        savedViews: current.savedViews.filter((item) => item.id !== view.id),
      }));
      setSelectedSavedViewId("none");
    } catch {
      setLoadError("Не удалось удалить сохранённый вид. Попробуйте ещё раз.");
    }
  }

  async function saveHiringTarget() {
    if (!isAdmin) return;
    if (targetDraft.scopeType !== "company" && !targetDraft.scopeId) {
      setLoadError("Выберите вакансию для цели найма.");
      return;
    }

    setTargetSaving(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/analytics/hiring-targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: targetDraft.id ?? undefined,
          scope_type: targetDraft.scopeType,
          scope_id: targetDraft.scopeType === "company" ? null : targetDraft.scopeId,
          metric_name: "hires",
          period_start: targetDraft.periodStart,
          period_end: targetDraft.periodEnd,
          target_hires: numberOrNull(targetDraft.targetHires),
          target_time_to_fill_days: numberOrNull(targetDraft.targetTimeToFillDays),
          target_time_to_hire_days: null,
          sla_feedback_hours: numberOrNull(targetDraft.slaFeedbackHours),
          minimum_pipeline_size: numberOrNull(targetDraft.minimumPipelineSize),
          target_interview_to_offer_conversion: null,
        }),
      });
      const json: unknown = await res.json().catch(() => null);
      const target = json && typeof json === "object" ? (json as { target?: HiringTargetDto }).target : null;
      if (!res.ok || !target) {
        setLoadError("Не удалось сохранить цель найма. Проверьте поля и попробуйте ещё раз.");
        return;
      }
      setHiringTargets((current) => [target, ...current.filter((item) => item.id !== target.id)]);
      setTargetDraft((current) => ({ ...current, id: target.id }));
      setFilters((current) => ({ ...current }));
    } catch {
      setLoadError("Не удалось сохранить цель найма. Проверьте поля и попробуйте ещё раз.");
    } finally {
      setTargetSaving(false);
    }
  }

  function clearHiringTargetDraft() {
    setTargetDraft({
      id: null,
      scopeType: "company",
      scopeId: "",
      periodStart: filters.periodStart,
      periodEnd: filters.periodEnd,
      targetHires: "",
      targetTimeToFillDays: "",
      slaFeedbackHours: "",
      minimumPipelineSize: "",
    });
  }

  function targetScopeText(target: HiringTargetDto) {
    if (target.scopeType === "company") return "Компания";
    if (target.scopeType === "vacancy") {
      return dashboard.vacancies.find((vacancy) => vacancy.id === target.scopeId)?.title ?? "Вакансия";
    }
    return target.scopeType === "department" ? "Отдел" : "Рекрутер";
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Статистика найма</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Срез по доступным вам вакансиям и кандидатам: план, воронка, источники, риски, AI и выгрузки.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={xlsxHref}>
              <FileSpreadsheet className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
              XLSX
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={csvHref}>
              <Download className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
              CSV
            </Link>
          </Button>
        </div>
      </div>

      {loadError ? (
        <Alert>
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Аналитика временно недоступна</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4 shrink-0" aria-hidden="true" />
            Фильтры и сохранённые виды
          </CardTitle>
          <CardDescription>Сохранённый вид хранит только фильтры. Личные виды доступны всем ролям, вид компании публикует только администратор.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor="analytics-period-start">Начало периода</Label>
              <Input id="analytics-period-start" type="date" value={filters.periodStart} onChange={(e) => setFilter("periodStart", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="analytics-period-end">Конец периода</Label>
              <Input id="analytics-period-end" type="date" value={filters.periodEnd} onChange={(e) => setFilter("periodEnd", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Режим</Label>
              <Select value={filters.periodMode} onValueChange={(value) => setFilter("periodMode", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="period">За период</SelectItem>
                  <SelectItem value="asOf">На дату</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Источник</Label>
              <Select value={filters.source} onValueChange={(value) => setFilter("source", value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все источники</SelectItem>
                  <SelectItem value="hh.ru">HH.ru</SelectItem>
                  <SelectItem value="manual">Ручное добавление</SelectItem>
                  <SelectItem value="referral">Рекомендации</SelectItem>
                  <SelectItem value="other">Другие</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="analytics-score">AI-score от</Label>
              <Input
                id="analytics-score"
                type="number"
                min={0}
                max={100}
                value={filters.scoreThreshold}
                onChange={(e) => setFilter("scoreThreshold", Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="min-w-0 space-y-2">
              <Label id="analytics-vacancy-label">Вакансия</Label>
              <Select value={filters.vacancy} onValueChange={(value) => setFilter("vacancy", value)}>
                <SelectTrigger aria-labelledby="analytics-vacancy-label" className="min-w-0">
                  <SelectValue placeholder="Все вакансии" />
                </SelectTrigger>
                <SelectContent className="max-w-[min(32rem,var(--radix-select-trigger-width))]">
                  <SelectItem value="all">Все вакансии</SelectItem>
                  {dashboard.vacancies.map((vacancy) => (
                    <SelectItem key={vacancy.id} value={vacancy.id}>
                      {vacancy.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="analytics-department">Департамент</Label>
              <Input
                id="analytics-department"
                value={filters.department === "all" ? "" : filters.department}
                onChange={(e) => setFilter("department", e.target.value || "all")}
                placeholder="Все департаменты"
                maxLength={80}
                className="min-w-0"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="analytics-location">Город</Label>
              <Input
                id="analytics-location"
                value={filters.location === "all" ? "" : filters.location}
                onChange={(e) => setFilter("location", e.target.value || "all")}
                placeholder="Все города"
                maxLength={80}
                className="min-w-0"
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Select value={filters.vacancyStatus} onValueChange={(value) => setFilter("vacancyStatus", value)}>
              <SelectTrigger aria-label="Статус вакансии">
                <SelectValue placeholder="Статус вакансии" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы вакансий</SelectItem>
                <SelectItem value="active">В работе</SelectItem>
                <SelectItem value="paused">На паузе</SelectItem>
                <SelectItem value="closed">Закрытые</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filters.status} onValueChange={(value) => setFilter("status", value)}>
              <SelectTrigger aria-label="Этап кандидата">
                <SelectValue placeholder="Этап кандидата" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все этапы</SelectItem>
                <SelectItem value="new">Новые</SelectItem>
                <SelectItem value="reviewing">Рассмотрение</SelectItem>
                <SelectItem value="interview-scheduled">Интервью</SelectItem>
                <SelectItem value="offer">Оффер</SelectItem>
                <SelectItem value="hired">Найм</SelectItem>
              </SelectContent>
            </Select>
            {isAdmin ? (
              <Select value={filters.owner} onValueChange={(value) => setFilter("owner", value)}>
                <SelectTrigger aria-label="Ответственный">
                  <SelectValue placeholder="Ответственный" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Вся команда</SelectItem>
                  <SelectItem value="created_by">По владельцу записи</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
            <Button type="button" variant={filters.riskyOnly ? "default" : "outline"} onClick={() => setFilter("riskyOnly", !filters.riskyOnly)}>
              Только риск
            </Button>
            <Button type="button" variant={filters.staleOnly ? "default" : "outline"} onClick={() => setFilter("staleOnly", !filters.staleOnly)}>
              Давно без движения
            </Button>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Select value={selectedSavedViewId} onValueChange={applySavedView}>
              <SelectTrigger aria-label="Сохранённые виды">
                <SelectValue placeholder="Сохранённые виды" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Без сохранённого вида</SelectItem>
                {dashboard.savedViews.map((view) => (
                  <SelectItem key={view.id} value={view.id}>
                    {view.name} · {view.visibility === "company" ? "Вид компании" : "Личный вид"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <Input
                value={savedViewName}
                onChange={(e) => setSavedViewName(e.target.value)}
                placeholder="Название вида"
                maxLength={80}
                className="min-w-0"
              />
              <Select value={savedViewVisibility} onValueChange={(value) => setSavedViewVisibility(value === "company" && isAdmin ? "company" : "private")}>
                <SelectTrigger className="w-full sm:w-44" aria-label="Доступ к виду">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(isAdmin ? [
                    { value: "private", label: "Личный вид" },
                    { value: "company", label: "Вид компании" },
                  ] : [
                    { value: "private", label: "Личный вид" },
                  ]).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" onClick={saveCurrentView} disabled={!savedViewName.trim()}>
                <Save className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                Сохранить
              </Button>
              <Button type="button" variant="outline" onClick={deleteSelectedSavedView} disabled={selectedSavedViewId === "none"}>
                Удалить вид
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="h-auto max-w-full flex-wrap justify-start">
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          <TabsTrigger value="funnel">Воронка</TabsTrigger>
          <TabsTrigger value="vacancies">Вакансии</TabsTrigger>
          <TabsTrigger value="sources">Источники</TabsTrigger>
          {isAdmin && <TabsTrigger value="team">Команда</TabsTrigger>}
          <TabsTrigger value="ai">AI</TabsTrigger>
          <TabsTrigger value="export">Экспорт</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {dashboard.kpis.map((item) => (
              <KpiCard key={item.id} item={item} />
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Что требует внимания
                </CardTitle>
                <CardDescription>Риски и подсказки отсортированы по влиянию на найм.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {dashboard.needsAttention.length === 0 ? (
                  <EmptyState title="Нет срочных сигналов" detail="Когда появятся рисковые вакансии, слабые источники или кандидаты без движения, они будут здесь." />
                ) : (
                  dashboard.needsAttention.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => captureAnalyticsUiEvent("analytics_drilldown_opened")}
                      className="flex min-w-0 items-center justify-between gap-3 rounded-md border p-3 hover:bg-muted/40"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{item.title}</span>
                        <span className="block break-words text-sm text-muted-foreground">{item.detail}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Короткая воронка
                </CardTitle>
                <CardDescription>Переходы за выбранный период и текущий срез, если истории пока мало.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {dashboard.funnel.length === 0 ? (
                  <EmptyState title="Истории переходов пока мало" detail={dashboard.dataQualityNotes[0] ?? "Новые изменения статусов начнут пополнять этот блок."} />
                ) : (
                  dashboard.funnel.slice(0, 5).map((row) => (
                    <Link key={row.stage} href={row.href} className="block rounded-md border p-3 hover:bg-muted/40">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate font-medium">{row.stage}</span>
                        <span className="shrink-0 text-sm text-muted-foreground">{row.count}</span>
                      </div>
                      <BarMeter value={row.conversion} />
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="funnel" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Воронка кандидатов</CardTitle>
              <CardDescription>Конверсии между этапами, время на этапах и причины отказов, когда они есть в истории.</CardDescription>
            </CardHeader>
            <CardContent>
              {dashboard.funnel.length === 0 ? (
                <EmptyState title="Недостаточно истории переходов" detail="Пока показываем честное состояние данных: время на этапах появится после следующих изменений статусов." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Этап</TableHead>
                      <TableHead>Кандидаты</TableHead>
                      <TableHead>Конверсия</TableHead>
                      <TableHead>Среднее время</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.funnel.map((row) => (
                      <TableRow key={row.stage}>
                        <TableCell className="min-w-0">
                          <Link href={row.href} className="block truncate font-medium">
                            {row.stage}
                          </Link>
                        </TableCell>
                        <TableCell>{row.count}</TableCell>
                        <TableCell>
                          <BarMeter value={row.conversion} />
                        </TableCell>
                        <TableCell>{typeof row.avgDays === "number" ? `${row.avgDays} дн.` : "Нужно больше истории"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vacancies" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Вакансии</CardTitle>
              <CardDescription>
                Риск основан на настроенных целях и видимых процессных сигналах. Если SLA не задан, показываем мягкую подсказку «давно не было движения».
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dashboard.vacancies.length === 0 ? (
                <EmptyState title="Нет вакансий в выбранном срезе" detail="Измените период или фильтры, чтобы увидеть таблицу управления вакансиями." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Вакансия</TableHead>
                      <TableHead>Ответственный</TableHead>
                      <TableHead>Дней</TableHead>
                      <TableHead>AI 70+/80+</TableHead>
                      <TableHead>Интервью/офферы/наймы</TableHead>
                      <TableHead>Риск</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.vacancies.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="max-w-[18rem]">
                          <Link href={row.href} className="block truncate font-medium">
                            {row.title}
                          </Link>
                          <p className="break-words text-xs text-muted-foreground">{row.nextAction}</p>
                        </TableCell>
                        <TableCell className="max-w-[12rem] truncate">{row.owner}</TableCell>
                        <TableCell>{row.daysOpen}</TableCell>
                        <TableCell>{row.ai70}/{row.ai80}</TableCell>
                        <TableCell>{row.interviews}/{row.offers}/{row.hires}</TableCell>
                        <TableCell>
                          <Badge variant={row.risk === "high" ? "destructive" : "outline"}>{row.riskReason}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Источники</CardTitle>
              <CardDescription>Качество источника: не только объём, но и путь до интервью, оффера и найма.</CardDescription>
            </CardHeader>
            <CardContent>
              {dashboard.sources.length === 0 ? (
                <EmptyState title="Нет данных по источникам" detail="Источник появится после добавления или импорта кандидатов в выбранном срезе." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Источник</TableHead>
                      <TableHead>Кандидаты</TableHead>
                      <TableHead>До интервью</TableHead>
                      <TableHead>До оффера</TableHead>
                      <TableHead>До найма</TableHead>
                      <TableHead>Средний AI-score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.sources.map((row) => (
                      <TableRow key={row.source}>
                        <TableCell className="max-w-[16rem]">
                          <Link href={row.href} className="block truncate font-medium">
                            {row.source}
                          </Link>
                        </TableCell>
                        <TableCell>{row.candidates}</TableCell>
                        <TableCell>{row.interviewConversion}%</TableCell>
                        <TableCell>{row.offerConversion}%</TableCell>
                        <TableCell>{row.hireConversion}%</TableCell>
                        <TableCell>{row.avgScore}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="team" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Команда</CardTitle>
                <CardDescription>Админский срез нагрузки и процессных рисков без рейтинга «лучше/хуже».</CardDescription>
              </CardHeader>
              <CardContent>
                {dashboard.team.length === 0 ? (
                  <EmptyState title="Нет командной выборки" detail="Командная аналитика появится, когда в выбранном срезе будут вакансии или кандидаты с владельцами." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Сотрудник</TableHead>
                        <TableHead>Вакансии</TableHead>
                        <TableHead>Кандидаты</TableHead>
                        <TableHead>Давно без движения</TableHead>
                        <TableHead>AI 80+ без движения</TableHead>
                        <TableHead>Наймы</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dashboard.team.map((row) => (
                        <TableRow key={row.owner}>
                          <TableCell className="max-w-[16rem] truncate">{row.owner}</TableCell>
                          <TableCell>{row.activeVacancies}</TableCell>
                          <TableCell>{row.candidatesInWork}</TableCell>
                          <TableCell>{row.staleCandidates}</TableCell>
                          <TableCell>{row.aiShortlistWithoutMovement}</TableCell>
                          <TableCell>{row.hires}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="ai" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-4 w-4 shrink-0" aria-hidden="true" />
                  AI-эффективность
                </CardTitle>
                <CardDescription>
                  AI помогает расставить приоритеты, но решение о продвижении или отказе принимает человек.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md border p-3">
                    <p className="text-sm text-muted-foreground">AI-shortlist → интервью</p>
                    <p className="text-2xl font-semibold">{dashboard.aiShortlistConversion.interview}%</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-sm text-muted-foreground">AI-shortlist → оффер</p>
                    <p className="text-2xl font-semibold">{dashboard.aiShortlistConversion.offer}%</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-sm text-muted-foreground">AI-shortlist → найм</p>
                    <p className="text-2xl font-semibold">{dashboard.aiShortlistConversion.hire}%</p>
                  </div>
                </div>
                {isAdmin && companyAiUsage ? (
                  <div className="rounded-md border p-3">
                    <p className="font-medium">Использование AI по компании</p>
                    <p className="text-sm text-muted-foreground">
                      Использовано {companyAiUsage.used} из {companyAiUsage.quota}. Остаток кредитов: {companyAiUsage.credits}.
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Распределение AI-score</CardTitle>
                <CardDescription>Порог AI-shortlist в v1: 80+. Фильтр выше не меняет эту бизнес-метрику.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {dashboard.aiBuckets.map((bucket) => (
                  <Link
                    key={bucket.label}
                    href={bucket.href}
                    onClick={() => captureAnalyticsUiEvent("analytics_drilldown_opened")}
                    className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-muted/40"
                  >
                    <span className="min-w-0 truncate">{bucket.label}</span>
                    <span className="shrink-0 font-medium">{bucket.count}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="export" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden="true" />
                Экспорт
              </CardTitle>
              <CardDescription>
                Отчёт сформируется по доступным вам данным. Администратор получает командные листы, HR и рекрутер — только свой срез.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Button asChild variant="outline" className="justify-start">
                  <Link href={xlsxHref}>
                    <FileSpreadsheet className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                    Скачать XLSX-отчёт
                  </Link>
                </Button>
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                  <Select value={csvDataset} onValueChange={setCsvDataset}>
                    <SelectTrigger aria-label="CSV-набор">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="candidates">Candidates</SelectItem>
                      <SelectItem value="pipeline-events">Pipeline events</SelectItem>
                      <SelectItem value="rejection-reasons">Rejection reasons</SelectItem>
                      <SelectItem value="sources">Sources</SelectItem>
                      <SelectItem value="ai-scores">AI scores</SelectItem>
                      <SelectItem value="sla-breaches">Настроенные SLA</SelectItem>
                      {isAdmin ? <SelectItem value="recruiters">Recruiters</SelectItem> : null}
                      {isAdmin ? <SelectItem value="ai-audit">AI audit</SelectItem> : null}
                    </SelectContent>
                  </Select>
                  <Button asChild variant="outline">
                    <Link href={csvHref}>
                      <Download className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                      Скачать CSV
                    </Link>
                  </Button>
                </div>
              </div>
              <Alert>
                <Building2 className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>Состав отчёта</AlertTitle>
                <AlertDescription>
                  XLSX включает Summary, Vacancies, Candidates, Pipeline events, Rejection reasons, Sources и AI scores. Настроенные SLA
                  добавляются только когда правила заданы. Командные и AI audit листы доступны только администратору.
                </AlertDescription>
              </Alert>
              <p className="text-sm text-muted-foreground">
                configuredSlaBreaches: {dashboard.configuredSlaBreaches}. Если правил SLA нет, подсказки остаются мягкими и не называются нарушениями.
              </p>
            </CardContent>
          </Card>
          {isAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Цели найма
                </CardTitle>
                <CardDescription>Администратор может настроить цель для компании или конкретной вакансии. SLA считается только по заданным правилам.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Область</Label>
                    <Select
                      value={targetDraft.scopeType}
                      onValueChange={(value) =>
                        setTargetDraft((current) => ({
                          ...current,
                          id: null,
                          scopeType: value === "vacancy" ? "vacancy" : "company",
                          scopeId: value === "vacancy" ? current.scopeId : "",
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="company">Компания</SelectItem>
                        <SelectItem value="vacancy">Вакансия</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {targetDraft.scopeType === "vacancy" ? (
                    <div className="space-y-2">
                      <Label>Вакансия</Label>
                      <Select value={targetDraft.scopeId || "none"} onValueChange={(value) => setTargetDraft((current) => ({ ...current, scopeId: value === "none" ? "" : value }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Выберите вакансию</SelectItem>
                          {dashboard.vacancies.map((vacancy) => (
                            <SelectItem key={vacancy.id} value={vacancy.id}>
                              {vacancy.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <Label htmlFor="analytics-target-start">Начало</Label>
                    <Input id="analytics-target-start" type="date" value={targetDraft.periodStart} onChange={(e) => setTargetDraft((current) => ({ ...current, periodStart: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="analytics-target-end">Конец</Label>
                    <Input id="analytics-target-end" type="date" value={targetDraft.periodEnd} onChange={(e) => setTargetDraft((current) => ({ ...current, periodEnd: e.target.value }))} />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="analytics-target-hires">Наймы</Label>
                    <Input id="analytics-target-hires" inputMode="numeric" value={targetDraft.targetHires} onChange={(e) => setTargetDraft((current) => ({ ...current, targetHires: e.target.value.replace(/\D/g, "").slice(0, 4) }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="analytics-target-fill">Time-to-fill, дней</Label>
                    <Input id="analytics-target-fill" inputMode="numeric" value={targetDraft.targetTimeToFillDays} onChange={(e) => setTargetDraft((current) => ({ ...current, targetTimeToFillDays: e.target.value.replace(/\D/g, "").slice(0, 4) }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="analytics-target-sla">SLA без движения, часов</Label>
                    <Input id="analytics-target-sla" inputMode="numeric" value={targetDraft.slaFeedbackHours} onChange={(e) => setTargetDraft((current) => ({ ...current, slaFeedbackHours: e.target.value.replace(/\D/g, "").slice(0, 4) }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="analytics-target-pipeline">Минимум кандидатов</Label>
                    <Input id="analytics-target-pipeline" inputMode="numeric" value={targetDraft.minimumPipelineSize} onChange={(e) => setTargetDraft((current) => ({ ...current, minimumPipelineSize: e.target.value.replace(/\D/g, "").slice(0, 4) }))} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" onClick={saveHiringTarget} disabled={targetSaving}>
                    <Target className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                    {targetSaving ? "Сохраняем..." : "Сохранить цель"}
                  </Button>
                  <Button type="button" variant="outline" onClick={clearHiringTargetDraft}>
                    Новая цель
                  </Button>
                  <span className="text-sm text-muted-foreground">Настроено целей: {hiringTargets.length}</span>
                </div>
                {hiringTargets.length === 0 ? (
                  <EmptyState title="Цели ещё не настроены" detail="Добавьте цель компании или вакансии, чтобы план и SLA начали участвовать в расчётах." />
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Область</TableHead>
                          <TableHead>Период</TableHead>
                          <TableHead>Наймы</TableHead>
                          <TableHead>Time-to-fill</TableHead>
                          <TableHead>SLA</TableHead>
                          <TableHead>Pipeline</TableHead>
                          <TableHead className="text-right">Действие</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {hiringTargets.slice(0, 8).map((target) => {
                          const canEditTarget = target.scopeType === "company" || target.scopeType === "vacancy";
                          return (
                            <TableRow key={target.id}>
                              <TableCell className="max-w-[16rem] truncate">{targetScopeText(target)}</TableCell>
                              <TableCell>{target.periodStart} - {target.periodEnd}</TableCell>
                              <TableCell>{targetValue(target.targetHires)}</TableCell>
                              <TableCell>{targetValue(target.targetTimeToFillDays, " дн.")}</TableCell>
                              <TableCell>{targetValue(target.slaFeedbackHours, " ч")}</TableCell>
                              <TableCell>{targetValue(target.minimumPipelineSize)}</TableCell>
                              <TableCell className="text-right">
                                <Button type="button" variant="outline" size="sm" onClick={() => editHiringTarget(target)} disabled={!canEditTarget}>
                                  Изменить
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>
      </Tabs>

      {isLoading ? (
        <p className="text-sm text-muted-foreground" role="status">
          Обновляем аналитику…
        </p>
      ) : null}
      <div className="sr-only" aria-hidden="true">
        <LineChart />
        <Sparkles />
        <Target />
        <Users />
      </div>
    </div>
  );
}
