import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const readMaybe = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : "");

const dashboardSource = () => readMaybe("components/dashboard/stats/analytics-dashboard.tsx");
const serverSource = () => readMaybe("lib/analytics/server.ts");
const candidatesPageSource = () => readMaybe("app/(dashboard)/dashboard/candidates/page.tsx");
const vacanciesPageSource = () => readMaybe("app/(dashboard)/dashboard/vacancies/page.tsx");
const candidateServiceSource = () => readMaybe("services/data/candidates.ts");
const vacancyServiceSource = () => readMaybe("services/data/vacancies.ts");

test("analytics drilldown links preserve period, filters, score ranges, and return context", () => {
  const source = dashboardSource();

  assert.match(source, /export function buildAnalyticsDrilldownHref/);
  assert.match(source, /new URLSearchParams/);
  for (const key of ["periodStart", "periodEnd", "periodMode", "vacancy", "source", "status", "scoreThreshold", "returnTo"]) {
    assert.match(source, new RegExp(`params\\.set\\("${key}"`), `${key} must be preserved in drilldown URLs`);
  }
  assert.match(source, /scoreMin/);
  assert.match(source, /scoreMax/);
  assert.match(source, /scoreBucket/);
  assert.doesNotMatch(source, /Number\(overrides\.scoreThreshold[\s\S]*\?\s*"high"\s*:\s*"all"/);
  assert.match(source, /analytics_drilldown_opened/);
});

test("candidate page parses analytics drilldown query params without dropping existing candidate filters", () => {
  const source = candidatesPageSource();

  assert.match(source, /function parseAnalyticsDrilldownSearchParams/);
  assert.match(source, /analyticsPeriodStart/);
  assert.match(source, /analyticsPeriodEnd/);
  assert.match(source, /analyticsSource/);
  assert.match(source, /analyticsStatus/);
  assert.match(source, /analyticsScoreThreshold/);
  assert.match(source, /analyticsScoreMin/);
  assert.match(source, /analyticsScoreMax/);
  assert.match(source, /analyticsScoreBucket/);
  assert.match(source, /analyticsReturnTo/);
  assert.match(source, /returnTo/);
  assert.match(source, /Сохранён контекст аналитики/);
});

test("vacancy page consumes analytics vacancy drilldown and preserves return context", () => {
  const source = vacanciesPageSource();
  const service = vacancyServiceSource();

  assert.match(source, /function parseAnalyticsVacancyDrilldownSearchParams\(params: URLSearchParams\)/);
  assert.match(source, /analyticsVacancyId/);
  assert.match(source, /analyticsReturnTo/);
  assert.match(source, /function isAnalyticsStatsReturnPath\(value: string \| null\)/);
  assert.match(source, /normalized === "\/dashboard\/stats"/);
  assert.match(source, /normalized\.startsWith\("\/dashboard\/stats\?"\)/);
  assert.doesNotMatch(source, /rawReturnTo\?\.startsWith\("\/dashboard\/stats"\)/);
  assert.match(source, /Сохранён контекст аналитики/);
  assert.match(source, /setDetailsVacancyId\(analyticsDrilldown\.analyticsVacancyId\)/);
  assert.match(source, /vacancyId:\s*analyticsDrilldown\.analyticsVacancyId/);
  assert.match(source, /function isVacancyStatusFilter\(value: string \| null\)/);
  assert.match(source, /const nextStatus = isVacancyStatusFilter\(rawStatus\) \? rawStatus : "all"/);
  assert.match(service, /vacancyId\?:\s*string\s*\|\s*null/);
  assert.match(service, /if \(vacancyId\) query = query\.eq\("id", vacancyId\)/);
  assert.match(source, /returnTo/);
});

test("candidate page applies analytics drilldown params to candidate queries", () => {
  const source = candidatesPageSource();

  assert.match(source, /const analyticsCandidateFilters\s*=\s*useMemo/);
  for (const field of ["source", "status", "eventStatus", "eventPeriodStart", "eventPeriodEnd"]) {
    assert.match(source, new RegExp(`${field}:\\s*analyticsDrilldown`), `${field} must be derived from analytics drilldown`);
  }
  assert.match(source, /aiScoreMin:[\s\S]*analyticsScoreMin/);
  assert.match(source, /aiScoreMax:[\s\S]*analyticsScoreMax/);
  assert.match(source, /analyticsPeriodMode\s*===\s*"period"/);
  assert.match(source, /analyticsPeriodMode\s*===\s*"asOf"/);
  assert.match(source, /listCandidatesPage\(\{[\s\S]*\.\.\.analyticsCandidateFilters/);
  assert.match(source, /selectionScopeKey[\s\S]*analyticsCandidateFilters/);
  assert.doesNotMatch(source, /analyticsDrilldown[\s\S]{0,300}bannerOnly/);
});

test("candidate query updates preserve analytics drilldown context", () => {
  const source = candidatesPageSource();

  assert.match(source, /preserveAnalyticsDrilldownParams/);
  assert.match(source, /replaceQuery\(next/);
  assert.match(source, /analyticsQueryParamKeys/);
  assert.doesNotMatch(source, /params\.delete\("returnTo"\)/);
});

test("candidate data service supports event-based drilldowns and exact AI score buckets", () => {
  const source = candidateServiceSource();

  assert.match(source, /eventStatus\?:\s*Candidate\["status"\]/);
  assert.match(source, /eventPeriodStart/);
  assert.match(source, /eventPeriodEnd/);
  assert.match(source, /aiScoreMax/);
  assert.match(source, /\.from\("pipeline_events"\)/);
  assert.match(source, /\.eq\("to_status",\s*input\.eventStatus\)/);
  assert.match(source, /\.gte\("occurred_at"/);
  assert.match(source, /\.lte\("occurred_at"/);
  assert.match(source, /pageSize\s*=\s*1000/);
  assert.match(source, /\.range\(from,\s*from \+ pageSize - 1\)/);
  assert.match(source, /candidateIds\.add/);
  assert.match(source, /\.in\("id",\s*eventCandidateIds\)/);
  assert.match(source, /\.lte\("match_percentage",\s*input\.aiScoreMax\)/);
  assert.doesNotMatch(source, /gte\("applied_at"/);
});

test("server DTO forces funnel drilldowns to period mode and keeps score-filtered links aligned", () => {
  const source = serverSource();

  assert.match(source, /overrides\.periodMode\s*\?\?\s*filters\.periodMode/);
  assert.match(source, /status:\s*row\.stage,\s*periodMode:\s*"period"/);
  assert.match(source, /source:\s*row\.source,\s*scoreMin:\s*String\(filters\.scoreThreshold\)/);
  assert.match(source, /targetPath === "\/dashboard\/candidates"/);
  assert.match(source, /drilldownHref\("\/dashboard\/vacancies", uiFilters, \{ vacancy: row\.vacancyId \}\)/);
  const vacancyHrefCalls = source.match(/drilldownHref\("\/dashboard\/vacancies", uiFilters, \{[^}]+\}\)/g) ?? [];
  assert.ok(vacancyHrefCalls.length > 0, "vacancy drilldown calls must exist");
  for (const call of vacancyHrefCalls) {
    assert.doesNotMatch(call, /status:/);
    assert.doesNotMatch(call, /scoreMin:/);
  }
});
