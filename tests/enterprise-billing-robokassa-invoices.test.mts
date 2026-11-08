import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export%20%7B%7D", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { createRobokassaInvoice, deactivateRobokassaInvoice, getRobokassaInvoiceStatus } = await import(
  "../lib/billing/robokassa-invoices.ts"
);

const ENV_KEYS = [
  "ROBOKASSA_MERCHANT_LOGIN",
  "ROBOKASSA_LOGIN",
  "ROBOKASSA_PASSWORD1",
  "ROBOKASSA_HASH_ALGORITHM",
  "ROBOKASSA_INVOICE_CREATE_URL",
  "ROBOKASSA_INVOICE_STATUS_URL",
  "ROBOKASSA_INVOICE_DEACTIVATE_URL",
  "ROBOKASSA_INVOICE_TIMEOUT_MS",
] as const;

function withEnv(env: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>, fn: () => Promise<void> | void) {
  const previous = new Map<string, string | undefined>();
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  return Promise.resolve(fn()).finally(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function decodeBase64UrlJson(part: string): unknown {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
}

function sampleInput() {
  return {
    invId: 1000000001,
    amountKopecks: 12000000,
    description: "Enterprise access hiiire",
    manualInvoiceId: "manual-invoice-1",
    payerEmail: "billing@example.com",
    receipt: {
      sno: "osn",
      items: [
        {
          name: "Enterprise access hiiire",
          quantity: 1,
          sum: "120000.00",
          tax: "none",
        },
      ],
    },
    successUrl: "https://hiiire.example/admin/billing?invoice=success",
    failUrl: "https://hiiire.example/admin/billing?invoice=failed",
  };
}

test("createRobokassaInvoice sends signed JWT payload to configured Invoice API endpoint", async () => {
  await withEnv(
    {
      ROBOKASSA_MERCHANT_LOGIN: "hiiire-shop",
      ROBOKASSA_PASSWORD1: "pass1",
      ROBOKASSA_HASH_ALGORITHM: "sha256",
      ROBOKASSA_INVOICE_CREATE_URL: "https://robokassa.example/CreateInvoice",
    },
    async () => {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      const fetchMock = async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(
          JSON.stringify({
            Id: 98765,
            Url: "https://auth.robokassa.ru/merchant/Invoice/encoded-id",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      };

      const result = await createRobokassaInvoice(sampleInput(), { fetch: fetchMock });

      assert.equal(result.providerInvoiceId, "1000000001");
      assert.equal(result.invoiceUrl, "https://auth.robokassa.ru/merchant/Invoice/encoded-id");
      assert.deepEqual(result.raw, {
        Id: 98765,
        Url: "https://auth.robokassa.ru/merchant/Invoice/encoded-id",
      });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, "https://robokassa.example/CreateInvoice");
      assert.equal(calls[0].init.method, "POST");
      assert.equal((calls[0].init.headers as Record<string, string>)["content-type"], "application/json");
      assert.ok(calls[0].init.signal instanceof AbortSignal);

      const token = JSON.parse(String(calls[0].init.body));
      const [headerPart, payloadPart, signaturePart] = token.split(".");
      assert.deepEqual(decodeBase64UrlJson(headerPart), { typ: "JWT", alg: "SHA256" });
      assert.deepEqual(decodeBase64UrlJson(payloadPart), {
        MerchantLogin: "hiiire-shop",
        InvoiceType: "OneTime",
        Culture: "ru",
        InvId: 1000000001,
        OutSum: 120000,
        Description: "Enterprise access hiiire",
        Email: "billing@example.com",
        InvoiceItems: [
          {
            Name: "Enterprise access hiiire",
            Quantity: 1,
            Cost: 120000,
            Tax: "none",
            PaymentMethod: "full_payment",
            PaymentObject: "service",
          },
        ],
        SuccessUrl2Data: {
          Url: "https://hiiire.example/admin/billing?invoice=success",
          Method: "GET",
        },
        FailUrl2Data: {
          Url: "https://hiiire.example/admin/billing?invoice=failed",
          Method: "GET",
        },
        UserFields: {
          shp_manual_invoice_id: "manual-invoice-1",
        },
      });

      const expectedSignature = createHmac("sha256", "hiiire-shop:pass1")
        .update(`${headerPart}.${payloadPart}`, "utf8")
        .digest("base64")
        .replace(/=+$/, "");
      assert.equal(signaturePart, expectedSignature);
    },
  );
});

test("createRobokassaInvoice uses the documented default endpoint and parses a plain invoice URL response", async () => {
  await withEnv(
    {
      ROBOKASSA_MERCHANT_LOGIN: "hiiire-shop",
      ROBOKASSA_PASSWORD1: "pass1",
    },
    async () => {
      const fetchMock = async (url: string | URL | Request) => {
        assert.equal(
          String(url),
          "https://services.robokassa.ru/InvoiceServiceWebApi/api/CreateInvoice",
        );
        return new Response('"https://auth.robokassa.ru/merchant/Invoice/plain-encoded-id"', {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      };

      const result = await createRobokassaInvoice(sampleInput(), { fetch: fetchMock });

      assert.equal(result.providerInvoiceId, "1000000001");
      assert.equal(result.invoiceUrl, "https://auth.robokassa.ru/merchant/Invoice/plain-encoded-id");
      assert.equal(result.raw, "https://auth.robokassa.ru/merchant/Invoice/plain-encoded-id");
    },
  );
});

test("createRobokassaInvoice reports missing Invoice API config before calling provider", async () => {
  await withEnv({}, async () => {
    let called = false;
    await assert.rejects(
      createRobokassaInvoice(sampleInput(), {
        fetch: async () => {
          called = true;
          return new Response(null, { status: 200 });
        },
      }),
      /ROBOKASSA_INVOICE_API_NOT_CONFIGURED/,
    );
    assert.equal(called, false);
  });
});

test("createRobokassaInvoice wraps provider failures without exposing response body as the message", async () => {
  await withEnv(
    {
      ROBOKASSA_MERCHANT_LOGIN: "hiiire-shop",
      ROBOKASSA_PASSWORD1: "pass1",
    },
    async () => {
      await assert.rejects(
        createRobokassaInvoice(sampleInput(), {
          fetch: async () =>
            new Response(JSON.stringify({ error: "bad credentials" }), {
              status: 401,
              headers: { "content-type": "application/json" },
            }),
        }),
        /ROBOKASSA_INVOICE_API_FAILED/,
      );
    },
  );
});

test("getRobokassaInvoiceStatus sends signed JWT to the status endpoint and parses invoice status", async () => {
  await withEnv(
    {
      ROBOKASSA_MERCHANT_LOGIN: "hiiire-shop",
      ROBOKASSA_PASSWORD1: "pass1",
      ROBOKASSA_HASH_ALGORITHM: "sha256",
      ROBOKASSA_INVOICE_CREATE_URL: "https://robokassa.example/CreateInvoice",
    },
    async () => {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      const result = await getRobokassaInvoiceStatus(
        {
          invId: 1000000001,
          providerInvoiceId: "1000000001",
          invoiceUrl: "https://auth.robokassa.ru/merchant/Invoice/encoded-id",
          createdAt: "2026-05-26T10:00:00.000Z",
        },
        {
          fetch: async (url: string | URL | Request, init?: RequestInit) => {
            calls.push({ url: String(url), init: init ?? {} });
            return new Response(
              JSON.stringify({
                Result: {
                  Items: [{ InvId: 1000000001, Status: "Expired" }],
                },
              }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          },
        },
      );

      assert.equal(result.providerStatus, "Expired");
      assert.equal(calls[0].url, "https://robokassa.example/GetInvoiceInformationList");

      const token = JSON.parse(String(calls[0].init.body));
      const [, payloadPart] = token.split(".");
      const payload = decodeBase64UrlJson(payloadPart) as Record<string, unknown>;
      assert.equal(payload.MerchantLogin, "hiiire-shop");
      assert.equal(payload.CurrentPage, 1);
      assert.equal(payload.PageSize, 10);
      assert.deepEqual(payload.InvoiceStatuses, ["Paid", "Expired", "Notpaid"]);
      assert.deepEqual(payload.InvoiceTypes, ["OneTime"]);
      assert.equal(payload.Keywords, "1000000001");
    },
  );
});

test("deactivateRobokassaInvoice sends invoice identifiers to the deactivate endpoint", async () => {
  await withEnv(
    {
      ROBOKASSA_MERCHANT_LOGIN: "hiiire-shop",
      ROBOKASSA_PASSWORD1: "pass1",
      ROBOKASSA_INVOICE_CREATE_URL: "https://robokassa.example/CreateInvoice",
    },
    async () => {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      const result = await deactivateRobokassaInvoice(
        {
          invId: 1000000001,
          providerInvoiceId: "provider-123",
          invoiceUrl: "https://auth.robokassa.ru/merchant/Invoice/encoded-id",
        },
        {
          fetch: async (url: string | URL | Request, init?: RequestInit) => {
            calls.push({ url: String(url), init: init ?? {} });
            return new Response(JSON.stringify({ Success: true }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          },
        },
      );

      assert.deepEqual(result.raw, { Success: true });
      assert.equal(calls[0].url, "https://robokassa.example/DeactivateInvoice");

      const token = JSON.parse(String(calls[0].init.body));
      const [, payloadPart] = token.split(".");
      assert.deepEqual(decodeBase64UrlJson(payloadPart), {
        MerchantLogin: "hiiire-shop",
        InvId: 1000000001,
        Id: "provider-123",
        EncodedId: "encoded-id",
      });
    },
  );
});
