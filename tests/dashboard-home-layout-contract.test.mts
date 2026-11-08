import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/(dashboard)/dashboard/page.tsx", "utf8");

function getBlock(startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `Could not find block start: ${startNeedle}`);

  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `Could not find block end: ${endNeedle}`);

  return source.slice(start, end);
}

function assertHasClass(block: string, className: string, message?: string) {
  assert.match(block, new RegExp(`\\b${className}\\b`), message ?? `Expected class "${className}"`);
}

test("dashboard stat cards keep equal rows and guard narrow desktop overflow", () => {
  const statsGrid = getBlock("{/* Stats Grid */}", "{loadError ?");

  assertHasClass(statsGrid, "auto-rows-fr", "Stats grid rows must keep cards aligned when one title wraps");
  assert.ok(
    statsGrid.includes("grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]"),
    "Stats grid must respond to available content width, not only viewport breakpoints"
  );
  assert.match(statsGrid, /<Link[^>]+className="[^"]*\bh-full\b[^"]*\bmin-w-0\b/);
  assert.match(statsGrid, /<Card[^>]+className="[^"]*\bh-full\b[^"]*\bmin-w-0\b/);
  assert.match(statsGrid, /<CardHeader[^>]+className="[^"]*\bmin-w-0\b/);
  assert.match(statsGrid, /<CardTitle[^>]+className="[^"]*\bmin-w-0\b[^"]*\bbreak-words\b/);
  assert.match(statsGrid, /<Icon[^>]+className="[^"]*\bshrink-0\b/);
});
