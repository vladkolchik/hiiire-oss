import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const routePath = "app/api/analytics/export/route.ts";
const routeSource = () => (existsSync(routePath) ? readFileSync(routePath, "utf8") : "");

test("analytics export route validates format and csv dataset with safe Russian messages", () => {
  const source = routeSource();

  assert.match(source, /export\s+async\s+function\s+GET/);
  assert.match(source, /format=xlsx\|csv/);
  assert.match(source, /dataset/);
  assert.match(source, /INVALID_QUERY/);
  assert.match(source, /Выберите формат выгрузки/);
  assert.match(source, /Выберите CSV-датасет/);
  assert.match(source, /NextResponse\.json\(\{\s*error,\s*message,\s*issues/);
  assert.doesNotMatch(source, /Too big|Too small|expected string|stack trace|provider error/i);
});

test("analytics export route validates date order with the shared dashboard validator", () => {
  const source = routeSource();

  assert.match(source, /isAnalyticsPeriodOrderValid/);
  assert.match(source, /дата начала должна быть раньше даты окончания/i);
});

test("analytics export route uses scoped analytics loader and shared XLSX/CSV builders", () => {
  const source = routeSource();

  assert.match(source, /createSupabaseServerClient/);
  assert.match(source, /getSupabaseAdminClient/);
  assert.match(source, /requireCompanyContext/);
  assert.match(source, /normalizeAnalyticsFilters\(searchParams,\s*\{\s*role:\s*ctx\.role/);
  assert.match(source, /loadAnalyticsDashboard\(\{[\s\S]*supabase[\s\S]*admin[\s\S]*ctx[\s\S]*filters/);
  assert.match(source, /output:\s*"raw"/);
  assert.match(source, /buildAnalyticsXlsxBuffer/);
  assert.match(source, /buildAnalyticsCsvDataset/);
  assert.match(source, /listAvailableCsvDatasets/);
  assert.doesNotMatch(source, /@ts-ignore/);
});

test("analytics export route protects admin-only datasets and AI audit fields", () => {
  const source = routeSource();

  assert.match(source, /ADMIN_ONLY_CSV_DATASETS/);
  assert.match(source, /recruiters/);
  assert.match(source, /ai-audit/);
  assert.match(source, /ctx\.role\s*!==\s*"admin"/);
  assert.match(source, /Этот датасет доступен только администратору/);
  assert.match(source, /jsonError\("FORBIDDEN",\s*403/);
  assert.doesNotMatch(source, /rawPrompt|prompt_text|provider_payload|resume_text|cv_text/i);
});

test("analytics export route returns download responses and requires export audit writes", () => {
  const source = routeSource();

  assert.match(source, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);
  assert.match(source, /text\/csv;\s*charset=utf-8/);
  assert.match(source, /Content-Disposition/);
  assert.match(source, /attachment;\s*filename=/);
  assert.match(source, /\.from\("analytics_export_events"\)[\s\S]*\.insert\(/);
  assert.match(source, /company_id:\s*ctx\.companyId/);
  assert.match(source, /user_id:\s*ctx\.userId/);
  assert.match(source, /role:\s*ctx\.role/);
  assert.match(source, /report_type/);
  assert.match(source, /format/);
  assert.match(source, /filters/);
  assert.match(source, /sheets/);
  assert.match(source, /row_counts/);
  assert.match(source, /if\s*\(error\)\s*throw new Error\("EXPORT_AUDIT_FAILED"\)/);
  assert.doesNotMatch(source, /Export download must not fail|best-effort/i);
  assert.match(source, /analytics_export_requested/);
  assert.match(source, /analytics_export_completed/);
  assert.match(source, /analytics_export_failed/);
  assert.match(source, /Не удалось подготовить выгрузку/);
});
