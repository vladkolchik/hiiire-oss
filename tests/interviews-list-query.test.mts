import assert from "node:assert/strict";
import test from "node:test";

import {
  getInterviewListRange,
  isInterviewStatusFilter,
  limitInterviewSearchInput,
  normalizeInterviewSearch,
  parseInterviewListScope,
  parseInterviewStatusFilter,
} from "../lib/interviews/list-query.ts";

test("interview list query parses safe filters and falls back to defaults", () => {
  assert.equal(parseInterviewListScope("upcoming"), "upcoming");
  assert.equal(parseInterviewListScope("all"), "all");
  assert.equal(parseInterviewListScope("calendar"), "upcoming");

  assert.equal(parseInterviewStatusFilter("scheduled"), "scheduled");
  assert.equal(parseInterviewStatusFilter("completed"), "completed");
  assert.equal(parseInterviewStatusFilter("cancelled"), "cancelled");
  assert.equal(parseInterviewStatusFilter("pending"), "all");

  assert.equal(isInterviewStatusFilter("cancelled"), true);
  assert.equal(isInterviewStatusFilter("pending"), false);
});

test("interview list query clamps pagination like other dashboard lists", () => {
  assert.deepEqual(getInterviewListRange({ page: 3, pageSize: 25 }), {
    page: 3,
    pageSize: 25,
    from: 50,
    to: 74,
  });

  assert.deepEqual(getInterviewListRange({ page: Number.NaN, pageSize: 500 }), {
    page: 1,
    pageSize: 200,
    from: 0,
    to: 199,
  });
});

test("interview search input is trimmed, whitespace-normalized, and length-limited", () => {
  assert.equal(normalizeInterviewSearch("  Анна   Петрова  "), "Анна Петрова");
  assert.equal(normalizeInterviewSearch("   "), "");

  const long = "а".repeat(200);
  assert.equal(limitInterviewSearchInput(long).length, 120);
});
