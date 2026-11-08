"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { FullCalendarInterviews, type CalendarSlotSelection, type CalendarVisibleRange } from "@/components/dashboard/full-calendar-interviews";
import { InterviewCard } from "@/components/dashboard/interview-card";
import { InterviewFormDialog, type InterviewFormSubmitInput } from "@/components/dashboard/interview-form-dialog";
import { InterviewsListFiltersBar } from "@/components/dashboard/interviews-list-filters-bar";
import { PaginationControls } from "@/components/dashboard/pagination-controls";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useCalendarRealtime } from "@/hooks/use-calendar-realtime";
import { rangeKey } from "@/lib/calendar/realtime";
import { readInterviewMutationErrorDescription } from "@/lib/interviews/user-facing-mutation-error";
import {
  limitInterviewSearchInput,
  normalizeInterviewSearch,
  parseInterviewListScope,
  parseInterviewStatusFilter,
  type InterviewListScope,
  type InterviewStatusFilter,
} from "@/lib/interviews/list-query";
import { listCandidates } from "@/services/data/candidates";
import {
  cancelInterview,
  checkInterviewChanges,
  completeInterview,
  createInterview,
  InterviewChangedError,
  InterviewConflictError,
  listInterviewsPage,
  listInterviewsWithVersion,
  listInterviewers,
  updateInterview,
  type InterviewConflict,
  type InterviewerOption,
} from "@/services/data/interviews";
import { listVacancies } from "@/services/data/vacancies";
import type { Candidate, FullInterviewListItem, InterviewListItem, Vacancy } from "@/types";

type PendingStatusAction = {
  type: "cancel" | "complete";
  interview: FullInterviewListItem;
};

const staleInterviewMessage = "Собеседование уже изменилось. Обновите календарь и попробуйте ещё раз.";
const staleCalendarMessage = "Календарь обновился. Нажмите, чтобы загрузить изменения.";
const listPageSizeOptions = [10, 25, 50];

function defaultRange(): CalendarVisibleRange {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 7);
  const to = new Date(now);
  to.setDate(to.getDate() + 30);
  return { from: from.toISOString(), to: to.toISOString() };
}

function isManageInterview(interview: InterviewListItem): interview is FullInterviewListItem {
  return interview.accessLevel === "manage";
}

function getInterviewChangedMessage(error: InterviewChangedError) {
  return error.message || staleInterviewMessage;
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, Math.trunc(v)));
}

export default function CalendarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const companyId = user?.companyId ?? null;
  const [activeTab, setActiveTab] = useState<"calendar" | InterviewListScope>("calendar");
  const [visibleRange, setVisibleRange] = useState<CalendarVisibleRange>(() => defaultRange());
  const [interviews, setInterviews] = useState<InterviewListItem[]>([]);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [listInterviews, setListInterviews] = useState<InterviewListItem[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [listHasMore, setListHasMore] = useState(false);
  const [listTotalIsExact, setListTotalIsExact] = useState(true);
  const [listScanLimitReached, setListScanLimitReached] = useState(false);
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(25);
  const [listStatus, setListStatus] = useState<InterviewStatusFilter>("all");
  const [listSearch, setListSearch] = useState("");
  const [listSearchDraft, setListSearchDraft] = useState("");
  const [listLoading, setListLoading] = useState(false);
  const [listLoadError, setListLoadError] = useState<string | null>(null);
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [interviewerOptions, setInterviewerOptions] = useState<InterviewerOption[]>([]);
  const [interviewsLoading, setInterviewsLoading] = useState(true);
  const [referenceDataLoading, setReferenceDataLoading] = useState(true);
  const [hasLoadedInitialInterviews, setHasLoadedInitialInterviews] = useState(false);
  const [hasLoadedReferenceData, setHasLoadedReferenceData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<CalendarSlotSelection | null>(null);
  const [draftSlot, setDraftSlot] = useState<CalendarSlotSelection | null>(null);
  const [selectedInterview, setSelectedInterview] = useState<InterviewListItem | null>(null);
  const [editingInterview, setEditingInterview] = useState<FullInterviewListItem | null>(null);
  const [conflicts, setConflicts] = useState<InterviewConflict[]>([]);
  const [pendingStatusAction, setPendingStatusAction] = useState<PendingStatusAction | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const visibleRangeRef = useRef(visibleRange);
  const currentRangeKeyRef = useRef(rangeKey(visibleRange));
  const loadInterviewsSeqRef = useRef(0);
  const loadInterviewListSeqRef = useRef(0);
  const listSearchDebounceRef = useRef<number | null>(null);
  const checkCalendarSeqRef = useRef(0);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const clearStaleStateRef = useRef<(() => void) | null>(null);
  const activeListScope: InterviewListScope = activeTab === "all" ? "all" : "upcoming";
  const listTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(listTotal / listPageSize));
  }, [listPageSize, listTotal]);
  const listCanGoForward = listTotalIsExact ? listPage < listTotalPages : listHasMore && !listScanLimitReached;
  const hasActiveListFilters = listStatus !== "all" || listSearchDraft.trim().length > 0;
  const currentRangeKey = useMemo(() => rangeKey(visibleRange), [visibleRange]);

  useEffect(() => {
    visibleRangeRef.current = visibleRange;
    currentRangeKeyRef.current = currentRangeKey;
  }, [currentRangeKey, visibleRange]);

  const replaceQuery = useCallback((next: Record<string, string | null | undefined>) => {
    const baseQuery = typeof window !== "undefined" ? window.location.search : searchParams.toString();
    const params = new URLSearchParams(baseQuery);
    for (const [key, value] of Object.entries(next)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    const suffix = params.toString();
    router.replace(suffix ? `/dashboard/calendar?${suffix}` : "/dashboard/calendar", { scroll: false });
  }, [router, searchParams]);

  const replaceListQuery = useCallback((next: {
    scope?: InterviewListScope | null;
    q?: string | null;
    status?: InterviewStatusFilter | null;
    page?: number | null;
    pageSize?: number | null;
  }) => {
    const scope = next.scope === undefined ? activeListScope : next.scope;
    const status = next.status === undefined ? listStatus : next.status;
    const rawSearch = next.q === undefined ? listSearch : next.q;
    const search = normalizeInterviewSearch(rawSearch);
    const page = next.page === undefined ? listPage : next.page;
    const pageSize = next.pageSize === undefined ? listPageSize : next.pageSize;

    replaceQuery({
      scope,
      q: search || null,
      status: status && status !== "all" ? status : null,
      page: page && page > 1 ? String(page) : null,
      pageSize: pageSize && pageSize !== 25 ? String(pageSize) : null,
    });
  }, [activeListScope, listPage, listPageSize, listSearch, listStatus, replaceQuery]);

  useEffect(() => {
    const hasListParams = ["scope", "q", "status", "page", "pageSize"].some((key) => searchParams.has(key));
    const nextScope = parseInterviewListScope(searchParams.get("scope"));
    const nextTab: "calendar" | InterviewListScope = hasListParams ? nextScope : "calendar";
    const nextPage = clampInt(Number.parseInt(searchParams.get("page") ?? "1", 10), 1, 10_000);
    const nextPageSize = clampInt(Number.parseInt(searchParams.get("pageSize") ?? "25", 10), 1, 200);
    const nextStatus = parseInterviewStatusFilter(searchParams.get("status"));
    const nextSearch = normalizeInterviewSearch(searchParams.get("q"));

    setActiveTab((prev) => (prev === nextTab ? prev : nextTab));
    setListPage((prev) => (prev === nextPage ? prev : nextPage));
    setListPageSize((prev) => (prev === nextPageSize ? prev : nextPageSize));
    setListStatus((prev) => (prev === nextStatus ? prev : nextStatus));
    setListSearch((prev) => (prev === nextSearch ? prev : nextSearch));
    setListSearchDraft((prev) => {
      if (listSearchDebounceRef.current) return prev;
      return prev === nextSearch ? prev : nextSearch;
    });
  }, [searchParams]);

  useEffect(() => {
    return () => {
      if (listSearchDebounceRef.current) window.clearTimeout(listSearchDebounceRef.current);
    };
  }, []);

  const loadInterviewsForRange = useCallback(async (range: CalendarVisibleRange, reason: "initial" | "refresh" | "realtime" = "refresh") => {
    const requestId = ++loadInterviewsSeqRef.current;
    const requestRangeKey = rangeKey(range);
    try {
      if (reason === "initial" || reason === "refresh") setInterviewsLoading(true);
      setLoadError(null);
      const result = await listInterviewsWithVersion(range);
      if (loadInterviewsSeqRef.current !== requestId || currentRangeKeyRef.current !== requestRangeKey) return null;
      setInterviews(result.interviews);
      setCurrentVersion(result.version);
      setHasLoadedInitialInterviews(true);
      clearStaleStateRef.current?.();
      return result.version;
    } catch (error) {
      if (loadInterviewsSeqRef.current !== requestId || currentRangeKeyRef.current !== requestRangeKey) return null;
      console.error("Failed to load calendar interviews:", error);
      setLoadError("Не удалось загрузить календарь. Обновите страницу или попробуйте позже.");
      throw error;
    } finally {
      if (loadInterviewsSeqRef.current === requestId && currentRangeKeyRef.current === requestRangeKey) {
        setInterviewsLoading(false);
      }
    }
  }, []);

  const refreshInterviews = useCallback(() => loadInterviewsForRange(visibleRangeRef.current, "refresh"), [loadInterviewsForRange]);

  const loadInterviewListPage = useCallback(async (options?: { preserveOnError?: boolean }) => {
    const requestId = ++loadInterviewListSeqRef.current;
    const preserveOnError = Boolean(options?.preserveOnError);

    try {
      setListLoading(true);
      setListLoadError(null);
      const result = await listInterviewsPage({
        scope: activeListScope,
        page: listPage,
        pageSize: listPageSize,
        status: listStatus,
        search: listSearch,
      });
      if (loadInterviewListSeqRef.current !== requestId) return;
      setListInterviews(result.interviews);
      setListTotal(result.total);
      setListHasMore(result.hasMore);
      setListTotalIsExact(result.totalIsExact);
      setListScanLimitReached(result.scanLimitReached);
    } catch (error) {
      if (loadInterviewListSeqRef.current !== requestId) return;
      console.error("Failed to load interview list:", error);
      if (!preserveOnError) {
        setListInterviews([]);
        setListTotal(0);
        setListHasMore(false);
        setListTotalIsExact(true);
        setListScanLimitReached(false);
      }
      setListLoadError("Не удалось загрузить список собеседований. Попробуйте обновить страницу.");
    } finally {
      if (loadInterviewListSeqRef.current === requestId) setListLoading(false);
    }
  }, [activeListScope, listPage, listPageSize, listSearch, listStatus]);

  const checkCalendarChanges = useCallback(async (range: CalendarVisibleRange) => {
    const requestId = ++checkCalendarSeqRef.current;
    const requestRangeKey = rangeKey(range);
    const result = await checkInterviewChanges(range);
    if (checkCalendarSeqRef.current !== requestId || currentRangeKeyRef.current !== requestRangeKey) return null;
    return result.version;
  }, []);

  const isRealtimePaused = formOpen || Boolean(selectedInterview) || Boolean(pendingStatusAction);
  const {
    staleState,
    refreshing: realtimeRefreshing,
    refreshNow: refreshRealtimeNow,
    clearStaleState,
  } = useCalendarRealtime({
    companyId,
    visibleRange,
    paused: isRealtimePaused,
    currentVersion,
    onRefreshRequested: () => loadInterviewsForRange(visibleRangeRef.current, "realtime"),
    onCheckChangesRequested: checkCalendarChanges,
  });

  useEffect(() => {
    clearStaleStateRef.current = clearStaleState;
    return () => {
      clearStaleStateRef.current = null;
    };
  }, [clearStaleState]);

  const handleVisibleRangeChange = useCallback((range: CalendarVisibleRange) => {
    setVisibleRange((current) => {
      if (current.from === range.from && current.to === range.to) return current;
      return range;
    });
  }, []);

  async function refreshInterviewsAfterAction() {
    try {
      await refreshInterviews();
    } catch (error) {
      console.error("Failed to refresh interviews after action:", error);
      toast.warning("Изменение сохранено", {
        description: "Обновите календарь, чтобы увидеть свежие изменения.",
      });
    }
  }

  async function refreshViewsAfterAction() {
    await refreshInterviewsAfterAction();
    if (activeTab !== "calendar") {
      await loadInterviewListPage({ preserveOnError: true });
    }
  }

  async function refreshInterviewsAfterStaleConflict() {
    try {
      await refreshInterviews();
    } catch (error) {
      console.error("Failed to refresh interviews after stale conflict:", error);
      toast.error("Не удалось обновить календарь. Попробуйте ещё раз.");
    }

    if (activeTab !== "calendar") {
      await loadInterviewListPage({ preserveOnError: true });
    }
  }

  useEffect(() => {
    void loadInterviewsForRange(visibleRange, "initial").catch(() => undefined);
  }, [loadInterviewsForRange, visibleRange]);

  useEffect(() => {
    if (activeTab === "calendar") return;
    void loadInterviewListPage().catch(() => undefined);
  }, [activeTab, loadInterviewListPage]);

  useEffect(() => {
    let cancelled = false;

    async function loadCalendarReferenceData() {
      try {
        setReferenceDataLoading(true);
        setLoadError(null);
        const [vacancyData, candidateData, interviewers] = await Promise.all([
          listVacancies(),
          listCandidates(),
          listInterviewers(),
        ]);
        if (cancelled) return;
        setVacancies(vacancyData);
        setCandidates(candidateData);
        setInterviewerOptions(interviewers);
        setHasLoadedReferenceData(true);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load calendar reference data:", error);
        setLoadError("Не удалось загрузить календарь. Обновите страницу или попробуйте позже.");
      } finally {
        if (!cancelled) setReferenceDataLoading(false);
      }
    }

    void loadCalendarReferenceData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeTab === "calendar" || listLoading || !listTotalIsExact) return;
    const normalized = clampInt(listPage, 1, listTotalPages);
    if (normalized === listPage) return;
    setListPage(normalized);
    replaceListQuery({ page: normalized });
  }, [activeTab, listLoading, listPage, listTotalIsExact, listTotalPages, replaceListQuery]);

  const staleInCurrentRange = Boolean(staleState && rangeKey(staleState.range) === currentRangeKey);
  const showPageStaleBanner = staleInCurrentRange && !isRealtimePaused;

  useEffect(() => {
    if (staleInCurrentRange && formOpen) setConflicts([]);
  }, [formOpen, staleInCurrentRange]);

  async function handleRefreshStale() {
    try {
      const acceptedVersion = await refreshRealtimeNow();
      if (!acceptedVersion) {
        toast.warning("Не удалось обновить календарь. Попробуйте ещё раз.");
        return;
      }
      clearStaleState();
      setFormOpen(false);
      setEditingInterview(null);
      setSelectedSlot(null);
      setDraftSlot(null);
      setSelectedInterview(null);
      setPendingStatusAction(null);
      setStatusNote("");
      setConflicts([]);
      toast.success("Календарь обновлён");
      requestAnimationFrame(() => headingRef.current?.focus());
    } catch (error) {
      console.error("Failed to refresh stale calendar:", error);
      toast.error("Не удалось обновить календарь. Попробуйте ещё раз.");
    }
  }

  const inlineStaleAlert = staleInCurrentRange ? (
    <Alert role="status" aria-live="polite">
      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      <AlertTitle>Календарь обновился</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="min-w-0 break-words">Обновите список, чтобы увидеть новые изменения.</span>
        <Button type="button" size="sm" variant="outline" onClick={() => void handleRefreshStale()} disabled={realtimeRefreshing}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          {realtimeRefreshing ? "Обновляем..." : "Обновить"}
        </Button>
      </AlertDescription>
    </Alert>
  ) : null;

  const formStaleAlert = inlineStaleAlert;
  const selectedInterviewStaleAlert = inlineStaleAlert;
  const statusActionStaleAlert = inlineStaleAlert;

  function openCreate() {
    setEditingInterview(null);
    setSelectedSlot(null);
    setDraftSlot(null);
    setConflicts([]);
    setFormOpen(true);
  }

  function openEdit(interview: InterviewListItem) {
    if (!isManageInterview(interview)) return;
    setEditingInterview(interview);
    setSelectedSlot(null);
    setDraftSlot(null);
    setConflicts([]);
    setFormOpen(true);
  }

  async function handleFormSubmit(input: InterviewFormSubmitInput) {
    const interviewToUpdate = editingInterview;
    const isEditing = Boolean(interviewToUpdate);
    if (staleInCurrentRange && isEditing) {
      toast.warning(staleInterviewMessage);
      return;
    }

    try {
      setSubmitting(true);
      if (interviewToUpdate) {
        const updateInput = {
          candidateId: input.candidateId,
          vacancyId: input.vacancyId,
          scheduledAt: input.scheduledAt,
          durationMinutes: input.durationMinutes,
          type: input.type,
          interviewerIds: input.interviewerIds,
          meetingUrl: input.meetingUrl,
          location: input.location,
          notes: input.notes,
          allowConflicts: input.allowConflicts,
          expectedUpdatedAt: interviewToUpdate.updatedAtRaw,
        };
        await updateInterview(interviewToUpdate.id, updateInput);
        toast.success("Собеседование обновлено");
      } else {
        await createInterview(input);
        toast.success("Собеседование назначено");
      }

      setConflicts([]);
      setFormOpen(false);
      setEditingInterview(null);
      setSelectedSlot(null);
      setDraftSlot(null);
      setSelectedInterview(null);
    } catch (error) {
      if (error instanceof InterviewConflictError) {
        setConflicts(error.conflicts);
        toast.warning("Есть пересечение по времени", {
          description: "Проверьте предупреждение и сохраните ещё раз, если всё верно.",
        });
        return;
      }
      if (error instanceof InterviewChangedError) {
        setConflicts([]);
        setFormOpen(false);
        setEditingInterview(null);
        setSelectedSlot(null);
        setDraftSlot(null);
        setSelectedInterview(null);
        toast.warning(getInterviewChangedMessage(error));
        await refreshInterviewsAfterStaleConflict();
        return;
      }
      toast.error(isEditing ? "Не удалось обновить собеседование" : "Не удалось назначить собеседование", {
        description: readInterviewMutationErrorDescription(error, "Проверьте данные и попробуйте ещё раз."),
      });
      return;
    } finally {
      setSubmitting(false);
    }

    await refreshViewsAfterAction();
  }

  function handleCancelInterview(interview: FullInterviewListItem) {
    setPendingStatusAction({ type: "cancel", interview });
    setStatusNote("");
  }

  function handleCompleteInterview(interview: FullInterviewListItem) {
    setPendingStatusAction({ type: "complete", interview });
    setStatusNote("");
  }

  async function confirmStatusAction() {
    const action = pendingStatusAction;
    if (!action) return;
    if (staleInCurrentRange) {
      toast.warning(staleInterviewMessage);
      return;
    }
    if (statusNote.trim().length > 2000) {
      toast.error("Заметка не должна быть длиннее 2000 символов");
      return;
    }

    try {
      setStatusSubmitting(true);
      if (action.type === "cancel") {
        await cancelInterview(action.interview.id, {
          cancelNote: statusNote.trim() || undefined,
          expectedUpdatedAt: action.interview.updatedAtRaw,
        });
        toast.success("Собеседование отменено");
      } else {
        await completeInterview(action.interview.id, {
          completionNote: statusNote.trim() || undefined,
          expectedUpdatedAt: action.interview.updatedAtRaw,
        });
        toast.success("Собеседование завершено");
      }
      setPendingStatusAction(null);
      setStatusNote("");
      setSelectedInterview(null);
    } catch (error) {
      console.error("Failed to change interview status:", error);
      if (error instanceof InterviewChangedError) {
        setPendingStatusAction(null);
        setStatusNote("");
        setSelectedInterview(null);
        toast.warning(getInterviewChangedMessage(error));
        await refreshInterviewsAfterStaleConflict();
        return;
      }
      toast.error(action.type === "cancel" ? "Не удалось отменить собеседование" : "Не удалось завершить собеседование", {
        description: "Попробуйте ещё раз.",
      });
      return;
    } finally {
      setStatusSubmitting(false);
    }

    await refreshViewsAfterAction();
  }

  function handleTabChange(value: string) {
    if (value !== "calendar" && value !== "upcoming" && value !== "all") return;
    setActiveTab(value);
    if (value === "calendar") {
      replaceQuery({ scope: null, q: null, status: null, page: null, pageSize: null });
      return;
    }

    setListPage(1);
    replaceListQuery({ scope: value, page: 1 });
  }

  function handleListSearchChange(next: string) {
    const limited = limitInterviewSearchInput(next);
    const normalized = normalizeInterviewSearch(limited);
    setListSearchDraft(limited);
    if (listSearchDebounceRef.current) window.clearTimeout(listSearchDebounceRef.current);
    listSearchDebounceRef.current = window.setTimeout(() => {
      listSearchDebounceRef.current = null;
      setListSearch((prev) => (prev === normalized ? prev : normalized));
      setListPage(1);
      replaceListQuery({ q: normalized, page: 1 });
    }, 300);
  }

  function handleListStatusChange(next: InterviewStatusFilter) {
    if (listSearchDebounceRef.current) {
      window.clearTimeout(listSearchDebounceRef.current);
      listSearchDebounceRef.current = null;
    }
    const normalizedSearch = normalizeInterviewSearch(listSearchDraft);
    setListSearch((prev) => (prev === normalizedSearch ? prev : normalizedSearch));
    setListStatus(next);
    setListPage(1);
    replaceListQuery({ q: normalizedSearch, status: next, page: 1 });
  }

  function resetListFilters() {
    if (listSearchDebounceRef.current) {
      window.clearTimeout(listSearchDebounceRef.current);
      listSearchDebounceRef.current = null;
    }
    setListSearch("");
    setListSearchDraft("");
    setListStatus("all");
    setListPage(1);
    replaceListQuery({ q: null, status: "all", page: 1 });
  }

  function goToListPage(nextPage: number) {
    const maxPage = listTotalIsExact ? listTotalPages : listPage + (listCanGoForward ? 1 : 0);
    const next = clampInt(nextPage, 1, maxPage);
    setListPage(next);
    replaceListQuery({ page: next });
  }

  const statusDialogTitle = pendingStatusAction?.type === "cancel" ? "Отменить собеседование" : "Завершить собеседование";
  const statusDialogDescription =
    pendingStatusAction?.type === "cancel"
      ? "Добавьте короткую причину, если она нужна команде."
      : "Добавьте итоговую заметку, если она нужна команде.";
  const pageReady = hasLoadedInitialInterviews && hasLoadedReferenceData && currentVersion !== null;
  const isInitialLoading = (interviewsLoading || referenceDataLoading) && !pageReady;
  const showCalendarRangeRefresh = interviewsLoading && pageReady;
  const listTitle = activeListScope === "upcoming" ? "Предстоящие собеседования" : "Все собеседования";
  const listDescription =
    activeListScope === "upcoming" ? "Будущие встречи с учётом поиска и статуса" : "История и будущие встречи с учётом поиска и статуса";
  const showListEmptyState = !listLoading && !listLoadError && listInterviews.length === 0;
  const showListPagination = !listLoadError && (!showListEmptyState || listPage > 1 || listScanLimitReached);
  const listEmptyMessage = listScanLimitReached
    ? "Список слишком широкий для точного показа. Уточните поиск или выберите статус."
    : hasActiveListFilters
      ? "По выбранным фильтрам собеседования не найдены"
      : activeListScope === "upcoming"
        ? "Предстоящих собеседований пока нет"
        : "Собеседований пока нет";
  const listInexactPaginationHint = listScanLimitReached
    ? "Дальше список не показываем, чтобы не вводить в заблуждение. Уточните поиск или выберите статус."
    : "Есть ещё результаты. Переходите дальше или уточните поиск.";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold tracking-tight outline-none">
            Календарь
          </h1>
          <p className="text-muted-foreground">Планируйте и управляйте собеседованиями</p>
        </div>
        <Button type="button" onClick={openCreate} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Новое собеседование
        </Button>
      </div>

      {showPageStaleBanner ? (
        <Alert role="status" aria-live="polite">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Календарь обновился</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="min-w-0 break-words">{staleCalendarMessage}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void handleRefreshStale()} disabled={realtimeRefreshing}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              {realtimeRefreshing ? "Обновляем..." : "Обновить"}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {isInitialLoading ? (
        <div className="rounded-lg border bg-background p-6 text-sm text-muted-foreground">Загружаем календарь...</div>
      ) : loadError && !pageReady ? (
        <div className="rounded-lg border bg-background p-6 text-sm text-destructive">{loadError}</div>
      ) : (
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          {loadError ? <div className="rounded-lg border bg-background p-4 text-sm text-destructive">{loadError}</div> : null}
          <TabsList className="max-w-full justify-start overflow-x-auto">
            <TabsTrigger value="calendar">Календарь</TabsTrigger>
            <TabsTrigger value="upcoming">Предстоящие</TabsTrigger>
            <TabsTrigger value="all">Все собеседования</TabsTrigger>
          </TabsList>

          <TabsContent value="calendar" className="space-y-4">
            {showCalendarRangeRefresh ? (
              <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground" role="status" aria-live="polite">
                Обновляем календарь...
              </div>
            ) : null}
            <FullCalendarInterviews
              interviews={interviews}
              draftSelection={draftSlot && !editingInterview ? draftSlot : null}
              onDatesChange={handleVisibleRangeChange}
              onSelectSlot={(slot) => {
                setSelectedSlot(slot);
                setDraftSlot(slot);
                setEditingInterview(null);
                setConflicts([]);
                setFormOpen(true);
              }}
              onSelectInterview={setSelectedInterview}
            />
          </TabsContent>

          <TabsContent value="upcoming" className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight">{listTitle}</h2>
              <p className="text-sm text-muted-foreground">{listDescription}</p>
            </div>
            <InterviewsListFiltersBar
              search={listSearchDraft}
              status={listStatus}
              hasActiveFilters={hasActiveListFilters}
              onSearchChange={handleListSearchChange}
              onStatusChange={handleListStatusChange}
              onReset={resetListFilters}
            />
            {listLoadError ? <div className="rounded-lg border bg-background p-4 text-sm text-destructive">{listLoadError}</div> : null}
            {listLoading ? (
              <div className="rounded-lg border bg-background p-6 text-sm text-muted-foreground" role="status" aria-live="polite">
                Загружаем собеседования...
              </div>
            ) : showListEmptyState ? (
              <div className="rounded-lg border bg-background p-6 text-sm text-muted-foreground">
                {listEmptyMessage}
              </div>
            ) : (
              <div className="space-y-3">
                {listInterviews.map((interview) => (
                  <InterviewCard
                    key={interview.id}
                    interview={interview}
                    onEdit={openEdit}
                    onCancel={handleCancelInterview}
                    onComplete={handleCompleteInterview}
                  />
                ))}
              </div>
            )}
            {showListPagination ? (
              <PaginationControls
                page={listPage}
                totalPages={listTotalPages}
                pageSize={listPageSize}
                hasExactTotal={listTotalIsExact}
                hasNextPage={listCanGoForward}
                inexactHint={listInexactPaginationHint}
                pageSizeOptions={listPageSizeOptions}
                isLoading={listLoading}
                onPageChange={goToListPage}
                onPageSizeChange={(nextPageSize) => {
                  const next = clampInt(nextPageSize, 1, 200);
                  setListPageSize(next);
                  setListPage(1);
                  replaceListQuery({ pageSize: next, page: 1 });
                }}
              />
            ) : null}
          </TabsContent>

          <TabsContent value="all" className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-tight">{listTitle}</h2>
              <p className="text-sm text-muted-foreground">{listDescription}</p>
            </div>
            <InterviewsListFiltersBar
              search={listSearchDraft}
              status={listStatus}
              hasActiveFilters={hasActiveListFilters}
              onSearchChange={handleListSearchChange}
              onStatusChange={handleListStatusChange}
              onReset={resetListFilters}
            />
            {listLoadError ? <div className="rounded-lg border bg-background p-4 text-sm text-destructive">{listLoadError}</div> : null}
            {listLoading ? (
              <div className="rounded-lg border bg-background p-6 text-sm text-muted-foreground" role="status" aria-live="polite">
                Загружаем собеседования...
              </div>
            ) : showListEmptyState ? (
              <div className="rounded-lg border bg-background p-6 text-sm text-muted-foreground">
                {listEmptyMessage}
              </div>
            ) : (
              <div className="space-y-3">
                {listInterviews.map((interview) => (
                  <InterviewCard
                    key={interview.id}
                    interview={interview}
                    onEdit={openEdit}
                    onCancel={handleCancelInterview}
                    onComplete={handleCompleteInterview}
                  />
                ))}
              </div>
            )}
            {showListPagination ? (
              <PaginationControls
                page={listPage}
                totalPages={listTotalPages}
                pageSize={listPageSize}
                hasExactTotal={listTotalIsExact}
                hasNextPage={listCanGoForward}
                inexactHint={listInexactPaginationHint}
                pageSizeOptions={listPageSizeOptions}
                isLoading={listLoading}
                onPageChange={goToListPage}
                onPageSizeChange={(nextPageSize) => {
                  const next = clampInt(nextPageSize, 1, 200);
                  setListPageSize(next);
                  setListPage(1);
                  replaceListQuery({ pageSize: next, page: 1 });
                }}
              />
            ) : null}
          </TabsContent>
        </Tabs>
      )}

      <InterviewFormDialog
        open={formOpen}
        onOpenChange={(next) => {
          setFormOpen(next);
          if (!next) {
            setEditingInterview(null);
            setSelectedSlot(null);
            setDraftSlot(null);
            setConflicts([]);
          }
        }}
        mode={editingInterview ? "edit" : "create"}
        interview={editingInterview ?? undefined}
        initialSlot={selectedSlot ?? undefined}
        vacancies={vacancies}
        candidates={candidates}
        interviewers={interviewerOptions}
        conflicts={conflicts}
        onClearConflicts={() => setConflicts([])}
        staleAlert={formStaleAlert}
        isStale={staleInCurrentRange && formOpen}
        onRefreshStale={handleRefreshStale}
        submitting={submitting}
        onDraftSlotChange={setDraftSlot}
        onSubmit={handleFormSubmit}
      />

      <Dialog open={Boolean(selectedInterview)} onOpenChange={(next) => !next && setSelectedInterview(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Собеседование</DialogTitle>
          </DialogHeader>
          {selectedInterview ? (
            <div className="space-y-4">
              {selectedInterviewStaleAlert}
              <InterviewCard
                interview={selectedInterview}
                onEdit={openEdit}
                onCancel={handleCancelInterview}
                onComplete={handleCompleteInterview}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingStatusAction)} onOpenChange={(next) => !next && setPendingStatusAction(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{statusDialogTitle}</DialogTitle>
            <DialogDescription>{statusDialogDescription}</DialogDescription>
          </DialogHeader>
          {statusActionStaleAlert}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="status-note" className="text-sm font-medium">
                Заметка
              </label>
              <span className="shrink-0 text-xs text-muted-foreground">{statusNote.length} / 2000</span>
            </div>
            <Textarea
              id="status-note"
              value={statusNote}
              onChange={(event) => setStatusNote(event.target.value)}
              placeholder="Можно оставить пустым"
              className="min-h-[120px] resize-none"
              maxLength={2000}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingStatusAction(null)} disabled={statusSubmitting}>
              Назад
            </Button>
            <Button type="button" onClick={() => void confirmStatusAction()} disabled={statusSubmitting || staleInCurrentRange}>
              {statusSubmitting ? "Сохраняем..." : "Подтвердить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
