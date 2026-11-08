import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("hooks/use-calendar-realtime.ts", "utf8");

test("calendar hook does not open Supabase Realtime from the browser", () => {
  assert.doesNotMatch(source, /createSupabaseBrowserClient/);
  assert.doesNotMatch(source, /@\/lib\/supabase\/browser/);
  assert.doesNotMatch(source, /\.channel\(/);
  assert.doesNotMatch(source, /supabase\.realtime/);
  assert.doesNotMatch(source, /onAuthStateChange/);
  assert.doesNotMatch(source, /removeChannel/);
  assert.doesNotMatch(source, /formatCalendarRealtimeTopic/);
  assert.doesNotMatch(source, /parseCalendarRealtimeSignal/);
  assert.match(source, /onCheckChangesRequested/);
  assert.match(source, /onRefreshRequested/);
});

test("calendar hook polls the guarded changes API and refreshes changed visible ranges", () => {
  assert.match(source, /setFallbackMode\(Boolean\(companyId\)\)/);
  assert.match(source, /createFallbackRealtimeScheduler/);
  assert.match(source, /const version = await onCheckChangesRequestedRef\.current\(startedRange\);/);
  assert.match(source, /const acceptedVersion = await onRefreshRequestedRef\.current\(\);/);
  assert.match(source, /if \(!version \|\| version === currentVersionRef\.current\) return;/);
});

test("calendar hook checks immediately when a hidden polling tab becomes visible", () => {
  const visibilityBlock = source.match(/function handleFallbackVisibilityChange\(\) \{[\s\S]*?\n    \}/)?.[0] ?? "";

  assert.match(visibilityBlock, /document\.visibilityState === "visible"/);
  assert.match(visibilityBlock, /void runFallbackCheck\(\);/);
  assert.doesNotMatch(visibilityBlock, /resumeWhenVisible\(runFallbackCheck\)/);
});
