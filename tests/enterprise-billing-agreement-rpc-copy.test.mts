import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const activateRoute = readFileSync(
  new URL("../app/api/admin/billing/enterprise-agreements/[id]/activate/route.ts", import.meta.url),
  "utf8",
);

const endRoute = readFileSync(
  new URL("../app/api/admin/billing/enterprise-agreements/[id]/end/route.ts", import.meta.url),
  "utf8",
);

const databaseTypes = readFileSync(new URL("../lib/supabase/database.types.ts", import.meta.url), "utf8");
const enterpriseBilling = readFileSync(new URL("../lib/billing/enterprise-billing.ts", import.meta.url), "utf8");
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const databaseSchemaDocs = readFileSync(new URL("../docs/DATABASE_SCHEMA.md", import.meta.url), "utf8");
// Internal business doc; it is not shipped in the public open-source export.
const landingFlowDocsUrl = new URL("../docs/landing-flow-and-pricing.md", import.meta.url);
const landingFlowDocs = existsSync(landingFlowDocsUrl) ? readFileSync(landingFlowDocsUrl, "utf8") : null;
const migrationUrl = new URL("../supabase/sql/enterprise_agreement_activation_rpc_v1.sql", import.meta.url);
const amendmentMigrationUrl = new URL(
  "../supabase/sql/enterprise_agreement_amendments_and_request_closure_v1.sql",
  import.meta.url,
);
const exitMigrationUrl = new URL("../supabase/sql/enterprise_exit_request_and_terminal_requests_v1.sql", import.meta.url);
const exitCompanyPlanRequiredMigrationUrl = new URL(
  "../supabase/sql/enterprise_exit_company_plan_required_v1.sql",
  import.meta.url,
);
const sourceRequestUniqueMigrationUrl = new URL(
  "../supabase/sql/enterprise_agreement_source_request_unique_v1.sql",
  import.meta.url,
);
const sourceRequestRequiredMigrationUrl = new URL(
  "../supabase/sql/enterprise_activation_source_request_required_v1.sql",
  import.meta.url,
);
const requestAgreementLifecycleGuardMigrationUrl = new URL(
  "../supabase/sql/enterprise_request_agreement_lifecycle_guard_v1.sql",
  import.meta.url,
);
const requestFlowDrawerGuardsMigrationUrl = new URL(
  "../supabase/sql/enterprise_request_flow_drawer_guards_v1.sql",
  import.meta.url,
);
const paidInvoiceRequiredMigrationUrl = new URL(
  "../supabase/sql/enterprise_activation_paid_invoice_required_v1.sql",
  import.meta.url,
);
const pendingActivationAndRestoreMigrationUrl = new URL(
  "../supabase/sql/enterprise_pending_activation_and_restore_rpc_v1.sql",
  import.meta.url,
);
const restoreBlocksProviderReviewInvoiceMigrationUrl = new URL(
  "../supabase/sql/enterprise_restore_blocks_provider_review_invoice_v1.sql",
  import.meta.url,
);
const restoreBlocksProviderUrlInvoiceMigrationUrl = new URL(
  "../supabase/sql/enterprise_restore_blocks_provider_url_invoice_v1.sql",
  import.meta.url,
);
const restoreProviderUrlOnlyGuardMigrationUrl = new URL(
  "../supabase/sql/enterprise_restore_provider_url_only_guard_v1.sql",
  import.meta.url,
);
const currentInvoiceCycleMigrationUrl = new URL(
  "../supabase/sql/enterprise_current_invoice_cycle_rpc_v1.sql",
  import.meta.url,
);
const restoreBlocksPaidReviewInvoiceMigrationUrl = new URL(
  "../supabase/sql/enterprise_restore_blocks_paid_review_invoice_v1.sql",
  import.meta.url,
);
const restoreCurrentCycleGuardMigrationUrl = new URL(
  "../supabase/sql/enterprise_restore_current_cycle_guard_v1.sql",
  import.meta.url,
);
const exitCurrentCompanyPlanSchemaMigrationUrl = new URL(
  "../supabase/sql/enterprise_exit_current_company_plan_schema_v1.sql",
  import.meta.url,
);

test("enterprise agreement admin routes use atomic DB RPCs instead of multi-step writes", () => {
  assert.match(activateRoute, /rpc\("activate_enterprise_agreement"/);
  assert.match(endRoute, /rpc\("end_enterprise_agreement"/);
  assert.match(endRoute, /requestId/);
  assert.match(endRoute, /p_request_id/);

  for (const route of [activateRoute, endRoute]) {
    assert.doesNotMatch(route, /qualify_company_enterprise_plan/);
    assert.doesNotMatch(route, /\.from\("company_plans"\)/);
    assert.doesNotMatch(route, /\.from\("billing_plan_change_requests"\)[\s\S]*?\.update\(/);
    assert.doesNotMatch(route, /\.from\("enterprise_agreements"\)[\s\S]*?\.update\(/);
    assert.match(route, /\.from\("enterprise_agreements"\)[\s\S]*?\.select\(ENTERPRISE_AGREEMENT_FIELDS\)/);
  }
});

test("enterprise agreement activation migration defines service-role-only atomic RPCs", () => {
  assert.equal(existsSync(migrationUrl), true);
  const migration = readFileSync(migrationUrl, "utf8");

  assert.match(migration, /create or replace function public\.activate_enterprise_agreement\(/);
  assert.match(migration, /create or replace function public\.end_enterprise_agreement\(/);
  assert.match(migration, /security definer/);
  assert.match(migration, /for update/);
  assert.match(migration, /status in \('draft', 'pending_payment'\)/);
  assert.match(migration, /status = 'active'/);
  assert.match(migration, /idx_enterprise_agreements_one_active_per_company/);
  assert.match(migration, /recurring_mandate_inv_id\s*=\s*null/);
  assert.match(migration, /scheduled_payment_id\s*=\s*null/);
  assert.match(migration, /status\s*=\s*'applied'/);
  assert.match(migration, /revoke all on function public\.activate_enterprise_agreement\(uuid, uuid, text\)/);
  assert.match(migration, /grant execute on function public\.activate_enterprise_agreement\(uuid, uuid, text\) to service_role/);
  assert.match(migration, /revoke all on function public\.end_enterprise_agreement\(uuid, uuid, text, text\)/);
  assert.match(migration, /grant execute on function public\.end_enterprise_agreement\(uuid, uuid, text, text\) to service_role/);
});

test("enterprise agreement amendment migration preserves audit trail and closes linked requests", () => {
  assert.equal(existsSync(amendmentMigrationUrl), true);
  const migration = readFileSync(amendmentMigrationUrl, "utf8");

  assert.match(migration, /add column if not exists replaces_agreement_id uuid/);
  assert.match(migration, /references public\.enterprise_agreements\(id\) on delete set null/);
  assert.match(migration, /idx_enterprise_agreements_replaces_agreement_id/);
  assert.match(migration, /v_replaced_agreement public\.enterprise_agreements/);
  assert.match(migration, /where ea\.id = v_agreement\.replaces_agreement_id[\s\S]*for update/);
  assert.match(migration, /v_replaced_agreement\.company_id <> v_agreement\.company_id/);
  assert.match(migration, /status = 'ended'[\s\S]*ended_reason = v_reason/);
  assert.match(migration, /where ea\.id = v_replaced_agreement\.id[\s\S]*and ea\.status = 'active'/);
  assert.match(migration, /status = 'applied'/);
});

test("enterprise agreement activation validates and applies linked source request atomically", () => {
  assert.equal(existsSync(amendmentMigrationUrl), true);
  const migration = readFileSync(amendmentMigrationUrl, "utf8");

  assert.match(migration, /v_source_request public\.billing_plan_change_requests/);
  assert.match(migration, /v_source_request_applied_count integer := 0/);
  assert.match(migration, /if v_agreement\.source_request_id is null then[\s\S]*raise exception 'SOURCE_REQUEST_REQUIRED'/);
  assert.match(migration, /v_agreement\.replaces_agreement_id is not null[\s\S]*v_agreement\.source_request_id is null[\s\S]*raise exception 'SOURCE_REQUEST_REQUIRED'/);
  assert.match(migration, /where bpr\.id = v_agreement\.source_request_id[\s\S]*for update/);
  assert.match(migration, /v_source_request\.company_id <> v_agreement\.company_id/);
  assert.match(migration, /v_source_request\.status <> 'approved'/);
  assert.doesNotMatch(migration, /v_source_request\.status not in \('submitted', 'in_review', 'contacted', 'approved'\)/);
  assert.match(migration, /v_source_request\.target_plan <> 'enterprise'/);
  assert.match(migration, /v_agreement\.replaces_agreement_id is null[\s\S]*v_source_request\.request_kind <> 'upgrade_to_enterprise'/);
  assert.match(migration, /v_agreement\.replaces_agreement_id is not null[\s\S]*v_source_request\.request_kind <> 'enterprise_terms_change'/);
  assert.match(migration, /where bpr\.id = v_agreement\.source_request_id[\s\S]*and bpr\.status = 'approved'/);
  assert.doesNotMatch(migration, /where bpr\.id = v_agreement\.source_request_id[\s\S]*and bpr\.status in \('submitted', 'in_review', 'contacted', 'approved'\)/);
  assert.match(migration, /get diagnostics v_source_request_applied_count = row_count/);
  assert.match(migration, /v_source_request_applied_count <> 1/);
});

test("enterprise agreement end RPC can atomically apply an approved exit request", () => {
  assert.equal(existsSync(exitMigrationUrl), true);
  const migration = readFileSync(exitMigrationUrl, "utf8");

  assert.match(migration, /p_request_id uuid/);
  assert.doesNotMatch(migration, /p_request_id uuid default null/);
  assert.match(migration, /v_request public\.billing_plan_change_requests/);
  assert.match(migration, /where bpr\.id = p_request_id[\s\S]*for update/);
  assert.match(migration, /if p_request_id is null then[\s\S]*raise exception 'REQUEST_REQUIRED'/);
  assert.match(migration, /v_request\.company_id <> v_agreement\.company_id/);
  assert.match(migration, /v_request\.request_kind <> 'enterprise_exit'/);
  assert.match(migration, /v_request\.status <> 'approved'/);
  assert.doesNotMatch(migration, /v_request\.status not in \('approved', 'contacted', 'in_review', 'submitted'\)/);
  assert.match(migration, /v_request\.current_plan <> 'enterprise'/);
  assert.match(migration, /v_request\.target_plan not in \('starter', 'professional'\)/);
  assert.match(migration, /v_plan\.current_plan <> 'enterprise'[\s\S]*raise exception 'COMPANY_PLAN_ENTERPRISE_REQUIRED'/);
  assert.match(migration, /ended_by_request_id = p_request_id/);
  assert.doesNotMatch(migration, /source_request_id = p_request_id/);
  assert.match(migration, /set status = 'applied'[\s\S]*applied_at = v_now/);
  assert.match(migration, /and bpr\.status = 'approved'/);
  assert.match(migration, /period_start = null/);
  assert.match(migration, /period_end = null/);
});

test("enterprise agreement exit hardening requires an existing Enterprise company plan", () => {
  assert.equal(existsSync(exitCompanyPlanRequiredMigrationUrl), true);
  const migration = readFileSync(exitCompanyPlanRequiredMigrationUrl, "utf8");

  assert.match(migration, /create or replace function public\.end_enterprise_agreement\(/);
  assert.match(migration, /if not v_has_plan or v_plan\.current_plan <> 'enterprise' then/);
  assert.match(migration, /raise exception 'COMPANY_PLAN_ENTERPRISE_REQUIRED'/);
  assert.doesNotMatch(migration, /insert into public\.company_plans/);
});

test("enterprise agreement source requests are unique for active-ish agreement states", () => {
  assert.equal(existsSync(sourceRequestUniqueMigrationUrl), true);
  const migration = readFileSync(sourceRequestUniqueMigrationUrl, "utf8");

  assert.match(migration, /create unique index if not exists idx_enterprise_agreements_one_open_per_source_request/);
  assert.match(migration, /on public\.enterprise_agreements\(source_request_id\)/);
  assert.match(migration, /source_request_id is not null/);
  assert.match(migration, /status in \('draft', 'pending_payment', 'active'\)/);
  assert.match(databaseSchemaDocs, /enterprise_agreement_source_request_unique_v1/);
});

test("enterprise agreement activation requires a source request for every open agreement", () => {
  assert.equal(existsSync(sourceRequestRequiredMigrationUrl), true);
  const migration = readFileSync(sourceRequestRequiredMigrationUrl, "utf8");

  assert.match(migration, /create or replace function public\.activate_enterprise_agreement\(/);
  assert.match(migration, /if v_agreement\.source_request_id is null then[\s\S]*raise exception 'SOURCE_REQUEST_REQUIRED'/);
  assert.match(migration, /where bpr\.id = v_agreement\.source_request_id[\s\S]*for update/);
  assert.match(migration, /v_source_request\.status <> 'approved'/);
  assert.match(migration, /v_source_request_applied_count <> 1/);
  assert.match(databaseSchemaDocs, /enterprise_activation_source_request_required_v1/);
  assert.match(databaseSchemaDocs, /orphan agreement/);
});

test("enterprise agreement activation requires a paid manual invoice", () => {
  assert.equal(existsSync(paidInvoiceRequiredMigrationUrl), true);
  const migration = readFileSync(paidInvoiceRequiredMigrationUrl, "utf8");

  assert.match(migration, /create or replace function public\.activate_enterprise_agreement\(/);
  assert.match(migration, /from public\.billing_manual_invoices bmi/);
  assert.match(migration, /bmi\.agreement_id = v_agreement\.id/);
  assert.match(migration, /bmi\.status = 'paid'/);
  assert.match(migration, /raise exception 'PAID_INVOICE_REQUIRED'/);
  assert.match(activateRoute, /PAID_INVOICE_REQUIRED/);
  assert.match(databaseSchemaDocs, /enterprise_activation_paid_invoice_required_v1/);
  if (landingFlowDocs) assert.match(landingFlowDocs, /paid manual invoice/);
});

test("enterprise activation is pending-payment only and restore draft is atomic", () => {
  assert.equal(existsSync(pendingActivationAndRestoreMigrationUrl), true);
  const migration = readFileSync(pendingActivationAndRestoreMigrationUrl, "utf8");

  assert.match(migration, /create or replace function public\.activate_enterprise_agreement\(/);
  assert.match(migration, /if v_agreement\.status <> 'pending_payment' then[\s\S]*raise exception 'AGREEMENT_NOT_ACTIVATABLE'/);
  assert.match(migration, /from public\.billing_manual_invoices newer/);
  assert.match(migration, /newer\.created_at > bmi\.created_at/);
  assert.match(migration, /newer\.created_at = bmi\.created_at and newer\.id::text > bmi\.id::text/);
  assert.match(migration, /create or replace function public\.restore_enterprise_agreement_draft\(/);
  assert.match(migration, /security definer/);
  assert.match(migration, /where ea\.id = p_agreement_id[\s\S]*for update/);
  assert.match(migration, /where bmi\.agreement_id = p_agreement_id[\s\S]*for update/);
  assert.match(migration, /status in \('issued', 'paid'\)/);
  assert.match(migration, /raise exception 'AGREEMENT_HAS_PAYABLE_INVOICE'/);
  assert.match(migration, /where ea\.id = v_agreement\.id[\s\S]*and ea\.status = 'pending_payment'/);
  assert.match(migration, /grant execute on function public\.restore_enterprise_agreement_draft\(uuid\) to service_role/);
  assert.match(databaseSchemaDocs, /restore_enterprise_agreement_draft/);
});

test("enterprise restore blocks provider-created review invoices", () => {
  assert.equal(existsSync(restoreBlocksProviderReviewInvoiceMigrationUrl), true);
  const migration = readFileSync(restoreBlocksProviderReviewInvoiceMigrationUrl, "utf8");

  assert.match(migration, /create or replace function public\.restore_enterprise_agreement_draft\(/);
  assert.match(migration, /where bmi\.agreement_id = p_agreement_id[\s\S]*for update/);
  assert.match(migration, /bmi\.status = 'requires_review'[\s\S]*bmi\.provider_invoice_id is not null/);
  assert.match(migration, /bmi\.status = 'requires_review'[\s\S]*bmi\.provider_invoice_url is not null/);
  assert.match(migration, /raise exception 'AGREEMENT_HAS_PAYABLE_INVOICE'/);
  assert.match(databaseSchemaDocs, /enterprise_restore_blocks_provider_review_invoice_v1/);
});

test("enterprise restore blocks any invoice with a provider payable URL", () => {
  assert.equal(existsSync(restoreBlocksProviderUrlInvoiceMigrationUrl), true);
  const migration = readFileSync(restoreBlocksProviderUrlInvoiceMigrationUrl, "utf8");

  assert.match(migration, /create or replace function public\.restore_enterprise_agreement_draft\(/);
  assert.match(migration, /where bmi\.agreement_id = p_agreement_id[\s\S]*for update/);
  assert.match(migration, /bmi\.provider_invoice_url is not null/);
  assert.match(migration, /raise exception 'AGREEMENT_HAS_PAYABLE_INVOICE'/);
  assert.match(databaseSchemaDocs, /enterprise_restore_blocks_provider_url_invoice_v1/);
});

test("enterprise restore treats reserved provider invoice id as non-payable without provider URL", () => {
  assert.equal(existsSync(restoreProviderUrlOnlyGuardMigrationUrl), true);
  const migration = readFileSync(restoreProviderUrlOnlyGuardMigrationUrl, "utf8");

  assert.match(migration, /create or replace function public\.restore_enterprise_agreement_draft\(/);
  assert.match(migration, /bmi\.provider_invoice_url is not null/);
  assert.doesNotMatch(migration, /bmi\.provider_invoice_id is not null/);
  assert.match(databaseSchemaDocs, /enterprise_restore_provider_url_only_guard_v1/);
});

test("enterprise invoice issue and activation use the current invoice cycle", () => {
  assert.equal(existsSync(currentInvoiceCycleMigrationUrl), true);
  const migration = readFileSync(currentInvoiceCycleMigrationUrl, "utf8");

  assert.match(migration, /create or replace function public\.create_enterprise_manual_invoice_draft\(/);
  assert.match(migration, /insert into public\.billing_manual_invoices/);
  assert.match(migration, /update public\.enterprise_agreements ea[\s\S]*set status = 'pending_payment'/);
  assert.match(migration, /get diagnostics v_claimed_count = row_count/);
  assert.match(migration, /v_claimed_count <> 1[\s\S]*raise exception 'AGREEMENT_STATUS_CHANGED'/);
  assert.match(migration, /grant execute on function public\.create_enterprise_manual_invoice_draft\(uuid, uuid, integer, text, text, timestamptz, timestamptz, jsonb\) to service_role/);
  assert.match(migration, /create or replace function public\.activate_enterprise_agreement\(/);
  assert.match(migration, /bmi\.status = 'paid'[\s\S]*not exists \([\s\S]*from public\.billing_manual_invoices newer/);
  assert.match(migration, /newer\.created_at > bmi\.created_at/);
  assert.match(migration, /newer\.created_at = bmi\.created_at and newer\.id::text > bmi\.id::text/);
  assert.match(databaseSchemaDocs, /enterprise_current_invoice_cycle_rpc_v1/);
  if (landingFlowDocs) assert.match(landingFlowDocs, /newest linked manual invoice/);
});

test("enterprise restore blocks callback-only paid review invoices", () => {
  assert.equal(existsSync(restoreBlocksPaidReviewInvoiceMigrationUrl), true);
  const migration = readFileSync(restoreBlocksPaidReviewInvoiceMigrationUrl, "utf8");

  assert.match(migration, /create or replace function public\.restore_enterprise_agreement_draft\(/);
  assert.match(migration, /v_latest_invoice\.provider_status = 'paid_requires_review'/);
  assert.match(migration, /order by bmi\.created_at desc, bmi\.id desc/);
  assert.match(migration, /raise exception 'AGREEMENT_HAS_PAYABLE_INVOICE'/);
  assert.doesNotMatch(migration, /bmi\.provider_invoice_id is not null/);
  assert.match(databaseSchemaDocs, /enterprise_restore_blocks_paid_review_invoice_v1/);
  assert.match(databaseSchemaDocs, /provider_status='paid_requires_review'/);
  if (landingFlowDocs) assert.match(landingFlowDocs, /paid_requires_review/);
});

test("enterprise restore applies paid review blocking to the current invoice cycle only", () => {
  assert.equal(existsSync(restoreCurrentCycleGuardMigrationUrl), true);
  const migration = readFileSync(restoreCurrentCycleGuardMigrationUrl, "utf8");

  assert.match(migration, /create or replace function public\.restore_enterprise_agreement_draft\(/);
  assert.match(migration, /v_latest_invoice public\.billing_manual_invoices/);
  assert.match(migration, /bmi\.provider_invoice_url is not null/);
  assert.match(migration, /order by bmi\.created_at desc, bmi\.id desc/);
  assert.match(migration, /v_latest_invoice\.status in \('issued', 'paid'\)/);
  assert.match(migration, /v_latest_invoice\.provider_status = 'paid_requires_review'/);
  assert.doesNotMatch(migration, /bmi\.status in \('issued', 'paid'\)[\s\S]{0,80}bmi\.provider_status = 'paid_requires_review'/);
  assert.doesNotMatch(migration, /bmi\.provider_invoice_id is not null/);
  assert.match(databaseSchemaDocs, /enterprise_restore_current_cycle_guard_v1/);
  assert.match(databaseSchemaDocs, /newest invoice cycle/);
  if (landingFlowDocs) assert.match(landingFlowDocs, /поздний callback на старый счёт не блокирует recovery/);
});

test("replayable enterprise restore SQL keeps the current invoice cycle semantics", () => {
  const migrations = [
    readFileSync(pendingActivationAndRestoreMigrationUrl, "utf8"),
    readFileSync(restoreProviderUrlOnlyGuardMigrationUrl, "utf8"),
    readFileSync(restoreBlocksPaidReviewInvoiceMigrationUrl, "utf8"),
    readFileSync(restoreCurrentCycleGuardMigrationUrl, "utf8"),
  ];

  for (const migration of migrations) {
    assert.match(migration, /create or replace function public\.restore_enterprise_agreement_draft\(/);
    assert.match(migration, /v_latest_invoice public\.billing_manual_invoices/);
    assert.match(migration, /bmi\.provider_invoice_url is not null/);
    assert.match(migration, /order by bmi\.created_at desc, bmi\.id desc/);
    assert.match(migration, /v_latest_invoice\.status in \('issued', 'paid'\)/);
    assert.match(migration, /v_latest_invoice\.provider_status = 'paid_requires_review'/);
    assert.doesNotMatch(migration, /bmi\.status in \('issued', 'paid'\)[\s\S]{0,120}bmi\.provider_status = 'paid_requires_review'/);
    assert.doesNotMatch(migration, /bmi\.provider_invoice_id is not null/);
  }
});

test("enterprise source request and agreement lifecycle is protected against close/create races", () => {
  assert.equal(existsSync(requestAgreementLifecycleGuardMigrationUrl), true);
  const migration = readFileSync(requestAgreementLifecycleGuardMigrationUrl, "utf8");
  assert.equal(existsSync(requestFlowDrawerGuardsMigrationUrl), true);
  const drawerGuardsMigration = readFileSync(requestFlowDrawerGuardsMigrationUrl, "utf8");

  assert.match(migration, /prevent_billing_plan_change_request_terminal_reopen/);
  assert.match(migration, /old\.status = 'approved'[\s\S]*new\.status in \('rejected', 'canceled'\)/);
  assert.match(migration, /SOURCE_REQUEST_HAS_OPEN_AGREEMENT/);
  assert.match(migration, /validate_enterprise_agreement_source_request_open/);
  assert.match(migration, /for update/);
  assert.match(migration, /new\.status in \('draft', 'pending_payment'\)/);
  assert.match(migration, /v_request\.status <> 'approved'/);
  assert.match(migration, /trg_enterprise_agreements_source_request_open/);
  assert.match(drawerGuardsMigration, /create_enterprise_agreement_from_request/);
  assert.match(drawerGuardsMigration, /p_source_request_updated_at/);
  assert.match(drawerGuardsMigration, /REQUEST_STATUS_CHANGED/);
  assert.match(drawerGuardsMigration, /update public\.billing_plan_change_requests[\s\S]*updated_at = v_now/);
  assert.match(drawerGuardsMigration, /drop function if exists public\.end_enterprise_agreement\(uuid, uuid, text, text, uuid\)/);
  assert.match(drawerGuardsMigration, /p_source_request_updated_at timestamptz/);
  assert.match(databaseSchemaDocs, /enterprise_request_agreement_lifecycle_guard_v1/);
  assert.match(databaseSchemaDocs, /enterprise_request_flow_drawer_guards_v1/);
  if (landingFlowDocs) assert.match(landingFlowDocs, /enterprise_agreement_source_request_unique_v1/);
  if (landingFlowDocs) assert.match(landingFlowDocs, /enterprise_activation_source_request_required_v1/);
  if (landingFlowDocs) assert.match(landingFlowDocs, /enterprise_request_agreement_lifecycle_guard_v1/);
  if (landingFlowDocs) assert.match(landingFlowDocs, /enterprise_request_flow_drawer_guards_v1/);
});

test("enterprise agreement end audit fields are exposed to application code", () => {
  assert.match(databaseTypes, /ended_by_request_id: string \| null/);
  assert.match(databaseTypes, /ended_by_request_id\?: string \| null/);
  assert.match(enterpriseBilling, /ended_by_request_id/);
  assert.match(enterpriseBilling, /endedByRequestId: row\.ended_by_request_id/);
});

test("terminal billing request protection lives in the exit hardening migration", () => {
  assert.equal(existsSync(exitMigrationUrl), true);
  const migration = readFileSync(exitMigrationUrl, "utf8");

  assert.match(migration, /prevent_billing_plan_change_request_terminal_reopen/);
  assert.match(migration, /old\.status in \('applied', 'rejected', 'canceled'\)/);
  assert.match(migration, /new\.status <> old\.status/);
  assert.match(migration, /TERMINAL_REQUEST_STATUS_IMMUTABLE/);
});

test("enterprise agreement activation route maps source request RPC validation errors", () => {
  for (const reason of [
    "SOURCE_REQUEST_REQUIRED",
    "SOURCE_REQUEST_NOT_FOUND",
    "SOURCE_REQUEST_COMPANY_MISMATCH",
    "SOURCE_REQUEST_STATUS_INVALID",
    "SOURCE_REQUEST_TARGET_PLAN_INVALID",
    "SOURCE_REQUEST_KIND_INVALID",
    "SOURCE_REQUEST_CURRENT_PLAN_INVALID",
    "SOURCE_REQUEST_APPLY_FAILED",
  ]) {
    assert.match(activateRoute, new RegExp(reason));
  }
});

test("enterprise agreement end route requires linked request validation", () => {
  assert.match(endRoute, /requestId:\s*z\.string\(\)\.uuid\(\)/);
  assert.match(endRoute, /sourceRequestUpdatedAt:\s*z\.string\(\)\.datetime\(\{ offset: true \}\)/);
  assert.match(endRoute, /p_source_request_updated_at/);
  assert.doesNotMatch(endRoute, /requestId:\s*z\.string\(\)\.uuid\(\)\.nullable\(\)\.optional\(\)/);
  assert.match(endRoute, /REQUEST_REQUIRED/);
  assert.match(endRoute, /REQUEST_STATUS_CHANGED/);
  assert.match(endRoute, /COMPANY_PLAN_ENTERPRISE_REQUIRED/);
});

test("request-versioned Enterprise exit RPC uses the current company_plans schema", () => {
  assert.equal(existsSync(exitCurrentCompanyPlanSchemaMigrationUrl), true);
  const migration = readFileSync(exitCurrentCompanyPlanSchemaMigrationUrl, "utf8");
  const drawerGuardsMigration = readFileSync(requestFlowDrawerGuardsMigrationUrl, "utf8");

  assert.match(migration, /drop function if exists public\.end_enterprise_agreement\(uuid, uuid, text, text, uuid, timestamptz\)/);
  assert.match(migration, /p_source_request_updated_at timestamptz/);
  assert.match(migration, /v_request\.updated_at <> p_source_request_updated_at/);
  assert.match(migration, /set current_plan = v_target_plan/);
  assert.match(migration, /intended_plan = v_target_plan/);
  assert.match(migration, /period_start = null/);
  assert.match(migration, /period_end = null/);
  assert.match(migration, /scheduled_payment_id = null/);
  assert.match(migration, /ended_by_request_id = p_request_id/);
  assert.match(migration, /get diagnostics v_request_applied_count = row_count/);

  for (const legacyColumn of [
    "requested_plan",
    "enterprise_requested",
    "enterprise_status",
    "enterprise_expires_at",
    "current_period_end",
    "cancel_at_period_end",
    "next_plan",
    "downgrade_scheduled_at",
    "pending_billing_provider",
    "pending_billing_invoice_id",
    "pending_billing_invoice_url",
    "pending_billing_started_at",
    "pending_billing_expires_at",
    "pending_billing_amount_rub",
    "pending_billing_plan",
    "pending_billing_cycle",
  ]) {
    assert.doesNotMatch(migration, new RegExp(`${legacyColumn}\\s*=`));
    assert.doesNotMatch(drawerGuardsMigration, new RegExp(`${legacyColumn}\\s*=`));
  }
});

test("database types expose enterprise agreement RPC signatures", () => {
  assert.match(databaseTypes, /activate_enterprise_agreement:\s*{/);
  assert.match(databaseTypes, /p_agreement_id: string/);
  assert.match(databaseTypes, /p_actor_id: string/);
  assert.match(databaseTypes, /end_enterprise_agreement:\s*{/);
  assert.match(databaseTypes, /create_enterprise_manual_invoice_draft:\s*{/);
  assert.match(databaseTypes, /p_amount: number/);
  assert.match(databaseTypes, /invoice_id: string/);
  assert.match(databaseTypes, /provider_invoice_id: string \| null/);
  assert.match(databaseTypes, /p_request_id: string/);
  assert.match(databaseTypes, /p_source_request_updated_at: string/);
  assert.doesNotMatch(databaseTypes, /p_request_id\?: string \| null/);
  assert.match(databaseTypes, /p_target_plan\?: "starter" \| "professional" \| null/);
  assert.match(databaseTypes, /create_enterprise_agreement_from_request:\s*{/);
  assert.match(databaseTypes, /replaces_agreement_id: string \| null/);
  assert.match(databaseTypes, /agreement_id: string/);
  assert.match(databaseTypes, /status: string/);
});

test("database schema docs describe applied enterprise billing migrations", () => {
  assert.match(databaseSchemaDocs, /enterprise_agreement_activation_rpc_v1` was applied/);
  assert.match(databaseSchemaDocs, /enterprise_manual_invoice_inv_id_v1` was applied/);
  assert.match(databaseSchemaDocs, /enterprise_exit_company_plan_required_v1` was applied/);
  assert.match(databaseSchemaDocs, /enterprise_request_flow_drawer_guards_v1` was applied/);
  assert.match(databaseSchemaDocs, /enterprise_exit_current_company_plan_schema_v1` was applied/);
  assert.doesNotMatch(databaseSchemaDocs, /enterprise_agreement_activation_rpc_v1` is a follow-up migration/);
});

test("docs describe Enterprise manual invoice issue order", () => {
  for (const docs of [readme, databaseSchemaDocs]) {
    assert.match(docs, /DB RPC в одной транзакции созда[ёе]т `draft` manual invoice row|`create_enterprise_manual_invoice_draft` в одной DB-транзакции созда[ёе]т `draft` invoice row/);
    assert.match(docs, /переводит agreement в `pending_payment`/);
    assert.match(docs, /только после этого API вызывает Robokassa|только после успешного RPC вызывается Robokassa Invoice API/);
    assert.doesNotMatch(docs, /сначала переводит agreement в `pending_payment`[\s\S]{0,220}потом созда[ёе]т manual invoice/);
    assert.doesNotMatch(docs, /перед созданием invoice agreement переводится в `pending_payment`/);
  }
});

test("docs list all Enterprise billing hardening migrations in rollout order", () => {
  for (const docs of [readme, databaseSchemaDocs]) {
    const ordered = [
      "enterprise_restore_blocks_provider_review_invoice_v1",
      "enterprise_restore_blocks_provider_url_invoice_v1",
      "enterprise_restore_provider_url_only_guard_v1",
      "enterprise_current_invoice_cycle_rpc_v1",
      "enterprise_restore_blocks_paid_review_invoice_v1",
      "enterprise_restore_current_cycle_guard_v1",
    ];
    let lastIndex = -1;
    for (const name of ordered) {
      const index = docs.indexOf(name);
      assert.ok(index > lastIndex, `${name} must be listed after the previous Enterprise hardening migration`);
      lastIndex = index;
    }
  }
});
