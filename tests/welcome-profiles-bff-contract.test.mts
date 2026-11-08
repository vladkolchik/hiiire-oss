import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const profilesRoute = readFileSync("app/api/profiles/route.ts", "utf8");
const welcomeRoute = readFileSync("app/api/onboarding/welcome/route.ts", "utf8");

test("profiles route preserves non-admin profile visibility", () => {
  assert.match(profilesRoute, /ctxRes\.data\.role === "admin"/);
  assert.match(profilesRoute, /parsedIds\.ids\.filter\(\(id\) => id === ctxRes\.data\.userId\)/);
  assert.match(profilesRoute, /visibleIds\.length === 0/);
  assert.match(profilesRoute, /\.in\("id", visibleIds\)/);
});

test("welcome route can only complete onboarding", () => {
  assert.match(welcomeRoute, /z\.literal\(true/);
  assert.doesNotMatch(welcomeRoute, /z\.boolean/);
  assert.match(welcomeRoute, /onboarding_completed:\s*parsed\.data\.onboardingCompleted/);
});

test("welcome route avoids billing side effects after completed onboarding", () => {
  assert.doesNotMatch(welcomeRoute, /Promise\.all\(/);
  assert.match(welcomeRoute, /onboardingCompleted === false[\s\S]*loadCompanyPlanSnapshot/);
  assert.match(welcomeRoute, /:\s*null/);
});
