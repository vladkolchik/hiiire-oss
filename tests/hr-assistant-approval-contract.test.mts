import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routePath = "app/api/hr-assistant/approvals/[id]/route.ts";

function readRoute() {
  return readFileSync(routePath, "utf8");
}

test("approval route requires company context, tool-run access, executor, and audit writes", () => {
  const source = readRoute();

  assert.match(source, /requireCompanyContext/);
  assert.match(source, /createSupabaseServerClient/);
  assert.match(source, /getSupabaseAdminClient/);
  assert.match(source, /requireAssistantToolRunAccess/);
  assert.match(source, /executeApprovedAssistantAction/);
  assert.match(source, /writeAssistantAuditEvent/);
  assert.match(source, /safeWriteAssistantAuditEvent/);
  assert.match(source, /try\s*\{[\s\S]*await writeAssistantAuditEvent[\s\S]*\}\s*catch\s*\{/);
  assert.equal(source.match(/await writeAssistantAuditEvent/g)?.length, 1);
});

test("approval route validates route params and request body with safe messages", () => {
  const source = readRoute();

  assert.match(source, /ParamsSchema/);
  assert.match(source, /\.uuid\(/);
  assert.match(source, /BodySchema/);
  assert.match(source, /z\.enum\(\["approved",\s*"rejected"\]/);
  assert.match(source, /await Promise\.resolve\(params\)/);
  assert.match(source, /safeParse/);
  assert.match(source, /INVALID_PARAMS/);
  assert.match(source, /INVALID_BODY/);
  assert.match(source, /message:\s*"[^"]*[А-Яа-яЁё][^"]*"/);
  assert.match(source, /code === "INVALID_BODY"\s*\?\s*ACTION_DECISION_MESSAGE/);
  assert.doesNotMatch(source, /Unrecognized key|unrecognized_keys/);
  assert.doesNotMatch(source, /Too big|Too small|expected string|invalid_type/);
});

test("approval route scopes approval updates by id, company, pending state, and allowed approved retry", () => {
  const source = readRoute();
  const toolRuns = readFileSync("lib/hr-assistant/tool-runs.ts", "utf8");
  const executor = readFileSync("lib/hr-assistant/actions/execute-approved.ts", "utf8");

  assert.match(source, /\.from\("assistant_tool_runs"\)/);
  assert.match(source, /\.update\(\{\s*approval_status:\s*parsed\.data\.decision,\s*approved_by:\s*ctx\.userId/s);
  assert.match(source, /\.eq\("id",\s*id\)/);
  assert.match(source, /\.eq\("company_id",\s*ctx\.companyId\)/);
  assert.match(source, /\.eq\("approval_status",\s*"pending"\)/);
  assert.match(source, /\.is\("executed_at",\s*null\)/);
  assert.match(source, /\.select\("id,approval_status"\)/);
  assert.match(source, /alreadyApprovedButRunnable/);
  assert.match(source, /isStaleExecution/);
  assert.match(source, /isExecutingApproval/);
  assert.match(source, /ACTION_IN_PROGRESS/);
  assert.match(source, /if\s*\(execution\.inProgress\)\s*\{[\s\S]*ACTION_IN_PROGRESS/);
  assert.match(source, /Действие уже выполняется\./);
  assert.match(source, /ALREADY_RESOLVED/);
  assert.match(toolRuns, /result_preview/);
  assert.match(toolRuns, /\.select\("id,thread_id,company_id,tool_name,input_preview,risk_level,policy_decision,approval_status,executed_at,result_preview"\)/);
  assert.match(executor, /if\s*\(!claimedRun\)\s*\{\s*return\s*\{\s*ok:\s*false as const,\s*inProgress:\s*true/s);
  assert.doesNotMatch(executor, /if\s*\(!claimedRun\)\s*\{\s*return\s*\{\s*ok:\s*true as const,\s*alreadyExecuted:\s*true/s);
});

test("approval route and executor recover stale executing leases", () => {
  const source = readRoute();
  const executor = readFileSync("lib/hr-assistant/actions/execute-approved.ts", "utf8");

  assert.match(source, /const EXECUTING_LEASE_MS = 5 \* 60 \* 1000/);
  assert.match(source, /function isStaleExecution/);
  assert.match(source, /resultPreview\?\.status === "executing" && !isStaleExecution\(toolRun\.executed_at\)/);
  assert.match(source, /!toolRun\.executed_at \|\| isStaleExecution\(toolRun\.executed_at\)/);
  assert.match(executor, /const EXECUTING_LEASE_MS = 5 \* 60 \* 1000/);
  assert.match(executor, /restoreStaleExecutingAssistantToolRun/);
  assert.match(executor, /\.lt\("executed_at", cutoffIso\)/);
  assert.match(executor, /staleExecutionRecovered/);
});

test("approval route blocks unsupported future external actions", () => {
  const source = readRoute();
  const toolRuns = readFileSync("lib/hr-assistant/tool-runs.ts", "utf8");

  assert.match(source, /not_supported_yet/);
  assert.match(source, /toolRun\.risk_level === "external"/);
  assert.match(toolRuns, /risk_level/);
  assert.match(source, /NOT_SUPPORTED/);
  assert.doesNotMatch(source, /sendEmail|publishHh|hhPublish/);
});

test("approval route records rejected and failed executions with restore details", () => {
  const source = readRoute();

  assert.match(source, /assistant_action_rejected/);
  assert.match(source, /await safeWriteAssistantAuditEvent/);
  assert.match(source, /return NextResponse\.json\(\{ approval \}/);
  assert.match(source, /executeApprovedAssistantAction\(admin,\s*ctx,\s*id\)/);
  assert.match(source, /if \(!execution\.ok\)/);
  assert.match(source, /const restorePending = execution\.restorePending !== false && !actionApplied/);
  assert.match(source, /restoreError/);
  assert.match(source, /error_message/);
  assert.match(source, /result_preview/);
  assert.match(source, /actionApplied:\s*execution\.actionApplied === true/);
  assert.match(source, /assistant_action_execution_failed/);
  assert.match(source, /RESTORE_FAILED/);
  assert.match(source, /EXECUTION_FAILED/);
  assert.doesNotMatch(source, /auditRecorded/);
});
