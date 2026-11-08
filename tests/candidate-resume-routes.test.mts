import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const resumeUrlRoutePath = path.resolve(process.cwd(), "app/api/candidates/resume-url/route.ts");
const resumeDownloadRoutePath = path.resolve(process.cwd(), "app/api/candidates/resume-download/route.ts");
const candidateCreateRoutePath = path.resolve(process.cwd(), "app/api/candidates/route.ts");

test("resume-url route returns an app-local download URL", () => {
  const source = readFileSync(resumeUrlRoutePath, "utf8");

  assert.match(source, /downloadUrl:\s*getCandidateResumeDownloadUrl\(candidateId\)/);
});

test("resume-download route forces attachment downloads", () => {
  const source = readFileSync(resumeDownloadRoutePath, "utf8");

  assert.match(source, /Content-Disposition/);
  assert.match(source, /attachment;/);
});

test("candidate create route keeps user filenames out of Supabase Storage keys", () => {
  const source = readFileSync(candidateCreateRoutePath, "utf8");

  assert.doesNotMatch(source, /buildResumeStoragePath\(candidateId,\s*idempotencyKey,\s*safeName\)/);
  assert.doesNotMatch(source, /\$\{storageSafeKey\}-\$\{safeName\}/);
  assert.match(source, /resume_file_name:\s*resumeFile\.name/);
});

test("candidate create route delegates resume text extraction to the shared extractor", () => {
  const source = readFileSync(candidateCreateRoutePath, "utf8");

  assert.match(source, /from\s+"@\/lib\/resume\/extract-text"/);
  assert.match(source, /\bextractTextFromResumeFile\b/);
});

test("candidate create route keeps early resume file size guard imported from shared limits", () => {
  const source = readFileSync(candidateCreateRoutePath, "utf8");

  assert.match(source, /if\s*\(\s*maybeFile\.size\s*>\s*MAX_RESUME_FILE_SIZE_BYTES\s*\)/);
  assert.doesNotMatch(source, /const\s+MAX_RESUME_FILE_SIZE_BYTES\s*=/);
});

test("candidate create route no longer uses route-local PDF or DOCX parsers", () => {
  const source = readFileSync(candidateCreateRoutePath, "utf8");
  const obsoleteParserPattern = new RegExp([
    ["pdf", "parse"].join("-"),
    ["mam", "moth"].join(""),
    ["PDF", "Parse"].join(""),
    ["extract", "Raw", "Text"].join(""),
  ].join("|"));

  assert.doesNotMatch(source, obsoleteParserPattern);
});
