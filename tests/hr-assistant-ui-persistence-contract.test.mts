import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("message history route returns display-ready parts with action cards", () => {
  const persistence = readFileSync("lib/hr-assistant/persistence.ts", "utf8");
  const messagesRoute = readFileSync("app/api/hr-assistant/threads/[id]/messages/route.ts", "utf8");

  assert.match(persistence, /listAssistantDisplayMessages/);
  assert.match(persistence, /assistant_tool_runs/);
  assert.match(persistence, /type:\s*"action"/);
  assert.match(persistence, /approvalStatus/);
  assert.match(persistence, /executionStatus/);
  assert.match(messagesRoute, /listAssistantDisplayMessages/);
  assert.doesNotMatch(messagesRoute, /listAssistantMessages\(admin, ctxRes\.data, id\)/);
});

test("persisted action cards attach to the assistant message that created the tool run", () => {
  const route = readFileSync("app/api/hr-assistant/chat/route.ts", "utf8");
  const toolRuns = readFileSync("lib/hr-assistant/tool-runs.ts", "utf8");
  const persistence = readFileSync("lib/hr-assistant/persistence.ts", "utf8");

  assert.match(route, /createHrAssistantTools\(\{ admin, ctx, threadId: thread\.id, assistantRequestId: requestId, calendarTimeContext \}\)/);
  assert.match(route, /attachAssistantToolRunsToMessage/);
  assert.match(toolRuns, /input_preview->>.*ASSISTANT_REQUEST_ID_INPUT_KEY/);
  assert.match(toolRuns, /\.is\("message_id",\s*null\)/);
  assert.match(persistence, /if \(!run\.message_id\) continue/);
  assert.doesNotMatch(persistence, /firstAssistantMessageId/);
});

test("client hydrates persisted message parts instead of plain text only", () => {
  const client = readFileSync("components/dashboard/hr-assistant/hr-assistant-client.tsx", "utf8");

  assert.match(client, /parts:\s*readMessageParts\(row\.parts/);
  assert.doesNotMatch(client, /parts:\s*\[\{ type:\s*"text", text:\s*row\.content \}\]/);
});

test("thread renders persisted action parts through product action card component", () => {
  const thread = readFileSync("components/assistant-ui/thread.tsx", "utf8");

  assert.match(thread, /readPersistedActionPart/);
  assert.match(thread, /PersistedActionCards/);
  assert.doesNotMatch(thread, /useMessage\(\(state\) => state\.content\)[\s\S]+readToolCallPart/);
});
