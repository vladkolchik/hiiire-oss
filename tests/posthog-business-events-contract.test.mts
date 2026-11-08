import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const businessEventsSource = () => readFileSync("lib/analytics/business-events.ts", "utf8");
const serverSource = () => readFileSync("lib/analytics/posthog-server.ts", "utf8");

test("business event taxonomy includes activation product revenue and enterprise events", () => {
  const source = businessEventsSource();
  for (const event of [
    "signup_completed",
    "login_completed",
    "company_group_identified",
    "company_activated",
    "vacancy_created",
    "vacancy_status_changed",
    "candidate_added",
    "candidate_imported_hh",
    "hh_connected",
    "hh_sync_started",
    "hh_sync_completed",
    "ai_analysis_started",
    "ai_analysis_completed",
    "ai_analysis_failed",
    "checkout_started",
    "payment_completed",
    "payment_failed",
    "credit_topup_paid",
    "subscription_renewed",
    "downgrade_scheduled",
    "credits_granted",
    "enterprise_lead_created",
    "enterprise_lead_reopened",
    "enterprise_request_created",
    "enterprise_request_status_changed",
    "enterprise_agreement_activated",
  ]) {
    assert.match(source, new RegExp(`"${event}"`));
  }
});

test("server analytics supports company groups and group identify", () => {
  const source = serverSource();
  assert.match(source, /groups\?:\s*Record<string, string>/);
  assert.match(source, /groupIdentify/);
  assert.match(source, /groupType:\s*"company"/);
});

test("business event facade allowlists properties and excludes sensitive keys", () => {
  const source = businessEventsSource();
  assert.match(source, /type AllowedBusinessEventProperty/);
  assert.match(source, /filterAllowedBusinessEventProperties/);
  assert.doesNotMatch(source, /resumeText|resume_text|rawText|prompt|providerPayload|SignatureValue|phone\b|\bemail\b|lead_message|free_text/i);
  assert.doesNotMatch(source, /"gclid"|"fbclid"|"msclkid"/);
  assert.doesNotMatch(source, /credits_spent/);
});

test("PostHog pageview URL keeps UTM but strips raw click IDs", async () => {
  const moduleUrl = pathToFileURL(path.resolve("lib/analytics/posthog-url.ts")).href;
  const { buildPostHogCurrentUrl } = await import(`${moduleUrl}?posthog-url=${Date.now()}`);
  const sanitized = buildPostHogCurrentUrl("https://hiiire.com", "/signup", "utm_source=google&utm_medium=cpc&gclid=raw&fbclid=raw&msclkid=raw&safe=ok");

  assert.equal(sanitized, "https://hiiire.com/signup?utm_source=google&utm_medium=cpc&safe=ok");
  assert.doesNotMatch(sanitized, /gclid|fbclid|msclkid|raw/);
});

test("PostHog browser before_send strips click IDs from every capture payload", async () => {
  const moduleUrl = pathToFileURL(path.resolve("lib/analytics/posthog-sanitize.ts")).href;
  const provider = readFileSync("components/analytics/posthog-provider.tsx", "utf8");
  const { sanitizePostHogCaptureResult } = await import(`${moduleUrl}?posthog-sanitize=${Date.now()}`);
  const sanitized = sanitizePostHogCaptureResult({
    event: "login_completed",
    properties: {
      $current_url: "https://hiiire.com/login?utm_source=google&gclid=raw&fbclid=raw&msclkid=raw",
      current_url: "https://hiiire.com/login?gclid=raw",
      gclid: "raw",
      fbclid: "raw",
      msclkid: "raw",
      first_gclid: "raw",
      last_fbclid: "raw",
      utm_source: "google",
      attribution: {
        first_msclkid: "raw",
        last_gclid: "raw",
        utm_campaign: "brand",
      },
    },
    $set: {
      $initial_current_url: "https://hiiire.com/signup?gclid=raw&utm_medium=cpc",
      $initial_gclid: "raw",
      first_fbclid: "raw",
    },
    $set_once: {
      msclkid: "raw",
      last_msclkid: "raw",
    },
  });

  assert.match(provider, /before_send:\s*sanitizePostHogCaptureResult/);
  assert.equal(sanitized?.properties?.utm_source, "google");
  assert.equal((sanitized?.properties?.attribution as Record<string, unknown>)?.utm_campaign, "brand");
  assert.equal(sanitized?.properties?.$current_url, "https://hiiire.com/login?utm_source=google");
  assert.equal(sanitized?.$set?.$initial_current_url, "https://hiiire.com/signup?utm_medium=cpc");
  assert.doesNotMatch(JSON.stringify(sanitized), /gclid|fbclid|msclkid|raw/);
});

test("core product routes capture business events", () => {
  const files = {
    signup: readFileSync("app/api/auth/signup/route.ts", "utf8"),
    vacancies: readFileSync("app/api/vacancies/route.ts", "utf8"),
    vacancyStatus: readFileSync("app/api/vacancies/[id]/status/route.ts", "utf8"),
    candidates: readFileSync("app/api/candidates/route.ts", "utf8"),
    job: readFileSync("app/api/jobs/route.ts", "utf8"),
    bulkJob: readFileSync("app/api/jobs/bulk/route.ts", "utf8"),
  };

  assert.match(files.signup, /signup_completed/);
  assert.match(files.vacancies, /vacancy_created/);
  assert.match(files.vacancyStatus, /vacancy_status_changed/);
  assert.match(files.candidates, /candidate_added/);
  assert.match(files.candidates, /candidate_imported_hh/);
  assert.match(files.candidates, /ai_analysis_started/);
  assert.doesNotMatch(files.job, /event:\s*"ai_analysis_started"/);
  assert.doesNotMatch(files.bulkJob, /event:\s*"ai_analysis_started"/);
});

test("hh routes capture connection sync and import events", () => {
  const callback = readFileSync("app/api/integrations/hh/callback/route.ts", "utf8");
  const vacancySync = readFileSync("app/api/integrations/hh/sync/vacancies/route.ts", "utf8");
  const candidateSync = readFileSync("app/api/integrations/hh/sync/candidates/route.ts", "utf8");

  assert.match(callback, /hh_connected/);
  assert.match(vacancySync, /hh_sync_started/);
  assert.match(vacancySync, /hh_sync_completed/);
  assert.match(candidateSync, /hh_sync_started/);
  assert.match(candidateSync, /hh_sync_completed/);
  assert.match(candidateSync, /candidate_imported_hh/);
});

test("revenue and enterprise flows capture business events", () => {
  const checkout = readFileSync("app/api/billing/checkout/route.ts", "utf8");
  const creditTopup = readFileSync("app/api/billing/credit-topup/route.ts", "utf8");
  const webhook = readFileSync("app/api/billing/robokassa-webhook/route.ts", "utf8");
  const downgrade = readFileSync("app/api/billing/schedule-downgrade/route.ts", "utf8");
  const leads = readFileSync("app/api/leads/route.ts", "utf8");
  const tariffActions = readFileSync("app/(admin)/admin/tariff-requests/actions.ts", "utf8");
  const activateAgreement = readFileSync("app/api/admin/billing/enterprise-agreements/[id]/activate/route.ts", "utf8");
  const credits = readFileSync("app/(admin)/admin/credits/actions.ts", "utf8");

  assert.match(checkout, /checkout_started/);
  assert.match(checkout, /captureCheckoutStarted\(reusedPayment,\s*true\)/);
  assert.match(checkout, /captureCheckoutStarted\(payment,\s*false\)/);
  assert.match(creditTopup, /checkout_started/);
  assert.match(creditTopup, /source:\s*"credit_topup"/);
  assert.match(creditTopup, /loadCompanyMarketingEventProperties/);
  assert.match(creditTopup, /\.\.\.marketingEventProperties/);
  assert.match(creditTopup, /reused/);
  assert.match(webhook, /payment_completed/);
  assert.match(webhook, /payment_failed/);
  assert.match(webhook, /const marketingEventProperties = await loadCompanyMarketingEventProperties\(payment\.company_id\)/);
  assert.match(webhook, /failure_stage:\s*"finalize_robokassa_payment"[\s\S]*\.\.\.marketingEventProperties/);
  assert.match(webhook, /failure_stage:\s*reason[\s\S]*\.\.\.marketingEventProperties/);
  assert.match(webhook, /failure_stage:\s*"finalize_credit_topup_payment"[\s\S]*\.\.\.marketingEventProperties/);
  assert.match(webhook, /credit_topup_paid/);
  assert.match(webhook, /loadCompanyMarketingEventProperties/);
  assert.match(webhook, /\.\.\.marketingEventProperties/);
  assert.match(webhook, /source:\s*"credit_topup"/);
  assert.match(webhook, /subscription_renewed/);
  assert.ok(webhook.indexOf('event: "payment_completed"') < webhook.indexOf("set_company_plan_auto_renew"));
  assert.match(downgrade, /downgrade_scheduled/);
  assert.match(leads, /enterprise_lead_created/);
  assert.match(leads, /enterprise_lead_reopened/);
  assert.match(leads, /enterprise_request_created/);
  assert.match(tariffActions, /enterprise_request_status_changed/);
  assert.match(activateAgreement, /enterprise_agreement_activated/);
  assert.match(credits, /credits_granted/);
  assert.match(credits, /source:\s*"manual_admin"/);
  assert.doesNotMatch(credits, /loadCompanyMarketingEventProperties/);
});
