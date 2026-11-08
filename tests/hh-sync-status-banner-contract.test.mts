import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getHhImportSyncState,
  isHhImportInProgress,
  shouldScheduleCandidatesRefreshAfterHhStatus,
  shouldRefreshCandidatesAfterHhImport,
} from "../lib/hh/sync-status.ts";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const nowMs = Date.parse("2026-05-30T00:00:00.000Z");

test("hh status API exposes safe auto-sync progress fields", () => {
  const route = source("app/api/integrations/hh/status/route.ts");
  const packageJson = source("package.json");

  assert.match(route, /sync_started_at/);
  assert.match(route, /sync_lock_expires_at/);
  assert.match(route, /last_sync_error_at/);
  assert.match(route, /last_sync_error/);
  assert.match(route, /syncStartedAt/);
  assert.match(route, /syncLockExpiresAt/);
  assert.match(route, /lastSyncErrorAt/);
  assert.match(route, /hasLastSyncError/);
  assert.doesNotMatch(route, /lastSyncError\s*:/);
  assert.match(packageJson, /"test:hh-sync"/);
  assert.match(packageJson, /hh-sync-status-banner-contract\.test\.mts/);
});

test("settings and candidates pages explain long HH auto-imports", () => {
  const settings = source("app/(dashboard)/dashboard/settings/page.tsx");
  const candidates = source("app/(dashboard)/dashboard/candidates/page.tsx");

  for (const page of [settings, candidates]) {
    assert.match(page, /getHhImportSyncState/);
    assert.match(page, /Загружаем отклики из HH\.ru/);
    assert.match(page, /Большие аккаунты могут синхронизироваться до 15 минут/);
    assert.match(page, /Кандидаты появятся автоматически/);
  }

  assert.match(settings, /syncLockExpiresAt/);
  assert.match(settings, /lastSyncedAt/);
  assert.match(candidates, /\/api\/integrations\/hh\/status/);
  assert.match(candidates, /setInterval/);
});

test("hh import progress helper separates loading, failed, and idle states", () => {
  assert.equal(
    getHhImportSyncState({
      isConnected: true,
      lastSyncedAt: "2026-05-29T23:50:00.000Z",
      syncLockExpiresAt: "2026-05-30T00:02:00.000Z",
      syncStartedAt: "2026-05-30T00:00:00.000Z",
    }, nowMs),
    "idle"
  );

  assert.equal(
    getHhImportSyncState({
      isConnected: true,
      lastSyncedAt: "2026-05-29T23:50:00.000Z",
      hasLastSyncError: true,
      lastSyncErrorAt: "2026-05-29T23:55:00.000Z",
    }, nowMs),
    "idle"
  );

  assert.equal(
    getHhImportSyncState({
      isConnected: true,
      lastSyncedAt: null,
      hasLastSyncError: true,
      syncLockExpiresAt: null,
      syncStartedAt: null,
    }, nowMs),
    "failed"
  );

  assert.equal(
    getHhImportSyncState({
      isConnected: true,
      lastSyncedAt: null,
      hasLastSyncError: true,
      syncLockExpiresAt: "2026-05-30T00:02:00.000Z",
    }, nowMs),
    "loading"
  );

  assert.equal(
    isHhImportInProgress({
      isConnected: true,
      lastSyncedAt: "2026-05-29T23:00:00.000Z",
      syncLockExpiresAt: "2026-05-29T23:01:00.000Z",
      syncStartedAt: "not-a-date",
    }, nowMs),
    false
  );

  assert.equal(
    getHhImportSyncState({
      isConnected: true,
      lastSyncedAt: "2026-05-29T23:50:00.000Z",
      hasLastSyncError: true,
      lastSyncErrorAt: "2026-05-29T23:40:00.000Z",
    }, nowMs),
    "idle"
  );
});

test("hh import banners have failure and refresh transition contracts", () => {
  const settings = source("app/(dashboard)/dashboard/settings/page.tsx");
  const candidates = source("app/(dashboard)/dashboard/candidates/page.tsx");

  assert.match(settings, /hhImportSyncState/);
  assert.match(settings, /HH\.ru не удалось загрузить отклики/);
  assert.match(settings, /Попробуйте запустить синхронизацию вручную/);
  assert.match(settings, /const interval = setInterval\(\(\) => void loadHhStatus\(\), 30000\)/);

  assert.match(candidates, /hhImportNeedsFinalRefreshRef/);
  assert.match(candidates, /shouldScheduleCandidatesRefreshAfterHhStatus/);
  assert.match(candidates, /HH\.ru не удалось загрузить отклики/);
  assert.match(candidates, /setHhStatus\(\(prev\)/);
});

test("candidates final refresh waits until initial loading is finished", () => {
  assert.equal(
    shouldScheduleCandidatesRefreshAfterHhStatus({
      previousStatus: null,
      nextStatus: {
        isConnected: true,
        connectedAt: "2026-05-29T23:59:00.000Z",
        lastSyncedAt: "2026-05-30T00:00:05.000Z",
      },
      pageStartedAtMs: nowMs,
      nowMs: Date.parse("2026-05-30T00:00:06.000Z"),
    }),
    true
  );

  assert.equal(
    shouldScheduleCandidatesRefreshAfterHhStatus({
      previousStatus: null,
      nextStatus: {
        isConnected: true,
        connectedAt: "2026-05-29T23:59:00.000Z",
        lastSyncedAt: "2026-05-29T23:00:00.000Z",
      },
      pageStartedAtMs: nowMs,
      nowMs: Date.parse("2026-05-30T00:00:06.000Z"),
    }),
    false
  );

  assert.equal(
    shouldScheduleCandidatesRefreshAfterHhStatus({
      previousStatus: null,
      nextStatus: {
        isConnected: true,
        connectedAt: "2026-05-01T00:00:00.000Z",
        lastSyncedAt: "2026-05-29T23:59:30.000Z",
      },
      pageStartedAtMs: nowMs,
      nowMs: Date.parse("2026-05-30T00:00:06.000Z"),
    }),
    false
  );

  assert.equal(
    shouldRefreshCandidatesAfterHhImport({
      pendingFinalRefresh: true,
      importInProgress: false,
      urlSynced: true,
      isInitialLoading: true,
    }),
    false
  );

  assert.equal(
    shouldRefreshCandidatesAfterHhImport({
      pendingFinalRefresh: true,
      importInProgress: false,
      urlSynced: true,
      isInitialLoading: false,
    }),
    true
  );

  const candidates = source("app/(dashboard)/dashboard/candidates/page.tsx");
  assert.match(candidates, /hhImportNeedsFinalRefreshRef/);
  assert.match(candidates, /hhStatusStartedAtRef/);
  assert.match(candidates, /hhImportFinalRefreshSignal/);
  assert.match(candidates, /setHhImportFinalRefreshSignal\(\(value\) => value \+ 1\)/);
  assert.match(candidates, /shouldScheduleCandidatesRefreshAfterHhStatus/);
  assert.match(candidates, /shouldRefreshCandidatesAfterHhImport/);
  assert.match(candidates, /hhImportNeedsFinalRefreshRef\.current = false/);
});

test("hh status fetch failures keep connection status unknown instead of disconnected", () => {
  const settings = source("app/(dashboard)/dashboard/settings/page.tsx");
  const candidates = source("app/(dashboard)/dashboard/candidates/page.tsx");

  assert.match(settings, /hhStatusCheckFailed/);
  assert.match(settings, /Не удалось проверить статус HH\.ru/);
  assert.match(settings, /const isHHStatusUnknown = hhStatus === null/);
  assert.match(settings, /setHhStatus\(\(prev\) => prev\)/);
  assert.match(settings, /!json \|\| typeof json !== "object"/);
  assert.doesNotMatch(settings, /prev \?\? \{ isConnected: false \}/);

  assert.match(candidates, /setHhStatus\(\(prev\) => prev\)/);
  assert.doesNotMatch(candidates, /prev \?\? \{ isConnected: false \}/);
});
