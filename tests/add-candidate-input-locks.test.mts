import assert from "node:assert/strict";
import test from "node:test";

import { getCandidateInputLocks } from "../lib/candidates/add-candidate-input-locks.ts";

test("candidate input locks disable text entry after resume files are selected", () => {
  const locks = getCandidateInputLocks({
    method: "pdf",
    selectedFilesCount: 1,
    textDescriptions: [{ value: "" }],
    isBusy: false,
  });

  assert.equal(locks.hasResumeFiles, true);
  assert.equal(locks.hasCandidateDescriptions, false);
  assert.equal(locks.isPdfTabDisabled, false);
  assert.equal(locks.isTextTabDisabled, true);
  assert.equal(locks.isPdfLockedByCandidateDescriptions, false);
  assert.equal(locks.isTextLockedByResumeFiles, true);
});

test("candidate input locks disable file upload after candidate descriptions are entered", () => {
  const locks = getCandidateInputLocks({
    method: "text",
    selectedFilesCount: 0,
    textDescriptions: [{ value: "Опытный frontend-разработчик с React и Next.js" }],
    isBusy: false,
  });

  assert.equal(locks.hasResumeFiles, false);
  assert.equal(locks.hasCandidateDescriptions, true);
  assert.equal(locks.isPdfTabDisabled, true);
  assert.equal(locks.isTextTabDisabled, false);
  assert.equal(locks.isPdfLockedByCandidateDescriptions, true);
  assert.equal(locks.isTextLockedByResumeFiles, false);
});

test("candidate input locks keep both methods available before candidate data is entered", () => {
  const locks = getCandidateInputLocks({
    method: "pdf",
    selectedFilesCount: 0,
    textDescriptions: [{ value: "   " }],
    isBusy: false,
  });

  assert.equal(locks.hasResumeFiles, false);
  assert.equal(locks.hasCandidateDescriptions, false);
  assert.equal(locks.isPdfTabDisabled, false);
  assert.equal(locks.isTextTabDisabled, false);
  assert.equal(locks.isPdfLockedByCandidateDescriptions, false);
  assert.equal(locks.isTextLockedByResumeFiles, false);
});

test("candidate input locks separate busy state from user input lock reasons", () => {
  const locks = getCandidateInputLocks({
    method: "pdf",
    selectedFilesCount: 0,
    textDescriptions: [{ value: "" }],
    isBusy: true,
  });

  assert.equal(locks.isPdfTabDisabled, true);
  assert.equal(locks.isTextTabDisabled, true);
  assert.equal(locks.isPdfLockedByCandidateDescriptions, false);
  assert.equal(locks.isTextLockedByResumeFiles, false);
});
