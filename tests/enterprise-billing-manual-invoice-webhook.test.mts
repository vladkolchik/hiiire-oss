import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getManualInvoicePaidWebhookAction,
  parseRobokassaManualInvoiceWebhookParams,
} from "../lib/billing/manual-invoices.ts";

const routeSource = () =>
  readFileSync(new URL("../app/api/billing/manual-invoice-webhook/route.ts", import.meta.url), "utf8");
const robokassaRouteSource = () =>
  readFileSync(new URL("../app/api/billing/robokassa-webhook/route.ts", import.meta.url), "utf8");
const invIdMigrationSource = () =>
  readFileSync(new URL("../supabase/sql/enterprise_manual_invoice_inv_id_v1.sql", import.meta.url), "utf8");

test("parses Robokassa ResultURL payload for a manual invoice", () => {
  const params = new URLSearchParams({
    OutSum: "120000.00",
    InvId: "98765",
    SignatureValue: "abc123",
    Shp_manual_invoice_id: "manual-invoice-1",
  });

  assert.deepEqual(parseRobokassaManualInvoiceWebhookParams(params), {
    ok: true,
    outSum: "120000.00",
    invId: 98765,
    providerInvoiceId: "98765",
    signatureValue: "abc123",
    providerPayload: {
      OutSum: "120000.00",
      InvId: "98765",
      SignatureValue: "abc123",
      Shp_manual_invoice_id: "manual-invoice-1",
    },
  });
});

test("parses invoice id aliases used by Robokassa callbacks", () => {
  const params = new URLSearchParams({
    outsum: "999.50",
    InvoiceID: "42",
    signaturevalue: "signed",
  });

  const parsed = parseRobokassaManualInvoiceWebhookParams(params);

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.invId, 42);
    assert.equal(parsed.providerInvoiceId, "42");
    assert.equal(parsed.outSum, "999.50");
    assert.equal(parsed.signatureValue, "signed");
  }
});

test("rejects incomplete or unsafe manual invoice webhook payloads", () => {
  assert.deepEqual(
    parseRobokassaManualInvoiceWebhookParams(
      new URLSearchParams({
        OutSum: "120000.00",
        InvId: "98765",
      }),
    ),
    { ok: false, error: "INVALID_PARAMS" },
  );

  assert.deepEqual(
    parseRobokassaManualInvoiceWebhookParams(
      new URLSearchParams({
        OutSum: "120000.00",
        InvId: "0",
        SignatureValue: "abc123",
      }),
    ),
    { ok: false, error: "INVALID_INV_ID" },
  );
});

test("chooses safe idempotency action for paid manual invoice events", () => {
  assert.equal(getManualInvoicePaidWebhookAction("issued"), "mark_paid");
  assert.equal(getManualInvoicePaidWebhookAction("paid"), "already_paid");

  for (const status of ["expired", "canceled", "refunded", "requires_review"] as const) {
    assert.equal(getManualInvoicePaidWebhookAction(status), "mark_review");
  }

  for (const status of ["draft"] as const) {
    assert.equal(getManualInvoicePaidWebhookAction(status), "mark_review");
  }
});

test("manual invoice webhook route uses Robokassa ResultURL safety contracts", () => {
  const source = routeSource();

  assert.match(source, /export const runtime = "nodejs"/);
  assert.match(source, /export const dynamic = "force-dynamic"/);
  assert.match(source, /verifyResultSignature/);
  assert.match(source, /requireRobokassaPassword2/);
  assert.match(source, /parseOutSumToKopecks/);
  assert.match(source, /\.from\("billing_manual_invoices"\)/);
  assert.match(source, /\.eq\("provider_invoice_id", parsed\.providerInvoiceId\)/);
  assert.match(source, /\.eq\("status", "issued"\)/);
  assert.match(source, /provider_payload:\s*parsed\.providerPayload/);
  assert.match(source, /return textResponse\(`OK\$\{parsed\.invId\}`\)/);
  assert.doesNotMatch(source, /\.from\("enterprise_agreements"\)/);
});

test("main Robokassa ResultURL can route Enterprise manual invoice callbacks by InvId", () => {
  const source = robokassaRouteSource();

  assert.match(source, /markManualInvoicePaid/);
  assert.match(source, /\.from\("billing_manual_invoices"\)/);
  assert.match(source, /\.eq\("provider_invoice_id", String\(invId\)\)/);
  assert.match(source, /getManualInvoicePaidWebhookAction/);
  assert.match(source, /provider_payload:\s*providerPayload/);
  assert.match(source, /manual invoice id mismatch/);
  assert.doesNotMatch(source, /activate_enterprise_agreement/);
});

test("manual invoice paid webhooks send status races to review instead of silently acknowledging", () => {
  for (const source of [robokassaRouteSource(), routeSource()]) {
    assert.match(source, /requires_review/);
    assert.match(source, /PAYMENT_REQUIRES_REVIEW/);
    assert.match(source, /\.select\("id,status"\)/);
  }
});

test("manual invoice paid webhooks review terminal invoice statuses before acknowledging", () => {
  for (const source of [robokassaRouteSource(), routeSource()]) {
    assert.match(source, /action === "mark_review"/);
    assert.match(source, /markManualInvoicePaymentRequiresReview/);
    assert.match(source, /provider_payload:\s*providerPayload|provider_payload:\s*parsed\.providerPayload/);
    assert.doesNotMatch(source, /action === "already_paid" \|\| action === "ignore"[\s\S]*?OK/);
    assert.doesNotMatch(source, /action === "ignore"/);
    assert.doesNotMatch(source, /paid event ignored/);
    assert.match(source, /\.update\(\{[\s\S]*status:\s*"requires_review"/);
    assert.match(source, /\.select\("id,status"\)[\s\S]*\.maybeSingle\(\)/);
    assert.match(source, /REVIEW_UPDATE_CONFLICT/);
  }
});

test("matched suspicious manual invoice paid callbacks are persisted for review", () => {
  const manualSource = routeSource();
  const robokassaSource = robokassaRouteSource();

  assert.match(manualSource, /markManualInvoicePaymentRequiresReview\(\{[\s\S]*providerPayload:\s*parsed\.providerPayload/);
  assert.match(robokassaSource, /markManualInvoicePaymentRequiresReview\(\{[\s\S]*providerPayload/);
  assert.match(manualSource, /forceReview:\s*true/);
  assert.match(robokassaSource, /forceReview:\s*true/);
  assert.match(manualSource, /currentInvoice\.status === "paid" && !forceReview/);
  assert.match(robokassaSource, /currentInvoice\.status === "paid" && !forceReview/);
  assert.match(manualSource, /\.eq\("id", invoiceId\)[\s\S]*\.select\("id,status"\)/);
  assert.match(robokassaSource, /\.eq\("id", invoiceId\)[\s\S]*\.select\("id,status"\)/);

  assert.doesNotMatch(
    manualSource,
    /shpManualInvoiceId[\s\S]{0,240}return textResponse\("INVOICE_MISMATCH", 400\)/,
  );
  assert.doesNotMatch(
    manualSource,
    /paidKopecks !== Number\(invoice\.amount \?\? 0\)[\s\S]{0,360}return textResponse\("OUTSUM_MISMATCH", 400\)/,
  );
  assert.doesNotMatch(
    robokassaSource,
    /manualInvoiceId && manualInvoiceId !== String\(invoice\.id\)[\s\S]{0,240}return \{ body: "INVOICE_MISMATCH", status: 400 \}/,
  );
  assert.doesNotMatch(
    robokassaSource,
    /paidKopecks !== Number\(invoice\.amount \?\? 0\)[\s\S]{0,360}return \{ body: "OUTSUM_MISMATCH", status: 400 \}/,
  );
});

test("manual invoices reserve high-range Robokassa InvId values before provider calls", () => {
  const source = invIdMigrationSource();

  assert.match(source, /create sequence if not exists public\.billing_manual_invoice_inv_id_seq/);
  assert.match(source, /start with 1000000000/);
  assert.match(source, /maxvalue 2147483647/);
  assert.match(source, /alter column provider_invoice_id set default nextval\('public\.billing_manual_invoice_inv_id_seq'\)::text/);
});
