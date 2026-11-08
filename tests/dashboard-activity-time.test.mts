import assert from "node:assert/strict";
import test from "node:test";

import { formatDashboardActivityOccurredAt } from "../lib/dashboard/activity-time.ts";

test("dashboard activity time formats server timestamps as absolute local time", () => {
  const value = formatDashboardActivityOccurredAt("2026-05-26T17:45:00.000Z", "ru-RU", "Europe/Moscow");

  assert.equal(value, "26.05.2026, 20:45");
});

test("dashboard activity time treats timezone-less server timestamps as UTC", () => {
  const value = formatDashboardActivityOccurredAt("2026-05-26T17:45:00", "ru-RU", "Europe/Moscow");

  assert.equal(value, "26.05.2026, 20:45");
});
