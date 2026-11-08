import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("auth provider identifies authenticated users in PostHog and resets on logout", () => {
  const source = readFileSync("hooks/use-auth.tsx", "utf8");
  const identifyCall = source.match(/posthog\.identify\(user\.id,\s*\{[\s\S]*?\n\s*\}\);/)?.[0] ?? "";
  const groupCalls = source.match(/posthog\.group\("company",\s*user\.companyId,\s*\{[\s\S]*?\n\s*\}\);/g) ?? [];
  const loginHelperStart = source.indexOf("function capturePostHogLoginCompleted");
  const loginHelperEnd = source.indexOf("export function AuthProvider");
  const loginHelper = loginHelperStart >= 0 && loginHelperEnd > loginHelperStart ? source.slice(loginHelperStart, loginHelperEnd) : "";
  const resetHelperStart = source.indexOf("function resetPostHogBestEffort");
  const resetHelperEnd = source.indexOf("async function identifyPostHogUser");
  const resetHelper = resetHelperStart >= 0 && resetHelperEnd > resetHelperStart ? source.slice(resetHelperStart, resetHelperEnd) : "";

  assert.match(source, /import posthog from "posthog-js";/);
  assert.match(source, /function identifyPostHogUser/);
  assert.match(source, /posthog\.identify\(user\.id/);
  assert.match(identifyCall, /email:\s*user\.email/);
  assert.match(identifyCall, /name:\s*user\.name/);
  assert.match(identifyCall, /role:\s*user\.role/);
  assert.match(identifyCall, /company_id:\s*user\.companyId/);
  assert.match(identifyCall, /plan:\s*planProperties\.plan/);
  assert.match(identifyCall, /billing_status:\s*planProperties\.billing_status/);
  assert.doesNotMatch(identifyCall, /company:\s*user\.company/);
  assert.match(source, /posthog\.group\("company",\s*user\.companyId/);
  assert.equal(groupCalls.length, 2);
  for (const groupCall of groupCalls) {
    assert.match(groupCall, /name:\s*user\.company/);
    assert.match(groupCall, /plan:\s*planProperties\.plan/);
    assert.match(groupCall, /billing_status:\s*planProperties\.billing_status/);
  }
  assert.match(source, /login_completed/);
  assert.match(source, /posthog\.capture\("login_completed"/);
  assert.match(source, /function capturePostHogLoginCompleted[\s\S]*try\s*\{[\s\S]*catch\s*\{/);
  assert.match(loginHelper, /loadPostHogPlanProperties/);
  assert.match(loginHelper, /posthog\.identify\(user\.id/);
  assert.ok(loginHelper.indexOf("posthog.identify(user.id") < loginHelper.indexOf('posthog.capture("login_completed"'));
  assert.match(loginHelper, /posthog\.group\("company",\s*user\.companyId/);
  assert.ok(loginHelper.indexOf('posthog.group("company"') < loginHelper.indexOf('posthog.capture("login_completed"'));
  assert.match(source, /posthog\.reset\(\)/);
  assert.match(source, /function resetPostHogBestEffort/);
  assert.match(resetHelper, /try\s*\{[\s\S]*posthog\.reset\(\)[\s\S]*catch\s*\{/);
  assert.match(source, /lastPostHogUserIdRef/);
});

test("user type carries company id for analytics without changing display copy", () => {
  const source = readFileSync("types/index.ts", "utf8");

  assert.match(source, /companyId\?: string;/);
});

test("docs mention PostHog identify for authenticated product analytics", () => {
  const readme = readFileSync("README.md", "utf8");

  assert.match(readme, /posthog\.identify/);
  assert.match(readme, /user\.id/);
  assert.match(readme, /posthog\.reset/);
});
