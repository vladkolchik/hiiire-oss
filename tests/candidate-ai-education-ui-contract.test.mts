import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("components/dashboard/candidate-details.tsx", "utf8");

test("candidate AI category UI can show education as excluded from match", () => {
  assert.match(source, /includedInMatch/);
  assert.match(source, /Не учитывалось/);
  assert.match(source, /Не учитывалось в итоговой оценке/);
});

test("candidate AI category UI treats missing metadata as legacy included score", () => {
  assert.match(source, /hasEducationMatchMetadata/);
  assert.match(source, /return false/);
});

test("candidate AI category UI uses the same education inclusion invariant as match score", () => {
  assert.match(source, /criterionState === "required"/);
  assert.match(source, /includedInMatch === true/);
  assert.match(source, /criterionEvidence/);
  assert.match(source, /trim\(\)\.length > 0/);
});

test("candidate AI category UI does not show active score or progress for excluded education", () => {
  assert.match(source, /!excludedFromMatch \? <span[\s\S]*\{score\}%/);
  assert.match(source, /!excludedFromMatch \? <Progress value=\{score\}/);
});

test("candidate AI category UI keeps excluded badge stable and wraps long AI text", () => {
  assert.match(source, /Badge[\s\S]*shrink-0/);
  assert.match(source, /min-w-0|break-words/);
  assert.match(source, /feedback[\s\S]*(break-words|min-w-0)|details[\s\S]*(break-words|min-w-0)/);
});

test("candidate list tooltip explains education weight exclusion", () => {
  const candidatesPage = readFileSync("app/(dashboard)/dashboard/candidates/page.tsx", "utf8");

  assert.match(candidatesPage, /если категория .?Образование.? помечена как не учитываемая/i);
  assert.match(candidatesPage, /остальные веса нормализуются/i);
});
