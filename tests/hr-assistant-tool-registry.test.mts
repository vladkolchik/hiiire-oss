import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("CRM write tools create pending approval runs instead of mutating directly", () => {
  const source = readFileSync("lib/hr-assistant/tools/crm-write.ts", "utf8");
  const persistence = readFileSync("lib/hr-assistant/persistence.ts", "utf8");

  assert.match(source, /createAssistantToolRun/);
  assert.match(source, /approvalStatus:\s*"pending"/);
  assert.match(source, /policyDecision:\s*"manual_approval_required"/);
  assert.match(source, /riskLevel:\s*"crm_write"/);
  assert.match(source, /requireCandidateAccess/);
  assert.match(source, /CANDIDATE_STATUS_VALUES/);
  assert.match(source, /formatCandidateStatusLabel/);
  assert.match(source, /statusLabel/);
  assert.match(source, /MAX_CANDIDATE_COMMENT_LENGTH/);
  assert.match(source, /\.trim\(\)/);
  assert.doesNotMatch(source, /\.from\("candidates"\)\.update/);
  assert.doesNotMatch(source, /enqueueAiAnalysisFromAssistant/);
  assert.match(persistence, /formatCandidateStatusLabel/);
  assert.match(persistence, /statusLabel/);
});

test("approved action executor verifies access and writes audit before finalizing", () => {
  const source = readFileSync("lib/hr-assistant/actions/execute-approved.ts", "utf8");

  assert.match(source, /requireAssistantToolRunAccess/);
  assert.match(source, /run\.approval_status !== "approved"/);
  assert.match(source, /run\.executed_at/);
  assert.match(source, /requireCandidateAccess/);
  assert.match(source, /CANDIDATE_STATUS_VALUES/);
  assert.match(source, /formatCandidateStatusLabel/);
  assert.match(source, /statusValues\.has\(input\.status\)/);
  assert.match(source, /MAX_CANDIDATE_COMMENT_LENGTH/);
  assert.match(source, /\.trim\(\)/);
  assert.match(source, /enqueueAiAnalysisFromAssistant/);
  assert.match(source, /\.from\("candidates"\)\s*[\s\S]+\.update/);
  assert.match(source, /\.eq\("id", candidateId\)/);
  assert.match(source, /\.eq\("vacancy_id", access\.data\.candidate\.vacancyId\)/);
  assert.match(source, /ctx\.role !== "admin"[\s\S]+\.eq\("created_by", ctx\.userId\)/);
  assert.match(source, /assistant_audit_events/);
  assert.match(source, /writeAssistantAuditEvent/);
  assert.match(source, /safeWriteAssistantAuditEvent/);
  assert.match(source, /try\s*\{[\s\S]*await writeAssistantAuditEvent[\s\S]*\}\s*catch\s*\{/);
  assert.equal(source.match(/await writeAssistantAuditEvent/g)?.length, 1);
  assert.match(source, /auditRecorded/);
  assert.match(source, /statusLabel/);
  assert.match(source, /finalizeError/);
  assert.match(source, /actionApplied/);
  assert.match(source, /restorePending/);
  assert.match(source, /inProgress/);
  assert.match(source, /if\s*\(!claimedRun\)\s*\{\s*return\s*\{\s*ok:\s*false as const,\s*inProgress:\s*true/s);
  assert.match(source, /executed_at/);
});

test("approved action executor only supports explicit approval-gated tool names", () => {
  const source = readFileSync("lib/hr-assistant/actions/execute-approved.ts", "utf8");

  assert.match(source, /propose_candidate_status_change/);
  assert.match(source, /propose_candidate_note_update/);
  assert.match(source, /start_candidate_ai_analysis/);
  assert.match(source, /Это действие пока недоступно\./);
});

test("tool registry includes approval-gated CRM write proposal tools", () => {
  const source = readFileSync("lib/hr-assistant/tools.ts", "utf8");

  assert.match(source, /propose_candidate_status_change/);
  assert.match(source, /propose_candidate_note_update/);
  assert.match(source, /proposeCandidateStatusChange/);
  assert.match(source, /proposeCandidateNoteUpdate/);
  assert.match(source, /inputSchema/);
  assert.doesNotMatch(source, /parameters:/);
});
