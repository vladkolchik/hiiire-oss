import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("forgot password rate limit message keeps retry sentence and timer together", () => {
  const source = readFileSync("app/(auth)/forgot-password/page.tsx", "utf8");

  assert.match(source, /setError\("Слишком много попыток\."\)/);
  assert.match(source, /Попробуйте через\{" "\}/);
  assert.match(source, /className="whitespace-nowrap"/);
  assert.doesNotMatch(source, /Слишком много попыток\. Попробуйте через/);
});
