import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildPlanChangeRequestInsert,
  resolveRequestAccessDestination,
} from "../lib/billing/plan-change-requests.ts";
import { getPlanChangeRequestKind } from "../lib/billing/enterprise-billing.ts";
import { getPaidPlanButtonLabel } from "../lib/billing/status-display.ts";

const planChangeRoute = readFileSync(
  new URL("../app/api/billing/plan-change-request/route.ts", import.meta.url),
  "utf8",
);
const leadsRoute = readFileSync(
  new URL("../app/api/leads/route.ts", import.meta.url),
  "utf8",
);
const settingsPage = readFileSync(
  new URL("../app/(dashboard)/dashboard/settings/page.tsx", import.meta.url),
  "utf8",
);
const requestAccessPage = readFileSync(
  new URL("../app/(marketing)/request-access/page.tsx", import.meta.url),
  "utf8",
);

test("routes request-access submissions by authenticated company context", () => {
  assert.equal(resolveRequestAccessDestination({ isAuthenticated: false, hasCompany: false, role: null }), "lead");
  assert.equal(resolveRequestAccessDestination({ isAuthenticated: true, hasCompany: false, role: null }), "lead");
  assert.equal(
    resolveRequestAccessDestination({ isAuthenticated: true, hasCompany: true, role: "admin" }),
    "billing_request",
  );
  assert.equal(resolveRequestAccessDestination({ isAuthenticated: true, hasCompany: true, role: "hr" }), "forbidden");
  assert.equal(
    resolveRequestAccessDestination({ isAuthenticated: true, hasCompany: true, role: "recruiter" }),
    "forbidden",
  );
});

test("builds immutable plan-change request insert payloads", () => {
  assert.deepEqual(
    buildPlanChangeRequestInsert({
      companyId: "company-1",
      requestedBy: "user-1",
      currentPlan: "enterprise",
      targetPlan: "starter",
      source: "settings",
      userMessage: "Хотим перейти на Starter",
    }),
    {
      company_id: "company-1",
      requested_by: "user-1",
      current_plan: "enterprise",
      target_plan: "starter",
      request_kind: "enterprise_exit",
      source: "settings",
      status: "submitted",
      user_message: "Хотим перейти на Starter",
    },
  );
});

test("normalizes blank user messages to null", () => {
  assert.equal(
    buildPlanChangeRequestInsert({
      companyId: "company-1",
      requestedBy: "user-1",
      currentPlan: "starter",
      targetPlan: "enterprise",
      source: "landing",
      userMessage: "   ",
    }).user_message,
    null,
  );
});

test("treats current Enterprise to Enterprise as terms-change rather than upgrade", () => {
  assert.equal(getPlanChangeRequestKind("enterprise", "enterprise"), "enterprise_terms_change");
});

test("company Enterprise admins can submit Enterprise terms-change requests", () => {
  assert.match(planChangeRoute, /currentPlan === parsed\.data\.targetPlan/);
  assert.match(planChangeRoute, /snapshot\.currentPlan === "enterprise"/);
  assert.match(planChangeRoute, /parsed\.data\.targetPlan === "enterprise"/);
  assert.match(settingsPage, /Изменить условия/);
  assert.match(settingsPage, /setEnterprisePlanChangePlan\("enterprise"\)/);
  assert.match(requestAccessPage, /PLAN_ALREADY_ACTIVE_DESCRIPTION[\s\S]*услов/);
});

test("settings Enterprise CTA respects any active billing request", () => {
  assert.match(settingsPage, /const activePlanChangeRequest = planChangeRequest/);
  assert.match(settingsPage, /activePlanChangeRequest \? \(/);
  assert.match(settingsPage, /Заявка в работе/);
  assert.match(settingsPage, /activePlanChangeRequest\.statusTitle/);
  assert.match(settingsPage, /currentPlan === "enterprise" && activePlanChangeRequest/);
  assert.match(settingsPage, /json\?\.reused \? "Заявка уже есть" : "Заявка отправлена"/);
  assert.doesNotMatch(settingsPage, /enterprisePlanChangeRequest \? \([\s\S]*?Заявка отправлена[\s\S]*?\) : currentPlan === "enterprise"/);
});

test("post-Enterprise-exit inactive target plan can start checkout", () => {
  assert.equal(
    getPaidPlanButtonLabel({
      targetPlan: "starter",
      currentPlan: "starter",
      billingStatus: "inactive",
      userRole: "admin",
      checkoutLoadingPlan: null,
      activePlanChangeRequestTargetPlan: null,
    }),
    "Оформить",
  );
  assert.match(settingsPage, /currentPlan === targetPlan && billingStatus === "active"[\s\S]*Текущий тариф/);
  assert.match(settingsPage, /return getPaidPlanButtonLabel/);
  assert.match(settingsPage, /currentPlan === targetPlan && billingStatus === "active"[\s\S]*return;/);
  assert.match(settingsPage, /void startCheckout\(targetPlan\)/);
});

test("request-access billing route uses request-kind specific status copy", () => {
  assert.match(leadsRoute, /getPlanChangeRequestStatusCopy/);
  assert.match(leadsRoute, /getPlanChangeRequestStatusCopy\(row\.request_kind,\s*status\)/);
  assert.doesNotMatch(leadsRoute, /ENTERPRISE_BILLING_STATUS_COPY\[status\]/);
});

test("authenticated Enterprise request copy is about corporate tariff terms, not platform access", () => {
  assert.match(requestAccessPage, /AUTHENTICATED_ENTERPRISE_REQUEST_DESCRIPTION/);
  assert.match(requestAccessPage, /корпоративн(?:ого|ый) тарифа/);
  assert.match(requestAccessPage, /индивидуальн(?:ых|ые) услов/);
  assert.doesNotMatch(requestAccessPage, /isAuthenticated[\s\S]{0,240}предоставления доступа к платформе/);
});

test("settings Enterprise plan-change comment mirrors the server limit", () => {
  assert.match(settingsPage, /id="enterprise-plan-change-message"[\s\S]*maxLength=\{2000\}/);
});

test("plan-change request API returns user-facing validation details", () => {
  assert.match(planChangeRoute, /COMMENT_MAX_MESSAGE/);
  assert.match(planChangeRoute, /Комментарий не должен быть длиннее 2000 символов/);
  assert.match(planChangeRoute, /safeValidationIssueMessage/);
  assert.match(planChangeRoute, /VALIDATION_MESSAGE/);
  assert.doesNotMatch(planChangeRoute, /message:\s*issue\.message/);
  assert.match(planChangeRoute, /const issues = error\.issues\.map/);
  assert.match(planChangeRoute, /message:\s*issues\[0\]\?\.message/);
  assert.doesNotMatch(planChangeRoute, /NextResponse\.json\(\{ error: "INVALID_BODY" \}/);
  assert.match(settingsPage, /message\?:\s*string/);
  assert.match(settingsPage, /issues\?:\s*Array<\{ message\?: string \}>/);
  assert.match(settingsPage, /getPlanChangeRequestErrorDescription\(json/);
});
