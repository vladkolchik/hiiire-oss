import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { createVerificationContextFromPendingUser } from "../lib/auth/verification-context.core.ts";

const verificationContextRoutePath = path.resolve(
  process.cwd(),
  "app/api/auth/verification-context/route.ts"
);

test("primeVerificationContext refreshes from the current session instead of posting an arbitrary email", async () => {
  const fetchCalls: Array<{ input: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;

  const sessionStorageState = new Map<string, string>();
  const sessionStorage = {
    getItem(key: string) {
      return sessionStorageState.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      sessionStorageState.set(key, value);
    },
    removeItem(key: string) {
      sessionStorageState.delete(key);
    },
    clear() {
      sessionStorageState.clear();
    },
  };

  (globalThis as typeof globalThis & { window?: unknown }).window = { sessionStorage };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ input: String(input), init });
    return new Response(
      JSON.stringify({
        contextId: "ctx-123",
        email: "pending@example.com",
        maskedEmail: "pe***@ex***.com",
        cooldownLeftSeconds: 0,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  }) as typeof fetch;

  try {
    const { primeVerificationContext, getExpectedVerificationContextId } = await import(
      "../lib/auth/verification-context.client.ts"
    );

    await primeVerificationContext("attacker@example.com");

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0]?.init?.method, "GET");
    assert.equal(fetchCalls[0]?.init?.body, undefined);
    assert.equal(getExpectedVerificationContextId(), "ctx-123");
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
  }
});

test("verification context route should not expose a public POST body flow", () => {
  const source = readFileSync(verificationContextRoutePath, "utf8");

  assert.doesNotMatch(source, /export\s+async\s+function\s+POST\s*\(/);
  assert.doesNotMatch(source, /BodySchema/);
  assert.doesNotMatch(source, /JSON\.stringify\(\{\s*email\s*\}\)/);
});

test("verification context route checks existing context email state before returning a guest context", () => {
  const source = readFileSync(verificationContextRoutePath, "utf8");

  assert.match(source, /getSupabaseAdminClient/);
  assert.match(source, /get_signup_email_state/);
  assert.match(source, /existingContext\.email/);
  assert.match(source, /status:\s*"confirmed"/);
  assert.match(source, /clearVerificationContext\(res,\s*req\)/);
  assert.match(source, /catch\s*\{/);
  assert.match(source, /return\s+false/);
});

test("trusted verification context can be derived only from a pending auth session user", () => {
  const pendingContext = createVerificationContextFromPendingUser({
    email: "Pending@Example.com",
  });

  assert.ok(pendingContext);
  assert.equal(pendingContext?.email, "pending@example.com");

  const confirmedContext = createVerificationContextFromPendingUser({
    email: "confirmed@example.com",
    email_confirmed_at: "2026-04-12T00:00:00.000Z",
  });

  assert.equal(confirmedContext, null);
});
