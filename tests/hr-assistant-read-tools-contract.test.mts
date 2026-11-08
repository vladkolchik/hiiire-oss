import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export {};", shortCircuit: true };
    }

    if (specifier === "next/server" || specifier === "next/server.js") {
      return {
        url: "data:text/javascript,export const NextResponse = { json: (_body, init = {}) => ({ status: init.status ?? 200 }) };",
        shortCircuit: true,
      };
    }

    if (specifier.endsWith("/auth/server-email-confirmation.ts") || specifier === "../auth/server-email-confirmation.ts") {
      return {
        url: "data:text/javascript,export async function getConfirmedServerUser() { return { data: { user: null }, error: null }; }",
        shortCircuit: true,
      };
    }

    if (specifier === "./crm-write" && context.parentURL?.endsWith("/lib/hr-assistant/tools/candidate-read.ts")) {
      return {
        url: 'data:text/javascript,export const CANDIDATE_STATUS_VALUES = ["new","reviewing","interview","offer","hired","rejected"];',
        shortCircuit: true,
      };
    }

    if (specifier.startsWith("@/")) {
      return nextResolve(pathToFileURL(resolve(projectRoot, specifier.slice(2)) + ".ts").href, context);
    }

    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !extname(specifier)) {
      return nextResolve(new URL(`${specifier}.ts`, context.parentURL).href, context);
    }

    return nextResolve(specifier, context);
  },
});

type FakeRow = Record<string, any>;

class CandidateToolQueryStub {
  private readonly filters = new Map<string, unknown>();
  private readonly inFilters = new Map<string, unknown[]>();
  private readonly gteFilters = new Map<string, unknown>();
  private readonly ltFilters = new Map<string, unknown>();
  private limitSize: number | null = null;
  private readonly admin: CandidateToolAdminStub;
  private readonly table: string;
  private countMode: "exact" | null;
  private headOnly: boolean;

  constructor(
    admin: CandidateToolAdminStub,
    table: string,
    countMode: "exact" | null = null,
    headOnly = false
  ) {
    this.admin = admin;
    this.table = table;
    this.countMode = countMode;
    this.headOnly = headOnly;
  }

  select(_columns: string, options?: { count?: "exact"; head?: boolean }) {
    this.admin.selectCalls.push({ table: this.table, columns: _columns });
    this.countMode = options?.count ?? null;
    this.headOnly = options?.head ?? false;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.set(column, value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.inFilters.set(column, values);
    return this;
  }

  gte(column: string, value: unknown) {
    this.gteFilters.set(column, value);
    return this;
  }

  lt(column: string, value: unknown) {
    this.ltFilters.set(column, value);
    return this;
  }

  or() {
    return this;
  }

  order() {
    return this;
  }

  limit(size: number) {
    this.limitSize = size;
    return this;
  }

  maybeSingle() {
    return Promise.resolve({ data: this.resolveRows()[0] ?? null, error: null });
  }

  then<TResult1 = { data: FakeRow[] | null; error: null; count?: number }, TResult2 = never>(
    onfulfilled?: ((value: { data: FakeRow[] | null; error: null; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    const rows = this.resolveRows();
    const limitedRows = this.limitSize === null ? rows : rows.slice(0, this.limitSize);
    return Promise.resolve({
      data: this.headOnly ? null : limitedRows,
      error: null,
      count: this.countMode === "exact" ? rows.length : undefined,
    }).then(onfulfilled, onrejected);
  }

  private resolveRows() {
    return (this.admin.rows[this.table] ?? []).filter((row) => {
      for (const [column, value] of this.filters) {
        if (row[column] !== value) return false;
      }
      for (const [column, values] of this.inFilters) {
        if (!values.includes(row[column])) return false;
      }
      for (const [column, value] of this.gteFilters) {
        if (row[column] < value) return false;
      }
      for (const [column, value] of this.ltFilters) {
        if (row[column] >= value) return false;
      }
      return true;
    });
  }
}

class CandidateToolAdminStub {
  readonly rows: Record<string, FakeRow[]>;
  readonly selectCalls: Array<{ table: string; columns: string }> = [];

  constructor(rows: Record<string, FakeRow[]>) {
    this.rows = rows;
  }

  from(table: string) {
    return new CandidateToolQueryStub(this, table);
  }
}

test("candidate list tool accepts pagination, search, filters, sort, and aggregations", () => {
  const toolsSource = readFileSync("lib/hr-assistant/tools.ts", "utf8");
  const candidateSource = readFileSync("lib/hr-assistant/tools/candidate-read.ts", "utf8");
  const retrievalSource = readFileSync("lib/hr-assistant/retrieval.ts", "utf8");
  const chatRouteSource = readFileSync("app/api/hr-assistant/chat/route.ts", "utf8");

  assert.match(toolsSource, /limit:\s*z\.number\(\)\.int\(\)\.min\(1\)\.max\(100\)\.optional\(\)/);
  assert.match(toolsSource, /cursor:\s*z\.string\(\)\.nullable\(\)\.optional\(\)/);
  assert.match(toolsSource, /nameQuery:\s*z\.string\(\)\.trim\(\)\.max\(200\)\.nullable\(\)\.optional\(\)/);
  assert.match(toolsSource, /status:\s*z\.enum\(CANDIDATE_STATUS_VALUES\)\.nullable\(\)\.optional\(\)/);
  assert.match(toolsSource, /scoreFilter:\s*z\.enum\(\["all",\s*"high",\s*"medium",\s*"low",\s*"unscored"\]\)/);
  assert.match(toolsSource, /source:\s*z\.enum\(\["all",\s*"manual",\s*"hh",\s*"referral",\s*"other"\]\)/);
  assert.match(toolsSource, /includeAggregations:\s*z\.boolean\(\)\.optional\(\)/);
  assert.match(candidateSource, /toolListSuccess/);
  assert.match(candidateSource, /pageInfo/);
  assert.match(candidateSource, /nextCursor/);
  assert.match(candidateSource, /filtersHash/);
  assert.match(candidateSource, /buildCandidateNameIlikePatterns/);
  assert.match(candidateSource, /statusCounts/);
  assert.match(candidateSource, /ASSISTANT_CANDIDATE_VACANCY_FILTER_CHUNK_SIZE/);
  assert.match(candidateSource, /compareCandidateRows/);
  assert.match(candidateSource, /const vacancyIdChunks = chunk\(vacancyIdsResult\.ids,\s*ASSISTANT_CANDIDATE_VACANCY_FILTER_CHUNK_SIZE\)/);
  assert.match(candidateSource, /\.in\("vacancy_id",\s*vacancyIdChunk\)/);
  assert.match(candidateSource, /formatCandidateStatusLabel/);
  assert.match(candidateSource, /statusLabel:/);
  assert.match(candidateSource, /statusLabels:/);
  assert.match(candidateSource, /formatCandidateSourceLabel/);
  assert.match(candidateSource, /sourceLabel:/);
  assert.match(candidateSource, /SOURCE_FILTER_LABELS/);
  assert.match(candidateSource, /hh\.ru["']:\s*"HH\.ru"/);
  assert.match(candidateSource, /manual:\s*"Вручную"/);
  assert.match(candidateSource, /referral:\s*"Реферал"/);
  assert.match(candidateSource, /other:\s*"Другое"/);
  assert.match(candidateSource, /unknown:\s*"Неизвестно"/);
  assert.match(candidateSource, /SCORE_FILTER_LABELS[\s\S]+all:\s*"Все"[\s\S]+unscored:\s*"Не просчитаны"[\s\S]+high:\s*"Высокое"[\s\S]+medium:\s*"Среднее"[\s\S]+low:\s*"Низкое"/);
  assert.match(candidateSource, /appliedFilterLabels:/);
  assert.match(candidateSource, /availableFilterLabels:/);
  assert.match(candidateSource, /sortLabel:/);
  assert.match(candidateSource, /scopeLabel:/);
  assert.match(candidateSource, /href:\s*buildCandidateCardHref\(row\.id\)/);
  assert.match(candidateSource, /vacancyTitle:/);
  assert.match(candidateSource, /\.from\("vacancies"\)\.select\("id,title"\)\.in\("id",\s*vacancyIds/);
  assert.match(candidateSource, /select\("id",\s*\{\s*count:\s*"exact",\s*head:\s*true\s*\}\)/);
  assert.doesNotMatch(candidateSource, /\.in\("vacancy_id",\s*vacancyIdsResult\.ids\)/);
  assert.doesNotMatch(candidateSource, /from\("candidates"\)\.select\("status"\)/);
  assert.match(candidateSource, /match_percentage\.is\.null/);
  assert.match(candidateSource, /\.is\("match_percentage",\s*null\)\.gt\("id",\s*lastId\)/);
  assert.match(candidateSource, /\.select\("id,company_id"\)\.eq\("id",\s*vacancyId\)\.maybeSingle\(\)/);
  assert.match(candidateSource, /vacancy\.company_id !== ctx\.companyId/);
  assert.match(candidateSource, /Вакансия не найдена или недоступна\./);
  assert.match(retrievalSource, /formatCandidateStatusLabel/);
  assert.doesNotMatch(retrievalSource, /\$\{candidate\.status\}/);
  assert.match(chatRouteSource, /statusLabel/);
  assert.match(chatRouteSource, /русск/);
});

test("candidate list tool reads all accessible vacancy ids past the Supabase REST row cap", () => {
  const candidateSource = readFileSync("lib/hr-assistant/tools/candidate-read.ts", "utf8");
  const helperStart = candidateSource.indexOf("async function getAccessibleVacancyIds");
  const helperEnd = candidateSource.indexOf("function applyCandidateFilters", helperStart);
  assert.notEqual(helperStart, -1);
  assert.notEqual(helperEnd, -1);
  const helperSource = candidateSource.slice(helperStart, helperEnd);

  assert.match(helperSource, /loadAllSupabaseRows/);
  assert.match(helperSource, /runPageQuery:\s*\(from,\s*to\)/);
  assert.match(helperSource, /\.order\("id",\s*\{\s*ascending:\s*true\s*\}\)/);
  assert.match(helperSource, /\.range\(from,\s*to\)/);
  assert.doesNotMatch(helperSource, /\.eq\("created_by",\s*ctx\.userId\)/);
  assert.doesNotMatch(helperSource, /const\s+\{\s*data,\s*error\s*\}\s*=\s*await\s+query/);
});

test("candidate list vacancy filter matches candidate detail access for owned candidates in company vacancies", async () => {
  const { listAccessibleCandidatesForAssistant, getAccessibleCandidateForAssistant } = await import(
    "../lib/hr-assistant/tools/candidate-read.ts"
  );
  const admin = new CandidateToolAdminStub({
    vacancies: [
      {
        id: "vacancy-company-owned-by-peer",
        title: "Backend Engineer",
        status: "active",
        location: "Москва",
        company_id: "company-1",
        created_by: "peer-user",
      },
    ],
    candidates: [
      {
        id: "candidate-owned",
        name: "Ирина Петрова",
        position: "Backend Engineer",
        status: "new",
        vacancy_id: "vacancy-company-owned-by-peer",
        match_percentage: 91,
        comment: null,
        source: "manual",
        created_by: "user-1",
        applied_at: "2026-05-19T10:00:00.000Z",
      },
    ],
  });
  const ctx = { userId: "user-1", companyId: "company-1", role: "hr" as const };

  const detail = await getAccessibleCandidateForAssistant(admin, ctx, { candidateId: "candidate-owned" });
  assert.equal(detail.ok, true);

  const list = await listAccessibleCandidatesForAssistant(admin, ctx, {
    vacancyId: "vacancy-company-owned-by-peer",
    includeAggregations: false,
  });

  assert.equal(list.ok, true);
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].id, "candidate-owned");
  assert.equal(list.pageInfo.total, 1);
});

test("candidate read tools select and expose structured desired salary", async () => {
  const { listAccessibleCandidatesForAssistant, getAccessibleCandidateForAssistant } = await import(
    "../lib/hr-assistant/tools/candidate-read.ts"
  );
  const admin = new CandidateToolAdminStub({
    vacancies: [
      {
        id: "vacancy-company-owned-by-peer",
        title: "Backend Engineer",
        status: "active",
        location: "Москва",
        company_id: "company-1",
        created_by: "peer-user",
      },
    ],
    candidates: [
      {
        id: "candidate-owned",
        name: "Ирина Петрова",
        position: "Backend Engineer",
        status: "new",
        vacancy_id: "vacancy-company-owned-by-peer",
        match_percentage: 91,
        comment: null,
        source: "manual",
        created_by: "user-1",
        applied_at: "2026-05-19T10:00:00.000Z",
        desired_salary_text: "от 250 000 ₽ net",
      },
    ],
  });
  const ctx = { userId: "user-1", companyId: "company-1", role: "hr" as const };

  const list = await listAccessibleCandidatesForAssistant(admin, ctx, {
    vacancyId: "vacancy-company-owned-by-peer",
    includeAggregations: false,
  });
  const detail = await getAccessibleCandidateForAssistant(admin, ctx, { candidateId: "candidate-owned" });

  assert.equal(list.ok, true);
  assert.equal(list.items[0].desiredSalaryText, "от 250 000 ₽ net");
  assert.equal(detail.ok, true);
  assert.equal(detail.item.desiredSalaryText, "от 250 000 ₽ net");
  assert.equal(
    admin.selectCalls.filter((call) => call.table === "candidates" && call.columns.includes("desired_salary_text")).length,
    2
  );
});

test("retrieval candidate facts use structured desired salary without resume text derivation", async () => {
  const { retrieveHrAssistantContext } = await import("../lib/hr-assistant/retrieval.ts");
  const admin = new CandidateToolAdminStub({
    vacancies: [
      {
        id: "vacancy-company-owned-by-peer",
        title: "Backend Engineer",
        status: "active",
        location: "Москва",
        company_id: "company-1",
        created_by: "peer-user",
      },
    ],
    candidates: [
      {
        id: "candidate-owned",
        name: "Ирина Петрова",
        position: "Backend Engineer",
        status: "new",
        vacancy_id: "vacancy-company-owned-by-peer",
        match_percentage: 91,
        comment: null,
        source: "manual",
        created_by: "user-1",
        applied_at: "2026-05-19T10:00:00.000Z",
        desired_salary_text: "от 250 000 ₽ net",
        resume_text: "Ожидаемая зарплата: 999 000 ₽",
      },
    ],
  });
  const ctx = { userId: "user-1", companyId: "company-1", role: "hr" as const };

  const result = await retrieveHrAssistantContext(admin, ctx, {
    query: "зарплатные ожидания кандидата",
    threadScopeType: "candidate",
    threadScopeId: "candidate-owned",
  });
  const facts = result.facts.join("\n");

  assert.match(facts, /желаемая зарплата: от 250 000 ₽ net/i);
  assert.doesNotMatch(facts, /999 000/);
});

test("candidate detail supports safe includes", () => {
  const toolsSource = readFileSync("lib/hr-assistant/tools.ts", "utf8");
  const candidateSource = readFileSync("lib/hr-assistant/tools/candidate-read.ts", "utf8");

  assert.match(toolsSource, /include:\s*z\.array\(z\.enum\(\["vacancy",\s*"contacts",\s*"analysis",\s*"latestJob",\s*"resumeSummary"\]\)\)/);
  assert.match(candidateSource, /candidate_contacts/);
  assert.match(candidateSource, /ai_analyses/);
  assert.match(candidateSource, /jobs_ai/);
  assert.match(candidateSource, /formatAiJobStatusLabel/);
  assert.match(candidateSource, /latestJob\s*=\s*latestJob\s*\?\s*\{\s*\.\.\.latestJob,\s*statusLabel:\s*formatAiJobStatusLabel\(latestJob\.status\)\s*\}\s*:\s*null/);
  assert.match(candidateSource, /href:\s*buildCandidateCardHref\(data\.id\)/);
  assert.match(candidateSource, /vacancyTitle:\s*vacancyTitle/);
  assert.match(candidateSource, /CANDIDATE_INCLUDE_LABELS/);
  assert.match(candidateSource, /latestJob:\s*"Последний AI-анализ"/);
  assert.match(candidateSource, /resumeSummary:\s*"Краткая информация о резюме"/);
  assert.doesNotMatch(candidateSource, /input\.include\.join/);
  assert.doesNotMatch(candidateSource, /select\("id,status,updated_at,last_error"\)/);
  assert.doesNotMatch(candidateSource, /resume_text[\s\S]+item:/);
});

test("vacancy list tool uses the shared paged envelope and no hidden limit", () => {
  const toolsSource = readFileSync("lib/hr-assistant/tools.ts", "utf8");
  const vacancySource = readFileSync("lib/hr-assistant/tools/vacancy-read.ts", "utf8");
  const retrievalSource = readFileSync("lib/hr-assistant/retrieval.ts", "utf8");
  const chatRouteSource = readFileSync("app/api/hr-assistant/chat/route.ts", "utf8");

  assert.match(toolsSource, /list_accessible_vacancies:[\s\S]+limit:\s*z\.number\(\)\.int\(\)\.min\(1\)\.max\(100\)\.optional\(\)/);
  assert.match(toolsSource, /titleQuery:\s*z\.string\(\)\.trim\(\)\.max\(200\)\.nullable\(\)\.optional\(\)/);
  assert.match(toolsSource, /status:\s*z\.enum\(\["draft",\s*"active",\s*"paused",\s*"closed"\]\)\.nullable\(\)\.optional\(\)/);
  assert.match(vacancySource, /toolListSuccess/);
  assert.match(vacancySource, /pageInfo/);
  assert.match(vacancySource, /nextCursor/);
  assert.match(vacancySource, /statusCounts/);
  assert.match(vacancySource, /formatVacancyStatusLabel/);
  assert.match(vacancySource, /statusLabel:/);
  assert.match(vacancySource, /statusLabels:/);
  assert.match(vacancySource, /appliedFilterLabels:/);
  assert.match(vacancySource, /availableFilterLabels:/);
  assert.match(vacancySource, /sortLabel:/);
  assert.match(vacancySource, /scopeLabel:/);
  assert.match(vacancySource, /href:\s*buildVacancyCardHref\(row\.id\)/);
  assert.match(vacancySource, /href:\s*buildVacancyCardHref\(data\.id\)/);
  assert.match(vacancySource, /select\("id",\s*\{\s*count:\s*"exact",\s*head:\s*true\s*\}\)/);
  assert.doesNotMatch(vacancySource, /from\("vacancies"\)\.select\("status"\)/);
  assert.doesNotMatch(vacancySource, /\.limit\(20\)/);
  assert.match(retrievalSource, /formatVacancyStatusLabel/);
  assert.match(retrievalSource, /vacancyTitle/);
  assert.match(retrievalSource, /href/);
  assert.doesNotMatch(retrievalSource, /\$\{vacancy\.status\}/);
  assert.doesNotMatch(retrievalSource, /вакансия:\s*\$\{candidate\.vacancyId\}/);
  assert.match(chatRouteSource, /статусов кандидатов, вакансий и собеседований/);
});

test("interview list returns page info and cannot limit before access filtering", () => {
  const calendarSource = readFileSync("lib/hr-assistant/tools/calendar.ts", "utf8");
  const toolsSource = readFileSync("lib/hr-assistant/tools.ts", "utf8");

  assert.match(toolsSource, /list_accessible_interviews:[\s\S]+limit:\s*z\.number\(\)\.int\(\)\.min\(1\)\.max\(100\)\.optional\(\)/);
  assert.match(toolsSource, /fromIso:\s*z\.string\(\)\.datetime\(\{\s*offset:\s*true\s*\}\)/);
  assert.match(toolsSource, /toIso:\s*z\.string\(\)\.datetime\(\{\s*offset:\s*true\s*\}\)/);
  assert.match(toolsSource, /cursor:\s*z\.string\(\)\.nullable\(\)\.optional\(\)/);
  assert.match(calendarSource, /pageInfo/);
  assert.match(calendarSource, /scannedCount/);
  assert.match(calendarSource, /while\s*\(/);
  assert.match(calendarSource, /formatInterviewStatusLabel/);
  assert.match(calendarSource, /statusLabel:/);
  assert.match(calendarSource, /statusLabels:/);
  assert.match(calendarSource, /appliedFilterLabels:/);
  assert.match(calendarSource, /sortLabel:/);
  assert.match(calendarSource, /scopeLabel:/);
  assert.match(calendarSource, /fromIso:\s*"Начало периода"/);
  assert.match(calendarSource, /toIso:\s*"Конец периода"/);
  assert.doesNotMatch(calendarSource, /С \$\{input\.fromIso\}/);
  assert.doesNotMatch(calendarSource, /\.limit\(50\);/);
});

test("interview list exposes display-ready labels and limited meeting context without card links", () => {
  const calendarSource = readFileSync("lib/hr-assistant/tools/calendar.ts", "utf8");
  const typeLabelsSource = readFileSync("lib/interviews/type-labels.ts", "utf8");

  assert.match(typeLabelsSource, /phone:\s*"Телефон"/);
  assert.match(typeLabelsSource, /video:\s*"Видео"/);
  assert.match(typeLabelsSource, /"in-person":\s*"Офис"/);
  assert.match(typeLabelsSource, /technical:\s*"Техническое"/);
  assert.match(typeLabelsSource, /formatInterviewTypeLabel/);

  assert.match(calendarSource, /INTERVIEW_TYPE_LABELS/);
  assert.match(calendarSource, /formatInterviewTypeLabel/);
  assert.match(calendarSource, /typeLabel:\s*formatInterviewTypeLabel\(row\.type\)/);
  assert.match(calendarSource, /typeLabels:\s*INTERVIEW_TYPE_LABELS/);

  assert.match(calendarSource, /candidateName:/);
  assert.match(calendarSource, /vacancyTitle:/);
  assert.match(calendarSource, /interviewerNames:/);
  assert.match(calendarSource, /if \(interview\.accessLevel === "interviewer_only"\)/);
  assert.match(calendarSource, /candidateHref:\s*buildCandidateCardHref\(interview\.candidateId\)/);
  assert.match(calendarSource, /vacancyHref:\s*buildVacancyCardHref\(interview\.vacancyId\)/);
  assert.match(calendarSource, /const displayInterviews = accessible\.filter[\s\S]+admin\.from\("candidates"\)/);
  assert.match(calendarSource, /const displayInterviews = accessible\.filter[\s\S]+admin\.from\("vacancies"\)/);
  assert.match(calendarSource, /const manageInterviews = accessible\.filter[\s\S]+admin\.from\("profiles"\)/);

  const limitedBranch = calendarSource.slice(calendarSource.indexOf('if (level === "interviewer_only")'), calendarSource.indexOf('} else if (level === "manage")'));
  assert.match(limitedBranch, /candidateId:\s*row\.candidate_id/);
  assert.match(limitedBranch, /vacancyId:\s*row\.vacancy_id/);
  assert.match(limitedBranch, /meetingUrl:\s*row\.meeting_url/);
  assert.match(limitedBranch, /location:\s*row\.location/);

  const limitedDisplayBlock = calendarSource.slice(
    calendarSource.indexOf('if (interview.accessLevel === "interviewer_only")'),
    calendarSource.indexOf("const interviewers =", calendarSource.indexOf('if (interview.accessLevel === "interviewer_only")'))
  );
  assert.match(limitedDisplayBlock, /displayTitle:\s*candidate\?\.name/);
  assert.match(limitedDisplayBlock, /displaySubtitle:\s*vacancy\?\.title/);
  assert.doesNotMatch(limitedDisplayBlock, /candidateHref|vacancyHref/);
});

test("interview list tool strips card ids and hrefs from interviewer-only output", async () => {
  const { listAccessibleInterviewsForAssistant } = await import("../lib/hr-assistant/tools/calendar.ts");
  const admin = new CandidateToolAdminStub({
    interviews: [
      {
        id: "interview-limited",
        company_id: "company-1",
        candidate_id: "candidate-hidden",
        vacancy_id: "vacancy-hidden",
        scheduled_at: "2026-05-20T10:00:00.000Z",
        duration_minutes: 45,
        type: "video",
        status: "scheduled",
        interviewer_ids: ["viewer-user"],
        meeting_url: "https://meet.example.com/limited",
        location: "Zoom",
        created_by: "other-user",
        updated_at: "2026-05-19T10:00:00.000Z",
      },
    ],
    candidates: [
      {
        id: "candidate-hidden",
        vacancy_id: "vacancy-hidden",
        name: "Анна Интервью",
        created_by: "other-user",
      },
    ],
    vacancies: [
      {
        id: "vacancy-hidden",
        company_id: "company-1",
        title: "Менеджер проекта",
        created_by: "other-user",
      },
    ],
  });

  const result = await listAccessibleInterviewsForAssistant(
    admin,
    { userId: "viewer-user", companyId: "company-1", role: "recruiter" },
    { fromIso: "2026-05-20T00:00:00.000Z", toIso: "2026-05-21T00:00:00.000Z", limit: 10 }
  );

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  const item = result.items[0];
  assert.equal(item.accessLevel, "interviewer_only");
  assert.equal(item.displayTitle, "Анна Интервью");
  assert.equal(item.displaySubtitle, "Менеджер проекта");
  assert.equal(item.meetingUrl, "https://meet.example.com/limited");
  assert.equal(item.location, "Zoom");
  assert.equal("candidateId" in item, false);
  assert.equal("vacancyId" in item, false);
  assert.equal("candidateHref" in item, false);
  assert.equal("vacancyHref" in item, false);
  assert.equal("createdById" in item, false);
});

test("interview list tool keeps meeting context for manage output", async () => {
  const { listAccessibleInterviewsForAssistant } = await import("../lib/hr-assistant/tools/calendar.ts");
  const admin = new CandidateToolAdminStub({
    interviews: [
      {
        id: "interview-manage",
        company_id: "company-1",
        candidate_id: "candidate-visible",
        vacancy_id: "vacancy-visible",
        scheduled_at: "2026-05-20T12:00:00.000Z",
        duration_minutes: 60,
        type: "video",
        status: "scheduled",
        interviewer_ids: ["viewer-user"],
        meeting_url: "https://meet.example.com/manage",
        location: "Google Meet",
        created_by: "viewer-user",
        updated_at: "2026-05-19T10:00:00.000Z",
      },
    ],
    candidates: [
      {
        id: "candidate-visible",
        vacancy_id: "vacancy-visible",
        name: "Мария Управляемая",
        created_by: "viewer-user",
      },
    ],
    vacancies: [
      {
        id: "vacancy-visible",
        company_id: "company-1",
        title: "Product Designer",
        created_by: "viewer-user",
      },
    ],
    profiles: [{ id: "viewer-user", name: "Интервьюер", email: "viewer@example.com" }],
  });

  const result = await listAccessibleInterviewsForAssistant(
    admin,
    { userId: "viewer-user", companyId: "company-1", role: "recruiter" },
    { fromIso: "2026-05-20T00:00:00.000Z", toIso: "2026-05-21T00:00:00.000Z", limit: 10 }
  );

  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
  const item = result.items[0];
  assert.equal(item.accessLevel, "manage");
  assert.equal(item.meetingUrl, "https://meet.example.com/manage");
  assert.equal(item.location, "Google Meet");
  assert.equal(item.candidateName, "Мария Управляемая");
  assert.equal(item.vacancyTitle, "Product Designer");
});
