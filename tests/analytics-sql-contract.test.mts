import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../supabase/sql/analytics_v1_foundation.sql", import.meta.url), "utf8");

function expectColumn(table: string, column: string) {
  assert.match(
    sql,
    new RegExp(`(?:create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}|alter\\s+table\\s+public\\.${table})[\\s\\S]*\\b${column}\\b`, "i"),
    `${table}.${column} is missing`
  );
}

function expectPolicy(policyName: string, table: string) {
  assert.match(
    sql,
    new RegExp(`create\\s+policy\\s+${policyName}\\s+on\\s+public\\.${table}`, "i"),
    `${policyName} policy is missing on ${table}`
  );
}

test("analytics foundation creates pipeline event and rejection reason tables", () => {
  assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+public\.pipeline_events/i);
  for (const column of [
    "company_id",
    "candidate_id",
    "vacancy_id",
    "actor_id",
    "from_status",
    "to_status",
    "event_type",
    "occurred_at",
    "rejection_reason_id",
    "rejection_reason",
    "metadata",
    "created_at",
  ]) {
    expectColumn("pipeline_events", column);
  }
  for (const eventType of ["candidate_created", "status_changed", "backfill_initial"]) {
    assert.match(sql, new RegExp(`'${eventType}'`, "i"));
  }

  assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+public\.rejection_reasons/i);
  for (const column of ["company_id", "name", "category", "is_active", "created_at", "updated_at"]) {
    expectColumn("rejection_reasons", column);
  }
});

test("analytics foundation creates saved views export audit and scoped hiring targets", () => {
  assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+public\.analytics_export_events/i);
  for (const column of ["company_id", "user_id", "role", "report_type", "format", "filters", "sheets", "row_counts", "created_at"]) {
    expectColumn("analytics_export_events", column);
  }

  assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+public\.analytics_filter_views/i);
  for (const column of ["company_id", "owner_id", "name", "visibility", "filters", "created_at", "updated_at"]) {
    expectColumn("analytics_filter_views", column);
  }
  assert.match(sql, /visibility\s+in\s+\('private',\s*'company'\)/i);

  for (const column of [
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
    expectColumn("hiring_targets", column);
  }
  assert.match(sql, /scope_type\s+in\s+\('company',\s*'department',\s*'vacancy',\s*'recruiter'\)/i);
  assert.match(sql, /unique[\s\S]*company_id[\s\S]*scope_type[\s\S]*coalesce\(scope_id/i);
});

test("analytics foundation enables RLS, deliberate grants, and narrow policies", () => {
  for (const table of ["pipeline_events", "rejection_reasons", "analytics_export_events", "analytics_filter_views", "hiring_targets"]) {
    assert.match(sql, new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i"));
    assert.match(sql, new RegExp(`grant\\s+select[\\s\\S]*on\\s+table\\s+public\\.${table}\\s+to\\s+authenticated`, "i"));
    assert.doesNotMatch(sql, new RegExp(`grant[\\s\\S]*on\\s+table\\s+public\\.${table}\\s+to\\s+anon`, "i"));
  }

  expectPolicy("pipeline_events_select_access", "pipeline_events");
  expectPolicy("rejection_reasons_select_company", "rejection_reasons");
  expectPolicy("analytics_export_events_select_admin", "analytics_export_events");
  expectPolicy("analytics_filter_views_select_access", "analytics_filter_views");
  expectPolicy("analytics_filter_views_insert_access", "analytics_filter_views");
  expectPolicy("analytics_filter_views_update_access", "analytics_filter_views");
  expectPolicy("analytics_filter_views_delete_access", "analytics_filter_views");
  expectPolicy("hiring_targets_select_company", "hiring_targets");
  expectPolicy("hiring_targets_insert_admin", "hiring_targets");
  expectPolicy("hiring_targets_update_admin", "hiring_targets");
  expectPolicy("hiring_targets_delete_admin", "hiring_targets");
  expectPolicy("rejection_reasons_insert_admin", "rejection_reasons");
  expectPolicy("rejection_reasons_update_admin", "rejection_reasons");
  expectPolicy("rejection_reasons_delete_admin", "rejection_reasons");

  assert.doesNotMatch(sql, /create\s+policy\s+(?:hiring_targets|rejection_reasons)_admin_mutate[\s\S]*for\s+all/i);

  assert.match(sql, /private\.can_access_candidate\(candidate_id\)/i);
  assert.match(sql, /private\.can_access_vacancy\(vacancy_id\)/i);
  assert.match(sql, /private\.is_company_admin_or_lead\(\)/i);
});

test("analytics foundation includes indexes backfill and audit-safe AI fields", () => {
  for (const indexName of [
    "idx_pipeline_events_company_occurred_at",
    "idx_pipeline_events_candidate_occurred_at",
    "idx_pipeline_events_vacancy_occurred_at",
    "idx_pipeline_events_actor_id",
    "idx_analytics_export_events_company_created_at",
    "idx_analytics_export_events_user_id",
    "idx_analytics_filter_views_company_owner_visibility",
    "idx_analytics_filter_views_owner_id",
    "idx_hiring_targets_company_period",
  ]) {
    assert.match(sql, new RegExp(`create\\s+(?:unique\\s+)?index\\s+if\\s+not\\s+exists\\s+${indexName}`, "i"));
  }

  assert.match(sql, /insert\s+into\s+public\.pipeline_events[\s\S]*'backfill_initial'/i);
  assert.match(sql, /not\s+exists\s*\([\s\S]*from\s+public\.pipeline_events/i);
  assert.match(sql, /coalesce\(c\.applied_at,\s*c\.created_at,\s*now\(\)\)/i);

  for (const column of ["model_version", "prompt_version", "score_version", "score_explanation", "audit_event_id"]) {
    expectColumn("ai_analyses", column);
  }
  assert.doesNotMatch(sql, /raw_prompt|resume_text|cv_text|provider_payload|provider_response|secret/i);
});
