import assert from "node:assert/strict";
import test from "node:test";

import {
  canOpenCandidateResume,
  getCandidateResumeDownloadUrl,
  getHhResumeUrl,
  getResumeDisabledTooltip,
} from "../lib/candidates/resume-links.ts";

test("manual candidate with saved resume keeps resume button enabled", () => {
  assert.equal(
    canOpenCandidateResume({
      source: "manual",
      resumeUrl: "resumes/candidate-1/resume.txt",
    }),
    true,
  );
});

test("hh candidate with HH resume id stays openable via external link", () => {
  assert.equal(
    canOpenCandidateResume({
      source: "hh.ru",
      hhruResumeId: "abc123",
    }),
    true,
  );
  assert.equal(getHhResumeUrl("abc123"), "https://hh.ru/resume/abc123");
});

test("disabled tooltip explains unavailable resume state", () => {
  assert.equal(getResumeDisabledTooltip({ source: "manual" }), "Файл резюме недоступен");
  assert.equal(getResumeDisabledTooltip({ source: "hh.ru" }), "Резюме HH недоступно");
});

test("download route is built from candidate id", () => {
  assert.equal(
    getCandidateResumeDownloadUrl("candidate 42"),
    "/api/candidates/resume-download?candidateId=candidate%2042",
  );
});
