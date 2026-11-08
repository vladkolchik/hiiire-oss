import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("lib/hr-assistant/model.ts", "utf8");
const chatRouteSource = readFileSync("app/api/hr-assistant/chat/route.ts", "utf8");

test("HR assistant model module is server-only", () => {
  assert.match(source, /^import "server-only";/);
});

test("HR assistant uses current DeepSeek V4 model ids", () => {
  assert.match(source, /deepseek-v4-flash/);
  assert.match(source, /deepseek-v4-pro/);
  assert.doesNotMatch(source, /deepseek-chat/);
  assert.doesNotMatch(source, /deepseek-reasoner/);
});

test("HR assistant reads model ids from environment with safe defaults", () => {
  assert.match(source, /HR_ASSISTANT_DEEPSEEK_MODEL/);
  assert.match(source, /HR_ASSISTANT_DEEPSEEK_PRO_MODEL/);
});

test("HR assistant chat route always uses the complex model variant", () => {
  assert.match(chatRouteSource, /getHrAssistantModelId\("complex"\)/);
  assert.match(chatRouteSource, /getHrAssistantModel\("complex"\)/);
  assert.doesNotMatch(chatRouteSource, /getHrAssistantModelId\("default"\)/);
  assert.doesNotMatch(chatRouteSource, /getHrAssistantModel\("default"\)/);
});
