import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("signup form has a visible return link back to pricing", () => {
  const source = readFileSync("app/(auth)/signup/page.tsx", "utf8");

  assert.match(source, /href="\/#pricing"/);
  assert.match(source, /Вернуться к тарифам/);
});
