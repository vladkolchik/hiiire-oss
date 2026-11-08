import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export%20%7B%7D", shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      const localPath = `${process.cwd()}/${specifier.slice(2)}`;
      return {
        url: pathToFileURL(/\.[cm]?tsx?$/.test(localPath) ? localPath : `${localPath}.ts`).href,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { buildSubscriptionReceipt } = await import("../lib/billing/fiscal-receipts.ts");
const { getBillingPlan, formatOutSum } = await import("../lib/billing/plans.ts");
const { buildCheckoutUrl, buildRecurringBody, createRecurringSignature } = await import("../lib/billing/robokassa.ts");
const { buildCheckoutSignatureBase, encodeRobokassaReceipt } = await import("../lib/billing/robokassa-signature.ts");

const checkoutRouteSource = () => readFileSync("app/api/billing/checkout/route.ts", "utf8");
const creditTopupRouteSource = () => readFileSync("app/api/billing/credit-topup/route.ts", "utf8");
const recurringRouteSource = () => readFileSync("app/api/cron/billing-renewals/route.ts", "utf8");

test("Starter subscription checkout amount is 4990 rubles", () => {
  const starterPlan = getBillingPlan("starter");

  assert.equal(starterPlan.amountKopecks, 499_000);
  assert.equal(formatOutSum(starterPlan.amountKopecks), "4990.00");
  assert.deepEqual(
    buildSubscriptionReceipt({
      planLabel: starterPlan.label,
      amountKopecks: starterPlan.amountKopecks,
    }).items[0],
    {
      name: "Подписка hiiire Starter на 1 месяц",
      quantity: 1,
      sum: "4990.00",
      tax: "none",
      payment_method: "full_payment",
      payment_object: "service",
    },
  );
});

test("subscription payments build Robokassa fiscal receipt items", () => {
  assert.deepEqual(
    buildSubscriptionReceipt({
      planLabel: "Professional",
      amountKopecks: 999_000,
    }),
    {
      sno: "osn",
      items: [
        {
          name: "Подписка hiiire Professional на 1 месяц",
          quantity: 1,
          sum: "9990.00",
          tax: "none",
          payment_method: "full_payment",
          payment_object: "service",
        },
      ],
    },
  );
});

test("Robokassa checkout URL carries payer email and fiscal receipt", () => {
  const receipt = encodeRobokassaReceipt(
    buildSubscriptionReceipt({
      planLabel: "Starter",
      amountKopecks: 499_000,
    }),
  );
  const signatureValue = buildCheckoutSignatureBase({
    merchantLogin: "hiiire",
    outSum: "4990.00",
    invId: 123,
    receipt,
    password1: "password-one",
    shp: { Shp_payment_id: "payment-1" },
  });

  const url = new URL(
    buildCheckoutUrl({
      paymentUrl: "https://auth.robokassa.ru/Merchant/Index.aspx",
      merchantLogin: "hiiire",
      outSum: "4990.00",
      invId: 123,
      description: "hiiire Starter subscription",
      signatureValue,
      resultUrl: "https://hiiire.example/result",
      successUrl: "https://hiiire.example/success",
      failUrl: "https://hiiire.example/fail",
      isTest: true,
      recurring: true,
      email: "billing@example.com",
      receipt,
      shp: { Shp_payment_id: "payment-1" },
    }),
  );

  assert.equal(url.searchParams.get("Email"), "billing@example.com");
  assert.equal(url.searchParams.get("Receipt"), receipt);
});

test("Robokassa recurring body carries payer email and fiscal receipt", () => {
  const receipt = encodeRobokassaReceipt(
    buildSubscriptionReceipt({
      planLabel: "Starter",
      amountKopecks: 499_000,
    }),
  );
  const body = buildRecurringBody({
    merchantLogin: "hiiire",
    invoiceId: 124,
    previousInvoiceId: 123,
    outSum: "4990.00",
    description: "hiiire Starter recurring",
    signatureValue: "signed",
    isTest: false,
    email: "billing@example.com",
    receipt,
  });

  assert.equal(body.get("Email"), "billing@example.com");
  assert.equal(body.get("Receipt"), receipt);
  assert.equal(
    createRecurringSignature({
      merchantLogin: "hiiire",
      outSum: "4990.00",
      invoiceId: 124,
      receipt,
      password1: "password-one",
    }),
    createHash("md5").update(`hiiire:4990.00:124:${receipt}:password-one`, "utf8").digest("hex"),
  );
});

test("subscription checkout and recurring routes pass email and receipt to Robokassa", () => {
  const checkoutSource = checkoutRouteSource();
  const topupSource = creditTopupRouteSource();
  const recurringSource = recurringRouteSource();

  assert.match(checkoutSource, /buildSubscriptionReceipt/);
  assert.match(checkoutSource, /encodeRobokassaReceipt/);
  assert.match(checkoutSource, /receipt:\s*encodedReceipt/);
  assert.match(checkoutSource, /email:\s*ctx\.email/);

  assert.match(topupSource, /email:\s*ctx\.email/);

  assert.match(recurringSource, /resolveCompanyBillingEmail/);
  assert.match(recurringSource, /buildSubscriptionReceipt/);
  assert.match(recurringSource, /receipt:\s*encodedReceipt/);
  assert.match(recurringSource, /email:\s*billingEmail/);
});

test("recurring renewal does not create or submit Robokassa payment without billing email", () => {
  const source = recurringRouteSource();
  const emailLookupIndex = source.indexOf("const billingEmail = await resolveCompanyBillingEmail");
  const missingEmailGuardIndex = source.indexOf("if (!billingEmail)");
  const paymentInsertIndex = source.indexOf('.from("payments")', missingEmailGuardIndex);
  const recurringFetchIndex = source.indexOf("await fetch(recurringUrl", missingEmailGuardIndex);

  assert.notEqual(emailLookupIndex, -1);
  assert.notEqual(missingEmailGuardIndex, -1);
  assert.notEqual(paymentInsertIndex, -1);
  assert.notEqual(recurringFetchIndex, -1);
  assert.ok(emailLookupIndex < missingEmailGuardIndex);
  assert.ok(missingEmailGuardIndex < paymentInsertIndex);
  assert.ok(missingEmailGuardIndex < recurringFetchIndex);
  assert.match(
    source.slice(missingEmailGuardIndex, paymentInsertIndex),
    /if \(!billingEmail\) \{\s*failed \+= 1;\s*continue;\s*\}/,
  );
});
