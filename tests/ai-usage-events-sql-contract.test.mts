import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,export%20%7B%7D", shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      const localPath = `${process.cwd()}/${specifier.slice(2)}`;
      return {
        url: pathToFileURL(/\.[cm]?tsx?$/.test(localPath) ? localPath : `${localPath}.ts`).href,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { recordAiUsageEventBestEffort } = await import("../lib/ai/usage-events.ts");

const sql = () => readFileSync("supabase/sql/ai_usage_events.sql", "utf8");

test("ai_usage_events SQL is server-only and privacy-safe", () => {
  const source = sql();
  assert.match(source, /create table if not exists public\.ai_usage_events/i);
  assert.match(source, /alter table public\.ai_usage_events enable row level security/i);
  assert.match(source, /for all\s+using \(false\)\s+with check \(false\)/i);
  assert.match(source, /candidate_profile_parse/i);
  assert.match(source, /tokens_in integer/i);
  assert.match(source, /tokens_out integer/i);
  assert.match(source, /drop column if exists idempotency_key_hash/i);
  assert.doesNotMatch(source, /request_hash|resume_text|resumeText|prompt|raw_output|model_output|contact_value|phone|email|file_name|provider_payload|idempotency_key_hash text/i);
});

test("ai_usage_events SQL has useful constraints and indexes", () => {
  const source = sql();
  assert.match(source, /check \(tokens_in is null or tokens_in >= 0\)/i);
  assert.match(source, /check \(tokens_out is null or tokens_out >= 0\)/i);
  assert.match(source, /check \(attempts >= 0\)/i);
  assert.match(source, /idx_ai_usage_events_company_created/i);
  assert.match(source, /idx_ai_usage_events_task_created/i);
  assert.match(source, /idx_ai_usage_events_request_id/i);
});

test("recordAiUsageEventBestEffort inserts only safe usage metadata", async () => {
  const rows: unknown[] = [];
  const admin = {
    from(table: string) {
      assert.equal(table, "ai_usage_events");
      return {
        async insert(row: unknown) {
          rows.push(row);
          return { error: null };
        },
      };
    },
  };

  await recordAiUsageEventBestEffort(admin as never, {
    companyId: "company-id",
    userId: "user-id",
    candidateId: "candidate-id",
    requestId: "request-id",
    task: "candidate_profile_parse",
    provider: "deepseek",
    model: "deepseek-v4-flash",
    status: "success",
    fallbackReason: null,
    attempts: 2,
    tokensIn: 30,
    tokensOut: 12,
    durationMs: 450,
  });

  assert.deepEqual(rows, [
    {
      company_id: "company-id",
      user_id: "user-id",
      candidate_id: "candidate-id",
      request_id: "request-id",
      task: "candidate_profile_parse",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      status: "success",
      fallback_reason: null,
      attempts: 2,
      tokens_in: 30,
      tokens_out: 12,
      duration_ms: 450,
    },
  ]);
});

test("recordAiUsageEventBestEffort logs only safe failure code or name outside production", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";

  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args);
  };

  try {
    const admin = {
      from() {
        return {
          async insert() {
            return {
              error: {
                code: "42501",
                message: "resume Иван Иванов ivan@example.com should not be logged",
                details: "prompt and raw output should not be logged",
              },
            };
          },
        };
      },
    };

    await recordAiUsageEventBestEffort(admin as never, {
      companyId: "company-id",
      userId: "user-id",
      candidateId: null,
      requestId: "request-id",
      task: "candidate_profile_parse",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      status: "fallback",
      fallbackReason: "rate_limit",
      attempts: 1,
      tokensIn: null,
      tokensOut: null,
      durationMs: 0,
    });

    const joined = warnings.map((args) => JSON.stringify(args)).join("\n");
    assert.match(joined, /42501/);
    assert.doesNotMatch(joined, /Иван|ivan@example\.com|prompt|raw output|resume/i);
  } finally {
    console.warn = originalWarn;
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  }
});
