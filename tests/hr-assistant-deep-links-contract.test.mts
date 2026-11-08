import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const candidateReadTool = readFileSync("lib/hr-assistant/tools/candidate-read.ts", "utf8");
const vacancyReadTool = readFileSync("lib/hr-assistant/tools/vacancy-read.ts", "utf8");
const candidatesService = readFileSync("services/data/candidates.ts", "utf8");
const vacanciesService = readFileSync("services/data/vacancies.ts", "utf8");
const candidatesPage = readFileSync("app/(dashboard)/dashboard/candidates/page.tsx", "utf8");
const vacanciesPage = readFileSync("app/(dashboard)/dashboard/vacancies/page.tsx", "utf8");

test("assistant candidate and vacancy read tools return dashboard hrefs", () => {
  assert.match(candidateReadTool, /href:\s*buildCandidateCardHref\(row\.id\)/);
  assert.match(candidateReadTool, /href:\s*buildCandidateCardHref\(data\.id\)/);
  assert.match(candidateReadTool, /@\/lib\/dashboard\/deep-links/);

  assert.match(vacancyReadTool, /href:\s*buildVacancyCardHref\(row\.id\)/);
  assert.match(vacancyReadTool, /href:\s*buildVacancyCardHref\(data\.id\)/);
  assert.match(vacancyReadTool, /@\/lib\/dashboard\/deep-links/);
});

test("dashboard pages support direct candidate and vacancy detail links", () => {
  assert.match(candidatesService, /export async function getCandidateDetailsById/);
  assert.match(candidatesPage, /getCandidateDetailsById/);
  assert.match(candidatesPage, /searchParams\.get\("candidate"\)/);
  assert.match(candidatesPage, /replaceQuery\(\{\s*candidate:\s*null\s*\}\)/);
  assert.match(candidatesPage, /replaceQuery\(\{\s*candidate:\s*candidate\.id\s*\}\)/);

  assert.match(vacanciesService, /export async function getVacancyById/);
  assert.match(vacanciesPage, /getVacancyById/);
  assert.match(vacanciesPage, /searchParams\.get\("vacancy"\)/);
  assert.match(vacanciesPage, /replaceQuery\(\{\s*vacancy:\s*null\s*\}\)/);
  assert.match(vacanciesPage, /replaceQuery\(\{\s*vacancy:\s*vacancy\.id\s*\}\)/);
});
