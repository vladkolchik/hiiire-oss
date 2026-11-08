import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateResumeFile } from "../lib/resume-file-validation.ts";

const dialogSource = () => readFileSync("components/dashboard/add-candidate-dialog.tsx", "utf8");

test("resume file validation accepts legacy DOC files", () => {
  assert.deepEqual(
    validateResumeFile(new File(["doc"], "resume.doc", { type: "application/msword" })),
    { valid: true },
  );
});

test("resume file validation unsupported-format copy lists DOC", () => {
  const result = validateResumeFile(new File(["png"], "resume.png", { type: "image/png" }));

  assert.equal(result.valid, false);
  assert.match(result.error ?? "", /PDF\/DOC\/DOCX\/TXT/);
});

test("add candidate dialog visible upload copy and accept list include DOC", () => {
  const source = dialogSource();

  assert.match(source, /PDF\/DOC\/DOCX\/TXT/);
  assert.match(source, /accept="[^"]*\.doc\b/);
  assert.match(source, /application\/msword/);
  assert.doesNotMatch(source, /PDF\s+—\s+до\s+5\s+страниц/);
});
