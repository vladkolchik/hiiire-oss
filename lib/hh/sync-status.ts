export type HhSyncStatusLike = {
  isConnected: boolean;
  connectedAt?: string | null;
  lastSyncedAt?: string | null;
  syncStartedAt?: string | null;
  syncLockExpiresAt?: string | null;
  lastSyncErrorAt?: string | null;
  hasLastSyncError?: boolean;
};

export type HhImportSyncState = "idle" | "loading" | "failed";

export type HhImportFinalRefreshInput = {
  pendingFinalRefresh: boolean;
  importInProgress: boolean;
  urlSynced: boolean;
  isInitialLoading: boolean;
};

export type HhImportFinalRefreshScheduleInput = {
  previousStatus: HhSyncStatusLike | null | undefined;
  nextStatus: HhSyncStatusLike | null | undefined;
  pageStartedAtMs: number;
  nowMs?: number;
};

const FIRST_IMPORT_OBSERVATION_WINDOW_MS = 15 * 60 * 1000;
const CLOCK_SKEW_TOLERANCE_MS = 5 * 1000;

function parseTimeMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function getHhImportSyncState(status: HhSyncStatusLike | null | undefined, nowMs = Date.now()): HhImportSyncState {
  if (!status?.isConnected) return "idle";

  const lastSyncedMs = parseTimeMs(status.lastSyncedAt);
  if (lastSyncedMs !== null) return "idle";

  const lockExpiresMs = parseTimeMs(status.syncLockExpiresAt);
  if (lockExpiresMs !== null && lockExpiresMs > nowMs) return "loading";

  if (status.hasLastSyncError) {
    const lastSyncErrorMs = parseTimeMs(status.lastSyncErrorAt);
    if (lastSyncErrorMs === null || lastSyncErrorMs <= nowMs) return "failed";
  }
  if (!status.lastSyncedAt) return "loading";

  const syncStartedMs = parseTimeMs(status.syncStartedAt);
  if (syncStartedMs !== null && nowMs - syncStartedMs < 5 * 60 * 1000) return "loading";

  return "idle";
}

export function isHhImportInProgress(status: HhSyncStatusLike | null | undefined, nowMs = Date.now()): boolean {
  return getHhImportSyncState(status, nowMs) === "loading";
}

export function shouldScheduleCandidatesRefreshAfterHhStatus(input: HhImportFinalRefreshScheduleInput): boolean {
  const nowMs = input.nowMs ?? Date.now();
  if (isHhImportInProgress(input.nextStatus, nowMs)) return false;
  if (isHhImportInProgress(input.previousStatus, nowMs)) return true;
  if (input.previousStatus !== null && input.previousStatus !== undefined) return false;
  if (!input.nextStatus?.isConnected) return false;

  const lastSyncedMs = parseTimeMs(input.nextStatus.lastSyncedAt);
  if (lastSyncedMs === null) return false;

  const connectedMs = parseTimeMs(input.nextStatus.connectedAt);
  if (connectedMs === null) return false;

  const withinFirstImportWindow = input.pageStartedAtMs >= connectedMs - CLOCK_SKEW_TOLERANCE_MS
    && input.pageStartedAtMs <= connectedMs + FIRST_IMPORT_OBSERVATION_WINDOW_MS;
  if (!withinFirstImportWindow) return false;

  return lastSyncedMs >= input.pageStartedAtMs - CLOCK_SKEW_TOLERANCE_MS
    && lastSyncedMs <= nowMs + CLOCK_SKEW_TOLERANCE_MS;
}

export function shouldRefreshCandidatesAfterHhImport(input: HhImportFinalRefreshInput): boolean {
  return input.pendingFinalRefresh && !input.importInProgress && input.urlSynced && !input.isInitialLoading;
}
