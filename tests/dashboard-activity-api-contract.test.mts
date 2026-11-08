import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routePath = "app/api/dashboard/activity/route.ts";
const servicePath = "services/data/activity.ts";
const databaseTypesPath = "lib/supabase/database.types.ts";

const route = () => readFileSync(routePath, "utf8");
const service = () => readFileSync(servicePath, "utf8");
const databaseTypes = () => readFileSync(databaseTypesPath, "utf8");

test("dashboard activity route is server guarded and calls list plus count RPCs", () => {
  const source = route();

  assert.match(source, /requireCompanyContext/);
  assert.match(source, /createSupabaseServerClient/);
  assert.match(source, /getSupabaseAdminClient/);
  assert.match(source, /\.rpc\("list_dashboard_activity"/);
  assert.match(source, /\.rpc\("count_dashboard_activity"/);
  assert.match(source, /p_company_id:\s*ctx\.companyId/);
  assert.match(source, /p_user_id:\s*ctx\.userId/);
  assert.match(source, /p_role:\s*ctx\.role/);
  assert.match(source, /p_limit:\s*pageSize/);
  assert.match(source, /p_offset:\s*\(page\s*-\s*1\)\s*\*\s*pageSize/);
  assert.match(source, /"Cache-Control":\s*"no-store"/);
});

test("dashboard activity RPCs are represented in generated Supabase database types", () => {
  const source = databaseTypes();

  assert.match(source, /list_dashboard_activity:\s*\{/);
  assert.match(source, /count_dashboard_activity:\s*\{/);
  assert.match(source, /p_company_id:\s*string/);
  assert.match(source, /p_user_id:\s*string/);
  assert.match(source, /p_role:\s*string/);
  assert.match(source, /p_type:\s*string/);
  assert.match(source, /p_limit:\s*number/);
  assert.match(source, /p_offset:\s*number/);
  assert.match(source, /activity_kind:\s*string/);
  assert.match(source, /actor_email:\s*string\s*\|\s*null/);
  assert.match(source, /credit_delta:\s*number\s*\|\s*null/);
  assert.match(source, /Returns:\s*number/);
});

test("dashboard activity route uses generated RPC types without a local fake client", () => {
  const source = route();

  assert.doesNotMatch(source, /DashboardActivityRpcClient/);
  assert.doesNotMatch(source, /ActivityRpcResult/);
  assert.doesNotMatch(source, /as unknown as DashboardActivityRpcClient/);
});

test("dashboard activity route rejects invalid query values with strict safe 400 messages", () => {
  const source = route();

  assert.match(source, /parseActivityTypeOrError/);
  assert.match(source, /"all"/);
  assert.match(source, /"candidates"/);
  assert.match(source, /"vacancies"/);
  assert.match(source, /"credits"/);
  assert.match(source, /return validationError\("Выберите корректный тип активности\."\)/);
  assert.match(source, /return validationError\("Проверьте номер страницы\."\)/);
  assert.match(source, /return validationError\("Проверьте размер страницы\."\)/);
  assert.match(source, /status:\s*400/);
  assert.doesNotMatch(source, /Number\.parseInt\(value \?\? "[^"]+"/);
});

test("dashboard activity route paginates from count RPC total, not list length", () => {
  const source = route();

  assert.match(source, /const total = parseTotalOrError\(countData\)/);
  assert.match(source, /if \(total instanceof NextResponse\) return total/);
  assert.match(source, /const totalPages = Math\.max\(1, Math\.ceil\(total \/ pageSize\)\)/);
  assert.match(source, /pagination:\s*\{\s*page,\s*pageSize,\s*total,\s*totalPages/s);
  assert.doesNotMatch(source, /total:\s*items\.length/);
});

test("dashboard activity route treats malformed RPC data as safe backend failure", () => {
  const source = route();

  assert.match(source, /function activityLookupError/);
  assert.match(source, /if \(!Array\.isArray\(data\)\) return activityLookupError\(\)/);
  assert.match(source, /function parseTotalOrError/);
  assert.match(source, /return activityLookupError\(\)/);
  assert.match(source, /Number\.isSafeInteger\(parsed\)/);
  assert.match(source, /function parseKindOrError/);
  assert.match(source, /const kind = parseKindOrError\(row\.activity_kind\)/);
  assert.match(source, /if \(kind instanceof NextResponse\) return kind/);
  assert.doesNotMatch(source, /return "candidate_created"/);
});

test("dashboard activity route returns safe DTOs and strips credit actor email", () => {
  const source = route();

  assert.match(source, /kind:\s*kind/);
  assert.match(source, /occurredAt:\s*String\(row\.occurred_at/);
  assert.match(source, /const creditDelta = typeof row\.credit_delta === "number" \? row\.credit_delta : null/);
  assert.match(source, /creditDelta,/);
  assert.match(source, /function formatCreditCount/);
  assert.match(source, /entity\s*=\s*kind === "credits_spent"\s*\?\s*null/);
  assert.match(source, /email:\s*kind === "credits_spent"\s*\?\s*null/);
  assert.match(source, /"Создана вакансия"/);
  assert.match(source, /"Добавлен кандидат"/);
  assert.match(source, /"Списаны кредиты"/);
  assert.match(source, /"AI-анализ резюме"/);
  assert.match(source, /formatCreditCount\(creditAmount\)/);
  assert.match(source, /Не удалось загрузить активность\. Попробуйте обновить страницу\./);
  assert.doesNotMatch(source, /title:\s*String\(row\.title\)/);
  assert.doesNotMatch(source, /description:\s*row\.description \? String\(row\.description\) : null/);
  assert.doesNotMatch(source, /message:\s*error instanceof Error \? error\.message/);
});

test("activity browser service calls guarded API and parses user-facing errors", () => {
  const source = service();

  assert.match(source, /export type DashboardActivityFilter = "all" \| "candidates" \| "vacancies" \| "credits"/);
  assert.match(source, /export async function listDashboardActivity/);
  assert.match(source, /\/api\/dashboard\/activity/);
  assert.match(source, /pageSize/);
  assert.match(source, /pagination/);
  assert.match(source, /readUserFacingApiErrorMessage/);
  assert.match(source, /Не удалось загрузить активность\. Попробуйте обновить страницу\./);
  assert.doesNotMatch(source, /throw new Error\(json\.error/);
});
