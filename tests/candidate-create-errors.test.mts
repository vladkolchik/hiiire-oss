import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { mapCreateCandidateError, mapCreateCandidateInvalidBodyError } from "../services/data/candidate-errors.ts";

const technicalLeakPattern = /Tika|parser|request[_ -]?id|stack|trace|env|config|service|RESUME_|PDF_|DOCX_|TXT_/i;

test("maps Tika extractor error codes to short Russian user-facing copy", () => {
  const expectedCodes = [
    "RESUME_FILE_UNSUPPORTED_TYPE",
    "RESUME_FILE_TOO_LARGE",
    "RESUME_FILE_EMPTY",
    "RESUME_FILE_PARSE_FAILED",
    "RESUME_FILE_TIMEOUT",
    "RESUME_EXTRACTION_TIKA_NOT_CONFIGURED",
    "RESUME_EXTRACTION_TIKA_AUTH_FAILED",
    "RESUME_EXTRACTION_TIKA_UNAVAILABLE",
    "RESUME_TEXT_TOO_LONG",
  ];

  for (const code of expectedCodes) {
    const message = mapCreateCandidateError(code, { maxChars: 50_000, maxWords: 8_000 });

    assert.notEqual(message, code);
    assert.doesNotMatch(message, technicalLeakPattern);
    assert.ok(/[А-Яа-яЁё]/.test(message), `${code} should be mapped to Russian copy`);
    assert.ok(message.length <= 180, `${code} message should stay concise`);
  }
});

test("keeps legacy parser error codes mapped to safe copy", () => {
  const legacyCodes = [
    "PDF_INVALID_HEADER",
    "PDF_ENCRYPTED",
    "PDF_TOO_MANY_PAGES",
    "PDF_EMPTY_TEXT",
    "PDF_INVALID",
    "PDF_PARSE_TIMEOUT",
    "PDF_PARSE_FAILED",
    "DOCX_INVALID_HEADER",
    "DOCX_INVALID",
    "DOCX_EMPTY_TEXT",
    "DOCX_PARSE_TIMEOUT",
    "DOCX_PARSE_FAILED",
    "TXT_EMPTY_TEXT",
    "TXT_INVALID_ENCODING",
    "TXT_PARSE_TIMEOUT",
    "TXT_PARSE_FAILED",
  ];

  for (const code of legacyCodes) {
    const message = mapCreateCandidateError(code, { maxPages: 5, maxChars: 50_000, maxWords: 8_000 });

    assert.notEqual(message, code);
    assert.doesNotMatch(message, technicalLeakPattern);
    assert.ok(/[А-Яа-яЁё]/.test(message), `${code} should be mapped to Russian copy`);
  }
});

test("maps internal and unknown create-candidate codes to safe fallback copy", () => {
  const fallbackCodes = ["INTERNAL_ERROR", "SOME_UNKNOWN_BACKEND_CODE"];

  for (const code of fallbackCodes) {
    const message = mapCreateCandidateError(code);

    assert.notEqual(message, code);
    assert.doesNotMatch(message, technicalLeakPattern);
    assert.doesNotMatch(message, /[A-Z]{2,}(?:_[A-Z0-9]+)+/);
    assert.ok(/[А-Яа-яЁё]/.test(message), `${code} should be mapped to Russian copy`);
    assert.ok(message.length <= 120, `${code} fallback should stay concise`);
  }
});

test("maps invalid create-candidate body details to safe copy without raw issue leaks", () => {
  const message = mapCreateCandidateInvalidBodyError([
    {
      path: ["resumeText"],
      message: "Too small: expected string to have >=20 characters",
    },
    {
      path: ["candidate", "source"],
      message: "SOME_UNKNOWN_BACKEND_CODE",
    },
  ]);

  assert.doesNotMatch(message, /resumeText|Too small|INVALID_BODY|SOME_UNKNOWN_BACKEND_CODE/);
  assert.doesNotMatch(message, /[A-Z]{2,}(?:_[A-Z0-9]+)+/);
  assert.ok(/[А-Яа-яЁё]/.test(message));
  assert.ok(message.length <= 160);
});

test("source-level contract: inactive subscription create response keeps created candidate without AI job", () => {
  const service = readFileSync("services/data/candidates.ts", "utf8");

  assert.match(service, /err\.data\.error === "SUBSCRIPTION_INACTIVE"/);
  assert.match(service, /typeof err\.data\.candidateId === "string"/);
  assert.match(service, /return \{ candidateId: err\.data\.candidateId, jobId: null \}/);
});
