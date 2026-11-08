import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/(dashboard)/dashboard/candidates/page.tsx", "utf8");

test("candidate details close clears local state and URL in one path", () => {
  const closeStart = source.indexOf("function setDetailsOpenSafe(next: boolean)");
  const closeEnd = source.indexOf("function shouldIgnoreDetailsOpen", closeStart);
  assert.ok(closeStart >= 0 && closeEnd > closeStart, "Could not find setDetailsOpenSafe");

  const closeBlock = source.slice(closeStart, closeEnd);
  assert.match(closeBlock, /setDetailsOpen\(next\)/);
  assert.match(closeBlock, /setDetailsCandidateId\(null\)/);
  assert.match(closeBlock, /setLinkedDetailsCandidate\(null\)/);
  assert.match(closeBlock, /replaceQuery\(\{\s*candidate:\s*null\s*\}\)/);
});

test("URL-to-details sync does not reopen the drawer from local close state changes", () => {
  const effectStart = source.indexOf('const linkedCandidateId = searchParams.get("candidate")?.trim() || null;');
  const effectEnd = source.indexOf("// Count \"unscored\" candidates", effectStart);
  assert.ok(effectStart >= 0 && effectEnd > effectStart, "Could not find candidate URL sync effect");

  const effectBlock = source.slice(effectStart, effectEnd);
  assert.doesNotMatch(effectBlock, /\}, \[searchParams, candidates, linkedDetailsCandidate, detailsOpen, detailsCandidateId\]\)/);
  assert.match(effectBlock, /\}, \[searchParams, candidates\]\)/);
});
