import assert from "node:assert/strict";
import test from "node:test";

import { getInterviewRangeQueryWindow, interviewOverlapsRange } from "../lib/interviews/range.ts";

test("visible range includes events that started before the range but overlap it", () => {
  assert.equal(
    interviewOverlapsRange({
      scheduledAt: "2099-01-10T08:30:00.000Z",
      durationMinutes: 90,
      from: "2099-01-10T09:00:00.000Z",
      to: "2099-01-10T18:00:00.000Z",
    }),
    true
  );
});

test("visible range excludes adjacent events", () => {
  assert.equal(
    interviewOverlapsRange({
      scheduledAt: "2099-01-10T08:00:00.000Z",
      durationMinutes: 60,
      from: "2099-01-10T09:00:00.000Z",
      to: "2099-01-10T18:00:00.000Z",
    }),
    false
  );
});

test("query window reaches backwards by max interview duration", () => {
  const window = getInterviewRangeQueryWindow({
    from: "2099-01-10T09:00:00.000Z",
    to: "2099-01-10T18:00:00.000Z",
  });

  assert.equal(window.queryFrom, "2099-01-10T01:00:00.000Z");
  assert.equal(window.queryTo, "2099-01-10T18:00:00.000Z");
});
