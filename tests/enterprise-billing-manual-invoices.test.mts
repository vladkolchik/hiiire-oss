import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildManualInvoiceReceipt,
  MANUAL_INVOICE_DESCRIPTION_MAX_LENGTH,
  MANUAL_INVOICE_FISCAL_ITEM_NAME_MAX_LENGTH,
  MANUAL_INVOICE_PAYER_EMAIL_MAX_LENGTH,
  mapRobokassaInvoiceStatus,
  MAX_MANUAL_INVOICE_AMOUNT_KOPECKS,
  shouldMarkManualInvoicePaid,
  validateManualInvoiceDraft,
} from "../lib/billing/manual-invoices.ts";

const cancelRouteSource = () =>
  readFileSync(new URL("../app/api/admin/billing/manual-invoices/[id]/cancel/route.ts", import.meta.url), "utf8");
const refreshRouteSource = () =>
  readFileSync(new URL("../app/api/admin/billing/manual-invoices/[id]/refresh/route.ts", import.meta.url), "utf8");
const resolveReviewRouteSource = () =>
  readFileSync(new URL("../app/api/admin/billing/manual-invoices/[id]/resolve-review/route.ts", import.meta.url), "utf8");
const issueInvoiceRouteSource = () =>
  readFileSync(
    new URL("../app/api/admin/billing/enterprise-agreements/[id]/issue-invoice/route.ts", import.meta.url),
    "utf8",
  );
const manualInvoicesTableSource = () =>
  readFileSync(new URL("../app/(admin)/admin/billing/manual-invoices-table.tsx", import.meta.url), "utf8");
const enterpriseAgreementsTableSource = () =>
  readFileSync(new URL("../app/(admin)/admin/billing/enterprise-agreements-table.tsx", import.meta.url), "utf8");
const cancelAgreementRouteSource = () =>
  readFileSync(new URL("../app/api/admin/billing/enterprise-agreements/[id]/cancel/route.ts", import.meta.url), "utf8");

test("maps provider invoice statuses to manual invoice statuses", () => {
  assert.equal(mapRobokassaInvoiceStatus("Paid"), "paid");
  assert.equal(mapRobokassaInvoiceStatus("Expired"), "expired");
  assert.equal(mapRobokassaInvoiceStatus("Cancelled"), "canceled");
  assert.equal(mapRobokassaInvoiceStatus("Notpaid"), "issued");
  assert.equal(mapRobokassaInvoiceStatus("UnknownNewStatus"), "requires_review");
});

test("builds fiscal receipt payload from invoice item", () => {
  assert.deepEqual(
    buildManualInvoiceReceipt({
      itemName: "Enterprise доступ hiiire",
      amountKopecks: 12000000,
      quantity: 1,
      tax: "none",
    }),
    {
      sno: "osn",
      items: [
        {
          name: "Enterprise доступ hiiire",
          quantity: 1,
          sum: "120000.00",
          tax: "none",
        },
      ],
    },
  );
});

test("validates manual invoice draft fields", () => {
  assert.deepEqual(
    validateManualInvoiceDraft({
      amountKopecks: 12000000,
      description: "Enterprise доступ hiiire",
      payerEmail: "billing@example.com",
    }),
    { ok: true },
  );

  assert.deepEqual(
    validateManualInvoiceDraft({
      amountKopecks: 0,
      description: "Enterprise доступ hiiire",
      payerEmail: "billing@example.com",
    }),
    { ok: false, error: "AMOUNT_REQUIRED" },
  );

  assert.deepEqual(
    validateManualInvoiceDraft({
      amountKopecks: MAX_MANUAL_INVOICE_AMOUNT_KOPECKS + 1,
      description: "Enterprise доступ hiiire",
      payerEmail: "billing@example.com",
    }),
    { ok: false, error: "AMOUNT_TOO_LARGE" },
  );

  assert.deepEqual(
    validateManualInvoiceDraft({
      amountKopecks: 12000000,
      description: " ",
      payerEmail: "billing@example.com",
    }),
    { ok: false, error: "DESCRIPTION_REQUIRED" },
  );

  assert.deepEqual(
    validateManualInvoiceDraft({
      amountKopecks: 12000000,
      description: "a".repeat(MANUAL_INVOICE_DESCRIPTION_MAX_LENGTH + 1),
      payerEmail: "billing@example.com",
    }),
    { ok: false, error: "DESCRIPTION_TOO_LONG" },
  );

  assert.deepEqual(
    validateManualInvoiceDraft({
      amountKopecks: 12000000,
      description: "Enterprise доступ hiiire",
      payerEmail: "billing@example.com",
      fiscalItemName: "a".repeat(MANUAL_INVOICE_FISCAL_ITEM_NAME_MAX_LENGTH + 1),
    }),
    { ok: false, error: "FISCAL_ITEM_NAME_TOO_LONG" },
  );

  assert.deepEqual(
    validateManualInvoiceDraft({
      amountKopecks: 12000000,
      description: "Enterprise доступ hiiire",
      payerEmail: null,
    }),
    { ok: false, error: "PAYER_EMAIL_REQUIRED" },
  );

  assert.deepEqual(
    validateManualInvoiceDraft({
      amountKopecks: 12000000,
      description: "Enterprise доступ hiiire",
      payerEmail: `${"a".repeat(MANUAL_INVOICE_PAYER_EMAIL_MAX_LENGTH)}@example.com`,
    }),
    { ok: false, error: "PAYER_EMAIL_TOO_LONG" },
  );

  assert.deepEqual(
    validateManualInvoiceDraft({
      amountKopecks: 12000000,
      description: "Enterprise доступ hiiire",
      payerEmail: "billing.example.com",
    }),
    { ok: false, error: "PAYER_EMAIL_INVALID" },
  );
});

test("marks manual invoice paid only from issued status", () => {
  assert.equal(shouldMarkManualInvoicePaid("issued"), true);

  for (const status of ["draft", "paid", "expired", "canceled", "refunded", "requires_review"] as const) {
    assert.equal(shouldMarkManualInvoicePaid(status), false);
  }
});

test("manual invoice refresh and cancellation recover provider-created unpaid links", () => {
  const route = cancelRouteSource();
  const refreshRoute = refreshRouteSource();
  const table = manualInvoicesTableSource();

  assert.match(refreshRoute, /getRobokassaInvoiceStatus/);
  assert.match(refreshRoute, /mapRobokassaInvoiceStatus/);
  assert.match(refreshRoute, /invoice\.status === "issued" \|\| invoice\.status === "requires_review"/);
  assert.match(refreshRoute, /INVOICE_REFRESH_NOT_ALLOWED/);
  assert.doesNotMatch(refreshRoute, /INVOICE_PROVIDER_NOT_CONFIGURED" \}, \{ status: 503 \}/);
  assert.match(refreshRoute, /nextStatus === "expired" \|\| nextStatus === "canceled" \|\| nextStatus === "refunded"/);
  assert.match(refreshRoute, /patch\.provider_invoice_url = null/);
  assert.match(refreshRoute, /\.eq\("status", invoice\.status\)/);
  assert.match(refreshRoute, /INVOICE_PROVIDER_REFRESH_FAILED/);
  assert.match(refreshRoute, /INVOICE_REFRESH_UPDATE_FAILED/);
  assert.match(refreshRoute, /INVOICE_REFRESH_CONFLICT/);

  assert.match(route, /deactivateRobokassaInvoice/);
  assert.match(route, /invoice\.status === "issued" \|\| invoice\.status === "requires_review"/);
  assert.match(route, /Boolean\(invoice\.provider_invoice_url\)/);
  assert.match(route, /patch\.provider_invoice_url = null/);
  assert.match(route, /provider_status = "canceled_provider_deactivated"/);
  assert.match(route, /\.eq\("status", invoice\.status\)/);
  assert.match(route, /INVOICE_CANCEL_CONFLICT/);
  assert.match(route, /\.maybeSingle\(\)/);
  assert.doesNotMatch(route, /\.single\(\)/);
  assert.match(table, /row\.status === "draft"[\s\S]*row\.status === "issued" \|\| row\.status === "requires_review"[\s\S]*Boolean\(row\.provider_invoice_url\)/);
  assert.match(table, /const canRefresh =[\s\S]*row\.status === "issued" \|\| row\.status === "requires_review"[\s\S]*Boolean\(row\.provider_invoice_url\)/);
  assert.match(table, /disabled=\{Boolean\(pending\) \|\| !canRefresh\}/);
  assert.match(table, /INVOICE_PROVIDER_REFRESH_FAILED/);
  assert.match(table, /INVOICE_REFRESH_NOT_ALLOWED/);
  assert.match(table, /INVOICE_PROVIDER_CANCEL_FAILED/);
  assert.match(table, /const cancelActionLabel = canRejectReview \? "Отклонить счёт после проверки" : "Отменить счёт"/);
});

test("allows platform admins to resolve reviewed manual invoices", () => {
  const route = resolveReviewRouteSource();
  const table = manualInvoicesTableSource();

  assert.match(route, /requirePlatformAdmin/);
  assert.match(route, /z\.enum\(\["mark_paid", "reject"\]\)/);
  assert.match(route, /\.select\("id,agreement_id,status,provider_invoice_url,provider_status,created_at"\)/);
  assert.match(route, /invoice\.status !== "requires_review"/);
  assert.match(route, /INVOICE_NOT_REVIEWABLE/);
  assert.match(route, /let isCurrentInvoice = true/);
  assert.match(route, /const hasPaymentEvidence = Boolean\(invoice\.provider_invoice_url\) \|\| invoice\.provider_status === "paid_requires_review"/);
  assert.match(route, /parsed\.data\.action === "mark_paid"/);
  assert.match(route, /INVOICE_PAYMENT_EVIDENCE_REQUIRED/);
  assert.match(route, /invoice\.agreement_id/);
  assert.match(route, /\.from\("enterprise_agreements"\)[\s\S]*\.eq\("id", invoice\.agreement_id\)/);
  assert.match(route, /agreement\.status !== "pending_payment"/);
  assert.match(route, /AGREEMENT_NOT_PENDING_PAYMENT/);
  assert.match(route, /\.from\("billing_manual_invoices"\)[\s\S]*\.order\("created_at", \{ ascending: false \}\)[\s\S]*\.order\("id", \{ ascending: false \}\)/);
  assert.match(route, /isCurrentInvoice = Boolean\(latestInvoice && latestInvoice\.id === invoice\.id\)/);
  assert.match(route, /!isCurrentInvoice/);
  assert.match(route, /INVOICE_NOT_CURRENT/);
  assert.match(route, /parsed\.data\.action === "reject"[\s\S]*invoice\.provider_status === "paid_requires_review" && isCurrentInvoice/);
  assert.match(route, /INVOICE_PROVIDER_LINK_ACTIVE/);
  assert.match(route, /status: "paid"[\s\S]*provider_status: "paid_manual_review"/);
  assert.match(route, /status: "canceled"[\s\S]*not_applied_manual_review[\s\S]*canceled_manual_review/);
  assert.match(route, /\.eq\("status", "requires_review"\)/);
  assert.match(route, /INVOICE_REVIEW_CONFLICT/);

  assert.match(table, /resolve-review/);
  assert.match(table, /mark_paid/);
  assert.match(table, /reject/);
  assert.match(table, /latestInvoiceIdByAgreement/);
  assert.match(table, /isLatestAgreementInvoice/);
  assert.match(table, /row\.status === "requires_review"/);
  assert.match(table, /const canMarkPaidReview =[\s\S]*isLatestAgreementInvoice[\s\S]*Boolean\(row\.provider_invoice_url\) \|\| row\.provider_status === "paid_requires_review"/);
  assert.match(table, /const canRejectReview =[\s\S]*!row\.provider_invoice_url[\s\S]*row\.provider_status !== "paid_requires_review" \|\| !isLatestAgreementInvoice/);
  assert.match(table, /disabled=\{Boolean\(pending\) \|\| !canMarkPaidReview\}/);
  assert.match(table, /disabled=\{Boolean\(pending\) \|\| \(!canCancel && !canRejectReview\)\}/);
  assert.match(table, /runInvoiceAction\(row\.id, canRejectReview \? "reject-review" : "cancel"\)/);
  assert.match(table, /Подтвердить оплату после проверки/);
  assert.match(table, /Отклонить счёт после проверки/);
  assert.match(table, /INVOICE_REVIEW_RESOLVE_FAILED/);
  assert.match(table, /INVOICE_REVIEW_CONFLICT/);
  assert.match(table, /INVOICE_PROVIDER_LINK_ACTIVE/);
  assert.match(table, /ссылка оплаты или платёжный callback/);
  assert.match(table, /INVOICE_PAYMENT_EVIDENCE_REQUIRED/);
  assert.match(table, /AGREEMENT_NOT_PENDING_PAYMENT/);
  assert.match(table, /INVOICE_NOT_CURRENT/);
});

test("issues Enterprise manual invoices only for invoiceable agreement statuses", () => {
  const route = issueInvoiceRouteSource();
  const table = enterpriseAgreementsTableSource();

  assert.match(route, /\.select\("id,company_id,source_request_id,status"\)/);
  assert.match(route, /agreement\.status !== "draft"/);
  assert.match(route, /!agreement\.source_request_id/);
  assert.match(route, /SOURCE_REQUEST_REQUIRED/);
  assert.match(route, /\.from\("billing_plan_change_requests"\)[\s\S]*\.eq\("id", agreement\.source_request_id\)/);
  assert.match(route, /sourceRequest\.status !== "approved"/);
  assert.match(route, /SOURCE_REQUEST_STATUS_INVALID/);
  assert.match(route, /AGREEMENT_NOT_INVOICEABLE/);
  assert.match(route, /const fiscalItemName = getString\(body\.fiscalItemName\) \?\? description/);
  assert.match(route, /validateManualInvoiceDraft\(\{ amountKopecks, description, payerEmail, fiscalItemName \}\)/);
  assert.match(table, /MAX_MANUAL_INVOICE_AMOUNT_KOPECKS/);
  assert.match(table, /maxLength=\{11\}/);
  assert.match(table, /MANUAL_INVOICE_PAYER_EMAIL_MAX_LENGTH/);
  assert.match(table, /MANUAL_INVOICE_DESCRIPTION_MAX_LENGTH/);
  assert.match(table, /MANUAL_INVOICE_FISCAL_ITEM_NAME_MAX_LENGTH/);
  assert.match(route, /admin\.rpc\("create_enterprise_manual_invoice_draft"/);
  assert.match(route, /p_agreement_id: agreement\.id/);
  assert.match(route, /p_actor_id: user\.id/);
  assert.match(route, /p_fiscal_receipt: fiscalReceipt/);
  assert.match(route, /AGREEMENT_STATUS_CHANGED/);
  assert.match(route, /restoreDraftAgreement\(admin, invoice\.agreement_id\)/);
  assert.match(route, /admin\.rpc\("restore_enterprise_agreement_draft"/);
  assert.match(route, /markDraftInvoiceCanceled\(admin, invoiceId\)/);
  assert.match(route, /markDraftInvoiceRequiresReview\(admin, invoiceId/);
  assert.match(route, /markInvoiceProviderSuccessRequiresReview\(admin, invoiceId, providerInvoice\)/);
  assert.match(route, /getManualInvoiceForRepair\(admin, invoiceId\)/);
  assert.match(route, /currentInvoice\?\.status === "paid" \|\| currentInvoice\?\.status === "issued"/);
  assert.match(route, /\.not\("status", "in", "\(\\"issued\\",\\"paid\\"\)"\)/);
  assert.match(route, /\.eq\("status", "draft"\)[\s\S]*\.select\("id"\)[\s\S]*\.maybeSingle\(\)/);
  assert.match(route, /INVOICE_STATE_REPAIR_FAILED/);
  assert.match(route, /INVOICE_REVIEW_MARK_FAILED/);
  assert.match(route, /INVOICE_STATUS_CHANGED/);

  const invoiceDraftRpcIndex = route.indexOf('admin.rpc("create_enterprise_manual_invoice_draft"');
  const providerCallIndex = route.indexOf("providerInvoice = await createRobokassaInvoice");
  const invalidInvIdIndex = route.indexOf("INVOICE_INV_ID_INVALID");
  const providerFailureIndex = route.indexOf("INVOICE_PROVIDER_FAILED");
  const genericProviderFailurePattern =
    /const markedForReview = await markDraftInvoiceRequiresReview\(admin, invoiceId\);\s+if \(!markedForReview\) return NextResponse\.json\(\{ error: "INVOICE_REVIEW_MARK_FAILED" \}, \{ status: 500 \}\);\s+return NextResponse\.json\(\{ error: "INVOICE_PROVIDER_FAILED"/;
  const providerSuccessRepairPattern =
    /const markedForReview = await markInvoiceProviderSuccessRequiresReview\(admin, invoiceId, providerInvoice\);\s+if \(!markedForReview\) return NextResponse\.json\(\{ error: "INVOICE_REVIEW_MARK_FAILED" \}, \{ status: 500 \}\);\s+return NextResponse\.json\(\{ error: "INVOICE_(?:ISSUE_UPDATE_FAILED|STATUS_CHANGED)"/;
  assert.ok(invoiceDraftRpcIndex > -1, "route must create and claim a manual invoice through the DB RPC");
  assert.ok(providerCallIndex > -1, "route must call the invoice provider");
  assert.ok(invoiceDraftRpcIndex < providerCallIndex, "atomic invoice draft RPC must happen before provider call");
  assert.doesNotMatch(route.slice(invoiceDraftRpcIndex, invalidInvIdIndex), /restoreDraftAgreement/);
  assert.ok(route.lastIndexOf("markDraftInvoiceRequiresReview", providerFailureIndex) > invoiceDraftRpcIndex);
  assert.doesNotMatch(route, /\.from\("billing_manual_invoices"\)[\s\S]*?\.insert\(/);
  assert.doesNotMatch(route, /\.from\("enterprise_agreements"\)[\s\S]*?\.update\(\{ status: "pending_payment"/);
  assert.match(route, genericProviderFailurePattern);
  assert.doesNotMatch(route, /markDraftInvoiceRequiresReview\(admin, invoiceId\);\s+if \(!markedForReview\)[\s\S]{0,220}restoreDraftAgreement\(admin, invoice\.agreement_id\)/);
  assert.match(route, providerSuccessRepairPattern);
  assert.doesNotMatch(route, /markInvoiceProviderSuccessRequiresReview\(admin, invoiceId, providerInvoice\);\s+if \(!markedForReview\)[\s\S]{0,220}restoreDraftAgreement\(admin, invoice\.agreement_id\)/);
  assert.match(
    route,
    /if \(!issuedInvoice\) \{[\s\S]*getManualInvoiceForRepair\(admin, invoiceId\)[\s\S]*currentInvoice\?\.status === "paid" \|\| currentInvoice\?\.status === "issued"[\s\S]*return NextResponse\.json\(\{ invoice: currentInvoice \}/,
  );
  assert.doesNotMatch(route, /\.update\(\{[\s\S]*?status: "issued"[\s\S]*?\.eq\("id", invoiceId\)[\s\S]*?\.select\("id,status,provider_invoice_url"\)[\s\S]*?\.single\(\)/);
});

test("platform admins can cancel draft Enterprise agreements before closing the source request", () => {
  const route = cancelAgreementRouteSource();
  const table = enterpriseAgreementsTableSource();

  assert.match(route, /requirePlatformAdmin/);
  assert.match(route, /\.select\("id,company_id,status"\)/);
  assert.match(route, /canCancelEnterpriseAgreement/);
  assert.match(route, /\.from\("billing_manual_invoices"\)[\s\S]*\.eq\("agreement_id", agreementId\)/);
  assert.match(route, /ENTERPRISE_AGREEMENT_CANCEL_BLOCKING_INVOICE_STATUSES/);
  assert.match(route, /status: "canceled"/);
  assert.match(route, /\.eq\("status", "draft"\)/);
  assert.match(route, /AGREEMENT_CANCEL_CONFLICT/);
  assert.doesNotMatch(route, /error\.message/);

  assert.match(table, /\/cancel/);
  assert.match(table, /Отменить договорённость/);
  assert.match(table, /canCancelAgreement/);
  assert.match(table, /AGREEMENT_NOT_CANCELABLE/);
  assert.match(table, /AGREEMENT_HAS_OPEN_INVOICE/);
  assert.match(table, /Договорённость отменена/);
});
