import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = () => readFileSync("app/api/analytics/saved-views/route.ts", "utf8");

test("analytics saved views route is authenticated, CSRF guarded, and scoped to visible views", () => {
  const source = routeSource();

  assert.match(source, /requireCompanyContext/);
  assert.match(source, /requireSameOriginRequest/);
  assert.match(source, /export\s+async\s+function\s+GET/);
  assert.match(source, /export\s+async\s+function\s+POST/);
  assert.match(source, /export\s+async\s+function\s+PATCH/);
  assert.match(source, /export\s+async\s+function\s+DELETE/);
  assert.match(source, /\.from\("analytics_filter_views"\)/);
  assert.match(source, /\.eq\("company_id",\s*ctx\.companyId\)/);
  assert.match(source, /\.or\(`visibility\.eq\.company,owner_id\.eq\.\$\{ctx\.userId\}`\)/);
});

test("analytics saved views validate display data with Russian user-facing errors", () => {
  const source = routeSource();

  assert.match(source, /zodErrorToUserFacingIssues/);
  assert.match(source, /error:\s*"INVALID_BODY"/);
  assert.match(source, /\bissues\b/);
  assert.match(source, /Название сохранённого вида обязательно/);
  assert.match(source, /Название сохранённого вида должно быть не длиннее 80 символов/);
  assert.match(source, /Фильтры сохранённого вида должны быть объектом/);
  assert.doesNotMatch(source, /"Too big"|"Too small"|"expected string"|"invalid_type"/);
});

test("analytics saved views enforce private ownership and admin-only company views", () => {
  const source = routeSource();

  assert.match(source, /z\.enum\(\["private",\s*"company"\]/);
  assert.match(source, /ctx\.role\s*!==\s*"admin"[\s\S]*visibility\s*===\s*"company"/);
  assert.match(source, /existing\.visibility\s*===\s*"company"[\s\S]*ctx\.role\s*!==\s*"admin"/);
  assert.match(source, /existing\.visibility\s*===\s*"private"[\s\S]*existing\.owner_id\s*!==\s*ctx\.userId/);
  assert.match(source, /owner_id:\s*ctx\.userId/);
  assert.match(source, /company_id:\s*ctx\.companyId/);
});

test("analytics saved views capture non-PII product events", () => {
  const source = routeSource();

  assert.match(source, /captureBusinessEvent/);
  assert.match(source, /analytics_saved_view_created/);
  assert.match(source, /analytics_saved_view_updated/);
  assert.match(source, /analytics_saved_view_deleted/);
  assert.match(source, /filter_keys/);
  assert.match(source, /visibility/);
  assert.doesNotMatch(source, /candidate_name|resume_text|cv_text|raw_prompt|provider_response/i);
});
