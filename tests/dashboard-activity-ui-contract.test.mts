import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const activityPagePath = "app/(dashboard)/dashboard/activity/page.tsx";
const dashboardPagePath = "app/(dashboard)/dashboard/page.tsx";
const sidebarPath = "components/dashboard/sidebar.tsx";
const mobileNavPath = "components/dashboard/mobile-nav.tsx";

const read = (path: string) => readFileSync(path, "utf8");

test("dashboard activity page is a real service-backed feed with filters and pagination", () => {
  const source = read(activityPagePath);

  assert.match(source, /listDashboardActivity/);
  assert.match(source, /PaginationControls/);
  assert.match(source, /useSearchParams/);
  assert.match(source, /useRouter/);
  assert.match(source, /type:\s*next === "all" \? null : next/);
  assert.match(source, /page:\s*"1"/);
  assert.match(source, /pageSize:\s*String\(next\)/);

  for (const label of ["Все", "Кандидаты", "Вакансии", "Кредиты"]) {
    assert.match(source, new RegExp(label));
  }

  assert.doesNotMatch(source, /MvpPlaceholder/);
});

test("dashboard activity page has safe loading, empty, error, and abort behavior", () => {
  const source = read(activityPagePath);

  assert.match(source, /new AbortController\(\)/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /isSafeActivityErrorMessage/);
  assert.match(source, /ActivitySkeleton/);
  assert.match(source, /Активность не загрузилась/);
  assert.match(source, /Не удалось загрузить активность\. Попробуйте обновить страницу\./);
  assert.match(source, /Пока нет событий/);
  assert.match(source, /По выбранному фильтру событий нет/);
  assert.match(source, /aria-busy/);
  assert.doesNotMatch(source, /setError\(e instanceof Error \? e\.message : ACTIVITY_LOAD_ERROR\)/);
  assert.doesNotMatch(source, /Failed to fetch/);
});

test("dashboard activity page normalizes invalid URL params before fetching", () => {
  const source = read(activityPagePath);

  assert.match(source, /normalizeActivityQuery/);
  assert.match(source, /VALID_PAGE_SIZES/);
  assert.match(source, /router\.replace\(normalized\.href\)/);
  assert.match(source, /if \(normalized\.changed\) return/);
  assert.match(source, /type: normalized\.filter/);
  assert.match(source, /page: normalized\.page/);
  assert.match(source, /pageSize: normalized\.pageSize/);
});

test("dashboard activity feed protects credit privacy and long row content", () => {
  const source = read(activityPagePath);

  assert.match(source, /Участник команды/);
  assert.match(source, /item\.kind === "credits_spent"/);
  assert.match(source, /item\.actor\.name \?\? "Участник команды"/);
  assert.match(source, /typeof item\.creditDelta === "number"/);
  assert.match(source, /Math\.abs\(item\.creditDelta\)/);
  assert.match(source, /min-w-0/);
  assert.match(source, /break-words/);
  assert.match(source, /shrink-0/);
  assert.match(source, /<Link[\s\S]{0,160}href=\{item\.entity\.href\}/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noopener noreferrer"/);
  assert.match(source, /aria-label=\{`Открыть \$\{item\.title\}`\}/);
  assert.doesNotMatch(source, /actor\.email/);
  assert.doesNotMatch(source, /[📋👤💳🤖📌]/u);
});

test("dashboard activity timestamps are absolute server timestamps converted for display", () => {
  for (const source of [read(activityPagePath), read(dashboardPagePath)]) {
    assert.match(source, /formatDashboardActivityOccurredAt/);
    assert.doesNotMatch(source, /formatDistanceToNow/);
  }
});

test("dashboard navigation includes activity in sidebar and mobile menu", () => {
  for (const source of [read(sidebarPath), read(mobileNavPath)]) {
    assert.match(source, /title:\s*"Активность"/);
    assert.match(source, /href:\s*"\/dashboard\/activity"/);
    assert.match(source, /Activity/);
  }
});

test("dashboard home loads last activity from shared service independently from stats", () => {
  const source = read(dashboardPagePath);

  assert.match(source, /listDashboardActivity/);
  assert.match(source, /DashboardActivityItem/);
  assert.match(source, /pageSize:\s*5/);
  assert.match(source, /activityLoadError/);
  assert.match(source, /setStatsLoading/);
  assert.match(source, /setActivityLoading/);
  assert.match(source, /\/api\/dashboard\/stats/);
  assert.match(source, /\/dashboard\/activity/);
  assert.match(source, /Последняя активность/);
  assert.match(source, /Не удалось загрузить последние события\./);
  assert.match(source, /function activitySummary/);
  assert.match(source, /activity\.kind === "credits_spent"/);
  assert.match(source, /activity\.actor\.name \?\? "Участник команды"/);
  assert.match(source, /списано/);
  assert.match(source, /AI-анализ/);
  assert.match(source, /creditAmountLabel/);
  assert.doesNotMatch(source, /activities"\s+in\s+json/);
  assert.doesNotMatch(source, /getActivityIcon\(activity\.type\)/);
  assert.doesNotMatch(source, /[📋👤💳🤖📌]/u);
  assert.doesNotMatch(source, /actor\.email/);
});

test("dashboard home cards and status summary avoid accessibility regressions", () => {
  const source = read(dashboardPagePath);

  assert.doesNotMatch(source, /<Card[\s\S]{0,220}role="button"/);
  assert.doesNotMatch(source, /<Card[\s\S]{0,220}tabIndex=\{0\}/);
  assert.match(source, /visibleStatusEntries/);
  assert.match(source, /Пока нет данных по статусам кандидатов\./);
  assert.doesNotMatch(source, /aria-hidden="true"\s*[\s\S]{0,120}role="img"/);
  assert.doesNotMatch(source, /aria-hidden="true"\s*[\s\S]{0,160}aria-label=\{`Цветовой индикатор/);
});
