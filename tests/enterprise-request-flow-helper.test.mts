import assert from "node:assert/strict";
import test from "node:test";

import {
  CLIENT_RESPONSE_PLACEHOLDER,
  currentStageKey,
  decisionPrimaryAction,
  decisionSecondaryDescription,
  flowStages,
  type PlanChangeRequestFlowRow,
} from "../app/(admin)/admin/billing/plan-change-request-flow.ts";

function row(overrides: Partial<PlanChangeRequestFlowRow>): PlanChangeRequestFlowRow {
  return {
    status: "submitted",
    request_kind: "upgrade_to_enterprise",
    target_plan: "enterprise",
    ...overrides,
  };
}

test("submitted Enterprise request is current work stage", () => {
  const request = row({ status: "submitted" });

  assert.equal(currentStageKey(request, false), "work");
  assert.deepEqual(
    flowStages(request, false).map((stage) => [stage.key, stage.state]),
    [
      ["work", "current"],
      ["decision", "future"],
      ["terms", "future"],
      ["connection", "future"],
    ],
  );
});

test("approved Enterprise upgrade moves to terms until terms exist", () => {
  const request = row({ status: "approved" });
  assert.equal(currentStageKey(request, false), "terms");
  assert.equal(currentStageKey(request, true), "connection");
});

test("Enterprise terms change uses update copy after replacement terms exist", () => {
  const request = row({ status: "approved", request_kind: "enterprise_terms_change" });
  assert.equal(currentStageKey(request, false), "terms");
  assert.equal(currentStageKey(request, true), "terms_update");
  assert.equal(flowStages(request, true).at(-1)?.label, "Обновление условий");
});

test("Enterprise exit does not expose terms stage", () => {
  const request = row({ status: "approved", request_kind: "enterprise_exit", target_plan: "professional" });
  assert.equal(currentStageKey(request, false), "exit");
  assert.deepEqual(flowStages(request, false).map((stage) => stage.key), ["work", "decision", "exit"]);
});

test("manual plan change does not expose Enterprise terms or exit stages", () => {
  const request = row({ status: "approved", request_kind: "manual_plan_change", target_plan: "professional" });
  const stages = flowStages(request, false);

  assert.equal(currentStageKey(request, false), "manual");
  assert.deepEqual(stages.map((stage) => stage.key), ["work", "decision", "manual"]);
  assert.doesNotMatch(stages.map((stage) => stage.description).join(" "), /условия Enterprise/i);
});

test("decision copy is request-kind aware", () => {
  const upgrade = row({ status: "in_review", request_kind: "upgrade_to_enterprise" });
  const exit = row({ status: "in_review", request_kind: "enterprise_exit", target_plan: "professional" });
  const manual = row({ status: "in_review", request_kind: "manual_plan_change", target_plan: "professional" });

  assert.equal(decisionPrimaryAction(upgrade).label, "Одобрить и перейти к условиям");
  assert.equal(decisionPrimaryAction(exit).label, "Одобрить выход из Enterprise");
  assert.equal(decisionPrimaryAction(manual).label, "Одобрить изменение тарифа");
  assert.match(String(decisionSecondaryDescription(upgrade)), /условия Enterprise/i);
  assert.doesNotMatch(String(decisionSecondaryDescription(exit)), /условия Enterprise/i);
  assert.doesNotMatch(String(decisionSecondaryDescription(manual)), /условия Enterprise/i);
});

test("client response placeholders are request-kind aware", () => {
  assert.match(CLIENT_RESPONSE_PLACEHOLDER.upgrade_to_enterprise, /условия Enterprise/i);
  assert.match(CLIENT_RESPONSE_PLACEHOLDER.enterprise_terms_change, /новые условия Enterprise/i);
  assert.doesNotMatch(CLIENT_RESPONSE_PLACEHOLDER.enterprise_exit, /условия Enterprise/i);
  assert.doesNotMatch(CLIENT_RESPONSE_PLACEHOLDER.manual_plan_change, /условия Enterprise/i);
});

test("rejected and canceled requests do not mark future Enterprise stages as done", () => {
  for (const status of ["rejected", "canceled"] as const) {
    const states = new Map(flowStages(row({ status }), false).map((stage) => [stage.key, stage.state]));
    assert.notEqual(states.get("terms"), "done");
    assert.notEqual(states.get("connection"), "done");
  }
});

test("terminal requests are finished", () => {
  for (const status of ["applied", "rejected", "canceled"] as const) {
    assert.equal(currentStageKey(row({ status }), false), "finished");
  }
});
