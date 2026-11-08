export type CalendarVisibleRange = {
  from: string;
  to: string;
};

export type CalendarRealtimeSignal = {
  companyId: string;
  changedAt: string;
};

export type CalendarStaleState =
  | null
  | {
      range: CalendarVisibleRange;
      version: string;
      changedAt: string;
    };

export type CalendarRealtimeAction =
  | {
      type: "mark-stale";
      range: CalendarVisibleRange;
      version: string;
      changedAt: string;
    }
  | { type: "range-changed"; range: CalendarVisibleRange }
  | { type: "clear" };

export function formatCalendarRealtimeTopic(companyId: string): string {
  return `calendar:company:${companyId}`;
}

export function rangesEqual(left: CalendarVisibleRange, right: CalendarVisibleRange): boolean {
  return left.from === right.from && left.to === right.to;
}

export function rangeKey(range: CalendarVisibleRange): string {
  return `${range.from}..${range.to}`;
}

export function parseCalendarRealtimeSignal(input: unknown): CalendarRealtimeSignal | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const keys = Object.keys(input);
  if (keys.length !== 2 || !keys.includes("companyId") || !keys.includes("changedAt")) return null;

  const payload = input as Record<string, unknown>;
  if (typeof payload.companyId !== "string" || !payload.companyId.trim()) return null;
  if (typeof payload.changedAt !== "string" || Number.isNaN(Date.parse(payload.changedAt))) return null;

  return { companyId: payload.companyId, changedAt: payload.changedAt };
}

function signalBucket(signal: CalendarRealtimeSignal, bucketMs: number): number {
  return Math.floor(Date.parse(signal.changedAt) / bucketMs);
}

export function shouldAcceptRealtimeSignal(
  previous: CalendarRealtimeSignal | null,
  next: CalendarRealtimeSignal,
  bucketMs = 5_000
): boolean {
  if (!previous) return true;
  if (previous.companyId !== next.companyId) return true;
  return signalBucket(previous, bucketMs) !== signalBucket(next, bucketMs);
}

export function calendarRealtimeReducer(state: CalendarStaleState, action: CalendarRealtimeAction): CalendarStaleState {
  switch (action.type) {
    case "mark-stale":
      return { range: action.range, version: action.version, changedAt: action.changedAt };
    case "range-changed":
      if (!state) return null;
      return rangesEqual(state.range, action.range) ? state : null;
    case "clear":
      return null;
    default:
      return state;
  }
}

type RealtimeCoordinatorState = {
  companyId: string | null | undefined;
  visibleRange: CalendarVisibleRange;
  paused: boolean;
  currentVersion: string | null;
  hidden: boolean;
};

export type CalendarRealtimeCoordinatorOptions = {
  debounceMs?: number;
  getState: () => RealtimeCoordinatorState;
  checkChanges: (range: CalendarVisibleRange) => Promise<string | null>;
  refresh: () => Promise<string | null>;
  markStale: (state: NonNullable<CalendarStaleState>) => void;
  clearStale?: () => void;
  setPendingHiddenCheck: (pending: boolean) => void;
  onFallbackMode?: (active: boolean) => void;
  setTimeout?: (callback: () => void, delay: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
};

export function createCalendarRealtimeCoordinator(options: CalendarRealtimeCoordinatorOptions) {
  const debounceMs = options.debounceMs ?? 750;
  const setTimer = options.setTimeout ?? ((callback, delay) => globalThis.setTimeout(callback, delay));
  const clearTimer = options.clearTimeout ?? ((handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>));
  let debounceHandle: unknown = null;
  let pendingHiddenCheck = false;
  let inFlightCheck = false;
  let queuedCheck = false;
  let disposed = false;
  let requestId = 0;
  let currentTask: Promise<void> = Promise.resolve();

  async function runCheck(signal: CalendarRealtimeSignal | null) {
    if (disposed) return;

    const startedState = options.getState();
    const startedRange = startedState.visibleRange;
    const startedRangeKey = rangeKey(startedRange);
    const thisRequestId = ++requestId;
    let refreshFailedVersion: string | null = null;

    inFlightCheck = true;
    try {
      const nextVersion = await options.checkChanges(startedRange);
      if (disposed) return;

      const latestState = options.getState();
      if (thisRequestId !== requestId || rangeKey(latestState.visibleRange) !== startedRangeKey) return;
      if (!nextVersion || nextVersion === latestState.currentVersion) return;

      if (latestState.paused) {
        options.markStale({
          range: startedRange,
          version: nextVersion,
          changedAt: signal?.changedAt ?? new Date().toISOString(),
        });
        return;
      }

      refreshFailedVersion = nextVersion;
      const acceptedVersion = await options.refresh();
      if (disposed) return;

      refreshFailedVersion = null;
      if (acceptedVersion && rangeKey(options.getState().visibleRange) === startedRangeKey) {
        options.clearStale?.();
      }
    } catch {
      if (disposed) return;

      if (refreshFailedVersion && rangeKey(options.getState().visibleRange) === startedRangeKey) {
        options.markStale({
          range: startedRange,
          version: refreshFailedVersion,
          changedAt: signal?.changedAt ?? new Date().toISOString(),
        });
      }
      options.onFallbackMode?.(true);
    } finally {
      inFlightCheck = false;
      if (!disposed && queuedCheck) {
        queuedCheck = false;
        startCheck(signal);
      }
    }
  }

  function startCheck(signal: CalendarRealtimeSignal | null) {
    if (disposed) return;

    if (inFlightCheck) {
      queuedCheck = true;
      return;
    }

    currentTask = runCheck(signal);
  }

  function scheduleCheck(signal: CalendarRealtimeSignal | null) {
    if (disposed) return;
    if (debounceHandle) clearTimer(debounceHandle);

    if (debounceMs <= 0) {
      startCheck(signal);
      return;
    }

    debounceHandle = setTimer(() => {
      if (disposed) return;
      debounceHandle = null;
      startCheck(signal);
    }, debounceMs);
  }

  function handleSignal(signal: CalendarRealtimeSignal) {
    if (disposed) return;

    const state = options.getState();
    if (!state.companyId || signal.companyId !== state.companyId) return;

    if (state.hidden) {
      pendingHiddenCheck = true;
      options.setPendingHiddenCheck(true);
      return;
    }

    scheduleCheck(signal);
  }

  function handleVisible() {
    if (disposed) return;
    if (!pendingHiddenCheck) return;
    pendingHiddenCheck = false;
    options.setPendingHiddenCheck(false);
    scheduleCheck(null);
  }

  async function refreshNow(): Promise<string | null> {
    if (disposed) return null;

    const startedRangeKey = rangeKey(options.getState().visibleRange);
    const version = await options.refresh();
    if (disposed) return null;
    if (startedRangeKey !== rangeKey(options.getState().visibleRange)) return null;
    return version;
  }

  return {
    handleSignal,
    handleVisible,
    refreshNow,
    flush: async () => currentTask,
    dispose: () => {
      disposed = true;
      requestId++;
      queuedCheck = false;
      pendingHiddenCheck = false;
      if (debounceHandle) clearTimer(debounceHandle);
      debounceHandle = null;
    },
  };
}

export type FallbackRealtimeSchedulerOptions = {
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  random?: () => number;
  getHidden: () => boolean;
  setTimeout: (callback: () => void, delay: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export function createFallbackRealtimeScheduler(options: FallbackRealtimeSchedulerOptions) {
  const baseDelayMs = options.baseDelayMs ?? 60_000;
  const maxDelayMs = options.maxDelayMs ?? 300_000;
  const jitterMs = options.jitterMs ?? 15_000;
  const random = options.random ?? Math.random;
  let handle: unknown = null;
  let failures = 0;

  function clear() {
    if (handle) options.clearTimeout(handle);
    handle = null;
  }

  function scheduleNext(failed: boolean, callback: () => void = () => undefined) {
    clear();
    if (options.getHidden()) return null;
    failures = failed ? Math.min(failures + 1, 3) : 0;
    const backoff = Math.min(baseDelayMs * 2 ** failures, maxDelayMs);
    const delay = Math.min(backoff + Math.round(random() * jitterMs), maxDelayMs + jitterMs);
    handle = options.setTimeout(callback, delay);
    return handle;
  }

  function resumeWhenVisible(callback: () => void = () => undefined) {
    if (options.getHidden()) return null;
    return scheduleNext(false, callback);
  }

  return { scheduleNext, resumeWhenVisible, clear };
}
