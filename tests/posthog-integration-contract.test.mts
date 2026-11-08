import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("root layout wraps the app with the PostHog provider", () => {
  const source = readFileSync("app/layout.tsx", "utf8");

  assert.match(source, /import \{ PostHogProvider \} from "@\/components\/analytics\/posthog-provider";/);
  assert.match(source, /<PostHogProvider>/);
  assert.match(source, /\{children\}/);
  assert.match(source, /<\/PostHogProvider>/);
});

test("PostHog provider initializes only when a public key is configured", () => {
  const source = readFileSync("components/analytics/posthog-provider.tsx", "utf8");

  assert.match(source, /"use client";/);
  assert.match(source, /NEXT_PUBLIC_POSTHOG_KEY/);
  assert.match(source, /NEXT_PUBLIC_POSTHOG_HOST/);
  assert.match(source, /posthog\.init/);
  assert.match(source, /defaults:\s*"2026-01-30"/);
  assert.match(source, /capture_pageview:\s*false/);
  assert.match(source, /<PHProvider client=\{posthog\}>/);
});
