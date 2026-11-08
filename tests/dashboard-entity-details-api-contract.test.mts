import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const candidateRoutePath = "app/api/candidates/[id]/route.ts";
const vacancyRoutePath = "app/api/vacancies/[id]/route.ts";

test("candidate and vacancy detail API routes use server-side access guards", () => {
  assert.equal(existsSync(candidateRoutePath), true, "candidate detail route should exist");
  assert.equal(existsSync(vacancyRoutePath), true, "vacancy detail route should exist");

  const candidateRoute = readFileSync(candidateRoutePath, "utf8");
  const vacancyRoute = readFileSync(vacancyRoutePath, "utf8");

  assert.match(candidateRoute, /export async function GET/);
  assert.match(candidateRoute, /requireCompanyContext\(supabase\)/);
  assert.match(candidateRoute, /requireCandidateAccess\(admin,\s*ctx,\s*candidateId\)/);
  assert.match(candidateRoute, /\.from\("jobs_ai"\)/);
  assert.match(candidateRoute, /\.eq\("requested_by",\s*ctx\.userId\)/);
  assert.match(candidateRoute, /latestJob/);

  assert.match(vacancyRoute, /export async function GET/);
  assert.match(vacancyRoute, /requireCompanyContext\(supabase\)/);
  assert.match(vacancyRoute, /requireVacancyAccess\(admin,\s*ctx,\s*vacancyId\)/);
  assert.match(vacancyRoute, /return NextResponse\.json\(\{\s*vacancy:/);
});

test("dashboard deep links load details through API routes, not browser table reads", () => {
  const candidatesService = readFileSync("services/data/candidates.ts", "utf8");
  const vacanciesService = readFileSync("services/data/vacancies.ts", "utf8");
  const candidatesPage = readFileSync("app/(dashboard)/dashboard/candidates/page.tsx", "utf8");
  const vacanciesPage = readFileSync("app/(dashboard)/dashboard/vacancies/page.tsx", "utf8");

  assert.match(candidatesService, /export async function getCandidateDetailsById/);
  assert.match(candidatesService, /fetch\(`\/api\/candidates\/\$\{encodeURIComponent\(id\)\}`/);
  assert.match(candidatesService, /latestJob/);
  assert.match(candidatesPage, /getCandidateDetailsById\(linkedCandidateId\)/);
  assert.match(candidatesPage, /linkedCandidateDoneNeedsRefresh/);
  assert.match(candidatesPage, /getCandidateDetailsById\(detailsCandidateId\)/);
  assert.match(candidatesPage, /setLinkedCandidateJob\(linkedCandidateId,\s*latestJob\)/);
  assert.match(candidatesPage, /replaceQuery\(\{\s*candidate:\s*candidate\.id\s*\}\)/);
  assert.match(candidatesPage, /setDetailsOpen\(false\);[\s\S]+setDetailsCandidateId\(null\);[\s\S]+setLinkedDetailsCandidate\(null\);/);

  assert.match(vacanciesService, /export async function getVacancyById/);
  assert.match(vacanciesService, /fetch\(`\/api\/vacancies\/\$\{encodeURIComponent\(id\)\}`/);
  assert.match(vacanciesPage, /getVacancyById\(linkedVacancyId\)/);
  assert.match(vacanciesPage, /replaceQuery\(\{\s*vacancy:\s*vacancy\.id\s*\}\)/);
  assert.match(vacanciesPage, /setDetailsOpen\(false\);[\s\S]+setDetailsVacancyId\(null\);[\s\S]+setLinkedDetailsVacancy\(null\);/);
});
