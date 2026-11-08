import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  calendarRealtimeReducer,
  createCalendarRealtimeCoordinator,
  createFallbackRealtimeScheduler,
  formatCalendarRealtimeTopic,
  parseCalendarRealtimeSignal,
  rangesEqual,
  shouldAcceptRealtimeSignal,
  type CalendarVisibleRange,
} from "../lib/calendar/realtime.ts";

const realtimeSql = readFileSync("supabase/sql/interviews_realtime_v1.sql", "utf8");
const cleanupSql = readFileSync("supabase/sql/interviews_rpc_cleanup_v1.sql", "utf8");
const readme = readFileSync("docs/technical-reference.md", "utf8");
const calendarHook = readFileSync("hooks/use-calendar-realtime.ts", "utf8");

test("calendar realtime migration uses private broadcast with generic payload", () => {
  assert.match(realtimeSql, /create or replace function public\.broadcast_interview_calendar_change/i);
  assert.match(realtimeSql, /realtime\.send/i);
  assert.match(realtimeSql, /calendar:company:/i);
  assert.match(realtimeSql, /calendar_changed/i);
  assert.match(realtimeSql, /jsonb_build_object/i);
  assert.match(realtimeSql, /'companyId'/);
  assert.match(realtimeSql, /'changedAt'/);
  assert.match(realtimeSql, /true\s*\)\s*;/i);

  const payloadBlock = realtimeSql.match(/jsonb_build_object\(([\s\S]*?)\)\s*,\s*'calendar_changed'/i)?.[1] ?? "";
  assert.deepEqual(
    [...payloadBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]),
    ["companyId", "changedAt"]
  );
  assert.doesNotMatch(
    realtimeSql,
    /'interviewId'|'scheduledAt'|'previousScheduledAt'|'status'|'meeting_url'|'location'|'notes'|'candidate_id'|'vacancy_id'|'interviewer_ids'/i
  );
});

test("calendar realtime migration invalidates limited display context changes", () => {
  assert.match(realtimeSql, /create or replace function public\.broadcast_candidate_calendar_display_change/i);
  assert.match(realtimeSql, /create or replace function public\.broadcast_vacancy_calendar_display_change/i);
  assert.match(realtimeSql, /after update of name on public\.candidates/i);
  assert.match(realtimeSql, /after update of title on public\.vacancies/i);
  assert.match(realtimeSql, /from public\.interviews i[\s\S]*i\.candidate_id = coalesce\(new\.id, old\.id\)/i);
  assert.match(realtimeSql, /from public\.interviews i[\s\S]*i\.vacancy_id = coalesce\(new\.id, old\.id\)/i);
  assert.match(realtimeSql, /perform public\.broadcast_calendar_company_change\(changed_company_id\)/i);
  assert.doesNotMatch(realtimeSql, /new\.name|old\.name|new\.title|old\.title/i);
});

test("calendar realtime private channel is authorized by exact company topic", () => {
  assert.match(realtimeSql, /on realtime\.messages/i);
  assert.match(realtimeSql, /for select/i);
  assert.match(realtimeSql, /to authenticated/i);
  assert.match(realtimeSql, /realtime\.messages\.extension\s*=\s*'broadcast'/i);
  assert.match(realtimeSql, /realtime\.topic\(\)\s*=\s*'calendar:company:'\s*\|\|\s*p\.company_id::text/i);
  assert.match(realtimeSql, /public\.profiles/i);
  assert.match(realtimeSql, /p\.id\s*=\s*auth\.uid\(\)/i);
  assert.doesNotMatch(realtimeSql, /split_part\s*\(/i);
});

test("cancel and complete rpc signatures require optimistic concurrency", () => {
  assert.match(realtimeSql, /cancel_interview_mvp\([\s\S]*p_expected_updated_at timestamptz/i);
  assert.match(realtimeSql, /complete_interview_mvp\([\s\S]*p_expected_updated_at timestamptz/i);
  assert.match(realtimeSql, /and updated_at = p_expected_updated_at/i);
});

test("old cancel and complete rpc overloads are removed after app deploy", () => {
  assert.match(cleanupSql, /drop function if exists public\.cancel_interview_mvp\(uuid,\s*uuid,\s*text\)/i);
  assert.match(cleanupSql, /drop function if exists public\.complete_interview_mvp\(uuid,\s*uuid,\s*text\)/i);
});

test("readme documents calendar polling through the guarded changes API", () => {
  const calendarSection = readme.match(/### 📅 Календарь[\s\S]*?---/)?.[0] ?? "";

  assert.match(calendarSection, /\/api\/interviews\/changes/);
  assert.match(calendarSection, /fingerprint/);
  assert.match(calendarSection, /expectedUpdatedAt/);
  assert.doesNotMatch(calendarSection, /browser realtime|browser Supabase|WebSocket/i);
});

test("readme documents optimistic concurrency cleanup without browser realtime rollout requirements", () => {
  assert.match(readme, /interviews_rpc_cleanup_v1\.sql/);
  assert.match(readme, /expectedUpdatedAt/);
  assert.match(readme, /после того, как все app-инстансы|after all app instances/i);
  assert.doesNotMatch(readme, /before deploying app code, which opens a browser realtime channel/i);
});

test("readme describes current calendar fingerprint risk without stale iteration label", () => {
  const calendarSection = readme.match(/### 📅 Календарь[\s\S]*?---/)?.[0] ?? "";

  assert.match(calendarSection, /\/api\/interviews\/changes/);
  assert.match(calendarSection, /fingerprint/);
  assert.doesNotMatch(calendarSection, /Iteration 1/i);
});

test("calendar realtime utility formats exact company topic and validates only generic payload", () => {
  assert.equal(formatCalendarRealtimeTopic("company-1"), "calendar:company:company-1");

  assert.deepEqual(parseCalendarRealtimeSignal({ companyId: "company-1", changedAt: "2026-01-10T09:00:00.123456+00:00" }), {
    companyId: "company-1",
    changedAt: "2026-01-10T09:00:00.123456+00:00",
  });
  assert.equal(parseCalendarRealtimeSignal({ companyId: "company-1", changedAt: "nope" }), null);
  assert.equal(parseCalendarRealtimeSignal({ companyId: "company-1", changedAt: "2026-01-10T09:00:00.123456+00:00", interviewId: "leak" }), null);
});

test("calendar realtime utility dedupes bursts by company and time bucket", () => {
  assert.equal(
    shouldAcceptRealtimeSignal(
      { companyId: "company-1", changedAt: "2026-01-10T09:00:00.100Z" },
      { companyId: "company-1", changedAt: "2026-01-10T09:00:04.900Z" }
    ),
    false
  );
  assert.equal(
    shouldAcceptRealtimeSignal(
      { companyId: "company-1", changedAt: "2026-01-10T09:00:00.100Z" },
      { companyId: "company-1", changedAt: "2026-01-10T09:00:06.000Z" }
    ),
    true
  );
});

test("calendar realtime coordinator accepts same-bucket signals after previous refresh completed", async () => {
  const range: CalendarVisibleRange = { from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" };
  const events: string[] = [];
  let currentVersion = "v1";
  let nextCheckedVersion = "v2";

  const coordinator = createCalendarRealtimeCoordinator({
    debounceMs: 0,
    getState: () => ({ companyId: "company-1", visibleRange: range, paused: false, currentVersion, hidden: false }),
    checkChanges: async () => {
      events.push(`check:${nextCheckedVersion}`);
      return nextCheckedVersion;
    },
    refresh: async () => {
      currentVersion = nextCheckedVersion;
      events.push(`refresh:${currentVersion}`);
      return currentVersion;
    },
    markStale: (state) => events.push(`stale:${state.version}`),
    clearStale: () => events.push("clear-stale"),
    setPendingHiddenCheck: () => events.push("hidden"),
  });

  coordinator.handleSignal({ companyId: "company-1", changedAt: "2026-01-10T09:00:00.100Z" });
  await coordinator.flush();

  nextCheckedVersion = "v3";
  coordinator.handleSignal({ companyId: "company-1", changedAt: "2026-01-10T09:00:04.900Z" });
  await coordinator.flush();

  assert.deepEqual(events, ["check:v2", "refresh:v2", "clear-stale", "check:v3", "refresh:v3", "clear-stale"]);
});

test("calendar realtime stale reducer stores range metadata and clears on range change", () => {
  const range: CalendarVisibleRange = { from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" };
  const nextRange: CalendarVisibleRange = { from: "2026-02-01T00:00:00.000Z", to: "2026-03-01T00:00:00.000Z" };

  const stale = calendarRealtimeReducer(null, {
    type: "mark-stale",
    range,
    version: "v2",
    changedAt: "2026-01-10T09:00:00.123456+00:00",
  });

  assert.deepEqual(stale, { range, version: "v2", changedAt: "2026-01-10T09:00:00.123456+00:00" });
  assert.equal(calendarRealtimeReducer(stale, { type: "range-changed", range }), stale);
  assert.equal(calendarRealtimeReducer(stale, { type: "range-changed", range: nextRange }), null);
  assert.equal(rangesEqual(range, { ...range }), true);
});

test("calendar realtime coordinator checks fingerprint before refresh and marks paused ranges stale", async () => {
  const range: CalendarVisibleRange = { from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" };
  const events: string[] = [];
  let paused = false;

  const coordinator = createCalendarRealtimeCoordinator({
    debounceMs: 0,
    getState: () => ({ companyId: "company-1", visibleRange: range, paused, currentVersion: "v1", hidden: false }),
    checkChanges: async () => {
      events.push("check");
      return "v2";
    },
    refresh: async () => {
      events.push("refresh");
      return "v2";
    },
    markStale: (state) => events.push(`stale:${state.version}`),
    setPendingHiddenCheck: () => events.push("hidden"),
  });

  coordinator.handleSignal({ companyId: "company-1", changedAt: "2026-01-10T09:00:00.000Z" });
  await coordinator.flush();
  assert.deepEqual(events, ["check", "refresh"]);

  events.length = 0;
  paused = true;
  coordinator.handleSignal({ companyId: "company-1", changedAt: "2026-01-10T09:00:06.000Z" });
  await coordinator.flush();
  assert.deepEqual(events, ["check", "stale:v2"]);
});

test("calendar realtime coordinator coalesces refreshes and ignores stale range fingerprints", async () => {
  const rangeA: CalendarVisibleRange = { from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" };
  const rangeB: CalendarVisibleRange = { from: "2026-02-01T00:00:00.000Z", to: "2026-03-01T00:00:00.000Z" };
  const events: string[] = [];
  let currentRange = rangeA;
  let releaseCheck: ((version: string) => void) | null = null;

  const coordinator = createCalendarRealtimeCoordinator({
    debounceMs: 0,
    getState: () => ({ companyId: "company-1", visibleRange: currentRange, paused: false, currentVersion: "v1", hidden: false }),
    checkChanges: async () =>
      new Promise<string>((resolve) => {
        releaseCheck = resolve;
      }),
    refresh: async () => {
      events.push("refresh");
      return "v2";
    },
    markStale: () => events.push("stale"),
    setPendingHiddenCheck: () => events.push("hidden"),
  });

  coordinator.handleSignal({ companyId: "company-1", changedAt: "2026-01-10T09:00:00.000Z" });
  coordinator.handleSignal({ companyId: "company-1", changedAt: "2026-01-10T09:00:06.000Z" });
  currentRange = rangeB;
  releaseCheck?.("v2");
  await coordinator.flush();

  assert.deepEqual(events, []);
});

test("calendar realtime coordinator marks stale when changed fingerprint refresh fails", async () => {
  const range: CalendarVisibleRange = { from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" };
  const events: string[] = [];

  const coordinator = createCalendarRealtimeCoordinator({
    debounceMs: 0,
    getState: () => ({ companyId: "company-1", visibleRange: range, paused: false, currentVersion: "v1", hidden: false }),
    checkChanges: async () => {
      events.push("check");
      return "v2";
    },
    refresh: async () => {
      events.push("refresh");
      throw new Error("refresh failed");
    },
    markStale: (state) => events.push(`stale:${state.version}:${state.range.from}`),
    setPendingHiddenCheck: () => events.push("hidden"),
    onFallbackMode: () => events.push("fallback"),
  });

  coordinator.handleSignal({ companyId: "company-1", changedAt: "2026-01-10T09:00:00.000Z" });
  await coordinator.flush();

  assert.deepEqual(events, ["check", "refresh", `stale:v2:${range.from}`, "fallback"]);
});

test("calendar realtime coordinator does not mark stale when refresh returns a newer version", async () => {
  const range: CalendarVisibleRange = { from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" };
  const events: string[] = [];

  const coordinator = createCalendarRealtimeCoordinator({
    debounceMs: 0,
    getState: () => ({ companyId: "company-1", visibleRange: range, paused: false, currentVersion: "v1", hidden: false }),
    checkChanges: async () => {
      events.push("check:v2");
      return "v2";
    },
    refresh: async () => {
      events.push("refresh:v3");
      return "v3";
    },
    markStale: (state) => events.push(`stale:${state.version}`),
    setPendingHiddenCheck: () => events.push("hidden"),
  });

  coordinator.handleSignal({ companyId: "company-1", changedAt: "2026-01-10T09:00:00.000Z" });
  await coordinator.flush();

  assert.deepEqual(events, ["check:v2", "refresh:v3"]);
});

test("calendar realtime coordinator clears stale after successful automatic current-range refresh", async () => {
  const range: CalendarVisibleRange = { from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" };
  const events: string[] = [];

  const coordinator = createCalendarRealtimeCoordinator({
    debounceMs: 0,
    getState: () => ({ companyId: "company-1", visibleRange: range, paused: false, currentVersion: "v1", hidden: false }),
    checkChanges: async () => {
      events.push("check:v2");
      return "v2";
    },
    refresh: async () => {
      events.push("refresh:v3");
      return "v3";
    },
    markStale: (state) => events.push(`stale:${state.version}`),
    clearStale: () => events.push("clear-stale"),
    setPendingHiddenCheck: () => events.push("hidden"),
  });

  coordinator.handleSignal({ companyId: "company-1", changedAt: "2026-01-10T09:00:00.000Z" });
  await coordinator.flush();

  assert.deepEqual(events, ["check:v2", "refresh:v3", "clear-stale"]);
});

test("calendar realtime coordinator does not clear stale when refresh response is ignored", async () => {
  const range: CalendarVisibleRange = { from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" };
  const events: string[] = [];

  const coordinator = createCalendarRealtimeCoordinator({
    debounceMs: 0,
    getState: () => ({ companyId: "company-1", visibleRange: range, paused: false, currentVersion: "v1", hidden: false }),
    checkChanges: async () => {
      events.push("check:v2");
      return "v2";
    },
    refresh: async () => {
      events.push("refresh:null");
      return null;
    },
    markStale: (state) => events.push(`stale:${state.version}`),
    clearStale: () => events.push("clear-stale"),
    setPendingHiddenCheck: () => events.push("hidden"),
  });

  coordinator.handleSignal({ companyId: "company-1", changedAt: "2026-01-10T09:00:00.000Z" });
  await coordinator.flush();

  assert.deepEqual(events, ["check:v2", "refresh:null"]);
});

test("calendar realtime coordinator suppresses in-flight side effects after dispose", async () => {
  const range: CalendarVisibleRange = { from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z" };
  const events: string[] = [];
  let releaseCheck: ((version: string) => void) | null = null;

  const coordinator = createCalendarRealtimeCoordinator({
    debounceMs: 0,
    getState: () => ({ companyId: "company-1", visibleRange: range, paused: false, currentVersion: "v1", hidden: false }),
    checkChanges: async () =>
      new Promise<string>((resolve) => {
        events.push("check-started");
        releaseCheck = resolve;
      }),
    refresh: async () => {
      events.push("refresh");
      return "v2";
    },
    markStale: (state) => events.push(`stale:${state.version}`),
    clearStale: () => events.push("clear-stale"),
    setPendingHiddenCheck: () => events.push("hidden"),
    onFallbackMode: () => events.push("fallback"),
  });

  coordinator.handleSignal({ companyId: "company-1", changedAt: "2026-01-10T09:00:00.000Z" });
  coordinator.dispose();
  releaseCheck?.("v2");
  await coordinator.flush();

  assert.deepEqual(events, ["check-started"]);
});

test("calendar realtime fallback scheduler uses jittered timeouts and skips hidden polling", () => {
  const scheduled: number[] = [];
  let hidden = false;
  const scheduler = createFallbackRealtimeScheduler({
    baseDelayMs: 60_000,
    maxDelayMs: 300_000,
    jitterMs: 15_000,
    random: () => 0.5,
    getHidden: () => hidden,
    setTimeout: (_callback, delay) => {
      scheduled.push(delay);
      return scheduled.length;
    },
    clearTimeout: () => undefined,
  });

  scheduler.scheduleNext(false);
  assert.equal(scheduled[0], 67_500);
  scheduler.scheduleNext(true);
  assert.equal(scheduled[1], 127_500);
  hidden = true;
  scheduler.scheduleNext(false);
  assert.equal(scheduled.length, 2);
});

test("calendar realtime fallback scheduler resumes after hidden tab becomes visible", () => {
  const scheduled: number[] = [];
  const callbacks: Array<() => void> = [];
  let hidden = true;
  let checks = 0;
  const scheduler = createFallbackRealtimeScheduler({
    baseDelayMs: 60_000,
    maxDelayMs: 300_000,
    jitterMs: 0,
    random: () => 0,
    getHidden: () => hidden,
    setTimeout: (callback, delay) => {
      callbacks.push(callback);
      scheduled.push(delay);
      return scheduled.length;
    },
    clearTimeout: () => undefined,
  });

  assert.equal(scheduler.scheduleNext(false, () => checks++), null);
  assert.equal(scheduled.length, 0);

  hidden = false;
  scheduler.resumeWhenVisible(() => checks++);
  assert.deepEqual(scheduled, [60_000]);
  callbacks[0]?.();
  assert.equal(checks, 1);
});

test("calendar polling cleanup is a hard stop before fallback reschedule", () => {
  const runFallbackCheck = calendarHook.match(/async function runFallbackCheck\(\) \{([\s\S]*?)inFlight = true;/)?.[1] ?? "";

  assert.match(runFallbackCheck, /if \(disposed\) return;/);
  assert.doesNotMatch(runFallbackCheck, /if \(disposed \|\|/);
  assert.ok(
    runFallbackCheck.indexOf("if (disposed) return;") < runFallbackCheck.indexOf("fallback.scheduleNext(false, runFallbackCheck)"),
    "disposed polling cleanup must not schedule a replacement timeout"
  );
});
