import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import test from "node:test";

const profileAndVacancyServices = [
  "services/data/vacancies.ts",
  "services/data/profiles.ts",
  "components/dashboard/welcome-dialog.tsx",
] as const;

const existingMutationRoutes = [
  "app/api/candidates/route.ts",
  "app/api/jobs/route.ts",
  "app/api/jobs/bulk/route.ts",
  "app/api/vacancies/route.ts",
  "app/api/vacancies/[id]/route.ts",
  "app/api/vacancies/[id]/status/route.ts",
  "app/api/vacancies/[id]/sync-hh/route.ts",
];

const candidateMutationRoutes = [
  "app/api/candidates/[id]/comment/route.ts",
  "app/api/candidates/[id]/name/route.ts",
  "app/api/candidates/[id]/contacts/route.ts",
  "app/api/candidates/[id]/contacts/[contactId]/route.ts",
] as const;

function getHandlerSource(source: string, method: "GET" | "POST" | "PATCH" | "DELETE"): string {
  const handlerStart = source.search(new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\(`));
  assert.notEqual(handlerStart, -1, `route must export ${method}`);
  return source.slice(handlerStart);
}

test("dashboard welcome, profile, and vacancy BFF routes exist", () => {
  assert.equal(existsSync("app/api/onboarding/welcome/route.ts"), true);
  assert.equal(existsSync("app/api/profiles/route.ts"), true);
  assert.equal(existsSync("app/api/vacancies/list/route.ts"), true);
});

test("welcome route protects PATCH before reading body or session", () => {
  const source = readFileSync("app/api/onboarding/welcome/route.ts", "utf8");
  assert.match(source, /export\s+async\s+function\s+PATCH\s*\(\s*req:\s*NextRequest\s*\)/);
  assert.match(source, /const csrfRes = requireSameOriginRequest\(req\)/);

  const handlerSource = source.slice(source.search(/export\s+async\s+function\s+PATCH\s*\(/));
  const csrfIndex = handlerSource.indexOf("requireSameOriginRequest(req)");
  assert.notEqual(csrfIndex, -1);

  for (const marker of ["req.json(", "createSupabaseServerClient(", "getSupabaseAdminClient(", ".update("]) {
    const markerIndex = handlerSource.indexOf(marker);
    if (markerIndex !== -1) {
      assert.ok(csrfIndex < markerIndex, `welcome PATCH must check same-origin before ${marker}`);
    }
  }
});

test("profile and vacancy browser flows use typed Hiiire API routes instead of browser Supabase", () => {
  const combined = profileAndVacancyServices.map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(combined, /@\/lib\/supabase\/browser/);
  assert.doesNotMatch(combined, /createSupabaseBrowserClient/);
  assert.doesNotMatch(combined, /\.from\("/);

  assert.match(combined, /\/api\/vacancies\/list/);
  assert.match(combined, /\/api\/profiles/);
  assert.match(combined, /\/api\/onboarding\/welcome/);
});

test("profile data service chunks ids by the route limit and calls /api/profiles", () => {
  const source = readFileSync("services/data/profiles.ts", "utf8");
  assert.match(source, /PROFILE_IDS_CHUNK_SIZE\s*=\s*200/);
  assert.match(source, /slice\(start,\s*start\s*\+\s*PROFILE_IDS_CHUNK_SIZE\)/);
  assert.match(source, /fetch\(`\/api\/profiles\?\$\{params\.toString\(\)\}`,\s*\{\s*method:\s*"GET",\s*cache:\s*"no-store"\s*\}\)/);
  assert.doesNotMatch(source, /createSupabaseBrowserClient/);
});

test("vacancy data service reads vacancy lists through /api/vacancies/list", () => {
  const source = readFileSync("services/data/vacancies.ts", "utf8");
  assert.match(source, /\/api\/vacancies\/list/);
  assert.match(source, /all",\s*"true"/);
  assert.match(source, /status",\s*"all"/);
  assert.doesNotMatch(source, /@\/lib\/supabase\/browser/);
  assert.doesNotMatch(source, /createSupabaseBrowserClient/);
});

test("vacancy list route keeps totalAllStatuses independent from the filtered total", () => {
  const source = readFileSync("app/api/vacancies/list/route.ts", "utf8");
  assert.match(source, /totalAllStatuses/);
  assert.match(source, /loadPagedSupabaseRows/);
  assert.match(source, /runTotalAllStatusesCount/);
  assert.doesNotMatch(source, /let\s+totalAllStatuses\s*=\s*total/);
  assert.doesNotMatch(source, /totalAllStatuses:\s*total[,\s}]/);
});

test("job latest route uses company/requester scope and selects latest non-canceled job per candidate", () => {
  assert.equal(existsSync("app/api/jobs/latest/route.ts"), true);
  const source = readFileSync("app/api/jobs/latest/route.ts", "utf8");

  assert.match(source, /createSupabaseServerClient/);
  assert.match(source, /requireCompanyContext\(supabase\)/);
  assert.match(source, /getSupabaseAdminClient/);
  assert.match(source, /MAX_CANDIDATE_IDS\s*=\s*200/);
  assert.match(source, /TOO_MANY_IDS/);
  assert.match(source, /Запросите не больше 200 статусов за раз\./);
  assert.match(source, /\.from\("jobs_ai"\)[\s\S]*\.select\("candidate_id,status,updated_at,last_error,attempt,max_attempts"\)/);
  assert.match(source, /\.eq\("company_id",\s*ctx\.companyId\)/);
  assert.match(source, /\.in\("candidate_id",\s*candidateIds\)/);
  assert.match(source, /\.in\("status",\s*\[\s*"queued",\s*"processing",\s*"done",\s*"failed"\s*\]\)/);
  assert.doesNotMatch(source, /"canceled"/);
  assert.match(source, /ctx\.role\s*!==\s*"admin"[\s\S]*\.eq\("requested_by",\s*ctx\.userId\)/);
  assert.match(source, /\.order\("updated_at",\s*\{\s*ascending:\s*false\s*\}\)/);
  assert.match(source, /byCandidate\.has\(row\.candidate_id\)/);
  assert.doesNotMatch(source, /slice\(0,\s*200\)/);
});

test("job active route uses company/requester scope and returns queued or processing rows only", () => {
  assert.equal(existsSync("app/api/jobs/active/route.ts"), true);
  const source = readFileSync("app/api/jobs/active/route.ts", "utf8");

  assert.match(source, /createSupabaseServerClient/);
  assert.match(source, /requireCompanyContext\(supabase\)/);
  assert.match(source, /getSupabaseAdminClient/);
  assert.match(source, /MAX_CANDIDATE_IDS\s*=\s*200/);
  assert.match(source, /TOO_MANY_IDS/);
  assert.match(source, /\.from\("jobs_ai"\)[\s\S]*\.select\("candidate_id,status,updated_at"\)/);
  assert.match(source, /\.eq\("company_id",\s*ctx\.companyId\)/);
  assert.match(source, /\.in\("candidate_id",\s*candidateIds\)/);
  assert.match(source, /\.in\("status",\s*\[\s*"queued",\s*"processing"\s*\]\)/);
  assert.doesNotMatch(source, /"done"|"failed"|"canceled"/);
  assert.match(source, /ctx\.role\s*!==\s*"admin"[\s\S]*\.eq\("requested_by",\s*ctx\.userId\)/);
});

test("job data service chunks ids and reads active/latest statuses through BFF routes", () => {
  const source = readFileSync("services/data/jobs.ts", "utf8");

  assert.match(source, /readUserFacingApiErrorMessage/);
  assert.match(source, /JOB_IDS_CHUNK_SIZE\s*=\s*200/);
  assert.match(source, /slice\(start,\s*start\s*\+\s*JOB_IDS_CHUNK_SIZE\)/);
  assert.match(source, /\/api\/jobs\/active/);
  assert.match(source, /\/api\/jobs\/latest/);
  assert.match(source, /prev\s*===\s*"queued"/);
  assert.doesNotMatch(source, /createSupabaseBrowserClient|@\/lib\/supabase\/browser/);
});

test("candidate list route exists and uses admin reads behind company context", () => {
  assert.equal(existsSync("app/api/candidates/list/route.ts"), true);
  const source = readFileSync("app/api/candidates/list/route.ts", "utf8");

  assert.match(source, /createSupabaseServerClient/);
  assert.match(source, /requireCompanyContext\(supabase\)/);
  assert.match(source, /getSupabaseAdminClient/);
  assert.match(source, /\.from\("vacancies"\)[\s\S]*\.eq\("company_id",\s*ctx\.companyId\)/);
  assert.match(source, /vacancies!inner/);
  assert.match(source, /\.eq\("vacancies\.company_id",\s*ctx\.companyId\)/);
  assert.match(source, /ctx\.role\s*!==\s*"admin"[\s\S]*\.eq\("created_by",\s*ctx\.userId\)/);
  assert.doesNotMatch(source, /createSupabaseBrowserClient|@\/lib\/supabase\/browser/);
});

test("candidate list route preserves filters, event chunking, exact counts, and child lookup bounds", () => {
  const source = readFileSync("app/api/candidates/list/route.ts", "utf8");

  for (const param of [
    "page",
    "pageSize",
    "vacancyId",
    "scoreFilter",
    "source",
    "status",
    "eventStatus",
    "eventPeriodStart",
    "eventPeriodEnd",
    "aiScoreMin",
    "aiScoreMax",
    "sort",
    "nameQuery",
    "all",
  ]) {
    assert.match(source, new RegExp(`searchParams\\.get\\("${param}"\\)`), `candidate route must parse ${param}`);
  }

  assert.match(source, /INVALID_QUERY/);
  assert.match(source, /Проверьте параметры списка кандидатов\./);
  assert.match(source, /CANDIDATES_LOOKUP_FAILED/);
  assert.match(source, /Не удалось загрузить кандидатов\./);
  assert.match(source, /applyScoreFilterToQuery/);
  assert.match(source, /buildCandidateNameIlikePatterns/);
  assert.match(source, /\.eq\("source"/);
  assert.match(source, /\.eq\("status"/);
  assert.match(source, /\.gte\("match_percentage",\s*input\.aiScoreMin\)/);
  assert.match(source, /\.lte\("match_percentage",\s*input\.aiScoreMax\)/);
  assert.match(source, /\.order\("applied_at"/);
  assert.match(source, /\.order\("match_percentage"/);
  assert.match(source, /\.from\("pipeline_events"\)/);
  assert.match(source, /CHUNK_SIZE\s*=\s*200/);
  assert.match(source, /slice\(start,\s*start\s*\+\s*CHUNK_SIZE\)/);
  assert.match(source, /eventCandidateIds\.length\s*>\s*CHUNK_SIZE/);
  assert.match(source, /loadPagedSupabaseRows/);
  assert.match(source, /loadAllSupabaseRows/);
  assert.match(source, /count:\s*"exact"/);
  assert.match(source, /MAX_ALL_CANDIDATES/);
  assert.match(source, /\.from\("ai_analyses"\)[\s\S]*\.in\("candidate_id"/);
  assert.match(source, /\.from\("candidate_contacts"\)[\s\S]*\.in\("candidate_id"/);
  assert.match(source, /\.order\("created_at",\s*\{\s*ascending:\s*true\s*\}\)/);
});

test("candidate data service reads lists through /api/candidates/list and maps rows", () => {
  const source = readFileSync("services/data/candidates.ts", "utf8");
  const listPageSource = source.slice(source.search(/export\s+async\s+function\s+listCandidatesPage/), source.search(/export\s+async\s+function\s+getCandidateDetailsById/));
  const listAllSource = source.slice(source.search(/export\s+async\s+function\s+listCandidates\(/), source.search(/export\s+async\s+function\s+updateCandidateComment/));
  const mapperSource = source.slice(source.search(/function\s+mapCandidateListRows/), source.search(/export\s+async\s+function\s+listCandidatesPage/));

  assert.match(listPageSource, /\/api\/candidates\/list/);
  assert.match(listPageSource, /mapCandidateListRows/);
  assert.doesNotMatch(listPageSource, /createSupabaseBrowserClient|\.from\("/);

  assert.match(listAllSource, /\/api\/candidates\/list/);
  assert.match(listAllSource, /all",\s*"true"/);
  assert.match(listAllSource, /vacancyId",\s*"all"/);
  assert.match(listAllSource, /scoreFilter",\s*"all"/);
  assert.match(listAllSource, /sort",\s*"date_desc"/);
  assert.match(listAllSource, /mapCandidateListRows/);
  assert.doesNotMatch(listAllSource, /createSupabaseBrowserClient|\.from\("/);
  assert.match(mapperSource, /contactsByCandidateId/);
  assert.match(mapperSource, /mapCandidateRow/);
});

test("candidate mutation and contact BFF routes exist", () => {
  for (const file of candidateMutationRoutes) {
    assert.equal(existsSync(file), true, `${file} must exist`);
  }
});

test("candidate comment and name mutations use same-origin BFF routes", () => {
  const source = readFileSync("services/data/candidates.ts", "utf8");
  const commentSource = source.slice(source.search(/export\s+async\s+function\s+updateCandidateComment/), source.search(/export\s+async\s+function\s+updateCandidateName/));
  const nameSource = source.slice(source.search(/export\s+async\s+function\s+updateCandidateName/), source.search(/export\s+async\s+function\s+updateCandidateStatus/));

  assert.match(commentSource, /fetch\(`\/api\/candidates\/\$\{encodeURIComponent\(candidateId\)\}\/comment`/);
  assert.match(commentSource, /method:\s*"PATCH"/);
  assert.match(commentSource, /readUserFacingApiErrorMessage\(json,\s*"Не удалось сохранить комментарий\. Попробуйте ещё раз\."\)/);

  assert.match(nameSource, /fetch\(`\/api\/candidates\/\$\{encodeURIComponent\(candidateId\)\}\/name`/);
  assert.match(nameSource, /method:\s*"PATCH"/);
  assert.match(nameSource, /readUserFacingApiErrorMessage\(json,\s*"Не удалось переименовать кандидата\. Попробуйте ещё раз\."\)/);

  assert.doesNotMatch(commentSource + nameSource, /createSupabaseBrowserClient|@\/lib\/supabase\/browser|\.from\("/);
});

test("candidate contact service uses scoped BFF routes and validates responses", () => {
  const source = readFileSync("services/data/candidate-contacts.ts", "utf8");

  assert.match(source, /readUserFacingApiErrorMessage/);
  assert.match(source, /z\.object\(\{\s*contacts:\s*z\.array\(z\.any\(\)\)/);
  assert.match(source, /z\.object\(\{\s*contact:\s*z\.any\(\)/);
  assert.match(source, /fetch\(`\/api\/candidates\/\$\{encodeURIComponent\(candidateId\)\}\/contacts`/);
  assert.match(source, /fetch\(`\/api\/candidates\/\$\{encodeURIComponent\(input\.candidateId\)\}\/contacts`/);
  assert.match(source, /updateCandidateContact\(input:\s*\{[\s\S]*candidateId:\s*string/);
  assert.match(source, /fetch\(`\/api\/candidates\/\$\{encodeURIComponent\(input\.candidateId\)\}\/contacts\/\$\{encodeURIComponent\(input\.id\)\}`/);
  assert.match(source, /deleteCandidateContact\(candidateId:\s*string,\s*id:\s*string\)/);
  assert.match(source, /fetch\(`\/api\/candidates\/\$\{encodeURIComponent\(candidateId\)\}\/contacts\/\$\{encodeURIComponent\(id\)\}`/);
  assert.doesNotMatch(source, /createSupabaseBrowserClient|@\/lib\/supabase\/browser|\.from\("/);
});

test("candidate details passes candidate id through contact update and delete calls", () => {
  const source = readFileSync("components/dashboard/candidate-details.tsx", "utf8");
  const saveSource = source.slice(source.search(/async\s+function\s+saveContact\(/), source.search(/async\s+function\s+removeContact\(/));
  const removeSource = source.slice(source.search(/async\s+function\s+removeContact\(/), source.search(/\/\/ Главный вывод/));

  assert.match(saveSource, /updateCandidateContact\(\{\s*candidateId:\s*candidate\.id,/);
  assert.match(removeSource, /deleteCandidateContact\(candidate\.id,\s*id\)/);
});

test("candidate mutation BFF routes guard mutations before body reads or database writes", () => {
  const routeMethods: Array<[string, Array<"POST" | "PATCH" | "DELETE">]> = [
    ["app/api/candidates/[id]/comment/route.ts", ["PATCH"]],
    ["app/api/candidates/[id]/name/route.ts", ["PATCH"]],
    ["app/api/candidates/[id]/contacts/route.ts", ["POST"]],
    ["app/api/candidates/[id]/contacts/[contactId]/route.ts", ["PATCH", "DELETE"]],
  ];

  for (const [file, methods] of routeMethods) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /requireCompanyContext\(supabase\)/);
    assert.match(source, /requireCandidateAccess\(admin,\s*ctx,\s*candidateId\)/);

    for (const method of methods) {
      const handlerSource = getHandlerSource(source, method);
      const firstCsrf = handlerSource.indexOf("requireSameOriginRequest(req)");
      assert.notEqual(firstCsrf, -1, `${file} ${method} must call requireSameOriginRequest(req)`);

      for (const marker of ["req.json(", ".insert(", ".update(", ".delete("]) {
        const firstMarker = handlerSource.indexOf(marker);
        if (firstMarker !== -1) {
          assert.ok(firstCsrf < firstMarker, `${file} ${method} must check same-origin before ${marker}`);
        }
      }
    }
  }
});

test("candidate mutation BFF routes sanitize validation issue messages", () => {
  const files = [
    "app/api/candidates/[id]/comment/route.ts",
    "app/api/candidates/[id]/name/route.ts",
    "app/api/candidates/[id]/contacts/route.ts",
    "app/api/candidates/[id]/contacts/[contactId]/route.ts",
  ];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /zodErrorToUserFacingIssues/);
    assert.doesNotMatch(source, /message:\s*issue\.message/);
  }
});

test("candidate contacts routes are scoped by candidate and use safe messages", () => {
  const collectionSource = readFileSync("app/api/candidates/[id]/contacts/route.ts", "utf8");
  const itemSource = readFileSync("app/api/candidates/[id]/contacts/[contactId]/route.ts", "utf8");

  assert.match(collectionSource, /export\s+async\s+function\s+GET/);
  assert.match(collectionSource, /\.from\("candidate_contacts"\)[\s\S]*\.eq\("candidate_id",\s*candidateId\)[\s\S]*\.order\("created_at",\s*\{\s*ascending:\s*true\s*\}\)/);
  assert.match(collectionSource, /\{\s*contacts:\s*contacts\s*\?\?\s*\[\]\s*\}/);
  assert.match(collectionSource, /cache-control",\s*"no-store"/);
  assert.match(collectionSource, /type:\s*z[\s\S]*Укажите тип контакта\.[\s\S]*\.min\(1,\s*\{\s*message:\s*"Укажите тип контакта\."\s*\}\)[\s\S]*\.max\(40/);
  assert.match(collectionSource, /value:\s*z[\s\S]*Укажите значение контакта\.[\s\S]*\.min\(1,\s*\{\s*message:\s*"Укажите значение контакта\."\s*\}\)[\s\S]*\.max\(500/);

  assert.match(itemSource, /\.from\("candidate_contacts"\)[\s\S]*\.eq\("id",\s*contactId\)[\s\S]*\.maybeSingle\(\)/);
  assert.match(itemSource, /contact\.candidate_id\s*!==\s*candidateId/);
  assert.match(itemSource, /Контакт не найден\./);
  assert.match(itemSource, /\.update\(\{\s*type:\s*body\.type,\s*value:\s*body\.value,\s*label:\s*body\.label\s*\?\?\s*null/);
  assert.match(itemSource, /\.delete\(\)[\s\S]*\.eq\("id",\s*contactId\)/);
});

test("calendar candidate selector uses all candidate reference data", () => {
  const source = readFileSync("app/(dashboard)/dashboard/calendar/page.tsx", "utf8");
  assert.match(source, /import\s+\{\s*listCandidates\s*\}\s+from\s+"@\/services\/data\/candidates"/);
  assert.match(source, /listCandidates\(\)/);
  assert.doesNotMatch(source, /listCandidatesPage\(\{\s*page:\s*1,\s*pageSize:\s*200/);
  assert.doesNotMatch(source, /candidateData\.items/);
});

test("existing cookie-authenticated mutation routes require same-origin requests", () => {
  for (const file of existingMutationRoutes) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /requireSameOriginRequest/);

    const handlerStart = source.search(/export\s+async\s+function\s+(POST|PATCH)\s*\(/);
    assert.notEqual(handlerStart, -1, `${file} must export a POST or PATCH handler`);
    const handlerSource = source.slice(handlerStart);

    const firstCsrf = handlerSource.indexOf("requireSameOriginRequest(req)");
    assert.notEqual(firstCsrf, -1, `${file} must call requireSameOriginRequest(req) inside the mutation handler`);

    for (const marker of ["req.json(", "req.formData(", ".insert(", ".update(", ".delete(", ".rpc("]) {
      const firstMarker = handlerSource.indexOf(marker);
      if (firstMarker !== -1) {
        assert.ok(firstCsrf < firstMarker, `${file} must check same-origin before ${marker}`);
      }
    }
  }
});
