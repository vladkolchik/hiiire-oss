import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = [
  readFileSync("supabase/sql/hr_assistant_v1.sql", "utf8"),
  readFileSync("supabase/sql/hr_assistant_v2_policy_performance.sql", "utf8"),
  readFileSync("supabase/sql/hr_assistant_v3_policy_select_helpers.sql", "utf8"),
  readFileSync("supabase/sql/hr_assistant_v4_message_idempotency.sql", "utf8"),
  readFileSync("supabase/sql/hr_assistant_v5_thread_management.sql", "utf8"),
].join("\n\n");

const assistantSqlFiles = [
  "hr_assistant_v1.sql",
  "hr_assistant_v2_policy_performance.sql",
  "hr_assistant_v3_policy_select_helpers.sql",
  "hr_assistant_v4_message_idempotency.sql",
  "hr_assistant_v5_thread_management.sql",
] as const;

const coreTables = [
  "assistant_threads",
  "assistant_messages",
  "assistant_context_items",
  "assistant_tool_runs",
  "assistant_audit_events",
] as const;

function tableDefinition(table: (typeof coreTables)[number]) {
  const match = sql.match(new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`, "i"));
  assert.ok(match, `expected create table statement for ${table}`);
  return match[1];
}

test("assistant SQL creates core persistence tables with RLS", () => {
  for (const table of coreTables) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
});

test("assistant SQL scopes every core table to company", () => {
  for (const table of coreTables) {
    assert.match(
      tableDefinition(table),
      /company_id uuid not null references public\.companies\(id\) on delete cascade/i,
      `${table} must be company scoped`
    );
  }
});

test("assistant SQL includes future thread scope columns", () => {
  const threads = tableDefinition("assistant_threads");

  assert.match(threads, /client_account_id uuid/i);
  assert.match(threads, /scope_type text not null default 'company'/i);
  assert.match(threads, /scope_id uuid/i);
  assert.match(threads, /mode text not null default 'general'/i);
});

test("assistant SQL denies browser inserts for all assistant tables", () => {
  for (const table of coreTables) {
    assert.match(
      sql,
      new RegExp(`create policy [\\w_"]+[\\s\\S]*?on public\\.${table}[\\s\\S]*?for insert[\\s\\S]*?with check \\(false\\)`, "i"),
      `${table} must deny browser inserts`
    );
  }
});

test("assistant SQL does not add browser update or delete policies", () => {
  const assistantPolicyLines = sql
    .split(/\r?\n/)
    .filter((line) => /create policy/i.test(line) || /\bfor (update|delete)\b/i.test(line))
    .filter((line) => /assistant_/i.test(line) || /\bfor (update|delete)\b/i.test(line));

  assert.equal(assistantPolicyLines.some((line) => /\bfor update\b/i.test(line)), false);
  assert.equal(assistantPolicyLines.some((line) => /\bfor delete\b/i.test(line)), false);
});

test("assistant SQL keeps private chats visible only to owner or admins", () => {
  assert.match(sql, /visibility = 'company'/i);
  assert.match(sql, /owner_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /p\.role = 'admin'/i);
  assert.match(sql, /company_id = \(select private\.current_user_company_id\(\)\)/i);
});

test("assistant child tables inherit thread visibility and company checks", () => {
  for (const table of ["assistant_messages", "assistant_context_items", "assistant_tool_runs"] as const) {
    assert.match(
      sql,
      new RegExp(
        `exists \\(\\s*select 1\\s*from public\\.assistant_threads t[\\s\\S]+t\\.id = ${table}\\.thread_id[\\s\\S]+t\\.company_id = ${table}\\.company_id[\\s\\S]+t\\.visibility = 'company'[\\s\\S]+t\\.owner_id = \\(select auth\\.uid\\(\\)\\)`,
        "i"
      )
    );
  }
});

test("assistant audit events are selectable by company admins only", () => {
  assert.match(
    sql,
    /create policy assistant_audit_select_company_admin[\s\S]+on public\.assistant_audit_events[\s\S]+for select[\s\S]+p\.company_id = assistant_audit_events\.company_id[\s\S]+p\.role = 'admin'/i
  );
});

test("assistant SQL indexes foreign keys used outside existing query indexes", () => {
  for (const index of [
    "idx_assistant_threads_owner",
    "idx_assistant_messages_company_created",
    "idx_assistant_messages_created_by",
    "idx_assistant_context_company_entity",
    "idx_assistant_context_added_by",
    "idx_assistant_tool_runs_company_created",
    "idx_assistant_tool_runs_message",
    "idx_assistant_tool_runs_approved_by",
    "idx_assistant_audit_thread",
    "idx_assistant_audit_tool_run",
    "idx_assistant_audit_actor",
  ]) {
    assert.match(sql, new RegExp(`create index if not exists ${index}`, "i"));
  }
});

test("assistant SQL enforces client message idempotency for user messages", () => {
  assert.match(sql, /create unique index if not exists idx_assistant_messages_user_client_message_id_unique/i);
  assert.match(sql, /on public\.assistant_messages \(thread_id, \(\(metadata ->> 'clientMessageId'\)\)\)/i);
  assert.match(sql, /where role = 'user'/i);
});

test("assistant SQL supports pinned threads and indexed chat search", () => {
  assert.match(sql, /alter table public\.assistant_threads[\s\S]+add column if not exists pinned_at timestamptz/i);
  assert.match(sql, /idx_assistant_threads_company_pinned_updated/i);
  assert.match(sql, /create index if not exists idx_assistant_messages_content_trgm/i);
  assert.match(sql, /gin \(content gin_trgm_ops\)/i);
  assert.match(sql, /create extension if not exists pg_trgm/i);
});

test("assistant RLS avoids per-row auth uid initialization", () => {
  assert.doesNotMatch(sql, /=\s*auth\.uid\(\)/i);
  assert.doesNotMatch(sql, /=\s*private\.current_user_company_id\(\)/i);
  assert.match(sql, /\(select auth\.uid\(\)\)/i);
  assert.match(sql, /\(select private\.current_user_company_id\(\)\)/i);
});

test("assistant SQL files sort in migration dependency order", () => {
  assert.deepEqual([...assistantSqlFiles].sort(), assistantSqlFiles);
});

