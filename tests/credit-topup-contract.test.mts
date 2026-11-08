import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CHECKOUT_TOPUP_REUSE_WINDOW_MS,
  CREDIT_TOPUP_PRESETS,
  CREDIT_TOPUP_PRICE_KOPECKS,
  buildCreditTopupReceipt,
  calculateCreditTopupAmountKopecks,
  parseCreditTopupQuantity,
  shouldReuseCreditTopupPayment,
} from "../lib/billing/credit-topups.ts";
import { buildCheckoutSignatureBase, encodeRobokassaReceipt } from "../lib/billing/robokassa-signature.ts";

const settingsSource = () => readFileSync("app/(dashboard)/dashboard/settings/page.tsx", "utf8");
const routeSource = () => readFileSync("app/api/billing/credit-topup/route.ts", "utf8");
const webhookSource = () => readFileSync("app/api/billing/robokassa-webhook/route.ts", "utf8");
const migrationSource = () => readFileSync("supabase/sql/billing_credit_topups_v1.sql", "utf8");
const adminCreditsSource = () => readFileSync("app/(admin)/admin/(protected)/credits/page.tsx", "utf8");

test("credit top-up pricing and presets match the product decision", () => {
  assert.deepEqual(CREDIT_TOPUP_PRESETS, [50, 100, 300, 600]);
  assert.equal(CREDIT_TOPUP_PRICE_KOPECKS, 1500);
  assert.equal(calculateCreditTopupAmountKopecks(50), 75_000);
  assert.equal(calculateCreditTopupAmountKopecks(600), 900_000);
});

test("credit top-up quantity accepts only short positive digit-only values", () => {
  assert.equal(parseCreditTopupQuantity("50"), 50);
  assert.equal(parseCreditTopupQuantity("00100"), 100);
  assert.equal(parseCreditTopupQuantity("99999"), 99_999);

  for (const value of ["", "0", "100000", "10.5", "10,5", "50 credits", "-50", " 50 ", "1 000"]) {
    assert.equal(parseCreditTopupQuantity(value), null, value);
  }
});

test("credit top-up builds a fiscal receipt for accounting", () => {
  assert.deepEqual(
    buildCreditTopupReceipt({
      credits: 100,
      amountKopecks: 150_000,
    }),
    {
      sno: "osn",
      items: [
        {
          name: "Пополнение баланса hiiire: 100 кредитов",
          quantity: 1,
          sum: "1500.00",
          tax: "none",
        },
      ],
    },
  );
});

test("Robokassa checkout signature includes the encoded fiscal receipt before password", () => {
  const receipt = buildCreditTopupReceipt({
    credits: 50,
    amountKopecks: 75_000,
  });
  const encodedReceipt = encodeRobokassaReceipt(receipt);

  assert.match(encodedReceipt, /^%7B/);
  assert.equal(
    buildCheckoutSignatureBase({
      merchantLogin: "hiiire",
      outSum: "750.00",
      invId: 123,
      password1: "password-one",
      receipt: encodedReceipt,
      shp: { Shp_credit_topup_id: "topup-1" },
    }),
    `hiiire:750.00:123:${encodedReceipt}:password-one:Shp_credit_topup_id=topup-1`,
  );
});

test("credit top-up reuses a matching pending checkout only inside the short payment window", () => {
  const now = new Date("2026-05-18T10:00:00.000Z");
  const candidate = {
    company_id: "company-1",
    credits: 100,
    amount: 150_000,
    currency: "RUB",
    status: "pending",
    checkout_expires_at: new Date(now.getTime() + CHECKOUT_TOPUP_REUSE_WINDOW_MS).toISOString(),
    created_at: now.toISOString(),
  };

  assert.equal(
    shouldReuseCreditTopupPayment(candidate, {
      companyId: "company-1",
      credits: 100,
      amount: 150_000,
      currency: "RUB",
      now,
    }),
    true,
  );

  assert.equal(
    shouldReuseCreditTopupPayment(
      { ...candidate, checkout_expires_at: now.toISOString() },
      {
        companyId: "company-1",
        credits: 100,
        amount: 150_000,
        currency: "RUB",
        now,
      },
    ),
    false,
  );

  assert.equal(
    shouldReuseCreditTopupPayment(
      { ...candidate, credits: 50, amount: 75_000 },
      {
        companyId: "company-1",
        credits: 100,
        amount: 150_000,
        currency: "RUB",
        now,
      },
    ),
    false,
  );
});

test("credit top-up checkout is a one-time Robokassa payment with top-up metadata", () => {
  const source = routeSource();

  assert.match(source, /calculateCreditTopupAmountKopecks/);
  assert.match(source, /Shp_credit_topup_id/);
  assert.match(source, /buildCreditTopupReceipt/);
  assert.match(source, /fiscal_receipt/);
  assert.match(source, /receipt:\s*fiscalReceipt/);
  assert.match(source, /encodeRobokassaReceipt/);
  assert.match(source, /CHECKOUT_TOPUP_REUSE_WINDOW_MS/);
  assert.match(source, /create_or_reuse_credit_topup_payment/);
  assert.match(source, /reused/);
  assert.match(source, /recurring:\s*false/);
  assert.doesNotMatch(source, /Recurring/);
  assert.match(source, /CREDIT_TOPUP_PLAN_INACTIVE/);
});

test("Robokassa ResultURL can finalize credit top-up payments before manual invoice fallback", () => {
  const source = webhookSource();

  assert.match(source, /markCreditTopupPaid/);
  assert.match(source, /credit_topup_payments/);
  assert.ok(source.indexOf("shp.Shp_credit_topup_id") < source.indexOf('.from("payments")'));
  assert.ok(source.indexOf("markCreditTopupPaid") < source.indexOf("markManualInvoicePaid"));
  assert.match(source, /credit_topup_paid/);
  assert.match(source, /provider_payload:\s*input\.providerPayload/);
  assert.doesNotMatch(source, /CREDIT_TOPUP_CHECKOUT_EXPIRED/);
  assert.match(source, /finalizeResult/);
  assert.match(source, /already_completed/);
  assert.match(source, /credits_granted/);
  assert.match(source, /notifyCompanyAdmins/);
  assert.match(source, /notifyCompanyAdminsByEmail/);
  assert.match(source, /formatClientCreditTopupPaidMessage/);
  assert.match(source, /formatClientCreditTopupPaidEmail/);
});

test("credit top-up migration stores one-time payments and grants credits into the common ledger", () => {
  const source = migrationSource();

  assert.match(source, /create table if not exists public\.credit_topup_payments/);
  assert.match(source, /credits integer not null/);
  assert.match(source, /amount integer not null/);
  assert.match(source, /fiscal_receipt jsonb/);
  assert.match(source, /provider_payload jsonb/);
  assert.match(source, /checkout_expires_at timestamptz/);
  assert.match(source, /inv_id integer not null default nextval\('public\.payments_inv_id_seq'\)/);
  assert.match(source, /create or replace function public\.create_or_reuse_credit_topup_payment/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /public\.credit_ledger/);
  assert.match(source, /reference_type[\s\S]*'credit_topup_payment'/);
  assert.match(source, /enable row level security/);
  assert.doesNotMatch(source, /create policy credit_topup_payments_select_company/);
  assert.match(source, /credit_topup_payments_deny_browser_select/);
});

test("settings plan tab exposes a minimal top-up dialog gated by offer and privacy consent", () => {
  const source = settingsSource();

  assert.match(source, /Пополнить баланс/);
  assert.match(source, /topup-consent/);
  assert.match(source, /CREDIT_TOPUP_PRESETS/);
  assert.match(source, /inputMode="numeric"/);
  assert.match(source, /maxLength=\{5\}/);
  assert.match(source, /\/api\/billing\/credit-topup/);
  assert.match(source, /публичной оферты/);
  assert.match(source, /политики конфиденциальности/);
  assert.match(source, /!creditTopupConsent/);
});

test("admin credits page shows credit top-up payments as business operations", () => {
  const source = adminCreditsSource();

  assert.match(source, /Пополнения кредитов/);
  assert.match(source, /credit_topup_payments/);
  assert.match(source, /credits,amount,currency,status,inv_id,fiscal_receipt,provider_payload/);
  assert.match(source, /InvId/);
  assert.match(source, /Сумма/);
  assert.match(source, /Чек/);
  assert.match(source, /Callback/);
  assert.match(source, /Payment ID/);
  assert.match(source, /Завершено/);
  assert.match(source, /Причина/);
});
