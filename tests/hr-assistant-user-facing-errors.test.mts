import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getHrAssistantUserFacingErrorMessage } from "../lib/hr-assistant/user-facing-errors.ts";

test("assistant errors do not expose raw technical codes", () => {
  assert.equal(
    getHrAssistantUserFacingErrorMessage({ error: "INTERNAL_ERROR" }, "Не удалось выполнить действие."),
    "Не удалось выполнить действие."
  );
});

test("assistant errors can use safe payload message", () => {
  assert.equal(
    getHrAssistantUserFacingErrorMessage(
      { error: "ACTION_NOT_SUPPORTED", message: "HR-ассистент пока может подготовить только черновик." },
      "Не удалось выполнить действие."
    ),
    "HR-ассистент пока может подготовить только черновик."
  );
});

test("assistant errors hide access internals", () => {
  assert.equal(
    getHrAssistantUserFacingErrorMessage({ message: "FORBIDDEN_SCOPE_VACANCY" }, "Это действие недоступно."),
    "Это действие недоступно."
  );
});

test("HR assistant helper delegates to the shared user-facing parser with relative import", () => {
  const source = readFileSync("lib/hr-assistant/user-facing-errors.ts", "utf8");
  assert.match(source, /readUserFacingApiErrorMessage/);
  assert.match(source, /from\s+["']\.\.\/api\/user-facing-errors\.ts["']/);
  assert.doesNotMatch(source, /@\/lib\/api\/user-facing-errors/);
});
