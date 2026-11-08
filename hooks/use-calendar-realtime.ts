"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import {
  calendarRealtimeReducer,
  createCalendarRealtimeCoordinator,
  createFallbackRealtimeScheduler,
  rangeKey,
  type CalendarStaleState,
  type CalendarVisibleRange,
} from "@/lib/calendar/realtime";

type UseCalendarRealtimeInput = {
  companyId?: string | null;
  visibleRange: CalendarVisibleRange;
  paused: boolean;
  currentVersion: string | null;
  onRefreshRequested: () => Promise<string | null>;
  onCheckChangesRequested: (range: CalendarVisibleRange) => Promise<string | null>;
};

export function useCalendarRealtime({
  companyId,
  visibleRange,
  paused,
  currentVersion,
  onRefreshRequested,
  onCheckChangesRequested,
}: UseCalendarRealtimeInput): {
  staleState: CalendarStaleState;
  fallbackMode: boolean;
  hasPendingHiddenCheck: boolean;
  refreshing: boolean;
  refreshNow: () => Promise<string | null>;
  clearStaleState: () => void;
} {
  const [staleState, dispatchStale] = useReducer(calendarRealtimeReducer, null);
  const [fallbackMode, setFallbackMode] = useState(false);
  const [hasPendingHiddenCheck, setHasPendingHiddenCheck] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const companyIdRef = useRef(companyId);
  const visibleRangeRef = useRef(visibleRange);
  const pausedRef = useRef(paused);
  const currentVersionRef = useRef(currentVersion);
  const onRefreshRequestedRef = useRef(onRefreshRequested);
  const onCheckChangesRequestedRef = useRef(onCheckChangesRequested);
  const coordinatorRef = useRef<ReturnType<typeof createCalendarRealtimeCoordinator> | null>(null);
  const fallbackRef = useRef<ReturnType<typeof createFallbackRealtimeScheduler> | null>(null);

  useEffect(() => {
    companyIdRef.current = companyId;
    visibleRangeRef.current = visibleRange;
    pausedRef.current = paused;
    currentVersionRef.current = currentVersion;
    onRefreshRequestedRef.current = onRefreshRequested;
    onCheckChangesRequestedRef.current = onCheckChangesRequested;
    dispatchStale({ type: "range-changed", range: visibleRange });
  }, [companyId, visibleRange, paused, currentVersion, onRefreshRequested, onCheckChangesRequested]);

  useEffect(() => {
    if (coordinatorRef.current) return;
    coordinatorRef.current = createCalendarRealtimeCoordinator({
      getState: () => ({
        companyId: companyIdRef.current,
        visibleRange: visibleRangeRef.current,
        paused: pausedRef.current,
        currentVersion: currentVersionRef.current,
        hidden: typeof document !== "undefined" && document.visibilityState === "hidden",
      }),
      checkChanges: (range) => onCheckChangesRequestedRef.current(range),
      refresh: () => onRefreshRequestedRef.current(),
      markStale: (state) => dispatchStale({ type: "mark-stale", ...state }),
      clearStale: () => dispatchStale({ type: "clear" }),
      setPendingHiddenCheck: setHasPendingHiddenCheck,
      onFallbackMode: setFallbackMode,
    });

    return () => {
      coordinatorRef.current?.dispose();
      coordinatorRef.current = null;
    };
  }, []);

  const clearStaleState = useCallback(() => {
    dispatchStale({ type: "clear" });
  }, []);

  const refreshNow = useCallback(async () => {
    setRefreshing(true);
    try {
      const startedRangeKey = rangeKey(visibleRangeRef.current);
      const version = await (coordinatorRef.current?.refreshNow() ?? onRefreshRequestedRef.current());
      if (version && startedRangeKey === rangeKey(visibleRangeRef.current)) {
        dispatchStale({ type: "clear" });
      }
      return version;
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setFallbackMode(Boolean(companyId));
    if (!companyId) setHasPendingHiddenCheck(false);
  }, [companyId]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        coordinatorRef.current?.handleVisible();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (!companyId || !fallbackMode) return;

    let disposed = false;
    let inFlight = false;
    const fallback = createFallbackRealtimeScheduler({
      getHidden: () => typeof document !== "undefined" && document.visibilityState === "hidden",
      setTimeout: (callback, delay) => window.setTimeout(callback, delay),
      clearTimeout: (handle) => window.clearTimeout(handle as number),
    });
    fallbackRef.current = fallback;

    async function runFallbackCheck() {
      if (disposed) return;

      if (inFlight || (typeof document !== "undefined" && document.visibilityState === "hidden")) {
        fallback.scheduleNext(false, runFallbackCheck);
        return;
      }

      inFlight = true;
      let failed = false;
      let refreshFailedWithVersion: string | null = null;
      const startedRange = visibleRangeRef.current;
      const startedRangeKey = rangeKey(startedRange);
      try {
        const version = await onCheckChangesRequestedRef.current(startedRange);
        if (disposed || startedRangeKey !== rangeKey(visibleRangeRef.current)) return;
        if (!version || version === currentVersionRef.current) return;
        if (pausedRef.current) {
          dispatchStale({ type: "mark-stale", range: startedRange, version, changedAt: new Date().toISOString() });
          return;
        }
        refreshFailedWithVersion = version;
        const acceptedVersion = await onRefreshRequestedRef.current();
        refreshFailedWithVersion = null;
        if (acceptedVersion && !disposed && startedRangeKey === rangeKey(visibleRangeRef.current)) {
          dispatchStale({ type: "clear" });
        }
      } catch {
        failed = true;
        if (refreshFailedWithVersion && !disposed && startedRangeKey === rangeKey(visibleRangeRef.current)) {
          dispatchStale({ type: "mark-stale", range: startedRange, version: refreshFailedWithVersion, changedAt: new Date().toISOString() });
        }
      } finally {
        inFlight = false;
        if (!disposed) fallback.scheduleNext(failed, runFallbackCheck);
      }
    }

    function handleFallbackVisibilityChange() {
      if (document.visibilityState === "visible") {
        void runFallbackCheck();
      }
    }

    document.addEventListener("visibilitychange", handleFallbackVisibilityChange);
    fallback.scheduleNext(false, runFallbackCheck);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleFallbackVisibilityChange);
      fallbackRef.current = null;
      fallback.clear();
    };
  }, [companyId, fallbackMode]);

  return {
    staleState,
    fallbackMode,
    hasPendingHiddenCheck,
    refreshing,
    refreshNow,
    clearStaleState,
  };
}
