import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVE_PLAN_CHANGE_REQUEST_STATUSES,
  ENTERPRISE_BILLING_STATUS_COPY,
  canActivateEnterpriseAgreement,
  canCancelEnterpriseAgreement,
  canEndEnterpriseAgreement,
  canSaveEnterpriseAgreementTerms,
  getPlanChangeRequestKind,
  getPlanChangeRequestStatusCopy,
  isActivePlanChangeRequestStatus,
  isFinishedPlanChangeRequestStatus,
} from "../lib/billing/enterprise-billing.ts";

test("classifies active and finished billing plan-change request statuses", () => {
  assert.deepEqual(ACTIVE_PLAN_CHANGE_REQUEST_STATUSES, ["submitted", "in_review", "contacted", "approved"]);

  for (const status of ["submitted", "in_review", "contacted", "approved"] as const) {
    assert.equal(isActivePlanChangeRequestStatus(status), true);
    assert.equal(isFinishedPlanChangeRequestStatus(status), false);
  }

  for (const status of ["applied", "rejected", "canceled"] as const) {
    assert.equal(isActivePlanChangeRequestStatus(status), false);
    assert.equal(isFinishedPlanChangeRequestStatus(status), true);
  }
});

test("resolves request kinds from current and target plans", () => {
  assert.equal(getPlanChangeRequestKind("starter", "enterprise"), "upgrade_to_enterprise");
  assert.equal(getPlanChangeRequestKind("professional", "enterprise"), "upgrade_to_enterprise");
  assert.equal(getPlanChangeRequestKind("enterprise", "starter"), "enterprise_exit");
  assert.equal(getPlanChangeRequestKind("enterprise", "professional"), "enterprise_exit");
  assert.equal(getPlanChangeRequestKind("enterprise", "enterprise"), "enterprise_terms_change");
  assert.equal(getPlanChangeRequestKind("starter", "professional"), "manual_plan_change");
});

test("uses end-user copy for billing request statuses", () => {
  assert.equal(ENTERPRISE_BILLING_STATUS_COPY.submitted.title, "Заявка отправлена");
  assert.equal(ENTERPRISE_BILLING_STATUS_COPY.in_review.title, "Заявка на рассмотрении");
  assert.equal(ENTERPRISE_BILLING_STATUS_COPY.contacted.title, "Мы связались с вами");
  assert.equal(ENTERPRISE_BILLING_STATUS_COPY.applied.title, "Тариф изменён");
});

test("uses specific copy for Enterprise exit requests", () => {
  const activeExitStatuses = ["submitted", "in_review", "contacted", "approved"] as const;
  for (const status of activeExitStatuses) {
    const copy = getPlanChangeRequestStatusCopy("enterprise_exit", status);
    assert.match(copy.description, /Enterprise .*активн/i);
    assert.match(copy.description, /оплат/i);
  }

  assert.equal(getPlanChangeRequestStatusCopy("enterprise_exit", "submitted").title, "Переход из Enterprise запрошен");
  assert.equal(getPlanChangeRequestStatusCopy("enterprise_exit", "in_review").title, "Переход на рассмотрении");
  assert.equal(getPlanChangeRequestStatusCopy("enterprise_exit", "approved").title, "Переход одобрен");
  assert.equal(getPlanChangeRequestStatusCopy("upgrade_to_enterprise", "submitted").title, "Заявка отправлена");
});

test("guards enterprise agreement activation by lifecycle and terms", () => {
  const validInput = {
    status: "pending_payment" as const,
    startsAt: "2026-05-03T10:00:00.000Z",
    endsAt: null,
    isOpenEnded: true,
    creditsLimit: 100,
    termsSummary: "Annual Enterprise access",
    hasActiveAgreementForCompany: false,
  };

  assert.deepEqual(canActivateEnterpriseAgreement(validInput), { ok: true });
  assert.equal(canActivateEnterpriseAgreement({ ...validInput, status: "draft" }).reason, "AGREEMENT_NOT_ACTIVATABLE");
  assert.equal(canActivateEnterpriseAgreement({ ...validInput, status: "active" }).reason, "AGREEMENT_NOT_ACTIVATABLE");
  assert.equal(canActivateEnterpriseAgreement({ ...validInput, hasActiveAgreementForCompany: true }).reason, "ACTIVE_AGREEMENT_EXISTS");
  assert.equal(canActivateEnterpriseAgreement({ ...validInput, isOpenEnded: false, endsAt: null }).reason, "ENDS_AT_REQUIRED");
  assert.equal(
    canActivateEnterpriseAgreement({
      ...validInput,
      isOpenEnded: false,
      endsAt: "2026-05-03T09:00:00.000Z",
    }).reason,
    "ENDS_AT_MUST_BE_AFTER_STARTS_AT",
  );
  assert.equal(canActivateEnterpriseAgreement({ ...validInput, creditsLimit: -1 }).reason, "CREDITS_LIMIT_INVALID");
  assert.equal(canActivateEnterpriseAgreement({ ...validInput, termsSummary: "   " }).reason, "TERMS_SUMMARY_REQUIRED");
});

test("validates draft Enterprise agreement terms separately from activation lifecycle", () => {
  const validDraftTerms = {
    status: "draft" as const,
    startsAt: "2026-05-03T10:00:00.000Z",
    endsAt: null,
    isOpenEnded: true,
    creditsLimit: 100,
    termsSummary: "Annual Enterprise access",
  };

  assert.deepEqual(canSaveEnterpriseAgreementTerms(validDraftTerms), { ok: true });
  assert.equal(
    canSaveEnterpriseAgreementTerms({ ...validDraftTerms, isOpenEnded: false, endsAt: null }).reason,
    "ENDS_AT_REQUIRED",
  );
  assert.equal(canSaveEnterpriseAgreementTerms({ ...validDraftTerms, termsSummary: "   " }).reason, "TERMS_SUMMARY_REQUIRED");
});

test("guards enterprise agreement ending by lifecycle and target plan", () => {
  const validInput = {
    status: "active" as const,
    reason: "Customer signed a new plan",
    targetPlan: "starter" as const,
  };

  assert.deepEqual(canEndEnterpriseAgreement(validInput), { ok: true });
  assert.deepEqual(canEndEnterpriseAgreement({ ...validInput, targetPlan: null }), { ok: true });
  assert.equal(canEndEnterpriseAgreement({ ...validInput, status: "draft" }).reason, "AGREEMENT_NOT_ACTIVE");
  assert.equal(canEndEnterpriseAgreement({ ...validInput, reason: " " }).reason, "END_REASON_REQUIRED");
  assert.equal(canEndEnterpriseAgreement({ ...validInput, targetPlan: "enterprise" }).reason, "TARGET_PLAN_INVALID");
});

test("guards draft Enterprise agreement cancellation by lifecycle and invoice state", () => {
  assert.deepEqual(canCancelEnterpriseAgreement({ status: "draft", hasBlockingInvoice: false }), { ok: true });
  assert.equal(
    canCancelEnterpriseAgreement({ status: "draft", hasBlockingInvoice: true }).reason,
    "AGREEMENT_HAS_OPEN_INVOICE",
  );

  for (const status of ["pending_payment", "active", "ended", "canceled"] as const) {
    assert.equal(canCancelEnterpriseAgreement({ status, hasBlockingInvoice: false }).reason, "AGREEMENT_NOT_CANCELABLE");
  }
});
