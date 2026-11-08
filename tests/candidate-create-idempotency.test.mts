import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCandidateCreateIdempotencyKey,
  buildCandidateCreateRequestHash,
} from "../lib/idempotency/candidate-create.ts";

test("candidate create idempotency key stays stable for the same draft task", () => {
  const input = {
    draftKey: "draft-1",
    vacancyId: "vacancy-1",
    source: "manual" as const,
    saveResumeFile: true,
    skipAiAnalysis: false,
    task: {
      kind: "file" as const,
      name: "resume.pdf",
      size: 1024,
      lastModified: 12345,
      index: 0,
    },
  };

  const a = buildCandidateCreateIdempotencyKey(input);
  const b = buildCandidateCreateIdempotencyKey(input);

  assert.equal(a, b);
});

test("candidate create idempotency key changes between dialog drafts", () => {
  const first = buildCandidateCreateIdempotencyKey({
    draftKey: "draft-1",
    vacancyId: "vacancy-1",
    source: "manual",
    saveResumeFile: false,
    skipAiAnalysis: false,
    task: {
      kind: "text",
      text: "Senior frontend engineer with React and TypeScript",
      index: 0,
    },
  });

  const second = buildCandidateCreateIdempotencyKey({
    draftKey: "draft-2",
    vacancyId: "vacancy-1",
    source: "manual",
    saveResumeFile: false,
    skipAiAnalysis: false,
    task: {
      kind: "text",
      text: "Senior frontend engineer with React and TypeScript",
      index: 0,
    },
  });

  assert.notEqual(first, second);
});

test("candidate create request hash changes when meaningful payload changes", () => {
  const base = buildCandidateCreateRequestHash({
    vacancyId: "vacancy-1",
    source: "manual",
    saveResumeFile: false,
    mode: "enqueue",
    resumeText: "Senior frontend engineer with React and TypeScript",
  });

  const changedText = buildCandidateCreateRequestHash({
    vacancyId: "vacancy-1",
    source: "manual",
    saveResumeFile: false,
    mode: "enqueue",
    resumeText: "Senior backend engineer with Go and PostgreSQL",
  });

  const changedMode = buildCandidateCreateRequestHash({
    vacancyId: "vacancy-1",
    source: "manual",
    saveResumeFile: false,
    mode: "skip_ai_analysis",
    resumeText: "Senior frontend engineer with React and TypeScript",
  });

  assert.notEqual(base, changedText);
  assert.notEqual(base, changedMode);
});
