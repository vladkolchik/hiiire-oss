"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { LayoutGrid, LayoutList, Brain, Calendar, FileText, Mail, Phone, MessageSquare, Info, Plus, RefreshCw } from "lucide-react";
import { AddCandidateDialog } from "@/components/dashboard/add-candidate-dialog";
import { CandidateDetails } from "@/components/dashboard/candidate-details";
import { CandidateStatusControl } from "@/components/dashboard/candidate-status-control";
import { FirstAiContextualOnboardingHint } from "@/components/dashboard/onboarding/contextual-onboarding-hint";
import { CandidatesFiltersBar } from "@/components/dashboard/candidates-filters-bar";
import { InterviewFormDialog, type InterviewFormSubmitInput } from "@/components/dashboard/interview-form-dialog";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import type { Candidate, Vacancy } from "@/types";
import {
  listCandidatesPage,
  getCandidateDetailsById,
  bulkStartCandidateAnalysis,
  retryCandidateAnalysis,
  updateCandidateComment,
  updateCandidateStatus,
  type CandidatesScoreFilter,
  type CandidatesSort,
} from "@/services/data/candidates";
import { listVacancies } from "@/services/data/vacancies";
import {
  createInterview,
  InterviewConflictError,
  listInterviewers,
  type InterviewConflict,
  type InterviewerOption,
} from "@/services/data/interviews";
import { listLatestJobsByCandidateIds, type CandidateJobSummary } from "@/services/data/jobs";
import { toast } from "sonner";
import Link from "next/link";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useAuth } from "@/hooks/use-auth";
import { getProfilesByIds, type ProfileLite } from "@/services/data/profiles";
import { PaginationControls } from "@/components/dashboard/pagination-controls";
import { readInterviewMutationErrorDescription } from "@/lib/interviews/user-facing-mutation-error";
import {
  canOpenCandidateResume,
  getCandidateResumeDownloadUrl,
  getHhResumeUrl,
  getResumeDisabledTooltip,
} from "@/lib/candidates/resume-links";
import { normalizeDisplayText } from "@/lib/utils";
import { formatCandidateDesiredSalary } from "@/lib/candidates/desired-salary-display";
import { limitCandidateNameSearchInput, normalizeCandidateNameSearch } from "@/lib/candidates/name-search";
import { CANDIDATE_STATUS_LABELS } from "@/lib/candidates/status-labels";
import {
  getHhImportSyncState,
  shouldRefreshCandidatesAfterHhImport,
  shouldScheduleCandidatesRefreshAfterHhStatus,
} from "@/lib/hh/sync-status";
import { notifyFirstAiOnboardingChanged } from "@/lib/onboarding/first-ai-client-events";

/**
 * Removes birth date from position string, keeping only age.
 * "Мужчина, 27 лет, родился 11 ноября 1998" -> "Мужчина, 27 лет"
 */
function cleanupPosition(position: string): string {
  let cleaned = position.replace(/,?\s*родил(?:ся|ась)\s+.*/i, "");
  cleaned = cleaned.replace(/,?\s*дата\s+рождения\s*[:\-]?\s*.*/i, "");
  cleaned = cleaned.replace(/,?\s*\d{1,2}[\.\-\/]\d{1,2}[\.\-\/]\d{2,4}\s*$/i, "");
  cleaned = cleaned.replace(/,?\s*\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+\d{4}\s*$/i, "");
  return cleaned.trim().replace(/,\s*$/, "").trim() || position;
}

function getFirstContactValue(candidate: Candidate, type: string): string | undefined {
  const t = type.toLowerCase();
  const c = (candidate.contacts ?? []).find((x) => String(x.type).toLowerCase() === t);
  return c?.value;
}

type CommentSaveState = "idle" | "saving" | "saved" | "error";
type CommentUiState = {
  draft: string;
  dirty: boolean;
  open: boolean;
  saveState: CommentSaveState;
  error?: string;
};

type HhStatusDto =
  | { isConnected: false }
  | {
      isConnected: true;
      connectedAt: string;
      lastSyncedAt: string | null;
      syncStartedAt: string | null;
      syncLockExpiresAt: string | null;
      lastSyncErrorAt: string | null;
      hasLastSyncError: boolean;
    };

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, Math.trunc(v)));
}

function parseScoreFilter(v: string | null | undefined): CandidatesScoreFilter | null {
  const x = String(v ?? "");
  if (x === "all" || x === "high" || x === "medium" || x === "low" || x === "unscored") return x;
  return null;
}

type CandidatesStatusFilter = Candidate["status"] | "all";

const candidateStatusValues: ReadonlyArray<Candidate["status"]> = [
  "new",
  "reviewing",
  "security-check",
  "interview-scheduled",
  "interviewed",
  "offer",
  "hired",
  "rejected",
];

function parseStatusFilter(v: string | null | undefined): CandidatesStatusFilter | null {
  const x = String(v ?? "");
  if (x === "all") return x;
  if (candidateStatusValues.includes(x as Candidate["status"])) return x as Candidate["status"];
  return null;
}

function parseSort(v: string | null | undefined): CandidatesSort | null {
  const x = String(v ?? "");
  if (x === "date_desc" || x === "date_asc" || x === "score_desc" || x === "score_asc") return x;
  return null;
}

type AnalyticsDrilldownSearchParams = {
  analyticsPeriodStart: string | null;
  analyticsPeriodEnd: string | null;
  analyticsPeriodMode: string | null;
  analyticsSource: Candidate["source"] | null;
  analyticsStatus: Candidate["status"] | null;
  analyticsScoreThreshold: number | null;
  analyticsScoreMin: number | null;
  analyticsScoreMax: number | null;
  analyticsScoreBucket: "unscored" | null;
  analyticsReturnTo: string | null;
};

const analyticsQueryParamKeys = [
  "periodStart",
  "periodEnd",
  "periodMode",
  "source",
  "status",
  "scoreThreshold",
  "scoreMin",
  "scoreMax",
  "scoreBucket",
  "returnTo",
] as const;

function normalizeAnalyticsTextParam(value: string | null): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized === "all") return null;
  return normalized.slice(0, 120);
}

function parseAnalyticsStatusParam(value: string | null): Candidate["status"] | null {
  const normalized = normalizeAnalyticsTextParam(value);
  if (
    normalized === "new" ||
    normalized === "reviewing" ||
    normalized === "security-check" ||
    normalized === "interview-scheduled" ||
    normalized === "interviewed" ||
    normalized === "offer" ||
    normalized === "hired" ||
    normalized === "rejected"
  ) {
    return normalized;
  }
  return null;
}

function parseAnalyticsSourceParam(value: string | null): Candidate["source"] | null {
  const normalized = normalizeAnalyticsTextParam(value);
  if (normalized === "hh.ru" || normalized === "manual" || normalized === "referral" || normalized === "other") {
    return normalized;
  }
  return null;
}

function parseAnalyticsDrilldownSearchParams(params: URLSearchParams): AnalyticsDrilldownSearchParams {
  const rawThreshold = Number.parseInt(params.get("scoreThreshold") ?? "", 10);
  const analyticsScoreThreshold = Number.isFinite(rawThreshold) ? clampInt(rawThreshold, 0, 100) : null;
  const rawScoreMin = Number.parseInt(params.get("scoreMin") ?? "", 10);
  const rawScoreMax = Number.parseInt(params.get("scoreMax") ?? "", 10);
  const analyticsScoreMin = Number.isFinite(rawScoreMin) ? clampInt(rawScoreMin, 0, 100) : null;
  const analyticsScoreMax = Number.isFinite(rawScoreMax) ? clampInt(rawScoreMax, 0, 100) : null;
  const analyticsScoreBucket = params.get("scoreBucket") === "unscored" ? "unscored" : null;
  const rawReturnTo = params.get("returnTo");
  const analyticsReturnTo = rawReturnTo?.startsWith("/dashboard/stats") ? rawReturnTo : null;

  return {
    analyticsPeriodStart: normalizeAnalyticsTextParam(params.get("periodStart")),
    analyticsPeriodEnd: normalizeAnalyticsTextParam(params.get("periodEnd")),
    analyticsPeriodMode: normalizeAnalyticsTextParam(params.get("periodMode")),
    analyticsSource: parseAnalyticsSourceParam(params.get("source")),
    analyticsStatus: parseAnalyticsStatusParam(params.get("status")),
    analyticsScoreThreshold,
    analyticsScoreMin,
    analyticsScoreMax,
    analyticsScoreBucket,
    analyticsReturnTo,
  };
}

function preserveAnalyticsDrilldownParams(params: URLSearchParams, current: URLSearchParams) {
  for (const key of analyticsQueryParamKeys) {
    const value = current.get(key);
    if (value && !params.has(key)) params.set(key, value);
  }
}

function areIdSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) {
    if (!b.has(x)) return false;
  }
  return true;
}

function CandidatesInitialSkeleton() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Загрузка…</span>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-10 w-full sm:w-48" />
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <Skeleton className="h-10 w-[200px]" />
          <Skeleton className="h-10 w-[220px]" />
          <Skeleton className="h-10 w-[260px]" />
        </div>
        <div className="flex gap-2" role="group" aria-label="Переключение вида отображения (загрузка)">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-10" />
        </div>
      </div>

      <Skeleton className="h-4 w-44" />

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 9 }).map((_, idx) => (
          <Card key={idx} className="flex flex-col">
            <CardHeader>
              <div className="flex items-start gap-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-7 w-16 rounded-md" />
                </div>
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
              <Skeleton className="h-4 w-40" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
              <div className="mt-auto pt-4 border-t flex gap-2">
                <Skeleton className="h-9 flex-1" />
                <Skeleton className="h-9 flex-1" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CandidatesGridPageSkeleton({ count }: { count: number }) {
  const safeCount = clampInt(count, 1, 12);
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: safeCount }).map((_, idx) => (
        <Card key={idx} className="flex flex-col">
          <CardHeader>
            <div className="flex items-start gap-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-7 w-16 rounded-md" />
              </div>
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
            <Skeleton className="h-4 w-40" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
            <div className="mt-auto pt-4 border-t flex gap-2">
              <Skeleton className="h-9 flex-1" />
              <Skeleton className="h-9 flex-1" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CandidatesListPageSkeleton({ count }: { count: number }) {
  const safeCount = clampInt(count, 1, 12);
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: safeCount }).map((_, idx) => (
        <Card key={idx}>
          <CardContent className="p-5">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-64 max-w-full" />
                  <Skeleton className="h-4 w-52 max-w-full" />
                </div>
                <Skeleton className="h-8 w-28" />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
              <Skeleton className="h-14 w-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function CandidatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isCompanyAdmin = user?.role === "admin";
  const creditsBlockedHint = isCompanyAdmin
    ? "Пополните баланс или обновите тариф."
    : "Обратитесь к администратору аккаунта, чтобы продолжить AI-анализ.";

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filterVacancy, setFilterVacancy] = useState<string>("all");
  const [filterScore, setFilterScore] = useState<CandidatesScoreFilter>("all");
  const [filterStatus, setFilterStatus] = useState<CandidatesStatusFilter>("all");
  const [nameQuery, setNameQuery] = useState<string>("");
  const [sort, setSort] = useState<CandidatesSort>("date_desc");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [urlSynced, setUrlSynced] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [totalCandidates, setTotalCandidates] = useState<number>(0);
  const [totalUnscoredInScope, setTotalUnscoredInScope] = useState<number>(0);
  const [totalUnscoredLoading, setTotalUnscoredLoading] = useState(false);
  const [hhStatus, setHhStatus] = useState<HhStatusDto | null>(null);
  const [hhImportFinalRefreshSignal, setHhImportFinalRefreshSignal] = useState(0);
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [vacanciesLoaded, setVacanciesLoaded] = useState(false);
  const [jobsByCandidateId, setJobsByCandidateId] = useState<Map<string, CandidateJobSummary>>(new Map());
  const [ownersById, setOwnersById] = useState<Map<string, ProfileLite>>(new Map());
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [creditsBalance, setCreditsBalance] = useState<number | null>(null);
  const [creditsBalanceLoading, setCreditsBalanceLoading] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState<"page" | "scope">("page");
  const [bulkRequestedCount, setBulkRequestedCount] = useState<number>(1);
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
  const [statusSavingByCandidateId, setStatusSavingByCandidateId] = useState<Record<string, boolean>>({});
  const [retrySubmittingByCandidateId, setRetrySubmittingByCandidateId] = useState<Record<string, boolean>>({});
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsCandidateId, setDetailsCandidateId] = useState<string | null>(null);
  const [addCandidateOpenSignal, setAddCandidateOpenSignal] = useState(0);
  const [linkedDetailsCandidate, setLinkedDetailsCandidate] = useState<Candidate | null>(null);
  const isMobileDetails = useMediaQuery("(max-width: 768px)");
  const [scheduleCandidate, setScheduleCandidate] = useState<Candidate | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [scheduleConflicts, setScheduleConflicts] = useState<InterviewConflict[]>([]);
  const [interviewerOptions, setInterviewerOptions] = useState<InterviewerOption[]>([]);
  const hhImportSyncState = getHhImportSyncState(hhStatus);
  const hhImportInProgress = hhImportSyncState === "loading";
  const hhImportFailed = hhImportSyncState === "failed";

  const [commentByCandidateId, setCommentByCandidateId] = useState<Record<string, CommentUiState>>({});
  const commentStateRef = useRef<Record<string, CommentUiState>>({});
  const commentSaveSeqRef = useRef<Record<string, number>>({});
  const commentDebounceTimerRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const linkedDetailsCandidateIdRef = useRef<string | null>(null);
  const didInitialLoadRef = useRef(false);
  const loadCandidatesSeqRef = useRef(0);
  const hhImportNeedsFinalRefreshRef = useRef(false);
  const hhStatusStartedAtRef = useRef(Date.now());
  const selectionSnapshotByScopeRef = useRef<Record<string, string[]>>({});
  const prevSelectionScopeKeyRef = useRef<string | null>(null);

  const analyticsDrilldown = useMemo(() => {
    return parseAnalyticsDrilldownSearchParams(new URLSearchParams(searchParams.toString()));
  }, [searchParams]);
  const analyticsCandidateFilters = useMemo(
    () => ({
      source: analyticsDrilldown.analyticsSource,
      status: analyticsDrilldown.analyticsPeriodMode === "asOf" ? analyticsDrilldown.analyticsStatus : null,
      eventStatus: analyticsDrilldown.analyticsPeriodMode === "period" ? analyticsDrilldown.analyticsStatus : null,
      eventPeriodStart: analyticsDrilldown.analyticsPeriodStart,
      eventPeriodEnd: analyticsDrilldown.analyticsPeriodEnd,
      aiScoreMin: analyticsDrilldown.analyticsScoreBucket === "unscored" ? null : analyticsDrilldown.analyticsScoreMin,
      aiScoreMax: analyticsDrilldown.analyticsScoreBucket === "unscored" ? null : analyticsDrilldown.analyticsScoreMax,
    }),
    [
      analyticsDrilldown.analyticsSource,
      analyticsDrilldown.analyticsStatus,
      analyticsDrilldown.analyticsPeriodMode,
      analyticsDrilldown.analyticsPeriodStart,
      analyticsDrilldown.analyticsPeriodEnd,
      analyticsDrilldown.analyticsScoreBucket,
      analyticsDrilldown.analyticsScoreMin,
      analyticsDrilldown.analyticsScoreMax,
    ]
  );

  const selectionScopeKey = useMemo(() => {
    return `${filterVacancy}::${filterScore}::${filterStatus}::${sort}::${normalizeCandidateNameSearch(nameQuery)}::${analyticsCandidateFilters.source ?? ""}::${analyticsCandidateFilters.status ?? ""}::${analyticsCandidateFilters.eventStatus ?? ""}::${analyticsCandidateFilters.eventPeriodStart ?? ""}::${analyticsCandidateFilters.eventPeriodEnd ?? ""}::${analyticsCandidateFilters.aiScoreMin ?? ""}::${analyticsCandidateFilters.aiScoreMax ?? ""}`;
  }, [filterVacancy, filterScore, filterStatus, sort, nameQuery, analyticsCandidateFilters]);

  useEffect(() => {
    commentStateRef.current = commentByCandidateId;
  }, [commentByCandidateId]);

  useEffect(() => {
    linkedDetailsCandidateIdRef.current = linkedDetailsCandidate?.id ?? null;
  }, [linkedDetailsCandidate?.id]);

  const creatorIdsKey = useMemo(() => {
    if (!isCompanyAdmin) return "";
    const ids = Array.from(new Set(candidates.map((c) => c.createdById))).filter(Boolean).sort();
    return ids.join("|");
  }, [candidates, isCompanyAdmin]);

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

  const resetBulkSelectionState = useCallback((options?: { clearScopeSnapshot?: boolean }) => {
    const clearScopeSnapshot = options?.clearScopeSnapshot ?? true;
    setSelectedCandidateIds(new Set());
    if (clearScopeSnapshot) {
      delete selectionSnapshotByScopeRef.current[selectionScopeKey];
    }
  }, [selectionScopeKey]);

  function replaceQuery(next: Record<string, string | null | undefined>) {
    const baseQuery = typeof window !== "undefined" ? window.location.search : searchParams.toString();
    const currentParams = new URLSearchParams(baseQuery);
    const params = new URLSearchParams(baseQuery);
    for (const [k, v] of Object.entries(next)) {
      if (!v) params.delete(k);
      else params.set(k, v);
    }
    preserveAnalyticsDrilldownParams(params, currentParams);
    const suffix = params.toString();
    router.replace(suffix ? `/dashboard/candidates?${suffix}` : "/dashboard/candidates");
  }

  function setLinkedCandidateJob(candidateId: string, latestJob: CandidateJobSummary | null) {
    setJobsByCandidateId((prev) => {
      const next = new Map(prev);
      if (latestJob) next.set(candidateId, latestJob);
      else next.delete(candidateId);
      return next;
    });
  }

  async function refreshCreditsBalance() {
    try {
      setCreditsBalanceLoading(true);
      const res = await fetch("/api/credits/balance", { method: "GET" });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setCreditsBalance(null);
        return;
      }
      const available =
        json && typeof json === "object" && "available" in json && typeof (json as { available?: unknown }).available === "number"
          ? (json as { available: number }).available
          : null;
      if (typeof available === "number") {
        setCreditsBalance(available);
        return;
      }
      const balance =
        json && typeof json === "object" && "balance" in json && typeof (json as { balance?: unknown }).balance === "number"
          ? (json as { balance: number }).balance
          : null;
      setCreditsBalance(typeof balance === "number" ? balance : null);
    } catch {
      setCreditsBalance(null);
    } finally {
      setCreditsBalanceLoading(false);
    }
  }

  const loadHhStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/hh/status", { method: "GET", cache: "no-store" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json || typeof json !== "object") {
        setHhStatus((prev) => prev);
        return;
      }
      if (json.isConnected !== true) {
        setHhStatus({ isConnected: false });
        return;
      }
      const nextStatus: HhStatusDto = {
        isConnected: true,
        connectedAt: String(json.connectedAt ?? ""),
        lastSyncedAt: (json.lastSyncedAt ?? null) as string | null,
        syncStartedAt: (json.syncStartedAt ?? null) as string | null,
        syncLockExpiresAt: (json.syncLockExpiresAt ?? null) as string | null,
        lastSyncErrorAt: (json.lastSyncErrorAt ?? null) as string | null,
        hasLastSyncError: json.hasLastSyncError === true,
      };
      setHhStatus((prev) => {
        if (shouldScheduleCandidatesRefreshAfterHhStatus({
          previousStatus: prev,
          nextStatus,
          pageStartedAtMs: hhStatusStartedAtRef.current,
        })) {
          hhImportNeedsFinalRefreshRef.current = true;
          setHhImportFinalRefreshSignal((value) => value + 1);
        }
        return nextStatus;
      });
    } catch {
      setHhStatus((prev) => prev);
    }
  }, []);

  useEffect(() => {
    void loadHhStatus();
    const interval = setInterval(() => void loadHhStatus(), 30000);
    return () => clearInterval(interval);
  }, [loadHhStatus]);

  // Credits polling (SPA-like UX after top-up).
  useEffect(() => {
    void refreshCreditsBalance();

    const onFocus = () => void refreshCreditsBalance();
    window.addEventListener("focus", onFocus);

    const interval = setInterval(() => void refreshCreditsBalance(), 15000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(interval);
    };
  }, []);

  // Sync URL -> state (page/pageSize/filters/sort)
  useEffect(() => {
    const nextPage = clampInt(Number.parseInt(searchParams.get("page") ?? "1", 10), 1, 10_000);
    const nextPageSize = clampInt(Number.parseInt(searchParams.get("pageSize") ?? "25", 10), 1, 200);
    const nextVacancy = searchParams.get("vacancy") ?? "all";
    const nextScore = parseScoreFilter(searchParams.get("score")) ?? "all";
    const nextStatus = parseStatusFilter(searchParams.get("candidateStatus")) ?? "all";
    const nextNameQuery = limitCandidateNameSearchInput(searchParams.get("q"));
    const nextSort = parseSort(searchParams.get("sort")) ?? "date_desc";

    setPage((prev) => (prev === nextPage ? prev : nextPage));
    setPageSize((prev) => (prev === nextPageSize ? prev : nextPageSize));
    setFilterVacancy((prev) => (prev === nextVacancy ? prev : nextVacancy));
    setFilterScore((prev) => (prev === nextScore ? prev : nextScore));
    setFilterStatus((prev) => (prev === nextStatus ? prev : nextStatus));
    setNameQuery((prev) => (prev === nextNameQuery ? prev : nextNameQuery));
    setSort((prev) => (prev === nextSort ? prev : nextSort));
    setUrlSynced(true);
  }, [searchParams]);

  // Load vacancies (for filter dropdown) once.
  useEffect(() => {
    let mounted = true;
    const loadVacancies = async () => {
      try {
        const vacData = await listVacancies();
        if (mounted) setVacancies(vacData);
      } catch (e) {
        console.error("Failed to load vacancies:", e);
      } finally {
        if (mounted) setVacanciesLoaded(true);
      }
    };
    void loadVacancies();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void listInterviewers()
      .then((items) => {
        if (mounted) setInterviewerOptions(items);
      })
      .catch(() => {
        if (mounted) setInterviewerOptions([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  type LoadCandidatesResult = "loaded" | "failed" | "stale";

  async function loadCandidatesPage(opts?: {
    asInitial?: boolean;
    preserveOnError?: boolean;
    override?: Partial<{
      page: number;
      pageSize: number;
      vacancyId: string;
      scoreFilter: CandidatesScoreFilter;
      statusFilter: CandidatesStatusFilter;
      nameQuery: string;
      sort: CandidatesSort;
    }>;
  }): Promise<LoadCandidatesResult> {
    const asInitial = Boolean(opts?.asInitial);
    const preserveOnError = Boolean(opts?.preserveOnError);
    const qPage = opts?.override?.page ?? page;
    const qPageSize = opts?.override?.pageSize ?? pageSize;
    const qVacancy = opts?.override?.vacancyId ?? filterVacancy;
    const qScore = opts?.override?.scoreFilter ?? filterScore;
    const qStatus = opts?.override?.statusFilter ?? filterStatus;
    const qNameQuery = opts?.override?.nameQuery ?? nameQuery;
    const qSort = opts?.override?.sort ?? sort;

    const seq = (loadCandidatesSeqRef.current ?? 0) + 1;
    loadCandidatesSeqRef.current = seq;

    try {
      if (asInitial) setIsInitialLoading(true);
      else setIsPageLoading(true);

      const { items, total } = await listCandidatesPage({
        page: qPage,
        pageSize: qPageSize,
        vacancyId: qVacancy,
        scoreFilter: qScore,
        nameQuery: qNameQuery,
        sort: qSort,
        ...analyticsCandidateFilters,
        status: qStatus === "all" ? analyticsCandidateFilters.status : qStatus,
      });

      if (loadCandidatesSeqRef.current !== seq) return "stale";

      setCandidates(items);
      setTotalCandidates(total);

      const jobsMap = items.length > 0 ? await listLatestJobsByCandidateIds(items.map((c) => c.id)) : new Map();
      if (loadCandidatesSeqRef.current !== seq) return "stale";
      setJobsByCandidateId((prev) => {
        const next = new Map(jobsMap);
        const linkedJob = detailsCandidateId ? prev.get(detailsCandidateId) : undefined;
        if (detailsCandidateId && linkedJob && !next.has(detailsCandidateId)) next.set(detailsCandidateId, linkedJob);
        return next;
      });
      return "loaded";
    } catch (e) {
      if (loadCandidatesSeqRef.current !== seq) return "stale";
      console.error("Failed to load candidates:", e);
      if (!preserveOnError) {
        setCandidates([]);
        setTotalCandidates(0);
        setJobsByCandidateId(new Map());
      }
      return "failed";
    } finally {
      if (loadCandidatesSeqRef.current === seq) {
        if (asInitial) setIsInitialLoading(false);
        setIsPageLoading(false);
      }
    }
  }

  async function handleCandidateScheduleSubmit(input: InterviewFormSubmitInput) {
    try {
      setScheduleSubmitting(true);
      const result = await createInterview(input);
      setScheduleConflicts(result.conflicts);
      toast.success("Собеседование назначено");
      setScheduleOpen(false);
      setScheduleCandidate(null);
    } catch (error) {
      if (error instanceof InterviewConflictError) {
        setScheduleConflicts(error.conflicts);
        toast.warning("Есть пересечение по времени", {
          description: "Проверьте предупреждение и сохраните ещё раз, если всё верно.",
        });
        return;
      }
      toast.error("Не удалось назначить собеседование", {
        description: readInterviewMutationErrorDescription(error, "Проверьте данные и попробуйте ещё раз."),
      });
      return;
    } finally {
      setScheduleSubmitting(false);
    }

    const refreshResult = await loadCandidatesPage({ asInitial: false, preserveOnError: true });
    if (refreshResult === "failed") {
      toast.warning("Собеседование назначено", {
        description: "Обновите список кандидатов, чтобы увидеть свежие изменения.",
      });
    }
  }

  // Load current candidates page (server pagination)
  useEffect(() => {
    if (!urlSynced) return;
    const run = async () => {
      const asInitial = !didInitialLoadRef.current;
      didInitialLoadRef.current = true;
      await loadCandidatesPage({ asInitial });
    };
    void run();
    return () => {
      // noop
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSynced, page, pageSize, filterVacancy, filterScore, filterStatus, nameQuery, sort, analyticsCandidateFilters]);

  useEffect(() => {
    if (!urlSynced || isInitialLoading || !hhImportInProgress) return;
    const interval = setInterval(() => {
      void loadCandidatesPage({ asInitial: false, preserveOnError: true });
    }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSynced, isInitialLoading, hhImportInProgress, page, pageSize, filterVacancy, filterScore, filterStatus, nameQuery, sort, analyticsCandidateFilters]);

  useEffect(() => {
    if (shouldRefreshCandidatesAfterHhImport({
      pendingFinalRefresh: hhImportNeedsFinalRefreshRef.current,
      importInProgress: hhImportInProgress,
      urlSynced,
      isInitialLoading,
    })) {
      hhImportNeedsFinalRefreshRef.current = false;
      void loadCandidatesPage({ asInitial: false, preserveOnError: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hhImportInProgress, hhImportFinalRefreshSignal, urlSynced, isInitialLoading, page, pageSize, filterVacancy, filterScore, filterStatus, nameQuery, sort, analyticsCandidateFilters]);

  useEffect(() => {
    const shouldOpenAddCandidate = searchParams.get("add") === "1";
    if (!shouldOpenAddCandidate) return;

    setAddCandidateOpenSignal((current) => current + 1);

    const next = new URLSearchParams(searchParams.toString());
    next.delete("add");
    const suffix = next.toString();
    router.replace(suffix ? `/dashboard/candidates?${suffix}` : "/dashboard/candidates");
  }, [searchParams, router]);

  useEffect(() => {
    const linkedCandidateId = searchParams.get("candidate")?.trim() || null;
    if (!linkedCandidateId) {
      setDetailsOpen(false);
      setDetailsCandidateId(null);
      setLinkedDetailsCandidate(null);
      return;
    }

    setDetailsCandidateId(linkedCandidateId);
    setDetailsOpen(true);

    if (candidates.some((candidate) => candidate.id === linkedCandidateId)) {
      setLinkedDetailsCandidate(null);
      return;
    }
    if (linkedDetailsCandidateIdRef.current === linkedCandidateId) return;

    let cancelled = false;
    void getCandidateDetailsById(linkedCandidateId)
      .then(({ candidate, latestJob }) => {
        if (cancelled) return;
        if (!candidate) {
          setDetailsOpen(false);
          setDetailsCandidateId(null);
          setLinkedDetailsCandidate(null);
          setLinkedCandidateJob(linkedCandidateId, null);
          replaceQuery({ candidate: null });
          toast.error("Кандидат недоступен", {
            description: "Возможно, ссылка устарела или у вас нет доступа.",
          });
          return;
        }
        setLinkedDetailsCandidate(candidate);
        setLinkedCandidateJob(linkedCandidateId, latestJob);
      })
      .catch(() => {
        if (cancelled) return;
        setDetailsOpen(false);
        setDetailsCandidateId(null);
        setLinkedDetailsCandidate(null);
        setLinkedCandidateJob(linkedCandidateId, null);
        replaceQuery({ candidate: null });
        toast.error("Не удалось открыть кандидата", {
          description: "Обновите страницу и попробуйте ещё раз.",
        });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, candidates]);

  // Count "unscored" candidates in current scope across ALL pages.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setTotalUnscoredLoading(true);
        const { total } = await listCandidatesPage({
          page: 1,
          pageSize: 1,
          vacancyId: filterVacancy,
          scoreFilter: "unscored",
          nameQuery,
          ...analyticsCandidateFilters,
          status: filterStatus === "all" ? analyticsCandidateFilters.status : filterStatus,
        });
        if (!cancelled) setTotalUnscoredInScope(total);
      } catch {
        if (!cancelled) setTotalUnscoredInScope(0);
      } finally {
        if (!cancelled) setTotalUnscoredLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [filterVacancy, filterStatus, nameQuery, analyticsCandidateFilters]);

  // Initialize / reconcile comment drafts with candidates list.
  useEffect(() => {
    if (candidates.length === 0) return;
    setCommentByCandidateId((prev) => {
      const next: Record<string, CommentUiState> = { ...prev };
      for (const c of candidates) {
        const existing = next[c.id];
        const commentFromDb = c.comment ?? "";
        if (!existing) {
          next[c.id] = { draft: commentFromDb, dirty: false, open: false, saveState: "idle" };
          continue;
        }
        // If user is editing, don't overwrite draft with refetch results.
        if (!existing.dirty) {
          next[c.id] = { ...existing, draft: commentFromDb };
        }
      }
      return next;
    });
  }, [candidates]);

  const activeJobsCount = useMemo(() => {
    let n = 0;
    for (const j of jobsByCandidateId.values()) {
      if (j.status === "queued" || j.status === "processing") n++;
    }
    return n;
  }, [jobsByCandidateId]);

  const pendingFinalizeCount = useMemo(() => {
    let n = 0;
    for (const c of candidates) {
      if (c.matchPercentage !== null) continue;
      const j = jobsByCandidateId.get(c.id);
      if (j?.status === "done") n++;
    }
    return n;
  }, [candidates, jobsByCandidateId]);

  // Background refresh while there are active jobs (queued/processing).
  useEffect(() => {
    const watchedCandidateIds = Array.from(new Set([...candidates.map((c) => c.id), ...(detailsCandidateId ? [detailsCandidateId] : [])]));
    if (watchedCandidateIds.length === 0) return;
    if (activeJobsCount === 0 && pendingFinalizeCount === 0) return;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    const tick = async () => {
      try {
        setIsRefreshing(true);
        const jobsMap = await listLatestJobsByCandidateIds(watchedCandidateIds);
        if (cancelled) return;
        setJobsByCandidateId(jobsMap);

        const stillActive = Array.from(jobsMap.values()).some((j) => j.status === "queued" || j.status === "processing");
        const needsFinalizeRefresh = candidates.some((c) => c.matchPercentage === null && jobsMap.get(c.id)?.status === "done");
        const linkedCandidateDoneNeedsRefresh =
          Boolean(detailsCandidateId) && !candidates.some((c) => c.id === detailsCandidateId) && jobsMap.get(detailsCandidateId ?? "")?.status === "done";

        // Pull candidates while we're waiting for finalized scores to appear.
        if (needsFinalizeRefresh || (!stillActive && pendingFinalizeCount > 0)) {
          const { items, total } = await listCandidatesPage({
            page,
            pageSize,
            vacancyId: filterVacancy,
            scoreFilter: filterScore,
            nameQuery,
            sort,
            ...analyticsCandidateFilters,
            status: filterStatus === "all" ? analyticsCandidateFilters.status : filterStatus,
          });
          if (!cancelled) {
            setCandidates(items);
            setTotalCandidates(total);
          }
        }

        if (linkedCandidateDoneNeedsRefresh && detailsCandidateId) {
          const { candidate, latestJob } = await getCandidateDetailsById(detailsCandidateId);
          if (!cancelled && candidate) {
            setLinkedDetailsCandidate(candidate);
            setLinkedCandidateJob(detailsCandidateId, latestJob);
          }
        }

        // Stop polling only when nothing is active and nothing is waiting for finalize.
        const hasPendingFinalize = candidates.some((c) => c.matchPercentage === null && jobsMap.get(c.id)?.status === "done");
        if (!stillActive && !hasPendingFinalize) {
          if (interval) clearInterval(interval);
          interval = null;
        }
      } catch (e) {
        console.error("Failed to refresh jobs:", e);
      } finally {
        if (!cancelled) setIsRefreshing(false);
      }
    };

    interval = setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [candidates, detailsCandidateId, activeJobsCount, pendingFinalizeCount, page, pageSize, filterVacancy, filterScore, filterStatus, nameQuery, sort, analyticsCandidateFilters]);

  // Handle new candidates added
  const handleCandidatesAdded = async () => {
    const nextPage = 1;
    setPage(nextPage);
    replaceQuery({ page: String(nextPage) });
    setSelectMode(false);
    resetBulkSelectionState();
    setBulkMode("page");
    setBulkRequestedCount(1);
    await loadCandidatesPage({ asInitial: false, override: { page: nextPage } });
    notifyFirstAiOnboardingChanged();
  };

  async function persistComment(candidateId: string, comment: string) {
    const seq = (commentSaveSeqRef.current[candidateId] ?? 0) + 1;
    commentSaveSeqRef.current[candidateId] = seq;

    setCommentByCandidateId((prev) => ({
      ...prev,
      [candidateId]: {
        ...(prev[candidateId] ?? { draft: comment, dirty: true, open: true, saveState: "idle" }),
        saveState: "saving",
        error: undefined,
      },
    }));

    try {
      await updateCandidateComment(candidateId, comment);
      if (commentSaveSeqRef.current[candidateId] !== seq) return;

      // Keep candidate list in sync (for list preview, etc.).
      setCandidates((prev) => prev.map((c) => (c.id === candidateId ? { ...c, comment } : c)));
      setLinkedDetailsCandidate((prev) => (prev?.id === candidateId ? { ...prev, comment } : prev));

      setCommentByCandidateId((prev) => ({
        ...prev,
        [candidateId]: {
          ...(prev[candidateId] ?? { draft: comment, dirty: false, open: false, saveState: "idle" }),
          dirty: false,
          saveState: "saved",
          error: undefined,
        },
      }));

      // Fade "saved" state back to idle.
      setTimeout(() => {
        if (commentSaveSeqRef.current[candidateId] !== seq) return;
        setCommentByCandidateId((prev) => {
          const cur = prev[candidateId];
          if (!cur) return prev;
          if (cur.saveState !== "saved") return prev;
          return { ...prev, [candidateId]: { ...cur, saveState: "idle" } };
        });
      }, 1200);
    } catch (e) {
      if (commentSaveSeqRef.current[candidateId] !== seq) return;
      setCommentByCandidateId((prev) => ({
        ...prev,
        [candidateId]: {
          ...(prev[candidateId] ?? { draft: comment, dirty: true, open: true, saveState: "idle" }),
          saveState: "error",
          error: e instanceof Error ? e.message : "Ошибка сохранения",
        },
      }));
    }
  }

  function scheduleCommentSave(candidateId: string) {
    const existing = commentDebounceTimerRef.current[candidateId];
    if (existing) clearTimeout(existing);
    commentDebounceTimerRef.current[candidateId] = setTimeout(() => {
      const state = commentStateRef.current[candidateId];
      if (!state || !state.dirty) return;
      void persistComment(candidateId, state.draft);
    }, 800);
  }

  function flushCommentSave(candidateId: string) {
    const existing = commentDebounceTimerRef.current[candidateId];
    if (existing) clearTimeout(existing);
    const state = commentStateRef.current[candidateId];
    if (!state || !state.dirty) return;
    void persistComment(candidateId, state.draft);
  }

  const filteredCandidates = candidates;
  const candidateDisplayById = useMemo(() => {
    const byId = new Map<string, { name: string; position: string; desiredSalaryText: string | null }>();
    for (const c of candidates) {
      byId.set(c.id, {
        name: normalizeDisplayText(c.name),
        position: normalizeDisplayText(cleanupPosition(c.position)),
        desiredSalaryText: formatCandidateDesiredSalary(c),
      });
    }
    return byId;
  }, [candidates]);

  useEffect(() => {
    const prevScopeKey = prevSelectionScopeKeyRef.current;
    if (prevScopeKey === null) {
      prevSelectionScopeKeyRef.current = selectionScopeKey;
      return;
    }
    if (prevScopeKey === selectionScopeKey) return;

    delete selectionSnapshotByScopeRef.current[prevScopeKey];
    setSelectedCandidateIds(new Set());
    prevSelectionScopeKeyRef.current = selectionScopeKey;
  }, [selectionScopeKey]);

  useEffect(() => {
    // Selection mode only makes sense for the "unscored" list.
    if (filterScore !== "unscored" && selectMode) {
      setSelectMode(false);
      resetBulkSelectionState();
      setBulkMode("page");
      setBulkRequestedCount(1);
    }
  }, [filterScore, selectMode, resetBulkSelectionState]);

  const selectableCandidates = useMemo(() => {
    // When selecting for scoring, selection scope follows current filters.
    return filterScore === "unscored" ? filteredCandidates : [];
  }, [filteredCandidates, filterScore]);

  useEffect(() => {
    if (!selectMode || bulkMode !== "page") return;

    const snapshot = selectionSnapshotByScopeRef.current[selectionScopeKey] ?? [];
    const next = new Set(snapshot);
    setSelectedCandidateIds((prev) => (areIdSetsEqual(prev, next) ? prev : next));
  }, [selectMode, bulkMode, selectionScopeKey]);

  useEffect(() => {
    if (!selectMode || bulkMode !== "page") return;
    selectionSnapshotByScopeRef.current[selectionScopeKey] = Array.from(selectedCandidateIds);
  }, [selectMode, bulkMode, selectedCandidateIds, selectionScopeKey]);

  useEffect(() => {
    if (!selectMode || bulkMode !== "page" || selectedCandidateIds.size === 0) return;

    const visibleCandidateIds = new Set(candidates.map((c) => c.id));
    const visibleSelectableIds = new Set(selectableCandidates.map((c) => c.id));
    let changed = false;
    const next = new Set<string>();

    for (const id of selectedCandidateIds) {
      if (visibleCandidateIds.has(id) && !visibleSelectableIds.has(id)) {
        changed = true;
        continue;
      }
      next.add(id);
    }

    if (changed) {
      setSelectedCandidateIds(next);
    }
  }, [selectMode, bulkMode, selectedCandidateIds, candidates, selectableCandidates]);

  const selectedOnPageCount = useMemo(() => {
    if (selectedCandidateIds.size === 0) return 0;
    let n = 0;
    for (const c of selectableCandidates) {
      if (selectedCandidateIds.has(c.id)) n++;
    }
    return n;
  }, [selectableCandidates, selectedCandidateIds]);

  const scopeTotal = useMemo(() => {
    if (filterScore !== "unscored") return 0;
    return totalCandidates;
  }, [filterScore, totalCandidates]);

  const scopeMaxByCredits = useMemo(() => {
    if (scopeTotal <= 0) return 0;
    if (creditsBalance === null) return scopeTotal;
    return Math.max(0, Math.min(scopeTotal, creditsBalance));
  }, [scopeTotal, creditsBalance]);

  const scopeSubmitCount = useMemo(() => {
    if (scopeTotal <= 0) return 0;
    return clampInt(bulkRequestedCount, 1, scopeTotal);
  }, [bulkRequestedCount, scopeTotal]);

  useEffect(() => {
    if (scopeTotal <= 0) {
      if (bulkRequestedCount !== 1) setBulkRequestedCount(1);
      return;
    }
    const normalized = clampInt(bulkRequestedCount, 1, scopeTotal);
    if (normalized !== bulkRequestedCount) setBulkRequestedCount(normalized);
  }, [scopeTotal, bulkRequestedCount]);

  function toggleSelected(candidateId: string, next?: boolean) {
    setSelectedCandidateIds((prev) => {
      const s = new Set(prev);
      const shouldSelect = typeof next === "boolean" ? next : !s.has(candidateId);
      if (shouldSelect) s.add(candidateId);
      else s.delete(candidateId);
      return s;
    });
  }

  function selectAllVisible() {
    setSelectedCandidateIds((prev) => {
      const merged = new Set(prev);
      for (const c of selectableCandidates) merged.add(c.id);
      return merged;
    });
  }

  function clearSelection() {
    resetBulkSelectionState();
  }

  async function bulkStartScoring() {
    const pageIds = Array.from(selectedCandidateIds);
    const isScopeMode = bulkMode === "scope";
    const requestedScope = scopeSubmitCount;

    if (!isScopeMode && pageIds.length === 0) return;
    if (isScopeMode && requestedScope <= 0) return;

    if (creditsBalance !== null && creditsBalance <= 0) {
      toast.error("Недостаточно кредитов", {
        description: creditsBlockedHint,
      });
      return;
    }

    setIsBulkSubmitting(true);
    toast.loading(
      isScopeMode ? `Запускаю AI анализ по фильтрам: ${requestedScope}` : `Запускаю AI анализ: ${pageIds.length}`,
      { description: undefined, id: "bulk-ai" }
    );

    try {
      const result = await bulkStartCandidateAnalysis(
        isScopeMode
          ? {
              mode: "scope",
              filters: {
                vacancyId: filterVacancy,
                scoreFilter: "unscored",
                statusFilter: filterStatus,
                nameQuery,
                sort: sort === "date_asc" ? "date_asc" : "date_desc",
              },
              limit: requestedScope,
            }
          : {
              mode: "ids",
              candidateIds: pageIds,
              limit: pageIds.length,
            }
      );

      const jobsMap = await listLatestJobsByCandidateIds(candidates.map((c) => c.id));
      setJobsByCandidateId(jobsMap);
      await refreshCreditsBalance();

      const clampSuffix = result.clampedByCredits
        ? ` Ограничено кредитами: ${result.effectiveLimit} из ${result.requested}.`
        : "";
      const serverNote = result.message ? ` ${result.message}` : "";

      toast.success("Готово", {
        id: "bulk-ai",
        description: `Запущено: ${result.started}. Пропущено: ${result.skipped}. Ошибок: ${result.failed}.${clampSuffix}${serverNote}`,
      });

      setSelectMode(false);
      resetBulkSelectionState();
      setBulkMode("page");
      setBulkRequestedCount(1);
      notifyFirstAiOnboardingChanged();
    } catch (e) {
      toast.error("Не удалось запустить массовый анализ", {
        id: "bulk-ai",
        description: e instanceof Error ? e.message : "Попробуйте ещё раз",
      });
    } finally {
      setIsBulkSubmitting(false);
    }
  }

  async function handleRetry(candidateId: string) {
    if (retrySubmittingByCandidateId[candidateId]) return;
    try {
      // Guard: starting AI analysis requires credits.
      if (creditsBalance !== null && creditsBalance <= 0) {
        toast.error("Недостаточно кредитов", {
          id: `retry-${candidateId}`,
          description: creditsBlockedHint,
        });
        return;
      }
      setRetrySubmittingByCandidateId((prev) => ({ ...prev, [candidateId]: true }));
      toast.loading("Запускаю AI анализ…", { description: undefined, id: `retry-${candidateId}` });
      await retryCandidateAnalysis(candidateId);
      const jobsMap = await listLatestJobsByCandidateIds(Array.from(new Set([...candidates.map((c) => c.id), candidateId])));
      setJobsByCandidateId(jobsMap);

      const j = jobsMap.get(candidateId);
      if (j?.status === "failed" && isInsufficientCreditsError(j.lastError)) {
        toast.error("Недостаточно кредитов", {
          id: `retry-${candidateId}`,
          description: creditsBlockedHint,
        });
        return;
      }

      toast.success("AI анализ запущен", { description: undefined, id: `retry-${candidateId}` });
      notifyFirstAiOnboardingChanged();
    } catch (e) {
      toast.error("Не удалось запустить анализ", {
        id: `retry-${candidateId}`,
        description: e instanceof Error ? e.message : "Попробуйте ещё раз",
      });
    } finally {
      setRetrySubmittingByCandidateId((prev) => ({ ...prev, [candidateId]: false }));
    }
  }

  function isInsufficientCreditsError(text: string | null | undefined): boolean {
    const t = String(text ?? "").toLowerCase();
    if (!t) return false;
    return (
      t.includes("insufficient credits") ||
      (t.includes("insufficient") && t.includes("credit")) ||
      (t.includes("недостат") && t.includes("кредит")) ||
      t.includes("законч") && t.includes("кредит") ||
      t.includes("23514")
    );
  }

  const blockedByCreditsCount = useMemo(() => {
    let n = 0;
    for (const c of candidates) {
      const j = jobsByCandidateId.get(c.id);
      if (j?.status === "failed" && isInsufficientCreditsError(j.lastError)) n++;
    }
    return n;
  }, [candidates, jobsByCandidateId]);

  const creditsBlocked = creditsBalance !== null && creditsBalance <= 0;
  const pageBulkDisabled = isBulkSubmitting || creditsBlocked || selectedCandidateIds.size === 0;
  const scopeBulkDisabled = isBulkSubmitting || creditsBlocked || scopeTotal === 0 || scopeSubmitCount <= 0;
  const bulkSubmitDisabled = bulkMode === "scope" ? scopeBulkDisabled : pageBulkDisabled;

  const detailsCandidate = useMemo(() => {
    if (!detailsCandidateId) return null;
    return candidates.find((c) => c.id === detailsCandidateId) ?? (linkedDetailsCandidate?.id === detailsCandidateId ? linkedDetailsCandidate : null);
  }, [candidates, detailsCandidateId, linkedDetailsCandidate]);

  const detailsVacancy = useMemo(() => {
    if (!detailsCandidate) return undefined;
    return vacancies.find((v) => v.id === detailsCandidate.vacancyId);
  }, [detailsCandidate, vacancies]);
  const detailsDisplayText = useMemo(() => {
    if (!detailsCandidate) return null;
    return (
      candidateDisplayById.get(detailsCandidate.id) ?? {
        name: normalizeDisplayText(detailsCandidate.name),
        position: normalizeDisplayText(cleanupPosition(detailsCandidate.position)),
        desiredSalaryText: formatCandidateDesiredSalary(detailsCandidate),
      }
    );
  }, [detailsCandidate, candidateDisplayById]);

  function setDetailsOpenSafe(next: boolean) {
    setDetailsOpen(next);
    if (!next) {
      setDetailsCandidateId(null);
      setLinkedDetailsCandidate(null);
      replaceQuery({ candidate: null });
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

  function openDetails(candidate: Candidate, e?: MouseEvent<HTMLElement>) {
    if (selectMode) return;
    if (e && shouldIgnoreDetailsOpen(e)) return;
    setDetailsCandidateId(candidate.id);
    setLinkedDetailsCandidate(null);
    setDetailsOpen(true);
    replaceQuery({ candidate: candidate.id });
  }

  function openScheduleInterview(candidate: Candidate) {
    setScheduleCandidate(candidate);
    setScheduleConflicts([]);
    setScheduleOpen(true);
  }

  function startResumeDownload(url: string, fileName?: string | null) {
    const link = document.createElement("a");
    link.href = url;
    if (typeof fileName === "string" && fileName.trim()) {
      link.download = fileName.trim();
    }
    link.rel = "noopener noreferrer";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function handleOpenResume(candidate: Candidate) {
    if (candidate.source === "hh.ru" && candidate.hhruResumeId) {
      window.open(getHhResumeUrl(candidate.hhruResumeId), "_blank", "noopener,noreferrer");
      return;
    }

    if (!candidate.resumeUrl) {
      toast.message("Файл резюме не сохранён", {
        description: "Добавьте кандидата с включенной опцией «Сохранить файл резюме», чтобы потом скачать файл.",
      });
      return;
    }

    const url = candidate.resumeUrl;

    if (canOpenCandidateResume(candidate)) {
      try {
        toast.loading("Готовлю файл…", { description: undefined, id: `resume-${candidate.id}` });
        const res = await fetch("/api/candidates/resume-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateId: candidate.id }),
        });
        const json: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          const errMsg =
            json && typeof json === "object" && "error" in json && typeof (json as { error?: unknown }).error === "string"
              ? String((json as { error?: unknown }).error)
              : "Не удалось получить ссылку";
          throw new Error(errMsg);
        }
        const downloadUrl =
          json && typeof json === "object" && "downloadUrl" in json && typeof (json as { downloadUrl?: unknown }).downloadUrl === "string"
            ? String((json as { downloadUrl?: unknown }).downloadUrl)
            : getCandidateResumeDownloadUrl(candidate.id);
        const fileName =
          json && typeof json === "object" && "fileName" in json && typeof (json as { fileName?: unknown }).fileName === "string"
            ? String((json as { fileName?: unknown }).fileName)
            : undefined;
        if (!downloadUrl) throw new Error("Некорректный ответ сервера");

        startResumeDownload(downloadUrl, fileName);
        toast.success("Скачивание началось", { description: undefined, id: `resume-${candidate.id}` });
      } catch (e) {
        toast.error("Не удалось скачать резюме", {
          id: `resume-${candidate.id}`,
          description: e instanceof Error ? e.message : "Попробуйте ещё раз",
        });
      }
      return;
    }

    // Fallback
    toast.message("Формат ссылки не поддержан", {
      description: "Не удалось определить источник резюме.",
    });
  }

  const getMatchLabel = useMemo(() => (score: number | null) => {
    if (score === null) return "—";
    if (score >= 85) return "Отлично подходит";
    if (score >= 70) return "Хорошо подходит";
    if (score > 0) return "Низкое соответствие";
    return "—";
  }, []);

  const getMatchColor = useMemo(() => (score: number | null) => {
    if (score === null) return "text-muted-foreground";
    if (score >= 85) return "text-green-600";
    if (score >= 70) return "text-yellow-600";
    if (score > 0) return "text-red-600";
    return "text-muted-foreground";
  }, []);

  async function handleStatusChange(candidateId: string, nextStatus: Candidate["status"]) {
    // Guard: do not allow setting back to "new"
    if (nextStatus === "new") return;

    const current = candidates.find((c) => c.id === candidateId)?.status ?? (linkedDetailsCandidate?.id === candidateId ? linkedDetailsCandidate.status : null);
    if (!current || current === nextStatus) return;

    setStatusSavingByCandidateId((prev) => ({ ...prev, [candidateId]: true }));
    toast.loading("Обновляю статус…", { description: undefined, id: `status-${candidateId}` });

    try {
      await updateCandidateStatus(candidateId, nextStatus);
      setCandidates((prev) => prev.map((c) => (c.id === candidateId ? { ...c, status: nextStatus } : c)));
      setLinkedDetailsCandidate((prev) => (prev?.id === candidateId ? { ...prev, status: nextStatus } : prev));
      toast.success("Статус обновлён", { description: undefined, id: `status-${candidateId}` });
    } catch (e) {
      toast.error("Не удалось обновить статус", {
        id: `status-${candidateId}`,
        description: e instanceof Error ? e.message : "Попробуйте ещё раз",
      });
    } finally {
      setStatusSavingByCandidateId((prev) => ({ ...prev, [candidateId]: false }));
    }
  }

  function handleContactsChanged(candidateId: string, nextContacts: NonNullable<Candidate["contacts"]>) {
    setCandidates((prev) => prev.map((c) => (c.id === candidateId ? { ...c, contacts: nextContacts } : c)));
    setLinkedDetailsCandidate((prev) => (prev?.id === candidateId ? { ...prev, contacts: nextContacts } : prev));
  }

  function handleNameChanged(candidateId: string, nextName: string) {
    setCandidates((prev) => prev.map((c) => (c.id === candidateId ? { ...c, name: nextName } : c)));
    setLinkedDetailsCandidate((prev) => (prev?.id === candidateId ? { ...prev, name: nextName } : prev));
  }

  const matchTooltip = (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Как считается соответствие вакансии"
          >
            <Info className="h-4 w-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm">
          Обычно соответствие считаем по категориям AI: навыки 35%, опыт 35%, образование 10%, достижения 10%, cultural fit 10%.
          Если категория "Образование" помечена как не учитываемая, она не влияет на итог, а остальные веса нормализуются.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(totalCandidates / pageSize));
  }, [totalCandidates, pageSize]);
  const hasAnalyticsDrilldownContext = Boolean(
    analyticsDrilldown.analyticsPeriodStart ||
      analyticsDrilldown.analyticsPeriodEnd ||
      analyticsDrilldown.analyticsSource ||
      analyticsDrilldown.analyticsStatus ||
      analyticsDrilldown.analyticsScoreThreshold ||
      analyticsDrilldown.analyticsReturnTo
  );
  const isListTransitionLoading = !isInitialLoading && isPageLoading;
  const normalizedNameQuery = normalizeCandidateNameSearch(nameQuery);
  const hasActiveFilters =
    filterVacancy !== "all" || filterScore !== "all" || filterStatus !== "all" || sort !== "date_desc" || normalizedNameQuery !== "";
  const activeFiltersCount =
    Number(filterVacancy !== "all") +
    Number(filterScore !== "all") +
    Number(filterStatus !== "all") +
    Number(sort !== "date_desc") +
    Number(normalizedNameQuery !== "");
  const hasVacancies = vacancies.length > 0;
  const showNoVacanciesState = vacanciesLoaded && !hasVacancies;
  const showCandidatesEmptyState = !isListTransitionLoading && filteredCandidates.length === 0 && totalCandidates === 0;

  // Canonicalize invalid/out-of-range page in URL after data is loaded.
  useEffect(() => {
    if (!urlSynced || isInitialLoading || isPageLoading) return;
    const normalized = clampInt(page, 1, totalPages);
    if (normalized === page) return;
    setPage(normalized);
    replaceQuery({ page: String(normalized) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSynced, isInitialLoading, isPageLoading, page, totalPages]);

  function goToPage(nextPage: number) {
    const clamped = clampInt(nextPage, 1, totalPages);
    if (clamped === page) return;
    setPage(clamped);
    replaceQuery({ page: String(clamped) });
  }

  function resetListSelectionForFilterChange() {
    setPage(1);
    setSelectMode(false);
    resetBulkSelectionState();
    setBulkMode("page");
    setBulkRequestedCount(1);
  }

  function applyVacancyFilter(nextVacancy: string) {
    setFilterVacancy(nextVacancy);
    resetListSelectionForFilterChange();
    replaceQuery({ vacancy: nextVacancy, page: "1" });
  }

  function applyScoreFilter(nextScore: CandidatesScoreFilter) {
    const safeScore = parseScoreFilter(nextScore) ?? "all";
    setFilterScore(safeScore);
    resetListSelectionForFilterChange();
    replaceQuery({ score: safeScore, page: "1" });
  }

  function applyStatusFilter(nextStatus: CandidatesStatusFilter) {
    const safeStatus = parseStatusFilter(nextStatus) ?? "all";
    setFilterStatus(safeStatus);
    resetListSelectionForFilterChange();
    replaceQuery({ candidateStatus: safeStatus === "all" ? null : safeStatus, page: "1" });
  }

  function applyNameSearch(nextNameQuery: string) {
    const safeNameQuery = limitCandidateNameSearchInput(nextNameQuery);
    const effectiveNameQuery = normalizeCandidateNameSearch(safeNameQuery);
    setNameQuery(safeNameQuery);
    resetListSelectionForFilterChange();
    replaceQuery({ q: effectiveNameQuery ? safeNameQuery : null, page: "1" });
  }

  function applySort(nextSort: CandidatesSort) {
    const safeSort = parseSort(nextSort) ?? "date_desc";
    setSort(safeSort);
    resetListSelectionForFilterChange();
    replaceQuery({ sort: safeSort === "date_desc" ? null : safeSort, page: "1" });
  }

  function resetAllFilters() {
    setFilterVacancy("all");
    setFilterScore("all");
    setFilterStatus("all");
    setNameQuery("");
    setSort("date_desc");
    resetListSelectionForFilterChange();
    replaceQuery({ vacancy: null, score: null, candidateStatus: null, q: null, sort: null, page: "1" });
  }

  return isInitialLoading ? (
    <CandidatesInitialSkeleton />
  ) : (
    <div className="flex flex-col gap-4" aria-busy={isListTransitionLoading}>
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Кандидаты</h1>
        <AddCandidateDialog vacancies={vacancies} onCandidatesAdded={handleCandidatesAdded} openSignal={addCandidateOpenSignal} />
      </div>

      {hasAnalyticsDrilldownContext ? (
        <Alert>
          <Info className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Сохранён контекст аналитики</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="min-w-0 break-words">
              Период {analyticsDrilldown.analyticsPeriodStart ?? "не выбран"} — {analyticsDrilldown.analyticsPeriodEnd ?? "не выбран"}
              {analyticsDrilldown.analyticsSource ? `, источник: ${analyticsDrilldown.analyticsSource}` : ""}
              {analyticsDrilldown.analyticsStatus ? `, этап: ${analyticsDrilldown.analyticsStatus}` : ""}
              {analyticsDrilldown.analyticsScoreBucket === "unscored"
                ? ", без AI-score"
                : analyticsDrilldown.analyticsScoreMin !== null || analyticsDrilldown.analyticsScoreMax !== null
                  ? `, AI-score ${analyticsDrilldown.analyticsScoreMin ?? 0}-${analyticsDrilldown.analyticsScoreMax ?? 100}`
                  : analyticsDrilldown.analyticsScoreThreshold !== null
                    ? `, AI-score от ${analyticsDrilldown.analyticsScoreThreshold}`
                    : ""}
              .
            </span>
            {analyticsDrilldown.analyticsReturnTo ? (
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link href={analyticsDrilldown.analyticsReturnTo}>Вернуться в аналитику</Link>
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <FirstAiContextualOnboardingHint surface="candidates" />

      {hhImportInProgress ? (
        <Alert>
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
          <AlertTitle>Загружаем отклики из HH.ru</AlertTitle>
          <AlertDescription className="text-sm">
            Большие аккаунты могут синхронизироваться до 15 минут. Кандидаты появятся автоматически, страницу можно не обновлять.
          </AlertDescription>
        </Alert>
      ) : hhImportFailed ? (
        <Alert variant="destructive">
          <AlertTitle>HH.ru не удалось загрузить отклики</AlertTitle>
          <AlertDescription className="text-sm">
            Попробуйте запустить синхронизацию вручную в настройках. Если ошибка повторится, переподключите HH.ru.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <CandidatesFiltersBar
          filterVacancy={filterVacancy}
          filterScore={filterScore}
          filterStatus={filterStatus}
          statusLabels={CANDIDATE_STATUS_LABELS}
          nameQuery={nameQuery}
          sort={sort}
          vacancies={vacancies}
          isMobile={isMobileDetails}
          hasActiveFilters={hasActiveFilters}
          activeFiltersCount={activeFiltersCount}
          onVacancyChange={applyVacancyFilter}
          onScoreChange={applyScoreFilter}
          onStatusChange={applyStatusFilter}
          onNameQueryChange={applyNameSearch}
          onSortChange={applySort}
          onReset={resetAllFilters}
        />

        <div className="flex gap-2" role="group" aria-label="Переключение вида отображения">
          <Button
            variant={viewMode === "grid" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("grid")}
            aria-pressed={viewMode === "grid"}
            aria-label="Переключить на вид сетки"
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("list")}
            aria-pressed={viewMode === "list"}
            aria-label="Переключить на вид списка"
          >
            <LayoutList className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Compact info bar */}
      {!selectMode ? (
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between py-2 px-4 rounded-lg bg-muted/30 border border-border/40">
          <div className="flex items-center gap-4 flex-wrap text-sm">
            {isListTransitionLoading ? (
              <span className="text-xs text-muted-foreground animate-pulse">Загрузка списка…</span>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Показано:</span>
                  <Badge variant="secondary" className="font-semibold">
                    {filteredCandidates.length}
                  </Badge>
                  <span className="text-muted-foreground/60">из</span>
                  <Badge variant="secondary" className="font-semibold">
                    {totalCandidates}
                  </Badge>
                </div>
                {filterScore !== "unscored" && totalUnscoredInScope > 0 && (
                  <>
                    <span className="text-muted-foreground/40">•</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">Не оценено:</span>
                      <Badge variant="secondary" className="font-semibold">
                        {totalUnscoredLoading ? "…" : totalUnscoredInScope}
                      </Badge>
                    </div>
                  </>
                )}
                {isRefreshing && (
                  <>
                    <span className="text-muted-foreground/40">•</span>
                    <span className="text-xs text-muted-foreground animate-pulse">Обновляем AI…</span>
                  </>
                )}
              </>
            )}
          </div>
          {totalUnscoredInScope > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFilterScore("unscored");
                setPage(1);
                replaceQuery({ score: "unscored", page: "1" });
                setSelectMode(true);
                setBulkMode("page");
                const maxFromCredits = creditsBalance === null ? totalUnscoredInScope : Math.min(totalUnscoredInScope, creditsBalance);
                const initial = Math.max(1, maxFromCredits);
                setBulkRequestedCount(initial);
              }}
              className="gap-2"
            >
              <Brain className="h-4 w-4" />
              Оценить ИИ
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 py-2 px-4 rounded-lg bg-primary/5 border border-primary/20">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={bulkMode === "page" ? "default" : "outline"}
              size="sm"
              onClick={() => setBulkMode("page")}
            >
              На странице
            </Button>
            <Button
              type="button"
              variant={bulkMode === "scope" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setBulkMode("scope");
                const initial = Math.max(1, scopeMaxByCredits > 0 ? scopeMaxByCredits : scopeTotal || 1);
                setBulkRequestedCount(initial);
              }}
            >
              По фильтрам
            </Button>
          </div>

          {bulkMode === "page" ? (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm">
                <span className="text-muted-foreground">Выбрано:</span>
                <Badge variant="default" className="font-semibold">
                  {selectedCandidateIds.size}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <span className="text-muted-foreground">на странице:</span>
                <Badge variant="secondary" className="font-semibold">
                  {selectedOnPageCount}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                Выбор сохраняется при переходе между страницами
              </div>
              <Button type="button" variant="outline" size="sm" onClick={selectAllVisible} disabled={selectableCandidates.length === 0}>
                Выбрать все
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={clearSelection} disabled={selectedCandidateIds.size === 0}>
                Снять
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Найдено в скоупе:</span>
                  <Badge variant="secondary" className="font-semibold">
                    {scopeTotal}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Доступно кредитов:</span>
                  <Badge variant="secondary" className="font-semibold">
                    {creditsBalance === null ? "—" : scopeMaxByCredits}
                  </Badge>
                </div>
              </div>

              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1">
                  <Slider
                    value={[scopeSubmitCount > 0 ? scopeSubmitCount : 1]}
                    min={1}
                    max={Math.max(1, scopeTotal)}
                    step={1}
                    onValueChange={(v) => setBulkRequestedCount(clampInt(v[0] ?? 1, 1, Math.max(1, scopeTotal)))}
                    disabled={scopeTotal <= 0 || isBulkSubmitting}
                    aria-label="Количество кандидатов для AI анализа"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={Math.max(1, scopeTotal)}
                    value={scopeSubmitCount > 0 ? String(scopeSubmitCount) : "1"}
                    onChange={(e) => {
                      const next = Number.parseInt(e.target.value, 10);
                      if (!Number.isFinite(next)) return;
                      setBulkRequestedCount(clampInt(next, 1, Math.max(1, scopeTotal)));
                    }}
                    disabled={scopeTotal <= 0 || isBulkSubmitting}
                    className="w-28"
                    aria-label="Точное количество кандидатов для AI анализа"
                  />
                  <span className="text-xs text-muted-foreground">из {scopeTotal}</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 self-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectMode(false);
                resetBulkSelectionState();
                setBulkMode("page");
                setBulkRequestedCount(1);
              }}
              disabled={isBulkSubmitting}
            >
              Отмена
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void bulkStartScoring()}
                      disabled={bulkSubmitDisabled}
                      className="gap-2"
                    >
                      <Brain className="h-4 w-4" />
                      {isBulkSubmitting ? "Запускаем…" : "Оценить"}
                    </Button>
                  </span>
                </TooltipTrigger>
                {creditsBlocked ? (
                  <TooltipContent side="top" className="max-w-sm">
                    Недостаточно кредитов для AI анализа. {creditsBlockedHint}
                  </TooltipContent>
                ) : bulkMode === "page" && selectedCandidateIds.size === 0 ? (
                  <TooltipContent side="top" className="max-w-sm">
                    Выберите хотя бы одного кандидата или переключитесь на режим «по фильтрам».
                  </TooltipContent>
                ) : bulkMode === "scope" && scopeTotal === 0 ? (
                  <TooltipContent side="top" className="max-w-sm">
                    В текущих фильтрах нет кандидатов для массового запуска.
                  </TooltipContent>
                ) : null}
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}

      {/* Single billing/credits CTA (page-level, not per card) */}
      {blockedByCreditsCount > 0 ? (
        <Alert>
          <AlertTitle>
            {creditsBalanceLoading
              ? "Проверяем баланс…"
              : creditsBalance !== null && creditsBalance <= 0
                ? "Кредиты закончились"
                : "Есть кандидаты, ожидающие повторного анализа"}
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-muted-foreground">
              {creditsBalance !== null && creditsBalance <= 0
                ? `AI анализ недоступен для ${blockedByCreditsCount} кандидатов. ${creditsBlockedHint}`
                : `Для ${blockedByCreditsCount} кандидатов анализ был остановлен из‑за нехватки кредитов. После пополнения нажмите «Повторить».`}
            </div>
            {creditsBalance !== null && creditsBalance <= 0 && isCompanyAdmin ? (
              <Button asChild className="w-full sm:w-auto">
                <Link href="/dashboard/settings?tab=plan">Перейти к тарифу</Link>
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {showCandidatesEmptyState ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {hasVacancies
                ? normalizedNameQuery
                  ? "По этому ФИО кандидаты не найдены"
                  : hasActiveFilters
                  ? "По выбранным фильтрам кандидаты не найдены"
                  : "Пока нет кандидатов"
                : showNoVacanciesState
                  ? "Сначала создайте вакансию"
                  : "Пока нет кандидатов"}
            </CardTitle>
            <CardDescription>
              {hasVacancies
                ? normalizedNameQuery
                  ? "Измените запрос, сбросьте поиск или добавьте нового кандидата."
                  : hasActiveFilters
                  ? "Сбросьте фильтры или добавьте новых кандидатов."
                  : "Добавьте первого кандидата — загрузите резюме или вставьте описание вручную."
                : showNoVacanciesState
                  ? "Кандидаты привязываются к вакансии. Создайте вакансию (можно в статусе «Черновик»), затем добавьте кандидатов."
                  : "Добавьте первого кандидата — загрузите резюме или вставьте описание вручную."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {showNoVacanciesState ? (
              <Alert>
                <AlertTitle>Совет</AlertTitle>
                <AlertDescription>
                  Для быстрого старта достаточно создать одну вакансию в статусе <strong>Черновик</strong> или{" "}
                  <strong>Активна</strong>.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              {showNoVacanciesState ? (
                <Button asChild className="w-full sm:w-auto">
                  <Link href="/dashboard/vacancies?create=1">
                    <Plus className="mr-2 h-4 w-4" />
                    Создать первую вакансию
                  </Link>
                </Button>
              ) : (
                <AddCandidateDialog
                  vacancies={vacancies}
                  onCandidatesAdded={handleCandidatesAdded}
                  trigger={
                    <Button className="w-full sm:w-auto">
                      <Plus className="mr-2 h-4 w-4" />
                      Добавить первого кандидата
                    </Button>
                  }
                />
              )}

              {hasActiveFilters ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={resetAllFilters}
                >
                  Сбросить фильтры
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Grid View */}
      {!showCandidatesEmptyState && viewMode === "grid" && (
        isListTransitionLoading ? (
          <CandidatesGridPageSkeleton count={Math.min(pageSize, 12)} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {filteredCandidates.map((candidate) => {
              const displayText = candidateDisplayById.get(candidate.id);
              const displayName = displayText?.name ?? candidate.name;
              const displayPosition = displayText?.position ?? cleanupPosition(candidate.position);
              const desiredSalaryText = displayText?.desiredSalaryText ?? formatCandidateDesiredSalary(candidate);
              const vacancy = vacancies.find((v) => v.id === candidate.vacancyId);
              const job = jobsByCandidateId.get(candidate.id);
              const jobStatus = job?.status;
              const failedAnalysis = jobStatus === "failed";
              const isCreditsError = failedAnalysis && isInsufficientCreditsError(job?.lastError);
              const isFinalizing = jobStatus === "done" && candidate.matchPercentage === null;
              const isActiveJob = jobStatus === "queued" || jobStatus === "processing" || isFinalizing;
              const neverAnalyzed = candidate.matchPercentage === null && !isActiveJob && !failedAnalysis;
              const commentUi = commentByCandidateId[candidate.id];
              const commentPreview = (candidate.comment ?? "").trim();
              const email = getFirstContactValue(candidate, "email");
              const phone = getFirstContactValue(candidate, "phone");
              const canOpenResume = canOpenCandidateResume(candidate);
              const resumeDisabledTooltip = getResumeDisabledTooltip(candidate);

              return (
                <Card
                  key={candidate.id}
                  className="min-w-0 flex flex-col hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={(e) => openDetails(candidate, e)}
                >
                  <CardHeader className="min-w-0 pb-3">
                    <div className="flex min-w-0 items-start gap-4">
                      {selectMode && bulkMode === "page" ? (
                        <div className="pt-1">
                          <Checkbox
                            checked={selectedCandidateIds.has(candidate.id)}
                            onCheckedChange={(v) => toggleSelected(candidate.id, Boolean(v))}
                            aria-label={`Выбрать кандидата ${candidate.name}`}
                          />
                        </div>
                      ) : null}
                      <Avatar className="h-12 w-12 shrink-0">
                        <AvatarImage src={candidate.avatar} alt={candidate.name} />
                        <AvatarFallback>
                          {candidate.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-2">
                          <div className="min-w-0 flex-1 basis-40">
                            <CardTitle className="truncate text-lg" title={displayName}>
                              {displayName}
                            </CardTitle>
                            <CardDescription className="truncate" title={displayPosition}>
                              {displayPosition}
                            </CardDescription>
                            {desiredSalaryText ? (
                              <p className="mt-1 truncate text-xs text-muted-foreground" title={desiredSalaryText}>
                                Желаемая зарплата: {desiredSalaryText}
                              </p>
                            ) : null}
                          </div>
                          <div className="ml-auto min-w-0 max-w-full">
                            <CandidateStatusControl
                              candidateId={candidate.id}
                              status={candidate.status}
                              disabled={Boolean(statusSavingByCandidateId[candidate.id])}
                              onChange={handleStatusChange}
                              compact
                            />
                          </div>
                        </div>
                        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <span className="min-w-0 flex-1 truncate font-medium text-foreground/80" title={vacancy?.title}>
                            {vacancy?.title}
                          </span>
                          <span className="shrink-0 whitespace-nowrap">
                            {formatDistanceToNow(candidate.appliedAt, {
                              addSuffix: true,
                              locale: ru,
                            })}
                          </span>
                          {candidate.source === "hh.ru" ? (
                            <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px] font-semibold">
                              HH.ru
                            </Badge>
                          ) : null}
                        </div>
                        {isCompanyAdmin ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Создал:{" "}
                            <span className="text-foreground/80">
                              {(() => {
                                const owner = ownersById.get(candidate.createdById);
                                if (owner?.id && owner.id === user?.id) return "Вы";
                                return owner?.name || owner?.email || candidate.createdById;
                              })()}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="min-w-0 flex flex-1 flex-col gap-3">
                  {/* Vacancy match (single primary metric) */}
                  <div className="rounded-lg bg-muted/30 border border-border/40 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Brain className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Соответствие</span>
                        {matchTooltip}
                      </div>
                      {neverAnalyzed ? (
                        <Badge variant="secondary" className="text-xs">
                          {creditsBlocked ? "Нет кредитов" : "Нет анализа"}
                        </Badge>
                      ) : failedAnalysis ? (
                        <Badge variant="destructive" className="text-xs">
                          Ошибка
                        </Badge>
                      ) : jobStatus === "queued" || jobStatus === "processing" ? (
                        <Badge variant="secondary" className="text-xs">
                          {jobStatus === "queued" ? "В очереди" : "Анализ…"}
                        </Badge>
                      ) : isFinalizing ? (
                        <Badge variant="secondary" className="text-xs">
                          Финализация…
                        </Badge>
                      ) : (
                        <div className="flex items-baseline gap-1.5">
                          <span className={`text-2xl font-bold ${getMatchColor(candidate.matchPercentage)}`}>
                            {candidate.matchPercentage === null ? "—" : `${candidate.matchPercentage}%`}
                          </span>
                        </div>
                      )}
                    </div>
                    {isActiveJob ? (
                      <Skeleton className="h-2 w-full" />
                    ) : neverAnalyzed || failedAnalysis ? null : (
                      <Progress value={candidate.matchPercentage ?? 0} className="h-2" />
                    )}
                    {neverAnalyzed ? (
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <p className="text-xs text-muted-foreground">
                          {creditsBlocked ? creditsBlockedHint : "Можно запустить AI анализ"}
                        </p>
                        {creditsBlocked ? (
                          isCompanyAdmin ? (
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Link href="/dashboard/settings?tab=plan">Тариф</Link>
                            </Button>
                          ) : null
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleRetry(candidate.id);
                            }}
                            disabled={Boolean(retrySubmittingByCandidateId[candidate.id])}
                          >
                            {retrySubmittingByCandidateId[candidate.id] ? "Запускаю…" : "Запустить AI анализ"}
                          </Button>
                        )}
                      </div>
                    ) : failedAnalysis ? (
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <p className="text-xs text-muted-foreground">
                          {isCreditsError
                            ? creditsBlocked
                              ? creditsBlockedHint
                              : "Можно повторить анализ"
                            : "AI анализ завершился ошибкой"}
                        </p>
                        {isCreditsError && creditsBlocked ? (
                          isCompanyAdmin ? (
                            <Button
                              asChild
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Link href="/dashboard/settings?tab=plan">Тариф</Link>
                            </Button>
                          ) : null
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleRetry(candidate.id);
                            }}
                            disabled={Boolean(retrySubmittingByCandidateId[candidate.id])}
                          >
                            {retrySubmittingByCandidateId[candidate.id] ? "Запускаю…" : "Повторить"}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {jobStatus === "queued" || jobStatus === "processing"
                          ? "AI анализ в процессе"
                          : isFinalizing
                            ? "Финализируем…"
                            : getMatchLabel(candidate.matchPercentage)}
                      </p>
                    )}
                  </div>

                  {/* Contact Info - single line */}
                  {(email || phone) && (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {email && (
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3 w-3" />
                          <span className="truncate max-w-[140px]">{email}</span>
                        </div>
                      )}
                      {email && phone && (
                        <span className="text-muted-foreground/40">·</span>
                      )}
                      {phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3" />
                          <span>{phone}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Comment (draft + autosave) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <MessageSquare className="h-3 w-3 text-muted-foreground" />
                        <span>Заметка</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() =>
                          setCommentByCandidateId((prev) => {
                            const cur = prev[candidate.id] ?? { draft: candidate.comment ?? "", dirty: false, open: false, saveState: "idle" as const };
                            return { ...prev, [candidate.id]: { ...cur, open: !cur.open } };
                          })
                        }
                      >
                        {commentUi?.open ? "Скрыть" : commentPreview ? "Редактировать" : "Добавить"}
                      </Button>
                    </div>

                    {!commentUi?.open ? (
                      <div className="text-xs text-muted-foreground">
                        {commentPreview ? <span className="line-clamp-2">{commentPreview}</span> : <span>Нет заметки</span>}
                      </div>
                    ) : (
                      <>
                        <Textarea
                          placeholder="Добавьте заметку о кандидате…"
                          value={commentUi?.draft ?? candidate.comment ?? ""}
                          onChange={(e) => {
                            const next = e.target.value;
                            setCommentByCandidateId((prev) => ({
                              ...prev,
                              [candidate.id]: {
                                ...(prev[candidate.id] ?? { draft: "", dirty: false, open: true, saveState: "idle" }),
                                draft: next,
                                dirty: true,
                                open: true,
                                // Keep last save state unless it's a previous success marker.
                                saveState: prev[candidate.id]?.saveState === "saved" ? "idle" : (prev[candidate.id]?.saveState ?? "idle"),
                              },
                            }));
                            scheduleCommentSave(candidate.id);
                          }}
                          onBlur={() => flushCommentSave(candidate.id)}
                          className="min-h-[72px] text-sm resize-none"
                          maxLength={500}
                        />
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">
                            {commentUi?.saveState === "saving"
                              ? "Сохраняем…"
                              : commentUi?.saveState === "saved"
                                ? "Сохранено"
                                : commentUi?.saveState === "error"
                                  ? "Ошибка сохранения"
                                  : " "}
                          </p>
                          <p className="text-xs text-muted-foreground text-right">
                            {(commentUi?.draft ?? candidate.comment ?? "").length} / 500
                          </p>
                        </div>
                        {commentUi?.saveState === "error" ? (
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground line-clamp-1" title={commentUi.error}>
                              {commentUi.error}
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => void persistComment(candidate.id, (commentStateRef.current[candidate.id]?.draft ?? ""))}
                            >
                              Повторить
                            </Button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-auto pt-4 border-t">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          {canOpenResume ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => void handleOpenResume(candidate)}
                            >
                              <FileText className="mr-2 h-3 w-3" />
                              Резюме
                            </Button>
                          ) : (
                            <span className="flex-1">
                              <Button variant="outline" size="sm" className="w-full" disabled>
                                <FileText className="mr-2 h-3 w-3" />
                                Резюме
                              </Button>
                            </span>
                          )}
                        </TooltipTrigger>
                        {!canOpenResume ? (
                          <TooltipContent side="top" className="max-w-sm">
                            {resumeDisabledTooltip}
                          </TooltipContent>
                        ) : null}
                      </Tooltip>
                    </TooltipProvider>
                    <Button type="button" size="sm" className="flex-1" onClick={() => openScheduleInterview(candidate)}>
                      <Calendar className="mr-2 h-3 w-3" />
                      Назначить
                    </Button>
                  </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}

      {/* List View */}
      {!showCandidatesEmptyState && viewMode === "list" && (
        isListTransitionLoading ? (
          <CandidatesListPageSkeleton count={Math.min(pageSize, 12)} />
        ) : (
          <div className="space-y-3">
            {filteredCandidates.map((candidate) => {
            const displayText = candidateDisplayById.get(candidate.id);
            const displayName = displayText?.name ?? candidate.name;
            const displayPosition = displayText?.position ?? cleanupPosition(candidate.position);
            const desiredSalaryText = displayText?.desiredSalaryText ?? formatCandidateDesiredSalary(candidate);
            const vacancy = vacancies.find((v) => v.id === candidate.vacancyId);
            const job = jobsByCandidateId.get(candidate.id);
            const jobStatus = job?.status;
            const commentUi = commentByCandidateId[candidate.id];
            const commentPreview = (candidate.comment ?? "").trim();
            const email = getFirstContactValue(candidate, "email");
            const phone = getFirstContactValue(candidate, "phone");
            const hasCompactContacts = Boolean(email || phone);
            const canOpenResume = canOpenCandidateResume(candidate);
            const resumeDisabledTooltip = getResumeDisabledTooltip(candidate);
            
            return (
              <Card
                key={candidate.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={(e) => openDetails(candidate, e)}
              >
                <CardContent className="p-5">
                  <div className="flex flex-col gap-3">
                    {/* Main row */}
                    <div className="flex items-start gap-5">
                      {selectMode && bulkMode === "page" ? (
                        <div className="self-start pt-1">
                          <Checkbox
                            checked={selectedCandidateIds.has(candidate.id)}
                            onCheckedChange={(v) => toggleSelected(candidate.id, Boolean(v))}
                            aria-label={`Выбрать кандидата ${candidate.name}`}
                          />
                        </div>
                      ) : null}
                      <Avatar className="h-12 w-12 flex-shrink-0">
                        <AvatarImage src={candidate.avatar} alt={candidate.name} />
                        <AvatarFallback>
                          {candidate.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1 grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-6">
                        <div className="min-w-0 xl:col-span-2 2xl:col-span-2">
                          <div className="flex min-w-0 flex-wrap items-start gap-2">
                            <h3 className="min-w-0 flex-1 basis-0 font-semibold truncate" title={displayName}>{displayName}</h3>
                            <div className="ml-auto max-w-full">
                              <CandidateStatusControl
                                candidateId={candidate.id}
                                status={candidate.status}
                                disabled={Boolean(statusSavingByCandidateId[candidate.id])}
                                onChange={handleStatusChange}
                              />
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground truncate" title={displayPosition}>{displayPosition}</p>
                          {desiredSalaryText ? (
                            <p className="mt-1 text-xs text-muted-foreground truncate" title={desiredSalaryText}>
                              Желаемая зарплата: {desiredSalaryText}
                            </p>
                          ) : null}
                          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span className="min-w-0 flex-1 basis-48 truncate font-medium text-foreground/80" title={vacancy?.title}>
                              {vacancy?.title}
                            </span>
                            <span className="shrink-0 whitespace-nowrap">
                              {formatDistanceToNow(candidate.appliedAt, {
                                addSuffix: true,
                                locale: ru,
                              })}
                            </span>
                            {isCompanyAdmin ? (
                              <span className="min-w-0 truncate">
                                Создал:{" "}
                                <span className="text-foreground/80">
                                  {(() => {
                                    const owner = ownersById.get(candidate.createdById);
                                    if (owner?.id && owner.id === user?.id) return "Вы";
                                    return owner?.name || owner?.email || candidate.createdById;
                                  })()}
                                </span>
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="min-w-0 rounded-lg border border-border/40 bg-muted/30 px-3 py-2 xl:col-span-1 2xl:col-span-2">
                          <div className="flex min-w-0 items-center gap-2">
                          <Brain className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          {matchTooltip}
                          <div className="min-w-0">
                            {jobStatus === "failed" ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-muted-foreground">
                                  {creditsBlocked ? "Нет кредитов" : "Ошибка"}
                                </span>
                                {creditsBlocked ? (
                                  isCompanyAdmin ? (
                                    <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                                      <Link href="/dashboard/settings?tab=plan">Тариф</Link>
                                    </Button>
                                  ) : null
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    onClick={() => void handleRetry(candidate.id)}
                                    disabled={Boolean(retrySubmittingByCandidateId[candidate.id])}
                                  >
                                    {retrySubmittingByCandidateId[candidate.id] ? "Запускаю…" : "Повторить"}
                                  </Button>
                                )}
                              </div>
                            ) : jobStatus === "queued" || jobStatus === "processing" ? (
                              <div className="text-sm text-muted-foreground">
                                {jobStatus === "queued" ? "В очереди" : "Анализ…"}
                              </div>
                            ) : jobStatus === "done" && candidate.matchPercentage === null ? (
                              <div className="text-sm text-muted-foreground">Финализация…</div>
                            ) : (
                              <div className="flex items-baseline gap-1.5">
                                <span className={`text-xl font-bold ${getMatchColor(candidate.matchPercentage)}`}>
                                  {candidate.matchPercentage === null ? "—" : `${candidate.matchPercentage}%`}
                                </span>
                                <span className="text-xs text-muted-foreground">соответствие</span>
                              </div>
                            )}
                          </div>
                        </div>
                        </div>

                        {/* Contact Info - compact */}
                        <div
                          className={
                            hasCompactContacts
                              ? "flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground xl:col-span-2 2xl:col-span-1"
                              : "hidden 2xl:block 2xl:col-span-1"
                          }
                          aria-hidden={!hasCompactContacts}
                        >
                          {email && (
                            <div className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              <span className="truncate max-w-[120px]">{email}</span>
                            </div>
                          )}
                          {email && phone && (
                            <span className="text-muted-foreground/40">·</span>
                          )}
                          {phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              <span>{phone}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2 xl:col-span-2 xl:justify-end 2xl:col-span-1 2xl:justify-self-end">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                {canOpenResume ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void handleOpenResume(candidate)}
                                  >
                                    <FileText className="mr-2 h-3 w-3" />
                                    Резюме
                                  </Button>
                                ) : (
                                  <span className="inline-flex">
                                    <Button variant="outline" size="sm" disabled>
                                      <FileText className="mr-2 h-3 w-3" />
                                      Резюме
                                    </Button>
                                  </span>
                                )}
                              </TooltipTrigger>
                              {!canOpenResume ? (
                                <TooltipContent side="top" className="max-w-sm">
                                  {resumeDisabledTooltip}
                                </TooltipContent>
                              ) : null}
                            </Tooltip>
                          </TooltipProvider>
                          <Button type="button" size="sm" onClick={() => openScheduleInterview(candidate)}>
                            <Calendar className="mr-2 h-3 w-3" />
                            Назначить
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Note (same pattern as grid) */}
                    <div className="ml-[68px] border-t pt-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <MessageSquare className="h-3 w-3 text-muted-foreground" />
                          <span>Заметка</span>
                          {!commentUi?.open && commentPreview && (
                            <span className="text-xs text-muted-foreground font-normal truncate max-w-[300px]">
                              — {commentPreview}
                            </span>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() =>
                            setCommentByCandidateId((prev) => {
                              const cur = prev[candidate.id] ?? { draft: candidate.comment ?? "", dirty: false, open: false, saveState: "idle" as const };
                              return { ...prev, [candidate.id]: { ...cur, open: !cur.open } };
                            })
                          }
                        >
                          {commentUi?.open ? "Скрыть" : commentPreview ? "Изменить" : "Добавить"}
                        </Button>
                      </div>

                      {commentUi?.open && (
                        <div className="mt-2 space-y-2">
                          <Textarea
                            placeholder="Добавьте заметку о кандидате…"
                            value={commentUi?.draft ?? candidate.comment ?? ""}
                            onChange={(e) => {
                              const next = e.target.value;
                              setCommentByCandidateId((prev) => ({
                                ...prev,
                                [candidate.id]: {
                                  ...(prev[candidate.id] ?? { draft: "", dirty: false, open: true, saveState: "idle" }),
                                  draft: next,
                                  dirty: true,
                                  open: true,
                                  saveState: prev[candidate.id]?.saveState === "saved" ? "idle" : (prev[candidate.id]?.saveState ?? "idle"),
                                },
                              }));
                              scheduleCommentSave(candidate.id);
                            }}
                            onBlur={() => flushCommentSave(candidate.id)}
                            className="min-h-[60px] text-sm resize-none"
                            maxLength={500}
                          />
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">
                              {commentUi?.saveState === "saving"
                                ? "Сохраняем…"
                                : commentUi?.saveState === "saved"
                                  ? "Сохранено"
                                  : commentUi?.saveState === "error"
                                    ? "Ошибка сохранения"
                                    : " "}
                            </p>
                            <p className="text-xs text-muted-foreground text-right">
                              {(commentUi?.draft ?? candidate.comment ?? "").length} / 500
                            </p>
                          </div>
                          {commentUi?.saveState === "error" ? (
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs text-muted-foreground line-clamp-1" title={commentUi.error}>
                                {commentUi.error}
                              </p>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                onClick={() => void persistComment(candidate.id, (commentStateRef.current[candidate.id]?.draft ?? ""))}
                              >
                                Повторить
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
            })}
          </div>
        )
      )}

      {/* Pagination */}
      {!showCandidatesEmptyState ? (
        <PaginationControls
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          isLoading={isInitialLoading || isPageLoading}
          onPageChange={goToPage}
          onPageSizeChange={(nextPageSize) => {
            const next = clampInt(nextPageSize, 1, 200);
            setPageSize(next);
            setPage(1);
            replaceQuery({ pageSize: String(next), page: "1" });
          }}
        />
      ) : null}

      {detailsCandidate ? (
        isMobileDetails ? (
          <Drawer open={detailsOpen} onOpenChange={setDetailsOpenSafe}>
            <DrawerContent className="mt-0 h-[100dvh] rounded-none">
              <DrawerTitle className="sr-only">
                Детали кандидата: {detailsDisplayText?.name ?? detailsCandidate.name}
              </DrawerTitle>
              <CandidateDetails
                candidate={detailsCandidate}
                vacancy={detailsVacancy}
                desiredSalaryText={detailsDisplayText?.desiredSalaryText ?? null}
                jobStatus={jobsByCandidateId.get(detailsCandidate.id)?.status}
                creditsBlocked={creditsBlocked}
                canManageBilling={isCompanyAdmin}
                retrySubmitting={Boolean(retrySubmittingByCandidateId[detailsCandidate.id])}
                onOpenResume={handleOpenResume}
                onScheduleInterview={openScheduleInterview}
                onRetryAnalysis={(id) => void handleRetry(id)}
                onContactsChanged={handleContactsChanged}
                onNameChanged={handleNameChanged}
                statusControl={
                  <CandidateStatusControl
                    candidateId={detailsCandidate.id}
                    status={detailsCandidate.status}
                    disabled={Boolean(statusSavingByCandidateId[detailsCandidate.id])}
                    onChange={handleStatusChange}
                  />
                }
                commentEditor={
                  <Card className="p-4 bg-muted/30 border-border/40 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">Заметка</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() =>
                          setCommentByCandidateId((prev) => {
                            const cur = prev[detailsCandidate.id] ?? {
                              draft: detailsCandidate.comment ?? "",
                              dirty: false,
                              open: false,
                              saveState: "idle" as const,
                            };
                            return { ...prev, [detailsCandidate.id]: { ...cur, open: !cur.open } };
                          })
                        }
                      >
                        {commentByCandidateId[detailsCandidate.id]?.open
                          ? "Скрыть"
                          : (detailsCandidate.comment ?? "").trim()
                            ? "Редактировать"
                            : "Добавить"}
                      </Button>
                    </div>

                    {!commentByCandidateId[detailsCandidate.id]?.open ? (
                      <div className="text-sm text-muted-foreground">
                        {(detailsCandidate.comment ?? "").trim() ? (
                          <span className="whitespace-pre-wrap break-words">{detailsCandidate.comment}</span>
                        ) : (
                          <span>Нет заметки</span>
                        )}
                      </div>
                    ) : (
                      <>
                        <Textarea
                          placeholder="Добавьте заметку о кандидате…"
                          value={commentByCandidateId[detailsCandidate.id]?.draft ?? detailsCandidate.comment ?? ""}
                          onChange={(e) => {
                            const next = e.target.value;
                            setCommentByCandidateId((prev) => ({
                              ...prev,
                              [detailsCandidate.id]: {
                                ...(prev[detailsCandidate.id] ?? { draft: "", dirty: false, open: true, saveState: "idle" }),
                                draft: next,
                                dirty: true,
                                open: true,
                                saveState:
                                  prev[detailsCandidate.id]?.saveState === "saved"
                                    ? "idle"
                                    : (prev[detailsCandidate.id]?.saveState ?? "idle"),
                              },
                            }));
                            scheduleCommentSave(detailsCandidate.id);
                          }}
                          onBlur={() => flushCommentSave(detailsCandidate.id)}
                          className="min-h-[96px] text-sm resize-none"
                          maxLength={500}
                        />
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">
                            {commentByCandidateId[detailsCandidate.id]?.saveState === "saving"
                              ? "Сохраняем…"
                              : commentByCandidateId[detailsCandidate.id]?.saveState === "saved"
                                ? "Сохранено"
                                : commentByCandidateId[detailsCandidate.id]?.saveState === "error"
                                  ? "Ошибка сохранения"
                                  : " "}
                          </p>
                          <p className="text-xs text-muted-foreground text-right">
                            {(commentByCandidateId[detailsCandidate.id]?.draft ?? detailsCandidate.comment ?? "").length} / 500
                          </p>
                        </div>
                        {commentByCandidateId[detailsCandidate.id]?.saveState === "error" ? (
                          <div className="flex items-center justify-between gap-2">
                            <p
                              className="text-xs text-muted-foreground line-clamp-1"
                              title={commentByCandidateId[detailsCandidate.id]?.error}
                            >
                              {commentByCandidateId[detailsCandidate.id]?.error}
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() =>
                                void persistComment(detailsCandidate.id, (commentStateRef.current[detailsCandidate.id]?.draft ?? ""))
                              }
                            >
                              Повторить
                            </Button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </Card>
                }
                onClose={() => setDetailsOpenSafe(false)}
              />
            </DrawerContent>
          </Drawer>
        ) : (
          <Sheet open={detailsOpen} onOpenChange={setDetailsOpenSafe}>
            <SheetContent side="right" className="w-full sm:w-[50vw] sm:max-w-[50vw] p-0">
              <SheetTitle className="sr-only">
                Детали кандидата: {detailsDisplayText?.name ?? detailsCandidate.name}
              </SheetTitle>
              <CandidateDetails
                candidate={detailsCandidate}
                vacancy={detailsVacancy}
                desiredSalaryText={detailsDisplayText?.desiredSalaryText ?? null}
                jobStatus={jobsByCandidateId.get(detailsCandidate.id)?.status}
                creditsBlocked={creditsBlocked}
                canManageBilling={isCompanyAdmin}
                retrySubmitting={Boolean(retrySubmittingByCandidateId[detailsCandidate.id])}
                onOpenResume={handleOpenResume}
                onScheduleInterview={openScheduleInterview}
                onRetryAnalysis={(id) => void handleRetry(id)}
                onContactsChanged={handleContactsChanged}
                onNameChanged={handleNameChanged}
                statusControl={
                  <CandidateStatusControl
                    candidateId={detailsCandidate.id}
                    status={detailsCandidate.status}
                    disabled={Boolean(statusSavingByCandidateId[detailsCandidate.id])}
                    onChange={handleStatusChange}
                  />
                }
                commentEditor={
                  <Card className="p-4 bg-muted/30 border-border/40 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">Заметка</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() =>
                          setCommentByCandidateId((prev) => {
                            const cur = prev[detailsCandidate.id] ?? {
                              draft: detailsCandidate.comment ?? "",
                              dirty: false,
                              open: false,
                              saveState: "idle" as const,
                            };
                            return { ...prev, [detailsCandidate.id]: { ...cur, open: !cur.open } };
                          })
                        }
                      >
                        {commentByCandidateId[detailsCandidate.id]?.open
                          ? "Скрыть"
                          : (detailsCandidate.comment ?? "").trim()
                            ? "Редактировать"
                            : "Добавить"}
                      </Button>
                    </div>

                    {!commentByCandidateId[detailsCandidate.id]?.open ? (
                      <div className="text-sm text-muted-foreground">
                        {(detailsCandidate.comment ?? "").trim() ? (
                          <span className="whitespace-pre-wrap break-words">{detailsCandidate.comment}</span>
                        ) : (
                          <span>Нет заметки</span>
                        )}
                      </div>
                    ) : (
                      <>
                        <Textarea
                          placeholder="Добавьте заметку о кандидате…"
                          value={commentByCandidateId[detailsCandidate.id]?.draft ?? detailsCandidate.comment ?? ""}
                          onChange={(e) => {
                            const next = e.target.value;
                            setCommentByCandidateId((prev) => ({
                              ...prev,
                              [detailsCandidate.id]: {
                                ...(prev[detailsCandidate.id] ?? { draft: "", dirty: false, open: true, saveState: "idle" }),
                                draft: next,
                                dirty: true,
                                open: true,
                                saveState:
                                  prev[detailsCandidate.id]?.saveState === "saved"
                                    ? "idle"
                                    : (prev[detailsCandidate.id]?.saveState ?? "idle"),
                              },
                            }));
                            scheduleCommentSave(detailsCandidate.id);
                          }}
                          onBlur={() => flushCommentSave(detailsCandidate.id)}
                          className="min-h-[96px] text-sm resize-none"
                          maxLength={500}
                        />
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">
                            {commentByCandidateId[detailsCandidate.id]?.saveState === "saving"
                              ? "Сохраняем…"
                              : commentByCandidateId[detailsCandidate.id]?.saveState === "saved"
                                ? "Сохранено"
                                : commentByCandidateId[detailsCandidate.id]?.saveState === "error"
                                  ? "Ошибка сохранения"
                                  : " "}
                          </p>
                          <p className="text-xs text-muted-foreground text-right">
                            {(commentByCandidateId[detailsCandidate.id]?.draft ?? detailsCandidate.comment ?? "").length} / 500
                          </p>
                        </div>
                        {commentByCandidateId[detailsCandidate.id]?.saveState === "error" ? (
                          <div className="flex items-center justify-between gap-2">
                            <p
                              className="text-xs text-muted-foreground line-clamp-1"
                              title={commentByCandidateId[detailsCandidate.id]?.error}
                            >
                              {commentByCandidateId[detailsCandidate.id]?.error}
                            </p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() =>
                                void persistComment(detailsCandidate.id, (commentStateRef.current[detailsCandidate.id]?.draft ?? ""))
                              }
                            >
                              Повторить
                            </Button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </Card>
                }
              />
            </SheetContent>
          </Sheet>
        )
      ) : null}

      <InterviewFormDialog
        open={scheduleOpen}
        onOpenChange={(next) => {
          setScheduleOpen(next);
          if (!next) {
            setScheduleCandidate(null);
            setScheduleConflicts([]);
          }
        }}
        mode="create"
        initialCandidate={scheduleCandidate ?? undefined}
        initialVacancy={scheduleCandidate ? vacancies.find((vacancy) => vacancy.id === scheduleCandidate.vacancyId) : undefined}
        lockCandidateAndVacancy={Boolean(scheduleCandidate)}
        vacancies={vacancies}
        candidates={scheduleCandidate ? [scheduleCandidate] : candidates}
        interviewers={interviewerOptions}
        conflicts={scheduleConflicts}
        onClearConflicts={() => setScheduleConflicts([])}
        submitting={scheduleSubmitting}
        onSubmit={handleCandidateScheduleSubmit}
      />
    </div>
  );
}
