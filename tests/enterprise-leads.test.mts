import assert from "node:assert/strict";
import test from "node:test";

import {
  decideEnterpriseLeadSubmission,
  getEnterpriseRequestStatusContent,
} from "../lib/leads/enterprise-request.ts";

test("reopens a rejected enterprise request for the same email", () => {
  const result = decideEnterpriseLeadSubmission({
    existingLead: {
      requested_plan: "enterprise",
      status: "rejected",
    },
  });

  assert.deepEqual(result, { action: "reopen" });
});
test("keeps active enterprise requests blocked from duplicate submission", () => {
  const result = decideEnterpriseLeadSubmission({
    existingLead: {
      requested_plan: "enterprise",
      status: "contacted",
    },
  });

  assert.equal(result.action, "conflict");
  assert.match(result.message, /заявк/i);
});

test("uses a friendly retry message when rejection reason is missing", () => {
  const status = getEnterpriseRequestStatusContent({
    status: "rejected",
    decision_note: null,
  });

  assert.ok(status);
  assert.equal(status.canResubmit, true);
  assert.equal(status.submitLabel, "Отправить заявку снова");
  assert.match(status.description, /отправить заявку снова/i);
});

test("shows the admin rejection reason when it exists", () => {
  const status = getEnterpriseRequestStatusContent({
    status: "rejected",
    decision_note: "Пока не хватает данных по вашей команде.",
  });

  assert.ok(status);
  assert.equal(status.canResubmit, true);
  assert.match(status.description, /Пока не хватает данных по вашей команде\./);
});
