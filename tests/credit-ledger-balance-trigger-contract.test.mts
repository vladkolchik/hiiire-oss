import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260702110101_credit_ledger_balance_trigger.sql",
  import.meta.url,
);

function readMigration() {
  return readFileSync(migrationUrl, "utf8");
}

test("credit ledger inserts atomically update the materialized company balance", () => {
  const sql = readMigration();

  assert.match(
    sql,
    /create\s+or\s+replace\s+function\s+public\.apply_credit_ledger_delta_to_balance\(\)/i,
  );
  assert.match(sql, /security\s+definer[\s\S]*set\s+search_path\s*=\s*''/i);
  assert.match(
    sql,
    /update\s+public\.company_credits[\s\S]*set\s+balance\s*=\s*balance\s*\+\s*new\.delta/i,
  );
  assert.match(
    sql,
    /if\s+new\.delta\s*<\s*0[\s\S]*raise\s+exception\s+'COMPANY_CREDITS_ROW_MISSING'/i,
  );
  assert.match(
    sql,
    /on\s+conflict\s*\(company_id\)\s+do\s+update[\s\S]*company_credits\.balance\s*\+\s*excluded\.balance/i,
  );
  assert.match(
    sql,
    /create\s+trigger\s+credit_ledger_apply_delta_to_balance\s+after\s+insert\s+on\s+public\.credit_ledger/i,
  );
});

test("credit ledger balance trigger is not directly executable by browser roles", () => {
  const sql = readMigration();

  assert.match(
    sql,
    /revoke\s+all\s+on\s+function\s+public\.apply_credit_ledger_delta_to_balance\(\)\s+from\s+public,\s*anon,\s*authenticated/i,
  );
});

test("backfill derives balances from the ledger and protects active reservations", () => {
  const sql = readMigration();

  assert.match(sql, /sum\(delta\)::integer\s+as\s+ledger_balance/i);
  assert.match(
    sql,
    /coalesce\(credits\.reserved,\s*0\)\s*>\s*ledger\.ledger_balance/i,
  );
  assert.match(sql, /raise\s+exception\s+'CREDIT_LEDGER_BACKFILL_INVARIANT_FAILED'/i);
  assert.match(
    sql,
    /where\s+public\.company_credits\.balance\s+is\s+distinct\s+from\s+excluded\.balance/i,
  );
});
