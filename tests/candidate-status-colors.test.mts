import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("components/dashboard/candidate-status-control.tsx", "utf8");
const statusColorsMatch = source.match(
  /const statusColors: Record<Candidate\["status"\], string> = \{([\s\S]*?)\n\};/,
);

assert.ok(statusColorsMatch, "CandidateStatusControl should define status color classes");

const statusColorsSource = statusColorsMatch[1];

function getStatusClasses(status: string): string {
  const escapedStatus = status.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:${escapedStatus}|["']${escapedStatus}["']):\\s*(?:"([^"]+)"|'([^']+)')`);
  const match = statusColorsSource.match(pattern);

  assert.ok(match, `Status ${status} should define explicit badge classes`);

  return match[1] ?? match[2] ?? "";
}

test("reviewing candidate status keeps documented yellow color in every browser theme", () => {
  const classes = getStatusClasses("reviewing");

  assert.match(classes, /\bbg-yellow-/);
  assert.match(classes, /\btext-yellow-/);
  assert.match(classes, /\bborder-yellow-/);
  assert.doesNotMatch(classes, /\bdark:/);
});

test("security check candidate status keeps documented amber color in every browser theme", () => {
  const classes = getStatusClasses("security-check");

  assert.match(classes, /\bbg-amber-/);
  assert.match(classes, /\btext-amber-/);
  assert.match(classes, /\bborder-amber-/);
  assert.doesNotMatch(classes, /\bdark:/);
});
