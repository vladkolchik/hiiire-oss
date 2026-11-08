import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

type CandidateNameSearchModule = {
  buildCandidateNameIlikePattern: (input: string | null | undefined) => string;
  buildCandidateNameIlikePatterns: (input: string | null | undefined) => string[];
  normalizeCandidateNameSearch: (input: string | null | undefined) => string;
};

async function loadCandidateNameSearchModule(): Promise<CandidateNameSearchModule> {
  const mod = await import("../lib/candidates/name-search.ts").catch(() => null);
  assert.ok(mod, "candidate name search helpers must exist");
  return mod as CandidateNameSearchModule;
}

test("candidate name search normalizes whitespace and caps user input length", async () => {
  const { normalizeCandidateNameSearch } = await loadCandidateNameSearchModule();

  assert.equal(normalizeCandidateNameSearch("  Иван\u00A0\u00A0Петров  "), "Иван Петров");
  assert.equal(normalizeCandidateNameSearch("   "), "");
  assert.equal(normalizeCandidateNameSearch("А".repeat(130)), "А".repeat(120));
});

test("candidate name search builds a literal ilike pattern", async () => {
  const { buildCandidateNameIlikePattern } = await loadCandidateNameSearchModule();

  assert.equal(buildCandidateNameIlikePattern("Иван"), "%Иван%");
  assert.equal(buildCandidateNameIlikePattern("50%_\\ Иванов"), "%50\\%\\_\\\\ Иванов%");
  assert.equal(buildCandidateNameIlikePattern("   "), "");
});

test("candidate name search builds token patterns so surname and first name can be swapped", async () => {
  const { buildCandidateNameIlikePatterns } = await loadCandidateNameSearchModule();

  assert.deepEqual(buildCandidateNameIlikePatterns("Иван Петров"), ["%Иван%", "%Петров%"]);
  assert.deepEqual(buildCandidateNameIlikePatterns("  Петров\u00A0Иван  "), ["%Петров%", "%Иван%"]);
  assert.deepEqual(buildCandidateNameIlikePatterns("Иван Иван"), ["%Иван%"]);
  assert.deepEqual(buildCandidateNameIlikePatterns("50%_\\ Иванов"), ["%50\\%\\_\\\\%", "%Иванов%"]);
  assert.deepEqual(buildCandidateNameIlikePatterns("   "), []);
});

test("candidates page wires full-name search through URL state, data loading, and reset", () => {
  const pageSource = readFileSync("app/(dashboard)/dashboard/candidates/page.tsx", "utf8");
  const filtersSource = readFileSync("components/dashboard/candidates-filters-bar.tsx", "utf8");
  const dataSource = readFileSync("services/data/candidates.ts", "utf8");
  const bulkRouteSource = readFileSync("app/api/jobs/bulk/route.ts", "utf8");

  assert.match(pageSource, /const \[nameQuery, setNameQuery\] = useState<string>\(""\)/);
  assert.match(pageSource, /searchParams\.get\("q"\)/);
  assert.match(pageSource, /nameQuery: qNameQuery/);
  assert.match(pageSource, /listCandidatesPage\(\{[\s\S]*nameQuery: qNameQuery,[\s\S]*sort: qSort,[\s\S]*analyticsCandidateFilters/);
  assert.match(
    pageSource,
    /\}, \[candidates, detailsCandidateId, activeJobsCount, pendingFinalizeCount, page, pageSize, filterVacancy, filterScore, filterStatus, nameQuery, sort, analyticsCandidateFilters\]\)/
  );
  assert.match(pageSource, /function applyNameSearch\(nextNameQuery: string\)/);
  assert.match(pageSource, /replaceQuery\(\{ q: effectiveNameQuery \? safeNameQuery : null, page: "1" \}\)/);
  assert.match(
    pageSource,
    /filterVacancy !== "all"\) \+\s*Number\(filterScore !== "all"\) \+\s*Number\(filterStatus !== "all"\) \+\s*Number\(sort !== "date_desc"\) \+\s*Number\(normalizedNameQuery !== ""\)/
  );
  assert.match(pageSource, /onNameQueryChange=\{applyNameSearch\}/);
  assert.match(pageSource, /nameQuery=\{nameQuery\}/);
  assert.match(pageSource, /nameQuery,/);

  assert.match(filtersSource, /Search/);
  assert.match(filtersSource, /nameQuery: string/);
  assert.match(filtersSource, /Поиск по ФИО/);
  assert.match(filtersSource, /maxLength=\{120\}/);

  assert.match(dataSource, /nameQuery\?: string/);
  assert.match(dataSource, /buildCandidateNameIlikePatterns/);
  assert.match(dataSource, /for \(const namePattern of namePatterns\)/);
  assert.match(dataSource, /\.ilike\("name", namePattern\)/);
  assert.match(dataSource, /code === "CANDIDATES_LOOKUP_FAILED"/);
  assert.match(dataSource, /Не удалось получить список кандидатов/);

  assert.match(bulkRouteSource, /nameQuery: z\.string\(\)\.max\(120\)\.optional\(\)/);
  assert.match(bulkRouteSource, /const namePatterns = buildCandidateNameIlikePatterns\(filter\.nameQuery\)/);
  assert.match(bulkRouteSource, /for \(const namePattern of namePatterns\)/);
  assert.match(bulkRouteSource, /query = query\.ilike\("name", namePattern\)/);
});

test("candidates page wires candidate status filter through URL state, data loading, reset, and bulk scope", () => {
  const pageSource = readFileSync("app/(dashboard)/dashboard/candidates/page.tsx", "utf8");
  const filtersSource = readFileSync("components/dashboard/candidates-filters-bar.tsx", "utf8");
  const bulkRouteSource = readFileSync("app/api/jobs/bulk/route.ts", "utf8");

  assert.match(pageSource, /type CandidatesStatusFilter = Candidate\["status"\] \| "all"/);
  assert.match(pageSource, /const \[filterStatus, setFilterStatus\] = useState<CandidatesStatusFilter>\("all"\)/);
  assert.match(pageSource, /searchParams\.get\("candidateStatus"\)/);
  assert.match(pageSource, /status: qStatus === "all" \? analyticsCandidateFilters\.status : qStatus/);
  assert.match(pageSource, /candidateStatus: safeStatus === "all" \? null : safeStatus/);
  assert.match(pageSource, /candidateStatus: null/);
  assert.match(pageSource, /statusFilter: filterStatus/);
  assert.match(pageSource, /onStatusChange=\{applyStatusFilter\}/);
  assert.match(pageSource, /filterStatus !== "all"/);

  assert.match(filtersSource, /filterStatus: CandidatesStatusFilter/);
  assert.match(filtersSource, /statusOptions/);
  assert.match(filtersSource, /Фильтр по статусу кандидата/);
  assert.match(filtersSource, /onStatusChange\(next\)/);

  assert.match(bulkRouteSource, /statusFilter:\s*z\.enum\(\["all",\s*"new",\s*"reviewing",\s*"security-check",\s*"interview-scheduled",\s*"interviewed",\s*"offer",\s*"hired",\s*"rejected"\]\)\.optional\(\)/);
  assert.match(bulkRouteSource, /if \(filter\.statusFilter && filter\.statusFilter !== "all"\) query = query\.eq\("status", filter\.statusFilter\)/);
});
