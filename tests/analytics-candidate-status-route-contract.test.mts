import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const statusRoute = () => readFileSync("app/api/candidates/[id]/status/route.ts", "utf8");
const candidateService = () => readFileSync("services/data/candidates.ts", "utf8");
const candidateCreateRoute = () => readFileSync("app/api/candidates/route.ts", "utf8");
const hhCandidateSyncRoute = () => readFileSync("app/api/integrations/hh/sync/candidates/route.ts", "utf8");
const hhCandidateSyncPreviewRoute = () => readFileSync("app/api/integrations/hh/sync/candidates/preview/route.ts", "utf8");
const analyticsSql = () => readFileSync("supabase/sql/analytics_v1_foundation.sql", "utf8");

test("candidate status route is CSRF guarded and writes status through atomic RPC", () => {
  const source = statusRoute();

  assert.match(source, /requireSameOriginRequest/);
  assert.match(source, /const csrfRes = requireSameOriginRequest\(req\)/);
  assert.match(source, /if \(!csrfRes\.ok\) return csrfRes\.response/);
  assert.match(source, /requireCompanyContext/);
  assert.match(source, /requireCandidateAccess/);
  assert.match(source, /z\.enum\(\[[\s\S]*"new"[\s\S]*"reviewing"[\s\S]*"rejected"[\s\S]*\]\)/);
  assert.match(source, /rejectionReasonId/);
  assert.match(source, /rejectionComment/);
  assert.match(source, /Проверьте статус кандидата/);

  assert.match(source, /\.rpc\("analytics_update_candidate_status"/);
  assert.match(source, /p_candidate_id:\s*candidateId/);
  assert.match(source, /p_company_id:\s*ctx\.companyId/);
  assert.match(source, /p_actor_id:\s*ctx\.userId/);
  assert.match(source, /p_rejection_reason_id:\s*body\.rejectionReasonId\s*\?\?\s*null/);
  assert.match(source, /p_rejection_comment:\s*normalizedRejectionComment/);
  assert.doesNotMatch(source, /\.from\("candidates"\)[\s\S]*\.update\([\s\S]*status[\s\S]*updated_at/);
  assert.doesNotMatch(source, /\.from\("pipeline_events"\)[\s\S]*\.insert\(/);
  assert.match(source, /captureBusinessEvent/);
  assert.match(source, /candidate_status_changed/);
  assert.doesNotMatch(source, /candidate_status_changed"\s+as\s+any/);
});

test("status RPC validates company access and preserves structured rejection reason names atomically", () => {
  const sql = analyticsSql();

  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.analytics_update_candidate_status/i);
  assert.match(sql, /security\s+definer/i);
  assert.match(sql, /set\s+search_path\s*=\s*''/i);
  assert.match(sql, /from\s+public\.candidates\s+c[\s\S]*join\s+public\.vacancies\s+v\s+on\s+v\.id\s*=\s*c\.vacancy_id[\s\S]*v\.company_id\s*=\s*p_company_id/i);
  assert.match(sql, /for\s+update/i);
  assert.match(sql, /from\s+public\.rejection_reasons[\s\S]*company_id\s*=\s*p_company_id[\s\S]*is_active\s+is\s+true/i);
  assert.match(sql, /insert\s+into\s+public\.pipeline_events[\s\S]*rejection_reason_id[\s\S]*rejection_reason[\s\S]*v_rejection_reason_name/i);
  assert.match(sql, /jsonb_build_object\('source',\s*'candidate_status_route'[\s\S]*'rejection_comment'/i);
  assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.analytics_update_candidate_status/i);
  assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.analytics_update_candidate_status[\s\S]*to\s+service_role/i);
});

test("browser status update goes through guarded API route instead of direct Supabase write", () => {
  const source = candidateService();
  const fnStart = source.indexOf("export async function updateCandidateStatus");
  assert.notEqual(fnStart, -1);
  const fnEnd = source.indexOf("export async function createCandidateAndQueueAnalysis", fnStart);
  assert.notEqual(fnEnd, -1);
  const fnSource = source.slice(fnStart, fnEnd);

  assert.match(fnSource, /fetch\(`\/api\/candidates\/\$\{encodeURIComponent\(candidateId\)\}\/status`/);
  assert.match(fnSource, /method:\s*"PATCH"/);
  assert.match(fnSource, /JSON\.stringify\(\{[\s\S]*status/);
  assert.doesNotMatch(fnSource, /\.from\("candidates"\)[\s\S]*\.update\(\{\s*status/);
  assert.match(fnSource, /issues\?\.\[0\]\?\.message/);
});

test("candidate creation route records a candidate_created pipeline event only for non-replayed creates", () => {
  const source = candidateCreateRoute();
  const branchStart = source.indexOf("if (candidateId && !replayed)");
  const branchEnd = source.indexOf("if (jobId && mode ===", branchStart);
  assert.notEqual(branchStart, -1);
  assert.notEqual(branchEnd, -1);
  const nonReplayBranch = source.slice(branchStart, branchEnd);

  assert.match(nonReplayBranch, /\.from\("pipeline_events"\)\.insert\(/);
  assert.match(nonReplayBranch, /event_type:\s*"candidate_created"/);
  assert.match(nonReplayBranch, /from_status:\s*null/);
  assert.match(nonReplayBranch, /to_status:\s*"new"/);
  assert.match(nonReplayBranch, /candidate_id:\s*candidateId/);
  assert.match(nonReplayBranch, /vacancy_id:\s*vacancy\.id/);
  assert.match(nonReplayBranch, /actor_id:\s*ctx\.userId/);
  assert.match(nonReplayBranch, /metadata:[\s\S]*source[\s\S]*mode/);
});

test("HH candidate sync route records candidate_created pipeline events for imported rows", () => {
  const source = hhCandidateSyncRoute();
  const branchStart = source.indexOf("if (createdCandidate?.id && extractedContacts.length > 0)");
  const branchEnd = source.indexOf("created++;", branchStart);
  assert.notEqual(branchStart, -1);
  assert.notEqual(branchEnd, -1);
  const createdCandidateBranch = source.slice(branchStart, branchEnd + "created++;".length);

  assert.match(createdCandidateBranch, /\.from\("pipeline_events"\)\.insert\(/);
  assert.match(createdCandidateBranch, /event_type:\s*"candidate_created"/);
  assert.match(createdCandidateBranch, /to_status:\s*"new"/);
  assert.match(createdCandidateBranch, /candidate_id:\s*createdCandidate\.id/);
  assert.match(createdCandidateBranch, /vacancy_id:\s*vac\.id/);
  assert.match(createdCandidateBranch, /actor_id:\s*ctx\.userId/);
  assert.match(createdCandidateBranch, /occurred_at:\s*appliedAt/);
  assert.match(createdCandidateBranch, /metadata:[\s\S]*hhru_resume_id/);
});

test("HH candidate sync route does not expose raw unknown exception messages", () => {
  const source = hhCandidateSyncRoute();
  const catchStart = source.lastIndexOf("} catch (e) {");
  assert.notEqual(catchStart, -1);
  const catchSource = source.slice(catchStart);

  assert.match(catchSource, /HH_SYNC_FAILED/);
  assert.match(catchSource, /Не удалось синхронизировать кандидатов/);
  assert.doesNotMatch(catchSource, /const msg = e instanceof Error \? e\.message : "INTERNAL_ERROR"/);
  assert.doesNotMatch(catchSource, /NextResponse\.json\(\{\s*error:\s*msg\s*\}/);
  assert.doesNotMatch(source, /message:\s*e instanceof Error \? e\.message/);
  assert.match(source, /Не удалось обновить контакты кандидата/);
  assert.match(source, /Не удалось сохранить контакты кандидата/);
});

test("HH candidate sync vacancy lookups paginate past the Supabase REST row cap", () => {
  for (const source of [hhCandidateSyncRoute(), hhCandidateSyncPreviewRoute()]) {
    assert.match(source, /loadAllSupabaseRows/);
    assert.match(source, /runPageQuery:\s*\(from,\s*to\)/);
    assert.match(source, /\.order\("id",\s*\{\s*ascending:\s*true\s*\}\)/);
    assert.match(source, /\.range\(from,\s*to\)/);
    assert.doesNotMatch(source, /const\s+\{\s*data:\s*vacsRaw,\s*error:\s*vacErr\s*\}\s*=\s*await\s+admin/);
  }
});
