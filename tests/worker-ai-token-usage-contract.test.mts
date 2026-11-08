import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("AI providers expose provider token usage for analysis persistence", () => {
  const deepseek = readFileSync("worker/src/deepseek.ts", "utf8");
  const openai = readFileSync("worker/src/openai.ts", "utf8");
  const gemini = readFileSync("worker/src/gemini.ts", "utf8");

  assert.match(deepseek, /tokensIn:\s*resp\.usage\?\.prompt_tokens\s*\?\?\s*null/);
  assert.match(deepseek, /tokensOut:\s*resp\.usage\?\.completion_tokens\s*\?\?\s*null/);

  assert.match(openai, /tokensIn:\s*resp\.usage\?\.input_tokens\s*\?\?\s*null/);
  assert.match(openai, /tokensOut:\s*resp\.usage\?\.output_tokens\s*\?\?\s*null/);

  assert.match(gemini, /tokensIn:\s*resp\.usageMetadata\?\.promptTokenCount\s*\?\?\s*null/);
  assert.match(gemini, /tokensOut:\s*sumTokenCounts\(resp\.usageMetadata\?\.candidatesTokenCount,\s*resp\.usageMetadata\?\.thoughtsTokenCount\)/);
});

test("worker persists token usage through finalize RPC and fallback upsert", () => {
  const source = readFileSync("worker/src/index.ts", "utf8");

  assert.match(source, /const \{ analysis, model, provider, tokensIn, tokensOut \} = await analyzeResume/);
  assert.match(source, /tokens_in:\s*tokensIn/);
  assert.match(source, /tokens_out:\s*tokensOut/);
  assert.match(source, /tokensIn(?:\s*:\s*tokensIn)?\s*,/);
  assert.match(source, /tokensOut(?:\s*:\s*tokensOut)?\s*,/);
  assert.match(source, /tokens_in:\s*input\.tokensIn/);
  assert.match(source, /tokens_out:\s*input\.tokensOut/);
  assert.match(source, /rpc_legacy_token_patch/);
  assert.match(source, /updateAnalysisTokenUsageBestEffort\(job\.candidate_id,\s*tokensIn,\s*tokensOut\)/);
});

test("finalize_ai_job writes token usage into ai_analyses", () => {
  const sql = readFileSync("supabase/sql/ai_jobs.sql", "utf8");

  assert.match(sql, /tokens_in integer default null/i);
  assert.match(sql, /tokens_out integer default null/i);
  assert.match(sql, /insert into public\.ai_analyses \([\s\S]*\btokens_in\b[\s\S]*\btokens_out\b/i);
  assert.match(sql, /\) values \([\s\S]*\btokens_in\b[\s\S]*\btokens_out\b[\s\S]*\)/i);
  assert.match(sql, /tokens_in = excluded\.tokens_in/i);
  assert.match(sql, /tokens_out = excluded\.tokens_out/i);
});
