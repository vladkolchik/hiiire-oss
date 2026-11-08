import { captureServerEvent, identifyServerGroup } from "@/lib/analytics/posthog-server";

export type BusinessEventName =
  | "signup_completed"
  | "login_completed"
  | "company_group_identified"
  | "company_activated"
  | "vacancy_created"
  | "vacancy_status_changed"
  | "candidate_added"
  | "candidate_imported_hh"
  | "candidate_status_changed"
  | "resume_extraction_completed"
  | "resume_extraction_failed"
  | "hh_connected"
  | "hh_sync_started"
  | "hh_sync_completed"
  | "ai_analysis_started"
  | "ai_analysis_completed"
  | "ai_analysis_failed"
  | "checkout_started"
  | "payment_completed"
  | "payment_failed"
  | "credit_topup_paid"
  | "subscription_renewed"
  | "downgrade_scheduled"
  | "credits_granted"
  | "enterprise_lead_created"
  | "enterprise_lead_reopened"
  | "enterprise_request_created"
  | "enterprise_request_status_changed"
  | "enterprise_agreement_activated"
  | "analytics_dashboard_viewed"
  | "analytics_filter_applied"
  | "analytics_saved_view_created"
  | "analytics_saved_view_updated"
  | "analytics_saved_view_deleted"
  | "analytics_export_created"
  | "analytics_export_requested"
  | "analytics_export_completed"
  | "analytics_export_failed"
  | "analytics_hiring_target_updated"
  | "analytics_drilldown_opened";

type AllowedBusinessEventProperty =
  | "activation_definition"
  | "analytics_view"
  | "amount_kopecks"
  | "attempt"
  | "auto_renew"
  | "billing_status"
  | "candidate_id"
  | "candidates_created"
  | "candidates_updated"
  | "clamped_by_credits"
  | "company_id"
  | "company_size"
  | "credits"
  | "currency"
  | "department"
  | "duration_ms"
  | "effective_limit"
  | "email_confirmation_required"
  | "employment_type"
  | "entitlement_state"
  | "event_source"
  | "experience_level"
  | "failed"
  | "failure_stage"
  | "error_kind"
  | "feature"
  | "feature_available"
  | "file_kind"
  | "file_size_bytes"
  | "filter_count"
  | "filter_keys"
  | "format"
  | "from_plan"
  | "headcount"
  | "inv_id"
  | "is_recurring"
  | "job_id"
  | "lead_id"
  | "match_percentage"
  | "max_attempts"
  | "metric_name"
  | "mode"
  | "model"
  | "payment_id"
  | "period_mode"
  | "plan"
  | "plan_tier"
  | "provider"
  | "reason"
  | "report_type"
  | "requested"
  | "requested_plan"
  | "request_id"
  | "result_code"
  | "reused"
  | "role"
  | "row_count"
  | "save_resume_file"
  | "scheduled_change"
  | "score"
  | "selected_in_scope"
  | "sheet_count"
  | "skipped"
  | "source"
  | "scope_type"
  | "started"
  | "status"
  | "sync_type"
  | "target_hires"
  | "to_plan"
  | "trigger"
  | "upgrade_boundary"
  | "utm_campaign"
  | "utm_content"
  | "utm_medium"
  | "utm_source"
  | "utm_term"
  | "user_id"
  | "vacancies_processed"
  | "vacancy_id"
  | "visibility";

type BusinessEventProperties = Partial<Record<AllowedBusinessEventProperty, string | number | boolean | null>>;

export type BusinessEventInput = {
  event: BusinessEventName;
  userId?: string | null;
  companyId?: string | null;
  role?: string | null;
  properties?: BusinessEventProperties;
  eventSource?: string;
};

const allowedBusinessEventProperties = new Set<AllowedBusinessEventProperty>([
  "activation_definition",
  "analytics_view",
  "amount_kopecks",
  "attempt",
  "auto_renew",
  "billing_status",
  "candidate_id",
  "candidates_created",
  "candidates_updated",
  "clamped_by_credits",
  "company_id",
  "company_size",
  "credits",
  "currency",
  "department",
  "duration_ms",
  "effective_limit",
  "email_confirmation_required",
  "employment_type",
  "entitlement_state",
  "event_source",
  "experience_level",
  "failed",
  "failure_stage",
  "error_kind",
  "feature",
  "feature_available",
  "file_kind",
  "file_size_bytes",
  "filter_count",
  "filter_keys",
  "format",
  "from_plan",
  "headcount",
  "inv_id",
  "is_recurring",
  "job_id",
  "lead_id",
  "match_percentage",
  "max_attempts",
  "metric_name",
  "mode",
  "model",
  "payment_id",
  "period_mode",
  "plan",
  "plan_tier",
  "provider",
  "reason",
  "report_type",
  "requested",
  "requested_plan",
  "request_id",
  "result_code",
  "reused",
  "role",
  "row_count",
  "save_resume_file",
  "scheduled_change",
  "score",
  "selected_in_scope",
  "sheet_count",
  "skipped",
  "source",
  "scope_type",
  "started",
  "status",
  "sync_type",
  "target_hires",
  "to_plan",
  "trigger",
  "upgrade_boundary",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
  "user_id",
  "vacancies_processed",
  "vacancy_id",
  "visibility",
]);

function isAllowedValue(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function filterAllowedBusinessEventProperties(properties: BusinessEventProperties = {}) {
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!allowedBusinessEventProperties.has(key as AllowedBusinessEventProperty)) continue;
    if (value === undefined || !isAllowedValue(value)) continue;
    output[key] = value;
  }
  return output;
}

export async function captureBusinessEvent(input: BusinessEventInput) {
  const distinctId = input.userId ?? input.companyId ?? "hiiire-server";
  const companyId = input.companyId ?? undefined;

  try {
    await captureServerEvent({
      event: input.event,
      distinctId,
      groups: companyId ? { company: companyId } : undefined,
      properties: filterAllowedBusinessEventProperties({
        event_source: input.eventSource ?? "server",
        user_id: input.userId ?? null,
        company_id: input.companyId ?? null,
        role: input.role ?? null,
        ...input.properties,
      }),
    });
  } catch {
    // Analytics must never break product flows.
  }
}

export async function identifyCompanyGroup(input: {
  companyId: string;
  distinctId?: string;
  plan?: string | null;
  billingStatus?: string | null;
}) {
  try {
    await identifyServerGroup({
      groupKey: input.companyId,
      distinctId: input.distinctId,
      properties: filterAllowedBusinessEventProperties({
        plan: input.plan ?? null,
        billing_status: input.billingStatus ?? null,
      }),
    });
  } catch {
    // Analytics must never break product flows.
  }

  await captureBusinessEvent({
    event: "company_group_identified",
    userId: input.distinctId,
    companyId: input.companyId,
    properties: {
      plan: input.plan ?? null,
      billing_status: input.billingStatus ?? null,
    },
  });
}
