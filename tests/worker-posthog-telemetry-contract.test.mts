import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("worker has a PostHog telemetry helper with safe defaults", () => {
  const source = readFileSync("worker/src/telemetry.ts", "utf8");

  assert.match(source, /import \{ PostHog \} from "posthog-node";/);
  assert.match(source, /NEXT_PUBLIC_POSTHOG_KEY/);
  assert.match(source, /NEXT_PUBLIC_POSTHOG_HOST/);
  assert.match(source, /flushAt:\s*1/);
  assert.match(source, /flushInterval:\s*0/);
  assert.match(source, /captureImmediate/);
  assert.match(source, /captureExceptionImmediate/);
  assert.match(source, /sanitizeWorkerException/);
  assert.doesNotMatch(source, /captureExceptionImmediate\(err,/);
  assert.match(source, /groups:\s*getCompanyGroup\(properties\)/);
  assert.match(source, /groupIdentify/);
  assert.match(source, /groupType:\s*"company"/);
  assert.match(source, /\$process_person_profile":\s*false/);
  assert.match(source, /safeTelemetryError/);
  assert.doesNotMatch(source, /resume_text|resumeText|vacancyDescription|rawText|prompt/i);
});

test("worker sends lifecycle and job telemetry without candidate content", () => {
  const source = readFileSync("worker/src/index.ts", "utf8");

  assert.match(source, /captureWorkerEvent\("worker_started"/);
  assert.match(source, /captureWorkerException\(err,\s*"worker_loop_error"/);
  assert.match(source, /captureWorkerException\(err,\s*"worker_process_job_unhandled"/);
  assert.match(source, /captureWorkerEvent\("ai_job_claimed"/);
  assert.match(source, /captureWorkerEvent\("ai_job_completed"/);
  assert.match(source, /captureWorkerEvent\("ai_analysis_completed"/);
  assert.match(source, /captureWorkerEvent\("ai_analysis_failed"/);
  assert.match(source, /captureWorkerEvent\("company_activated"/);
  assert.match(source, /captureWorkerException\(err,\s*"ai_job_failed"/);
  assert.match(source, /captureWorkerEvent\("ai_job_requeued"/);
  assert.match(source, /captureWorkerEvent\("ai_job_terminal_failed"/);
  assert.match(source, /captureWorkerException\(err,\s*"openai_failed_fallback_to_deepseek"/);
  assert.match(source, /registerWorkerProcessErrorHandlers/);
  assert.doesNotMatch(source, /captureWorkerEvent\([^)]*resume_text/i);
  assert.doesNotMatch(source, /captureWorkerEvent\([^)]*rawText/i);
});

test("worker HH sync failures include safe request diagnostics in logs and PostHog", () => {
  const source = readFileSync("worker/src/hh-sync.ts", "utf8");
  const telemetryBlock = source.match(/function captureHhSyncFailureTelemetry[\s\S]+?\r?\n}\r?\n\r?\nasync function/)?.[0] ?? "";

  assert.match(source, /captureWorkerEvent/);
  assert.match(source, /captureWorkerException/);
  assert.match(source, /hh_sync_failed/);
  assert.match(source, /hh_request_path/);
  assert.match(source, /hh_request_query_keys/);
  assert.match(source, /hh_error_kind/);
  assert.match(source, /cause=/);
  assert.match(source, /und_err_headers_overflow/);
  assert.match(source, /console\.warn\("\[worker\]\[hh\] sync account error"/);
  assert.match(source, /getHhRequestLogContext\(accountErr\)/);
  assert.doesNotMatch(telemetryBlock, /accessToken|refreshToken|Authorization|resume_text|resumeText|rawText|description/i);
});

test("worker deployment docs mention PostHog env for hiiire-worker", () => {
  const deployment = readFileSync("DEPLOYMENT.md", "utf8");
  const envExample = readFileSync(".env.example", "utf8");

  assert.match(deployment, /hiiire-worker[\s\S]*NEXT_PUBLIC_POSTHOG_KEY/);
  assert.match(deployment, /hiiire-worker[\s\S]*NEXT_PUBLIC_POSTHOG_HOST/);
  assert.match(deployment, /ai_job_claimed/);
  assert.match(deployment, /ai_job_completed/);
  assert.match(deployment, /ai_job_failed/);
  assert.match(envExample, /NEXT_PUBLIC_POSTHOG_KEY/);
  assert.match(envExample, /NEXT_PUBLIC_POSTHOG_HOST/);
});
