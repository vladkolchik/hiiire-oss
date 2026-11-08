import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sqlUrl = new URL("../supabase/sql/dashboard_activity_feed.sql", import.meta.url);

function readSql() {
  return readFileSync(sqlUrl, "utf8");
}

function expectMatch(source: string, pattern: RegExp, message: string) {
  assert.match(source, pattern, message);
}

function expectRevokedFromBrowserRoles(source: string, functionName: string, args: string) {
  for (const role of ["public", "anon", "authenticated"]) {
    expectMatch(
      source,
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+${functionName}\\(${args}\\)\\s+from\\s+${role}`, "i"),
      `${functionName} must be revoked from ${role}`
    );
  }
}

function extractCreditBranch(source: string) {
  const fromIndex = source.search(/from\s+public\.credit_ledger\s+cl/i);
  assert.notEqual(fromIndex, -1, "credit ledger branch is missing");
  const branchStart = source.lastIndexOf("\n  select", fromIndex);
  const branchEndMatch = /\r?\n\$\$;/g;
  branchEndMatch.lastIndex = fromIndex;
  const branchEnd = branchEndMatch.exec(source)?.index ?? -1;
  assert.notEqual(branchStart, -1, "credit branch select is missing");
  assert.notEqual(branchEnd, -1, "credit branch terminator is missing");
  return source.slice(branchStart, branchEnd);
}

function extractVacancyBranch(source: string) {
  const fromIndex = source.search(/from\s+public\.vacancies\s+v/i);
  assert.notEqual(fromIndex, -1, "vacancy branch is missing");
  const branchStart = source.lastIndexOf("\n  select", fromIndex);
  const branchEndMatch = /\r?\n\r?\n\s+union\s+all/gi;
  branchEndMatch.lastIndex = fromIndex;
  const branchEnd = branchEndMatch.exec(source)?.index ?? -1;
  assert.notEqual(branchStart, -1, "vacancy branch select is missing");
  assert.notEqual(branchEnd, -1, "vacancy branch terminator is missing");
  return source.slice(branchStart, branchEnd);
}

function extractCandidateBranch(source: string) {
  const fromIndex = source.search(/from\s+public\.pipeline_events\s+pe/i);
  assert.notEqual(fromIndex, -1, "candidate branch is missing");
  const branchStart = source.lastIndexOf("\n  select", fromIndex);
  const branchEndMatch = /\r?\n\r?\n\s+union\s+all/gi;
  branchEndMatch.lastIndex = fromIndex;
  const branchEnd = branchEndMatch.exec(source)?.index ?? -1;
  assert.notEqual(branchStart, -1, "candidate branch select is missing");
  assert.notEqual(branchEnd, -1, "candidate branch terminator is missing");
  return source.slice(branchStart, branchEnd);
}

test("dashboard activity SQL defines list and count RPCs without a new activity table", () => {
  const sql = readSql();

  expectMatch(sql, /create\s+or\s+replace\s+function\s+public\.list_dashboard_activity\b/i, "list_dashboard_activity RPC is missing");
  expectMatch(sql, /create\s+or\s+replace\s+function\s+public\.count_dashboard_activity\b/i, "count_dashboard_activity RPC is missing");

  for (const table of ["activities", "activity_events", "dashboard_activity"]) {
    assert.doesNotMatch(
      sql,
      new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+public\\.${table}\\b`, "i"),
      `must not create public.${table}`
    );
  }
});

test("dashboard activity SQL is built from the expected existing sources", () => {
  const sql = readSql();

  expectMatch(sql, /\bunion\s+all\b/i, "feed rows must be combined with UNION ALL");
  expectMatch(sql, /from\s+public\.vacancies\s+v\b/i, "vacancy source is missing");
  expectMatch(sql, /from\s+public\.pipeline_events\s+pe\b/i, "pipeline_events source is missing");
  expectMatch(sql, /pe\.event_type\s*=\s*'candidate_created'/i, "candidate_created filter is missing");
  expectMatch(sql, /from\s+public\.credit_ledger\s+cl\b/i, "credit ledger source is missing");
  expectMatch(sql, /cl\.reason\s*=\s*'resume_analysis'/i, "resume_analysis credit filter is missing");
  expectMatch(sql, /cl\.reference_type\s*=\s*'ai_job'/i, "ai_job credit reference filter is missing");
  expectMatch(sql, /join\s+public\.jobs_ai\s+j\b/i, "jobs_ai join is missing");
  expectMatch(sql, /left\s+join\s+public\.profiles\b/i, "profiles actor join is missing");
});

test("dashboard activity SQL exposes the required parameters and access helpers", () => {
  const sql = readSql();

  for (const [name, type] of [
    ["p_company_id", "uuid"],
    ["p_user_id", "uuid"],
    ["p_role", "text"],
    ["p_type", "text"],
    ["p_limit", "integer"],
    ["p_offset", "integer"],
  ]) {
    expectMatch(sql, new RegExp(`\\b${name}\\s+${type}\\b`, "i"), `${name} ${type} parameter is missing`);
  }

  expectMatch(sql, /private\.dashboard_activity_can_access_vacancy\b/i, "vacancy access helper is missing");
  expectMatch(sql, /private\.dashboard_activity_can_access_candidate\b/i, "candidate access helper is missing");
});

test("dashboard activity SQL includes all feed type filters", () => {
  const sql = readSql();

  assert.match(sql, /'Создана вакансия'::text\s+as\s+title/i);
  assert.match(sql, /'Добавлен кандидат'::text\s+as\s+title/i);
  assert.doesNotMatch(sql, /'Vacancy created'::text/i);
  assert.doesNotMatch(sql, /'Candidate created'::text/i);

  for (const type of ["all", "candidates", "vacancies", "credits"]) {
    expectMatch(sql, new RegExp(`p_type\\s+in\\s*\\([^)]*'${type}'`, "i"), `${type} filter is missing`);
  }
});

test("dashboard activity count and list RPCs keep totals stable and page deterministically", () => {
  const sql = readSql();

  expectMatch(sql, /function\s+public\.count_dashboard_activity[\s\S]+returns\s+bigint/i, "count RPC must return bigint");
  expectMatch(sql, /select\s+count\(\*\)::bigint[\s\S]+from\s+private\.dashboard_activity_rows/i, "count RPC must count the same source rows");
  expectMatch(sql, /order\s+by\s+rows\.occurred_at\s+desc,\s+rows\.activity_id\s+desc/i, "list RPC ordering is missing");
  expectMatch(
    sql,
    /limit\s+greatest\(1,\s*least\(coalesce\(p_limit,\s*25\),\s*200\)\)\s+offset\s+greatest\(0,\s*coalesce\(p_offset,\s*0\)\)/i,
    "list RPC must apply direct safe limit and offset expressions"
  );
  assert.doesNotMatch(sql, /limit\s+n\.page_limit/i, "list RPC must not use FROM-scope limit aliases");
  assert.doesNotMatch(sql, /offset\s+n\.page_offset/i, "list RPC must not use FROM-scope offset aliases");
});

test("dashboard activity private security definer helpers are not executable by browser roles", () => {
  const sql = readSql();

  expectRevokedFromBrowserRoles(sql, "private\\.dashboard_activity_can_access_vacancy", "uuid,\\s*uuid,\\s*text,\\s*uuid");
  expectRevokedFromBrowserRoles(sql, "private\\.dashboard_activity_can_access_candidate", "uuid,\\s*uuid,\\s*text,\\s*uuid");
  expectRevokedFromBrowserRoles(sql, "private\\.dashboard_activity_rows", "uuid,\\s*uuid,\\s*text,\\s*text");
});

test("dashboard activity actor profile joins are company-scoped inside security definer rows", () => {
  const sql = readSql();
  const vacancyBranch = extractVacancyBranch(sql);
  const candidateBranch = extractCandidateBranch(sql);
  const creditBranch = extractCreditBranch(sql);

  expectMatch(
    vacancyBranch,
    /left\s+join\s+public\.profiles\s+p\s+on\s+p\.id\s*=\s*v\.created_by\s+and\s+p\.company_id\s*=\s*p_company_id/i,
    "vacancy actor profile join must be scoped to requested company"
  );
  expectMatch(
    candidateBranch,
    /left\s+join\s+public\.profiles\s+p\s+on\s+p\.id\s*=\s*pe\.actor_id\s+and\s+p\.company_id\s*=\s*p_company_id/i,
    "candidate actor profile join must be scoped to requested company"
  );
  expectMatch(
    creditBranch,
    /left\s+join\s+public\.profiles\s+p\s+on\s+p\.id\s*=\s*coalesce\(cl\.created_by,\s*j\.requested_by\)\s+and\s+p\.company_id\s*=\s*p_company_id/i,
    "credit actor profile join must be scoped to requested company"
  );
});

test("dashboard activity credit rows are company-wide without disclosing entity or actor email", () => {
  const sql = readSql();
  const creditBranch = extractCreditBranch(sql);

  expectMatch(creditBranch, /'Списаны кредиты'::text\s+as\s+title/i, "credit branch must expose Russian title");
  expectMatch(creditBranch, /'AI-анализ резюме'::text\s+as\s+description/i, "credit branch must expose Russian description");
  assert.doesNotMatch(creditBranch, /'Credits spent'::text/i, "credit branch must not expose English title");
  assert.doesNotMatch(creditBranch, /'Resume analysis'::text/i, "credit branch must not expose English description");
  expectMatch(creditBranch, /cl\.company_id\s*=\s*p_company_id/i, "credit branch must scope by ledger company");
  expectMatch(creditBranch, /j\.company_id\s*=\s*p_company_id/i, "credit branch must cross-check jobs_ai company");
  expectMatch(creditBranch, /null::uuid\s+as\s+entity_id/i, "credit branch must hide entity id");
  expectMatch(creditBranch, /null::text\s+as\s+entity_name/i, "credit branch must hide entity name");
  expectMatch(creditBranch, /null::text\s+as\s+actor_email/i, "credit branch must hide actor email");
  assert.doesNotMatch(creditBranch, /p_role\s*=\s*'admin'/i, "credit branch must not be admin-only");
  assert.doesNotMatch(creditBranch, /created_by\s*=\s*p_user_id/i, "credit branch must not be owner-only");
});

test("dashboard activity candidate rows cross-check company and vacancy links", () => {
  const sql = readSql();
  const candidateBranch = extractCandidateBranch(sql);

  expectMatch(candidateBranch, /c\.created_at\s+as\s+occurred_at/i, "candidate feed event time must be when candidate was added to hiiire");
  assert.doesNotMatch(candidateBranch, /pe\.occurred_at\s+as\s+occurred_at/i, "candidate feed must not sort HH imports by application time");
  expectMatch(candidateBranch, /v\.company_id\s*=\s*p_company_id/i, "candidate branch must scope by vacancy company");
  expectMatch(candidateBranch, /pe\.company_id\s*=\s*v\.company_id/i, "candidate branch must cross-check pipeline event company");
  expectMatch(candidateBranch, /c\.vacancy_id\s*=\s*v\.id/i, "candidate branch must cross-check candidate vacancy");
});
