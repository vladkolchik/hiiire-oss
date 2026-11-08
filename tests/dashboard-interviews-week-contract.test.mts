import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const statsRoute = readFileSync(new URL("../app/api/dashboard/stats/route.ts", import.meta.url), "utf8");
const dashboardPage = readFileSync(new URL("../app/(dashboard)/dashboard/page.tsx", import.meta.url), "utf8");
const interviewWeek = readFileSync(new URL("../lib/dashboard/interview-week.ts", import.meta.url), "utf8");
const interviewCards = readFileSync(new URL("../lib/dashboard/interview-stat-cards.ts", import.meta.url), "utf8");

test("dashboard stats API counts upcoming scheduled interviews from one server timestamp", () => {
  assert.doesNotMatch(statsRoute, /const\s+interviewsThisWeek\s*=\s*0/);
  assert.match(statsRoute, /Date\.now\(\)/);
  assert.match(statsRoute, /serverNow/);
  assert.match(statsRoute, /loadDashboardInterviewCounts/);
  assert.match(statsRoute, /ownInterviewsUntilWeekEnd/);
  assert.match(statsRoute, /employeeInterviewsUntilWeekEnd/);
  assert.match(interviewWeek, /\.from\("interviews"\)/);
  assert.match(interviewWeek, /\.eq\("status",\s*"scheduled"\)/);
  assert.match(interviewWeek, /\.gte\("scheduled_at"/);
  assert.match(interviewWeek, /\.lt\("scheduled_at"/);
  assert.match(interviewWeek, /\.contains\("interviewer_ids"/);
  assert.match(interviewWeek, /\.not\(\s*"interviewer_ids",\s*"cd"/);
  assert.match(statsRoute, /loadDashboardInterviewCounts\(admin,\s*ctx,\s*\{\s*serverNow,\s*weekEndAt\s*\}\)/);
  assert.match(statsRoute, /serverNow,\s*weekEndAt,\s*avgMatchPercentage/);
});

test("dashboard interview card renders the until-week-end labels instead of the old copy", () => {
  assert.doesNotMatch(dashboardPage, /На этой неделе/);
  assert.match(interviewCards, /до конца недели/);
  assert.match(dashboardPage, /ownInterviewsUntilWeekEnd/);
  assert.match(dashboardPage, /employeeInterviewsUntilWeekEnd/);
});
