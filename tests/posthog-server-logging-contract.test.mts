import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("server PostHog helper sends immediate server-side events safely", () => {
  const source = readFileSync("lib/analytics/posthog-server.ts", "utf8");

  assert.match(source, /import \{ PostHog \} from "posthog-node";/);
  assert.match(source, /NEXT_PUBLIC_POSTHOG_KEY/);
  assert.match(source, /NEXT_PUBLIC_POSTHOG_HOST/);
  assert.match(source, /flushAt:\s*1/);
  assert.match(source, /flushInterval:\s*0/);
  assert.match(source, /captureImmediate/);
  assert.match(source, /captureExceptionImmediate/);
  assert.match(source, /\$process_person_profile":\s*false/);
});

test("Next instrumentation forwards server errors without leaking request headers", () => {
  const source = readFileSync("instrumentation.ts", "utf8");

  assert.match(source, /import type \{ Instrumentation \} from "next";/);
  assert.match(source, /captureServerError/);
  assert.match(source, /export const onRequestError:\s*Instrumentation\.onRequestError/);
  assert.match(source, /await captureServerError/);
  assert.doesNotMatch(source, /headers/);
});
