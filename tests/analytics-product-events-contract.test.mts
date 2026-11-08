import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = () => readFileSync("lib/analytics/business-events.ts", "utf8");
const routeSource = () => readFileSync("app/api/analytics/route.ts", "utf8");
const posthogProviderSource = () => readFileSync("components/analytics/posthog-provider.tsx", "utf8");

test("business event names include Analytics v1 product events", () => {
  const text = source();

  for (const eventName of [
    "analytics_dashboard_viewed",
    "analytics_filter_applied",
    "analytics_saved_view_created",
    "analytics_saved_view_updated",
    "analytics_saved_view_deleted",
    "analytics_export_created",
    "analytics_hiring_target_updated",
    "analytics_drilldown_opened",
  ]) {
    assert.match(text, new RegExp(`"${eventName}"`), `${eventName} is missing`);
  }
});

test("analytics business events allow safe adoption and monetization context properties", () => {
  const text = source();

  for (const property of [
    "analytics_view",
    "entitlement_state",
    "feature",
    "feature_available",
    "filter_count",
    "filter_keys",
    "format",
    "period_mode",
    "plan_tier",
    "report_type",
    "row_count",
    "sheet_count",
    "upgrade_boundary",
    "visibility",
  ]) {
    assert.match(text, new RegExp(`"${property}"`), `${property} is missing`);
  }
});

test("analytics business event allowlist excludes obvious PII and provider internals", () => {
  const text = source();

  for (const forbidden of [
    "candidate_name",
    "resume_text",
    "cv_text",
    "raw_prompt",
    "prompt",
    "provider_payload",
    "provider_response",
    "stack",
  ]) {
    assert.doesNotMatch(text, new RegExp(`"${forbidden}"`, "i"), `${forbidden} must not be allowlisted`);
  }
});

test("analytics dashboard route captures dashboard and filter product events", () => {
  const text = routeSource();

  assert.match(text, /captureBusinessEvent/);
  assert.match(text, /analytics_dashboard_viewed/);
  assert.match(text, /analytics_filter_applied/);
  assert.match(text, /analytics_view:\s*"dashboard"/);
  assert.match(text, /feature:\s*"analytics_v1"/);
  assert.match(text, /feature_available:\s*true/);
  assert.match(text, /period_mode:\s*filters\.periodMode/);
  assert.match(text, /filter_count/);
  assert.match(text, /filter_keys/);
  assert.match(text, /plan_tier/);
  assert.match(text, /entitlement_state/);
  assert.doesNotMatch(text, /candidate_name|resume_text|cv_text|raw_prompt|provider_response|email/i);
});

test("analytics client-only UI events are bridged to PostHog with safe context", () => {
  const text = posthogProviderSource();

  assert.match(text, /function AnalyticsUiEvents/);
  assert.match(text, /window\.addEventListener/);
  assert.match(text, /posthog\.capture\(event/);
  for (const eventName of ["analytics_drilldown_opened", "analytics_saved_view_applied"]) {
    assert.match(text, new RegExp(`"${eventName}"`), `${eventName} must be captured from the browser`);
  }
  assert.doesNotMatch(text, /"analytics_saved_view_created"|"analytics_saved_view_deleted"|"analytics_hiring_target_updated"/);
  assert.match(text, /customEvent\.detail/);
  assert.match(text, /feature:\s*"analytics_v1"/);
});
