import assert from "node:assert/strict";
import test from "node:test";

import {
  decideHrAssistantPolicy,
  type HrAssistantToolRisk,
} from "../lib/hr-assistant/policy.ts";

function decision(risk: HrAssistantToolRisk, mode: "manual" | "auto" = "auto") {
  return decideHrAssistantPolicy({
    mode,
    risk,
    isSupported: true,
    hasAccess: true,
    hasCredits: true,
  }).decision;
}

test("read and draft tools are auto approved after access checks", () => {
  assert.equal(decision("read"), "auto_approved");
  assert.equal(decision("draft"), "auto_approved");
});

test("crm writes require manual approval in manual mode", () => {
  assert.equal(decision("crm_write", "manual"), "manual_approval_required");
});

test("external and destructive actions require manual approval or are blocked", () => {
  assert.equal(decision("external", "auto"), "manual_approval_required");
  assert.equal(decision("destructive", "auto"), "manual_approval_required");
});

test("unsupported tools return not_supported_yet", () => {
  assert.equal(
    decideHrAssistantPolicy({
      mode: "auto",
      risk: "external",
      isSupported: false,
      hasAccess: true,
      hasCredits: true,
    }).decision,
    "not_supported_yet"
  );
});

test("access and credits failures are explicit decisions", () => {
  assert.equal(
    decideHrAssistantPolicy({
      mode: "auto",
      risk: "read",
      isSupported: true,
      hasAccess: false,
      hasCredits: true,
    }).decision,
    "failed_access_check"
  );

  assert.equal(
    decideHrAssistantPolicy({
      mode: "auto",
      risk: "ai_cost",
      isSupported: true,
      hasAccess: true,
      hasCredits: false,
    }).decision,
    "failed_credit_check"
  );
});
