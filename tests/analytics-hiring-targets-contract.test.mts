import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = () => readFileSync("app/api/analytics/hiring-targets/route.ts", "utf8");

test("analytics hiring targets route is authenticated, CSRF guarded, and company scoped", () => {
  const source = routeSource();

  assert.match(source, /requireCompanyContext/);
  assert.match(source, /requireSameOriginRequest/);
  assert.match(source, /export\s+async\s+function\s+GET/);
  assert.match(source, /export\s+async\s+function\s+PUT/);
  assert.match(source, /\.from\("hiring_targets"\)/);
  assert.match(source, /\.eq\("company_id",\s*ctx\.companyId\)/);
  assert.match(source, /\.order\("period_start"/);
});

test("analytics hiring targets preserve scoped target model instead of company-period only", () => {
  const source = routeSource();

  for (const field of [
    "scope_type",
    "scope_id",
    "metric_name",
    "period_start",
    "period_end",
    "target_hires",
    "target_time_to_fill_days",
    "target_time_to_hire_days",
    "sla_feedback_hours",
    "minimum_pipeline_size",
    "target_interview_to_offer_conversion",
  ]) {
    assert.match(source, new RegExp(field), `${field} must be handled by the route`);
  }

  assert.match(source, /z\.enum\(\["company",\s*"vacancy",\s*"recruiter"\]/);
  assert.doesNotMatch(source, /z\.enum\(\[[^\]]*"department"/);
  assert.match(source, /loadExistingTarget/);
  assert.match(source, /fields\.scope_id\s*\?\s*query\.eq\("scope_id"/);
  assert.match(source, /query\.is\("scope_id",\s*null\)/);
  assert.doesNotMatch(source, /period_key|period_type/);
});

test("analytics hiring targets restrict management reads and mutations to admin", () => {
  const source = routeSource();

  assert.match(source, /if\s*\(ctx\.role\s*!==\s*"admin"\)/);
  assert.match(source, /error:\s*"FORBIDDEN"/);
  assert.match(source, /Только администратор может изменять цели найма/);
  assert.match(source, /export\s+async\s+function\s+GET[\s\S]*ctx\.role\s*!==\s*"admin"/);
});

test("analytics hiring targets validate input with safe Russian API errors", () => {
  const source = routeSource();

  assert.match(source, /zodErrorToUserFacingIssues/);
  assert.match(source, /error:\s*"INVALID_BODY"/);
  assert.match(source, /\bissues\b/);
  assert.match(source, /Дата начала периода обязательна/);
  assert.match(source, /Дата окончания периода обязательна/);
  assert.match(source, /Цель найма не может быть отрицательной/);
  assert.match(source, /Конверсия должна быть от 0 до 100/);
  assert.match(source, /superRefine/);
  assert.match(source, /Для цели компании область должна быть пустой/);
  assert.match(source, /value\.scope_type\s*!==\s*"company"\s*&&\s*!value\.scope_id/);
  assert.doesNotMatch(source, /"Too big"|"Too small"|"expected string"|"invalid_type"/);
});

test("analytics hiring target updates capture product events with monetization context hooks", () => {
  const source = routeSource();

  assert.match(source, /captureBusinessEvent/);
  assert.match(source, /analytics_hiring_target_updated/);
  assert.match(source, /plan_tier/);
  assert.match(source, /entitlement_state/);
  assert.match(source, /feature_available/);
  assert.doesNotMatch(source, /candidate_name|resume_text|cv_text|raw_prompt|provider_response/i);
});
