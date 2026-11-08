import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("interview list API exposes a paged list mode without weakening calendar range rules", () => {
  const route = readFileSync("app/api/interviews/route.ts", "utf8");

  assert.match(route, /mode["']?\)\s*===\s*["']list["']/);
  assert.match(route, /loadVisibleInterviewListPage/);
  assert.match(route, /parseRequiredRange/);
  assert.match(route, /loadVisibleCalendarSnapshot/);
});

test("interview list page keeps read access checks and uses bounded honest pagination", () => {
  const source = readFileSync("lib/interviews/list-snapshot.ts", "utf8");

  assert.match(source, /requireInterviewReadAccess/);
  assert.match(source, /normalizeInterviewSearch/);
  assert.match(source, /getInterviewListRange/);
  assert.match(source, /INTERVIEW_LIST_MAX_SCAN_ROWS/);
  assert.match(source, /\.range\(/);
  assert.match(source, /hasMore/);
  assert.match(source, /totalIsExact/);
  assert.match(source, /scanLimitReached/);
  assert.match(source, /slice\(from,\s*to \+ 1\)/);
  assert.match(source, /enrichVisibleInterviewRows/);
});
