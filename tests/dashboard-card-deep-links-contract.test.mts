import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildCandidateCardHref, buildVacancyCardHref } from "../lib/dashboard/deep-links.ts";

const filesThatMustUseSharedHelpers = [
  "app/api/dashboard/activity/route.ts",
  "lib/hr-assistant/tools/candidate-read.ts",
  "lib/hr-assistant/tools/vacancy-read.ts",
  "lib/hr-assistant/tools/calendar.ts",
] as const;

const candidatesPage = readFileSync("app/(dashboard)/dashboard/candidates/page.tsx", "utf8");
const vacanciesPage = readFileSync("app/(dashboard)/dashboard/vacancies/page.tsx", "utf8");

test("dashboard card deep links are built by one shared helper", () => {
  assert.equal(buildCandidateCardHref("candidate 1/2"), "/dashboard/candidates?candidate=candidate%201%2F2");
  assert.equal(buildVacancyCardHref("vacancy 1/2"), "/dashboard/vacancies?vacancy=vacancy%201%2F2");
});

test("activity and assistant surfaces do not keep local card link builders", () => {
  for (const filePath of filesThatMustUseSharedHelpers) {
    const source = readFileSync(filePath, "utf8");

    assert.match(source, /@\/lib\/dashboard\/deep-links/, `${filePath} must import shared dashboard deep link helpers`);
    assert.doesNotMatch(source, /function\s+buildCandidateHref\b/, `${filePath} must not define a candidate href helper locally`);
    assert.doesNotMatch(source, /function\s+buildVacancyHref\b/, `${filePath} must not define a vacancy href helper locally`);
    assert.doesNotMatch(source, /\/dashboard\/candidates\?candidate=\$\{encodeURIComponent/, `${filePath} must not inline candidate card hrefs`);
    assert.doesNotMatch(source, /\/dashboard\/vacancies\?vacancy=\$\{encodeURIComponent/, `${filePath} must not inline vacancy card hrefs`);
  }
});

test("card detail query params do not reload or narrow the list behind the details panel", () => {
  const candidateFiltersStart = candidatesPage.indexOf("const analyticsCandidateFilters = useMemo");
  assert.ok(candidateFiltersStart >= 0, "candidate analytics filters memo is missing");
  const candidateFiltersEnd = candidatesPage.indexOf("const selectionScopeKey", candidateFiltersStart);
  assert.ok(candidateFiltersEnd > candidateFiltersStart, "candidate analytics filters memo end was not found");
  const candidateFiltersBlock = candidatesPage.slice(candidateFiltersStart, candidateFiltersEnd);

  assert.doesNotMatch(candidateFiltersBlock, /\[\s*analyticsDrilldown\s*\]/);
  assert.match(candidateFiltersBlock, /analyticsDrilldown\.analyticsSource/);
  assert.match(candidateFiltersBlock, /analyticsDrilldown\.analyticsPeriodStart/);
  assert.doesNotMatch(candidateFiltersBlock, /searchParams/);

  assert.match(vacanciesPage, /const analyticsVacancyId = isAnalyticsStatsReturnPath\(rawReturnTo\)\s*\?\s*vacancy\s*:\s*null/);
  assert.match(vacanciesPage, /analyticsVacancyId,/);
  assert.match(vacanciesPage, /const linkedVacancyId = searchParams\.get\("vacancy"\)\?\.trim\(\) \|\| null/);
  assert.match(vacanciesPage, /vacancyId:\s*analyticsDrilldown\.analyticsVacancyId/);
});
