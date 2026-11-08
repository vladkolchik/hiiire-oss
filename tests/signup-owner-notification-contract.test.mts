import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  assert.ok(existsSync(path), `${path} should exist`);
  return readFileSync(path, "utf8");
}

test("signup route schedules owner notification on both new-user success paths", () => {
  const route = read("app/api/auth/signup/route.ts");
  const postBody = route.slice(route.indexOf("export async function POST"));
  const scheduleCalls = postBody.match(/scheduleSignupOwnerNotification\(/g) ?? [];
  const analyticsCalls = postBody.match(/scheduleSignupAnalyticsCapture\(/g) ?? [];

  assert.equal(scheduleCalls.length, 2);
  assert.equal(analyticsCalls.length, 2);
  assert.match(route, /import \{ scheduleOwnerSignupNotification \} from "@\/lib\/telegram\/owner-signup-notification"/);
  assert.match(postBody, /scheduleSignupOwnerNotification\(\{[\s\S]*scheduleSignupAnalyticsCapture\(\{[\s\S]*emailConfirmationRequired:\s*true/);
  assert.match(postBody, /scheduleSignupOwnerNotification\(\{[\s\S]*scheduleSignupAnalyticsCapture\(\{[\s\S]*emailConfirmationRequired:\s*false/);
  assert.match(route, /marketingAttribution:\s*parsed\.data\.marketingAttribution/);
  assert.match(route, /requestedPlan:\s*intendedPlan/);
});

test("signup route schedules notification before analytics and branch responses", () => {
  const route = read("app/api/auth/signup/route.ts");
  const postBody = route.slice(route.indexOf("export async function POST"));
  const firstNotifyIndex = postBody.indexOf("scheduleSignupOwnerNotification(");
  const firstAnalyticsIndex = postBody.indexOf("scheduleSignupAnalyticsCapture(");
  const firstResponseIndex = postBody.indexOf("return buildEmailConfirmationResponse", firstNotifyIndex);
  const secondNotifyIndex = postBody.indexOf("scheduleSignupOwnerNotification(", firstNotifyIndex + 1);
  const secondAnalyticsIndex = postBody.indexOf("scheduleSignupAnalyticsCapture(", firstAnalyticsIndex + 1);
  const secondResponseIndex = postBody.indexOf("return res;", secondNotifyIndex);

  assert.ok(firstNotifyIndex >= 0);
  assert.ok(firstAnalyticsIndex > firstNotifyIndex);
  assert.ok(firstResponseIndex > firstNotifyIndex);
  assert.ok(secondNotifyIndex > firstNotifyIndex);
  assert.ok(secondAnalyticsIndex > secondNotifyIndex);
  assert.ok(secondResponseIndex > secondNotifyIndex);
});

test("signup route keeps notification internals outside the registration flow", () => {
  const route = read("app/api/auth/signup/route.ts");

  assert.doesNotMatch(route, /from "@\/lib\/telegram\/notify"/);
  assert.doesNotMatch(route, /from "@\/lib\/telegram\/client"/);
  assert.doesNotMatch(route, /from "@\/lib\/admin\/platform-summary"/);
  assert.doesNotMatch(route, /notifyOwnerSignupCreated/);
  assert.doesNotMatch(route, /await\s+notifyOwners/);
});

test("signup route wraps post-response analytics scheduling so it cannot break registration", () => {
  const route = read("app/api/auth/signup/route.ts");
  const helper = route.slice(route.indexOf("function scheduleSignupAnalyticsCapture"));

  assert.match(helper, /try \{[\s\S]*after\(async \(\) =>/);
  assert.match(helper, /Promise\.resolve\(\)[\s\S]*captureSignupCompleted\(input\)[\s\S]*catch\(\(\) => undefined\)/);
  assert.match(helper, /Analytics scheduling must never break signup/);
});

test("signup route does not await profile context before returning success responses", () => {
  const route = read("app/api/auth/signup/route.ts");
  const postBody = route.slice(route.indexOf("export async function POST"));

  assert.doesNotMatch(postBody, /loadSignupProfileContext/);
  assert.doesNotMatch(postBody, /\.from\("profiles"\)[\s\S]*return buildEmailConfirmationResponse/);
});

test("signup route does not notify duplicate or existing-unconfirmed email paths", () => {
  const route = read("app/api/auth/signup/route.ts");
  const postBody = route.slice(route.indexOf("export async function POST"));
  const duplicateIndex = postBody.indexOf("buildDuplicateEmailResponse(req)");
  const existingUnconfirmedIndex = postBody.indexOf('"existing_unconfirmed"');
  const firstScheduleIndex = postBody.indexOf("scheduleSignupOwnerNotification(");

  assert.ok(duplicateIndex >= 0);
  assert.ok(existingUnconfirmedIndex >= 0);
  assert.ok(firstScheduleIndex > duplicateIndex);
  assert.ok(firstScheduleIndex > existingUnconfirmedIndex);
});

test("signup route avoids post-preflight duplicate notification race", () => {
  const route = read("app/api/auth/signup/route.ts");
  const postBody = route.slice(route.indexOf("export async function POST"));
  const branchStart = postBody.indexOf("if (!data.session)");
  const branchResponse = postBody.indexOf("return buildEmailConfirmationResponse", branchStart);
  const emailConfirmationBranch = postBody.slice(branchStart, branchResponse);
  const firstScheduleAfterSignup = emailConfirmationBranch.indexOf("scheduleSignupOwnerNotification(");
  const guardIndex = emailConfirmationBranch.indexOf("shouldNotify: async () =>", firstScheduleAfterSignup);
  const afterSignupStateCheck = emailConfirmationBranch.indexOf("const emailStateAfterSignup = await getSignupEmailState(email).catch(() => undefined)", guardIndex);
  const eligibilityIndex = emailConfirmationBranch.indexOf("shouldNotifyForPostSignupEmailState", afterSignupStateCheck);

  assert.ok(firstScheduleAfterSignup >= 0);
  assert.ok(guardIndex > firstScheduleAfterSignup);
  assert.ok(afterSignupStateCheck >= 0);
  assert.ok(eligibilityIndex > afterSignupStateCheck);
  assert.doesNotMatch(emailConfirmationBranch.slice(0, firstScheduleAfterSignup), /getSignupEmailState\(email\)/);
  assert.doesNotMatch(emailConfirmationBranch, /\.catch\(\(\) => null\)/);
  assert.match(postBody, /return buildEmailConfirmationResponse\(req, email, "new_signup"\)/);
});
