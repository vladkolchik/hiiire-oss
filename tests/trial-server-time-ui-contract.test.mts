import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const settingsPage = readFileSync(
  new URL("../app/(dashboard)/dashboard/settings/page.tsx", import.meta.url),
  "utf8"
);
const trialBanner = readFileSync(new URL("../components/dashboard/trial-banner.tsx", import.meta.url), "utf8");
const welcomeDialog = readFileSync(new URL("../components/dashboard/welcome-dialog.tsx", import.meta.url), "utf8");

test("trial UI renders server-provided trial display fields", () => {
  assert.doesNotMatch(settingsPage, /new Date\(trialExpiresAt\)\.getTime\(\)\s*-\s*Date\.now\(\)/);
  assert.match(settingsPage, /trialDaysLeft/);
  assert.match(settingsPage, /trialState/);

  assert.doesNotMatch(trialBanner, /createSupabaseBrowserClient/);
  assert.doesNotMatch(trialBanner, /\.from\("company_plans"\)/);
  assert.doesNotMatch(trialBanner, /Date\.now\(\)/);
  assert.match(trialBanner, /\/api\/billing\/plan/);
  assert.match(trialBanner, /trialDaysLeft/);
  assert.match(trialBanner, /trialState/);

  assert.doesNotMatch(welcomeDialog, /\.from\("company_plans"\)/);
  assert.doesNotMatch(welcomeDialog, /Date\.now\(\)/);
  assert.match(welcomeDialog, /\/api\/billing\/plan/);
  assert.match(welcomeDialog, /trialDaysLeft/);
});
