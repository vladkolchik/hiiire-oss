import assert from "node:assert/strict";
import test from "node:test";

import {
  AI_SHORTLIST_THRESHOLD,
  getAnalyticsFilterLabel,
  isAnalyticsPeriodOrderValid,
  normalizeAnalyticsFilters,
} from "../lib/analytics/filters.ts";

test("analytics filters fall back to safe defaults with user-facing labels", () => {
  const params = new URLSearchParams({
    periodStart: "not-a-date",
    periodEnd: "2026-99-99",
    periodMode: "raw-sql",
    vacancyStatus: "deleted",
    aiScoreMin: "250",
    riskyOnly: "yes",
    staleOnly: "1",
    ownerId: "owner-1",
  });

  const filters = normalizeAnalyticsFilters(params, {
    now: new Date("2026-05-19T12:00:00.000Z"),
    role: "hr",
  });

  assert.equal(filters.periodStart, "2026-04-19");
  assert.equal(filters.periodEnd, "2026-05-19");
  assert.equal(filters.periodMode, "period_event");
  assert.equal(filters.vacancyStatus, "all");
  assert.equal(filters.aiScoreMin, null);
  assert.equal(filters.riskyOnly, false);
  assert.equal(filters.staleOnly, true);
  assert.equal(filters.ownerId, null);
  assert.equal(getAnalyticsFilterLabel("staleOnly"), "Только кандидаты без движения");
});

test("admin-only owner filter is preserved for admin and ignored for other roles", () => {
  const params = new URLSearchParams({
    ownerId: "user-42",
    periodStart: "2026-05-01",
    periodEnd: "2026-05-19",
  });

  assert.equal(
    normalizeAnalyticsFilters(params, { now: new Date("2026-05-19"), role: "admin" }).ownerId,
    "user-42",
  );
  assert.equal(
    normalizeAnalyticsFilters(params, { now: new Date("2026-05-19"), role: "recruiter" }).ownerId,
    null,
  );
});

test("custom AI score filter never changes named AI-shortlist threshold", () => {
  const filters = normalizeAnalyticsFilters(new URLSearchParams({ aiScoreMin: "92" }), {
    now: new Date("2026-05-19"),
    role: "admin",
  });

  assert.equal(filters.aiScoreMin, 92);
  assert.equal(AI_SHORTLIST_THRESHOLD, 80);
  assert.equal(filters.aiShortlistThreshold, AI_SHORTLIST_THRESHOLD);
});

test("all period modes from the analytics contract are accepted", () => {
  const modes = ["period_event", "period_created", "period_closed", "as_of_snapshot"] as const;

  for (const mode of modes) {
    const filters = normalizeAnalyticsFilters(new URLSearchParams({ periodMode: mode }), {
      now: new Date("2026-05-19"),
      role: "admin",
    });

    assert.equal(filters.periodMode, mode);
  }
});

test("analytics API filter contract uses server query names for visible dashboard filters", () => {
  const filters = normalizeAnalyticsFilters(
    new URLSearchParams({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-19",
      periodMode: "as_of_snapshot",
      asOfDate: "2026-05-19",
      vacancyId: "vacancy-42",
      vacancyStatus: "active",
      candidateStatus: "offer",
      aiScoreMin: "81",
      source: "hh.ru",
      riskyOnly: "1",
      staleOnly: "1",
    }),
    { now: new Date("2026-05-19"), role: "admin" },
  );

  assert.equal(filters.periodMode, "as_of_snapshot");
  assert.equal(filters.asOfDate, "2026-05-19");
  assert.equal(filters.vacancyId, "vacancy-42");
  assert.equal(filters.vacancyStatus, "active");
  assert.equal(filters.candidateStatus, "offer");
  assert.equal(filters.aiScoreMin, 81);
  assert.equal(filters.source, "hh.ru");
  assert.equal(filters.riskyOnly, true);
  assert.equal(filters.staleOnly, true);
});

test("shared analytics period validation rejects inverted ranges", () => {
  assert.equal(isAnalyticsPeriodOrderValid("2026-05-01", "2026-05-31"), true);
  assert.equal(isAnalyticsPeriodOrderValid("2026-05-31", "2026-05-01"), false);
});
