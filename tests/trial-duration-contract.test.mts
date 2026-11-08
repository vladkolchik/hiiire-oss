import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const canonicalSignupProvisioning = "supabase/sql/handle_new_user_platform_admin_company_member_v1.sql";
const productionDurationMigration = "supabase/sql/signup_trial_duration_7_days_v1.sql";
const signupProvisioningSchema = "supabase/sql/signup_trial_provisioning.sql";

test("signup provisioning grants a 7 day trial", () => {
  const source = readFileSync(canonicalSignupProvisioning, "utf8");
  const sevenDayAssignments = source.match(/now\(\) \+ interval '7 days'/g) ?? [];

  assert.equal(sevenDayAssignments.length, 2);
  assert.doesNotMatch(source, /now\(\) \+ interval '14 days'/);
  assert.doesNotMatch(source, /Auto-start trial \(14 days\)/);
});

test("production migration grants a 7 day trial without shortening existing trials", () => {
  const source = readFileSync(productionDurationMigration, "utf8");
  const sevenDayAssignments = source.match(/now\(\) \+ interval '7 days'/g) ?? [];

  assert.equal(sevenDayAssignments.length, 2);
  assert.doesNotMatch(source, /now\(\) \+ interval '14 days'/);
  assert.doesNotMatch(source, /update\s+public\.company_plans/i);
  assert.doesNotMatch(source, /least\s*\(/i);
});

test("signup provisioning comments do not describe a 14 day trial", () => {
  const source = readFileSync(signupProvisioningSchema, "utf8");

  assert.match(source, /Auto-start trial \(7 days\)/);
  assert.doesNotMatch(source, /Auto-start trial \(14 days\)/);
});
