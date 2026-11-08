import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const readMaybe = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : "");

const statsPageSource = () => readMaybe("app/(dashboard)/dashboard/stats/page.tsx");
const dashboardSource = () => readMaybe("components/dashboard/stats/analytics-dashboard.tsx");
const juniorDocsSource = () =>
  `${readMaybe("docs/For_juniors/hiiire_for_junior.md")}\n${readMaybe("docs/For_juniors/materials-for-testing.md")}\n${readMaybe("docs/For_juniors/promptforqaassistant.md")}`;

test("stats page mounts the production analytics dashboard instead of the MVP placeholder", () => {
  const source = statsPageSource();

  assert.match(source, /AnalyticsDashboard/);
  assert.doesNotMatch(source, /MvpPlaceholder/);
  assert.doesNotMatch(source, /готовится|находится в разработке/i);
});

test("analytics dashboard exposes all production tabs and keeps Team admin-only", () => {
  const source = dashboardSource();

  for (const label of ["Обзор", "Воронка", "Вакансии", "Источники", "Команда", "AI", "Экспорт"]) {
    assert.match(source, new RegExp(label));
  }

  assert.match(source, /isAdmin\s*&&[\s\S]*value="team"/);
  assert.match(source, /role:\s*"admin"\s*\|\s*"hr"\s*\|\s*"recruiter"/);
  assert.doesNotMatch(source, /готовится|скоро появится|находится в разработке/i);
});

test("analytics filters include saved views with private views for everyone and company publishing for admins", () => {
  const source = dashboardSource();

  assert.match(source, /savedViews/);
  assert.match(source, /fetch\("\/api\/analytics\/saved-views"/);
  assert.match(source, /applySavedView/);
  assert.doesNotMatch(source, /local-\$\{Date\.now\(\)\}/);
  assert.match(source, /visibility:\s*"private"\s*\|\s*"company"/);
  assert.match(source, /Личный вид/);
  assert.match(source, /Вид компании/);
  assert.match(source, /isAdmin\s*\?\s*\[/);
  assert.match(source, /method:\s*"DELETE"/);
  assert.match(source, /analytics_saved_view_applied/);
  assert.match(source, /Удалить вид/);
});

test("analytics dashboard exposes admin hiring target management", () => {
  const source = dashboardSource();

  assert.match(source, /fetch\("\/api\/analytics\/hiring-targets"/);
  assert.match(source, /method:\s*"PUT"/);
  assert.match(source, /Цели найма/);
  assert.match(source, /Сохранить цель/);
  assert.match(source, /Новая цель/);
  assert.match(source, /SLA без движения/);
  assert.match(source, /minimum_pipeline_size/);
  assert.match(source, /editHiringTarget/);
  assert.match(source, /isAdmin\s*\?\s*\([\s\S]*Цели найма/);
});

test("analytics AI and export copy is role-aware and user-facing", () => {
  const source = dashboardSource();

  assert.match(source, /XLSX/);
  assert.match(source, /CSV/);
  assert.match(source, /Отчёт сформируется по доступным вам данным/);
  assert.match(source, /companyAiUsage/);
  assert.match(source, /isAdmin\s*&&[\s\S]*companyAiUsage/);
  assert.match(source, /AI помогает расставить приоритеты/);
  assert.doesNotMatch(source, /INVALID_BODY|SQL|provider error|stack trace|stack/i);
});

test("risk and SLA copy distinguishes configured breaches from softer hints", () => {
  const source = dashboardSource();

  assert.match(source, /configuredSlaBreaches/);
  assert.match(source, /Настроенные SLA/);
  assert.match(source, /давно не было движения/);
  assert.doesNotMatch(source, /SLA нарушен по умолчанию|дефолтн(?:ый|ая|ое) SLA/i);
});

test("analytics dashboard converts UI filter state to API filter params for dashboard and exports", () => {
  const source = dashboardSource();
  const serializerStart = source.indexOf("function buildAnalyticsApiSearchParams");
  assert.ok(serializerStart >= 0, "dashboard must have an explicit UI-to-API filter serializer");
  const serializerEnd = source.indexOf("export function buildAnalyticsDrilldownHref", serializerStart);
  assert.ok(serializerEnd > serializerStart, "API serializer must be separate from drilldown link serialization");
  const serializer = source.slice(serializerStart, serializerEnd);

  for (const apiParam of ["vacancyId", "candidateStatus", "aiScoreMin", "periodMode", "asOfDate"]) {
    assert.match(serializer, new RegExp(`params\\.set\\("${apiParam}"`), `${apiParam} must be sent to analytics APIs`);
  }

  assert.match(serializer, /filters\.periodMode\s*===\s*"asOf"[\s\S]*"as_of_snapshot"/);
  assert.match(serializer, /"period_event"/);
  assert.doesNotMatch(serializer, /params\.set\("vacancy",/);
  assert.doesNotMatch(serializer, /params\.set\("status",/);
  assert.doesNotMatch(serializer, /params\.set\("scoreThreshold",/);
  assert.match(source, /fetch\(`\/api\/analytics\?\$\{buildAnalyticsApiSearchParams\(filters\)\.toString\(\)\}`/);
  assert.match(source, /useMemo\(\(\)\s*=>\s*buildAnalyticsApiSearchParams\(filters\)/);
});

test("analytics dashboard renders the visible global filters promised by the contract", () => {
  const source = dashboardSource();

  assert.match(source, /<Label[^>]*>\s*Вакансия\s*<\/Label>[\s\S]*setFilter\("vacancy",/);
  assert.match(source, /<Label[^>]+htmlFor="analytics-department"[^>]*>\s*Департамент\s*<\/Label>[\s\S]*setFilter\("department",/);
  assert.match(source, /<Label[^>]+htmlFor="analytics-location"[^>]*>\s*Город\s*<\/Label>[\s\S]*setFilter\("location",/);
  assert.match(source, /dashboard\.vacancies\.map\(\(vacancy\)/);
  assert.match(source, /e\.target\.value\s*\|\|\s*"all"/);
  assert.doesNotMatch(source, /setFilter\("(?:department|location)",\s*e\.target\.value\.trim\(\)/);
});

test("junior QA docs describe production analytics instead of the old stats preview", () => {
  const source = juniorDocsSource();

  assert.match(source, /\/dashboard\/stats[\s\S]*Аналитика найма/);
  assert.doesNotMatch(source, /Статистика\s*[—|-]\s*MVP-заглушка/i);
  assert.doesNotMatch(source, /\?mvp=0|MVP-заглушка|временный экран с переходом в раздел обратной связи/i);
});
