import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  HR_ASSISTANT_ALLOWED_PLANS,
  requireHrAssistantPlanAccessForSnapshot,
} from "../lib/hr-assistant/access-policy.ts";
import type { CompanyPlanSnapshot } from "../lib/billing/subscription-status.ts";

const routeFiles = [
  "app/api/hr-assistant/threads/route.ts",
  "app/api/hr-assistant/threads/[id]/route.ts",
  "app/api/hr-assistant/threads/[id]/messages/route.ts",
  "app/api/hr-assistant/chat/route.ts",
] as const;

const planProtectedRouteFiles = [
  ...routeFiles,
  "app/api/hr-assistant/approvals/[id]/route.ts",
] as const;

function planSnapshot(overrides: Partial<CompanyPlanSnapshot>): CompanyPlanSnapshot {
  return {
    currentPlan: "starter",
    trialExpiresAt: null,
    periodStart: null,
    periodEnd: null,
    autoRenew: true,
    scheduledPlan: null,
    scheduledPlanEffectiveAt: null,
    scheduledPaymentId: null,
    ...overrides,
  };
}

test("HR assistant thread API routes require company context and use server Supabase clients", () => {
  for (const file of routeFiles) {
    const source = readFileSync(file, "utf8");

    assert.match(source, /requireCompanyContext/);
    assert.match(source, /createSupabaseServerClient/);
    assert.match(source, /getSupabaseAdminClient/);
  }
});

test("HR assistant is gated by active Trial, Starter, Professional, or Enterprise plan", () => {
  const accessHelper = readFileSync("lib/hr-assistant/access.ts", "utf8");
  const accessPolicy = readFileSync("lib/hr-assistant/access-policy.ts", "utf8");

  assert.match(accessPolicy, /HR_ASSISTANT_ALLOWED_PLANS\s*=\s*\[\s*"trial",\s*"starter",\s*"professional",\s*"enterprise"\s*\]/);
  assert.doesNotMatch(accessPolicy, /"pro"/);
  assert.match(accessHelper, /loadCompanyPlanSnapshot/);
  assert.match(accessPolicy, /isAiAllowed/);
  assert.match(accessPolicy, /HR_ASSISTANT_PLAN_REQUIRED_MESSAGE/);
  assert.match(accessPolicy, /PLAN_REQUIRED/);
  assert.match(accessPolicy, /HR-ассистент доступен на активном тарифе/);
});

test("HR assistant plan policy allows only eligible active plans and paid grace", () => {
  const now = Date.parse("2026-05-19T12:00:00.000Z");
  const future = "2026-05-20T12:00:00.000Z";
  const pastInsideGrace = "2026-05-18T12:00:00.000Z";
  const pastOutsideGrace = "2026-05-10T12:00:00.000Z";

  const cases: Array<{
    name: string;
    snapshot: CompanyPlanSnapshot;
    expected: boolean;
  }> = [
    { name: "active trial", snapshot: planSnapshot({ currentPlan: "trial", trialExpiresAt: future }), expected: true },
    { name: "expired trial", snapshot: planSnapshot({ currentPlan: "trial", trialExpiresAt: pastOutsideGrace }), expected: false },
    { name: "active starter", snapshot: planSnapshot({ currentPlan: "starter", periodEnd: future }), expected: true },
    { name: "starter paid grace", snapshot: planSnapshot({ currentPlan: "starter", periodEnd: pastInsideGrace }), expected: true },
    {
      name: "starter expired without auto-renew",
      snapshot: planSnapshot({ currentPlan: "starter", periodEnd: pastInsideGrace, autoRenew: false }),
      expected: false,
    },
    { name: "expired professional", snapshot: planSnapshot({ currentPlan: "professional", periodEnd: pastOutsideGrace }), expected: false },
    { name: "enterprise", snapshot: planSnapshot({ currentPlan: "enterprise", periodEnd: null }), expected: true },
  ];

  for (const item of cases) {
    assert.equal(
      requireHrAssistantPlanAccessForSnapshot(item.snapshot, now),
      item.expected,
      item.name
    );
  }

  assert.deepEqual([...HR_ASSISTANT_ALLOWED_PLANS], ["trial", "starter", "professional", "enterprise"]);
  assert.equal(HR_ASSISTANT_ALLOWED_PLANS.includes("pro" as never), false);
});

test("HR assistant API routes reject companies without an active eligible plan", () => {
  for (const file of planProtectedRouteFiles) {
    const source = readFileSync(file, "utf8");

    assert.match(source, /requireHrAssistantPlanAccess/);
    assert.match(source, /hrAssistantPlanAccessResponse/);
    assert.match(source, /hrAssistantPlanAccessResponse\(\)/);
    assert.ok(
      source.indexOf("requireCompanyContext") < source.indexOf("requireHrAssistantPlanAccess"),
      `${file} should check plan access after company context is known`
    );
  }
});

test("HR assistant dashboard page renders a friendly plan placeholder instead of chat when plan is inactive", () => {
  const page = readFileSync("app/(dashboard)/dashboard/hr-assistant/page.tsx", "utf8");
  const accessHelper = readFileSync("lib/hr-assistant/access.ts", "utf8");
  const accessPolicy = readFileSync("lib/hr-assistant/access-policy.ts", "utf8");
  const placeholder = readFileSync("components/dashboard/hr-assistant/plan-access-placeholder.tsx", "utf8");
  const placeholderContract = `${accessHelper}\n${accessPolicy}\n${placeholder}`;

  assert.match(page, /loadHrAssistantPlanAccess/);
  assert.match(page, /HrAssistantPlanAccessPlaceholder/);
  assert.match(page, /HrAssistantClient/);
  assert.ok(
    page.indexOf("loadHrAssistantPlanAccess") < page.indexOf("return <HrAssistantClient"),
    "page should resolve plan access before rendering the chat client"
  );

  assert.match(placeholderContract, /HR-ассистент доступен на активном тарифе/);
  assert.match(placeholderContract, /Starter, Professional или Enterprise/);
  assert.doesNotMatch(placeholderContract, /Подключите Trial/);
  assert.match(placeholder, /\/dashboard\/settings\?tab=plan/);
  assert.doesNotMatch(placeholder, /raw|stack|INVALID|provider|internal/i);
});

test("HR assistant thread API routes return hardened user-facing validation errors", () => {
  for (const file of [
    "app/api/hr-assistant/threads/route.ts",
    "app/api/hr-assistant/threads/[id]/route.ts",
  ]) {
    const source = readFileSync(file, "utf8");

    assert.match(source, /error:\s*"INVALID_BODY"/);
    assert.match(source, /message:\s*"[^"]*[А-Яа-яЁё][^"]*"/);
    assert.match(source, /zodErrorToUserFacingIssues/);
    assert.match(source, /\bissues\b/);
    assert.doesNotMatch(source, /Too big|Too small|expected string|invalid_type/);
  }
});

test("HR assistant persistence helpers scope thread queries by company, visibility, and user role", () => {
  const source = readFileSync("lib/hr-assistant/persistence.ts", "utf8");

  assert.match(source, /import "server-only"/);
  assert.match(source, /\.eq\("company_id", ctx\.companyId\)/);
  assert.match(source, /visibility:\s*"private"/);
  assert.match(source, /ctx\.role !== "admin"/);
  assert.match(source, /\.eq\("owner_id", ctx\.userId\)/);
  assert.match(source, /data\.visibility !== "private"/);
  assert.match(source, /data\.owner_id !== ctx\.userId/);
});

test("HR assistant thread listing rechecks scoped entity access before returning rows", () => {
  const source = readFileSync("lib/hr-assistant/persistence.ts", "utf8");

  assert.match(source, /const visibleThreads = \[\]/);
  assert.match(source, /for \(const thread of (?:data|threads) \?\? \[\]\)/);
  assert.match(source, /await requireAssistantScopeAccess\(admin, ctx, \{\s*scopeType: thread\.scope_type,\s*scopeId: thread\.scope_id,\s*\}\)/);
  assert.match(source, /visibleThreads\.push\(thread\)/);
  assert.match(source, /return visibleThreads/);
});

test("HR assistant persistence reuses existing entity access helpers for scoped threads", () => {
  const source = readFileSync("lib/hr-assistant/persistence.ts", "utf8");

  assert.match(source, /requireAssistantScopeAccess/);
  assert.match(source, /input\.scopeType === "client_account"[\s\S]+ASSISTANT_SCOPE_NOT_SUPPORTED_YET/);
  assert.match(source, /requireVacancyAccess\(admin, ctx, input\.scopeId\)/);
  assert.match(source, /requireCandidateAccess\(admin, ctx, input\.scopeId\)/);
  assert.match(source, /requireInterviewReadAccess/);
});

test("HR assistant routes map unsupported future scopes to user-safe responses", () => {
  for (const file of routeFiles) {
    const source = readFileSync(file, "utf8");

    assert.match(source, /ASSISTANT_SCOPE_NOT_SUPPORTED_YET/);
    assert.match(source, /UNSUPPORTED_SCOPE/);
    assert.match(source, /Этот контекст пока нельзя использовать для чата\./);
  }
});

test("HR assistant thread routes keep Next route params compatible", () => {
  for (const file of [
    "app/api/hr-assistant/threads/[id]/route.ts",
    "app/api/hr-assistant/threads/[id]/messages/route.ts",
  ]) {
    const source = readFileSync(file, "utf8");

    assert.match(source, /params:\s*Promise<\{ id: string \}>\s*\|\s*\{ id: string \}/);
    assert.match(source, /await Promise\.resolve\(params\)/);
  }
});

test("HR assistant thread listing supports archived visibility, full chat search, and pinned ordering", () => {
  const route = readFileSync("app/api/hr-assistant/threads/route.ts", "utf8");
  const persistence = readFileSync("lib/hr-assistant/persistence.ts", "utf8");

  assert.match(route, /searchParams/);
  assert.match(route, /includeArchived/);
  assert.match(route, /search/);
  assert.match(persistence, /ListAssistantThreadsInput/);
  assert.match(persistence, /includeArchived/);
  assert.match(persistence, /searchQuery/);
  assert.match(persistence, /pinned_at/);
  assert.match(persistence, /assistant_messages/);
  assert.match(persistence, /message_snippet/);
  assert.match(persistence, /search_match_type/);
  assert.match(persistence, /order\("pinned_at"[\s\S]+nullsFirst:\s*false/);
});

test("HR assistant thread search validates short queries and keeps archived results opt-in", () => {
  const route = readFileSync("app/api/hr-assistant/threads/route.ts", "utf8");
  const persistence = readFileSync("lib/hr-assistant/persistence.ts", "utf8");

  assert.match(route, /THREAD_SEARCH_MIN_MESSAGE\s*=\s*"Введите минимум 2 символа для поиска"/);
  assert.match(route, /\.min\(2,\s*THREAD_SEARCH_MIN_MESSAGE\)/);
  assert.match(route, /\.transform\(\(value\)\s*=>\s*value === undefined \? undefined : value === "true"\)/);
  assert.match(route, /const includeArchived = parsedQuery\.data\.includeArchived;/);
  assert.doesNotMatch(route, /parsedQuery\.data\.includeArchived \?\? true/);
  assert.match(persistence, /const includeArchived = input\.includeArchived \?\? false;/);
});

test("HR assistant full-text search limits message matches to accessible threads first", () => {
  const source = readFileSync("lib/hr-assistant/persistence.ts", "utf8");
  const searchStart = source.indexOf("async function searchAssistantThreads");
  assert.notEqual(searchStart, -1, "searchAssistantThreads was not found");

  const searchSource = source.slice(searchStart, source.indexOf("export async function createAssistantThread", searchStart));
  assert.match(searchSource, /loadAccessibleAssistantThreadSearchPool\(admin, ctx, includeArchived\)/);
  assert.match(searchSource, /const accessibleThreadIds = accessibleThreads\.map/);
  assert.match(searchSource, /\.from\("assistant_messages"\)[\s\S]+\.in\("thread_id", threadIdChunk\)/);
  assert.ok(
    searchSource.indexOf("loadAccessibleAssistantThreadSearchPool") < searchSource.indexOf('.from("assistant_messages")'),
    "message search must happen after accessible thread filtering"
  );
});

test("HR assistant thread patch route supports pinning and archiving with user-safe messages", () => {
  const route = readFileSync("app/api/hr-assistant/threads/[id]/route.ts", "utf8");

  assert.match(route, /pinned/);
  assert.match(route, /pinned_at/);
  assert.match(route, /archived/);
  assert.match(route, /Выберите, нужно ли закрепить чат/);
  assert.match(route, /Выберите, нужно ли архивировать чат/);
  assert.match(route, /select\("id,title,scope_type,scope_id,mode,summary,updated_at,archived_at,pinned_at,owner_id,visibility"\)/);
});

test("HR assistant chat route generates a useful title from the first user message", () => {
  const route = readFileSync("app/api/hr-assistant/chat/route.ts", "utf8");
  const persistence = readFileSync("lib/hr-assistant/persistence.ts", "utf8");

  assert.match(route, /maybeNameThreadFromFirstUserMessage/);
  assert.match(route, /lastUserText/);
  assert.match(persistence, /generateAssistantThreadTitle/);
  assert.match(persistence, /updateAssistantThreadTitleFromFirstMessage/);
  assert.match(persistence, /ASSISTANT_THREAD_UPDATE_FAILED/);
  assert.doesNotMatch(route, /title:\s*"Новый чат"/);
});

test("HR assistant CRM tools reuse existing access helpers", () => {
  const crmReadSource = readFileSync("lib/hr-assistant/tools/crm-read.ts", "utf8");
  const candidateReadSource = readFileSync("lib/hr-assistant/tools/candidate-read.ts", "utf8");
  const vacancyReadSource = readFileSync("lib/hr-assistant/tools/vacancy-read.ts", "utf8");
  const source = `${crmReadSource}\n${candidateReadSource}\n${vacancyReadSource}`;

  assert.match(vacancyReadSource, /requireVacancyAccess/);
  assert.match(candidateReadSource, /requireCandidateAccess/);
  assert.match(source, /ctx\.role !== "admin"/);
  assert.match(source, /\.eq\("created_by", ctx\.userId\)/);
  assert.match(source, /\.eq\("company_id", ctx\.companyId\)/);
});

test("HR assistant candidate list exposes pagination metadata to avoid treating the first page as the full CRM", () => {
  const candidateReadSource = readFileSync("lib/hr-assistant/tools/candidate-read.ts", "utf8");
  const toolsSource = readFileSync("lib/hr-assistant/tools.ts", "utf8");

  assert.match(candidateReadSource, /ASSISTANT_CANDIDATE_LIST_DEFAULT_LIMIT/);
  assert.match(candidateReadSource, /\.select\("id,name,position,status,vacancy_id,match_percentage,desired_salary_text,source,created_by,applied_at",\s*\{\s*count:\s*"exact"\s*\}\)/);
  assert.match(candidateReadSource, /pageInfo:\s*\{\s*limit,\s*nextCursor,\s*hasMore,\s*total,\s*totalExact:\s*true/);
  assert.match(candidateReadSource, /aggregations:\s*includeAggregations\s*\?\s*\{\s*statusCounts/);
  assert.match(toolsSource, /const result = await listAccessibleCandidatesForAssistant/);
  assert.match(toolsSource, /return \{ \.\.\.result,\s*toolRunId:\s*run\.id \}/);
});

test("HR assistant tool registry exposes AI SDK tools with guarded execute functions", () => {
  const source = readFileSync("lib/hr-assistant/tools.ts", "utf8");
  assert.match(source, /tool\(/);
  assert.match(source, /inputSchema/);
  assert.match(source, /execute:/);
  assert.doesNotMatch(source, /parameters:/);
  assert.match(source, /createAssistantToolRun/);
  assert.match(source, /writeAssistantAuditEvent/);
  assert.match(source, /auto_approved/);
  assert.match(source, /assistant_action_not_supported/);
  assert.match(source, /listAccessibleVacanciesForAssistant/);
  assert.match(source, /getAccessibleCandidateForAssistant/);
  assert.match(source, /buildDraftInstruction/);
});

test("shared tool-run helper scopes tool runs and audit events", () => {
  const source = readFileSync("lib/hr-assistant/tool-runs.ts", "utf8");
  assert.match(source, /createAssistantToolRun/);
  assert.match(source, /requireAssistantToolRunAccess/);
  assert.match(source, /writeAssistantAuditEvent/);
  assert.match(source, /requireAssistantThreadAccess/);
  assert.match(source, /\.eq\("company_id", ctx\.companyId\)/);
  assert.match(source, /company_id: ctx\.companyId/);
  assert.match(source, /actor_user_id: ctx\.userId/);
  assert.match(source, /ASSISTANT_AUDIT_WRITE_FAILED/);
});

test("HR assistant AI analysis tool checks access and credits before enqueue", () => {
  const source = readFileSync("lib/hr-assistant/tools/ai-analysis.ts", "utf8");
  assert.match(source, /requireCandidateAccess/);
  assert.match(source, /loadCompanyPlanSnapshot/);
  assert.match(source, /isAiAllowed/);
  assert.match(source, /getAvailableCredits/);
  assert.match(source, /jobs_ai/);
  assert.match(source, /queued|processing|done/);
  assert.match(source, /reason:\s*"lookup"/);
  assert.doesNotMatch(source, /if \(error\) return false/);
  assert.match(source, /createAssistantToolRun/);
  assert.match(source, /approvalStatus:\s*"pending"/);
  assert.match(source, /enqueue_ai_job_with_credit_reserve/);
});

test("HR assistant tool registry exposes AI analysis and calendar tools", () => {
  const source = readFileSync("lib/hr-assistant/tools.ts", "utf8");
  assert.match(source, /start_candidate_ai_analysis/);
  assert.match(source, /list_accessible_interviews/);
  assert.match(source, /build_interview_prep/);
  assert.match(source, /proposeAiAnalysisFromAssistant/);
  assert.match(source, /listAccessibleInterviewsForAssistant/);
});

test("HR assistant prompt forbids treating pages as complete CRM results", () => {
  const source = readFileSync("app/api/hr-assistant/chat/route.ts", "utf8");

  assert.match(source, /pageInfo/);
  assert.match(source, /не считай страницу полным списком/i);
  assert.match(source, /hasMore/);
});

test("HR assistant prompt requires dashboard links and user-facing field labels", () => {
  const route = readFileSync("app/api/hr-assistant/chat/route.ts", "utf8");
  const tools = readFileSync("lib/hr-assistant/tools.ts", "utf8");

  assert.match(route, /href/);
  assert.match(route, /markdown-ссыл/);
  assert.match(route, /первом упоминании/);
  assert.match(route, /Не показывай raw-названия полей/);
  assert.match(route, /matchPercentage/);
  assert.match(route, /оценка|процент совпадения/);
  assert.match(tools, /items\[\]\.href/);
  assert.match(tools, /ready dashboard card link/);
});

test("HR assistant prompt treats retrieved and CRM content as untrusted data", () => {
  const route = readFileSync("app/api/hr-assistant/chat/route.ts", "utf8");
  const context = readFileSync("lib/hr-assistant/context.ts", "utf8");

  assert.match(route, /Текущий запрос пользователя[\s\S]+рабочая инструкция/);
  assert.match(route, /вставляет или цитирует как данные/);
  assert.match(route, /недоверенн/);
  assert.match(route, /не инструкц/);
  assert.match(route, /Игнорируй[\s\S]+system\/developer/);
  assert.match(route, /обойти approval/);
  assert.match(route, /вне разрешенных tools|вне разрешённых tools/);
  assert.match(context, /Untrusted retrieved CRM facts/);
  assert.match(context, /Untrusted retrieved hiiire docs/);
});

test("read tool audit previews include scope and page metadata", () => {
  const source = readFileSync("lib/hr-assistant/tools.ts", "utf8");

  assert.match(source, /resultPreview/);
  assert.match(source, /pageInfo/);
  assert.match(source, /scope/);
  assert.match(source, /itemCount/);
});

test("chat route wires retrieval and AI SDK tools into streamText", () => {
  const source = readFileSync("app/api/hr-assistant/chat/route.ts", "utf8");
  assert.match(source, /retrieveHrAssistantContext/);
  assert.match(source, /createHrAssistantTools/);
  assert.match(source, /tools:/);
  assert.match(source, /stopWhen:\s*stepCountIs\(5\)/);
  assert.match(source, /listRecentAssistantMessages/);
  assert.match(source, /saveAssistantUserMessageOnce/);
  assert.match(source, /clientMessageId/);
});

test("chat route accepts AI SDK tool parts after tool use", () => {
  const source = readFileSync("app/api/hr-assistant/chat/route.ts", "utf8");

  assert.match(source, /UiMessagePartSchema/);
  assert.match(source, /\.passthrough\(\)/);
  assert.match(source, /if \(part\.type !== "text"\) return/);
  assert.match(source, /const text = \(part as \{ text\?: unknown \}\)\.text/);
  assert.doesNotMatch(source, /type:\s*z\.literal\("text"/);
});

test("chat route accepts UI message metadata from the client runtime", () => {
  const source = readFileSync("app/api/hr-assistant/chat/route.ts", "utf8");
  const messageSchemaSource = source.slice(
    source.indexOf("const UiMessageSchema = z"),
    source.indexOf("const BodySchema = z")
  );

  assert.match(messageSchemaSource, /\.passthrough\(\);/);
  assert.doesNotMatch(messageSchemaSource, /\.strict\(\);/);
});

test("retrieval helper reuses guarded CRM helpers", () => {
  const source = readFileSync("lib/hr-assistant/retrieval.ts", "utf8");
  assert.match(source, /getAccessibleVacancyForAssistant/);
  assert.match(source, /getAccessibleCandidateForAssistant/);
  assert.match(source, /retrieveProductHelp/);
});

test("HR assistant calendar tool is read-prep only in first slice", () => {
  const source = readFileSync("lib/hr-assistant/tools/calendar.ts", "utf8");
  assert.match(source, /listAccessibleInterviewsForAssistant/);
  assert.match(source, /requireInterviewReadAccess/);
  assert.match(source, /getInterviewRangeQueryWindow/);
  assert.match(source, /interviewOverlapsRange/);
  assert.match(source, /interviewer_only/);
  assert.doesNotMatch(source, /if \(level\) accessible\.push\(\{ \.\.\.row, accessLevel: level \}\)/);
  assert.doesNotMatch(source, /create_interview_mvp/);
  assert.doesNotMatch(source, /update_interview_mvp/);
});
