import assert from "node:assert/strict";
import test from "node:test";

import { requireSameOriginRequest } from "../lib/api/csrf.ts";

function makeRequest(targetOrigin: string, origin: string, headers?: Record<string, string>) {
  return {
    headers: new Headers({
      host: new URL(targetOrigin).host,
      origin,
      ...headers,
    }),
    nextUrl: new URL(`${targetOrigin}/api/interviews`),
  } as Parameters<typeof requireSameOriginRequest>[0];
}

test("same origin passes", () => {
  const result = requireSameOriginRequest(makeRequest("https://app.example.com", "https://app.example.com"));

  assert.equal(result.ok, true);
});

test("same host with different scheme fails", () => {
  const result = requireSameOriginRequest(makeRequest("https://app.example.com", "http://app.example.com"));

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.response.status, 403);
});

test("malformed origin fails with 403", () => {
  const result = requireSameOriginRequest(makeRequest("https://app.example.com", "not a url"));

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.response.status, 403);
});

test("forwarded public origin is accepted behind a proxy", () => {
  const result = requireSameOriginRequest(
    makeRequest("http://internal:3000", "https://app.example.com", {
      "x-forwarded-host": "app.example.com",
      "x-forwarded-proto": "https",
    })
  );

  assert.equal(result.ok, true);
});
