import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const additiveSql = readFileSync(new URL("../supabase/sql/product_feedback_v1_additive.sql", import.meta.url), "utf8");
const finalizeSql = readFileSync(new URL("../supabase/sql/product_feedback_v2_finalize.sql", import.meta.url), "utf8");
const messageLimitSql = readFileSync(new URL("../supabase/sql/product_feedback_message_limit_10000.sql", import.meta.url), "utf8");
const sql = `${additiveSql}\n${finalizeSql}\n${messageLimitSql}`;
const types = readFileSync(new URL("../lib/supabase/database.types.ts", import.meta.url), "utf8");

function feedbackMutations(source: string, verb: "update" | "delete") {
  const pattern =
    verb === "update"
      ? /update\s+public\.feedback\b[\s\S]*?;/gi
      : /delete\s+from\s+public\.feedback\b[\s\S]*?;/gi;
  return source.match(pattern) ?? [];
}

test("feedback migration contains safe legacy stats migration and no broad delete", () => {
  assert.match(additiveSql, /alter table public\.feedback/);
  assert.match(additiveSql, /where\s+f\.page\s*=\s*'stats'/i);
  assert.match(additiveSql, /sections\s*=\s*coalesce\(f\.sections,\s*array\['stats'\]/i);
  assert.match(additiveSql, /type\s*=\s*coalesce\(f\.type,\s*'other'\)/i);
  assert.match(finalizeSql, /raise exception 'Unexpected feedback rows without product feedback columns/);
  for (const statement of feedbackMutations(sql, "update")) {
    assert.match(statement, /where[\s\S]*(?:f\.page\s*=\s*'stats'|page\s*=\s*'stats')/i, statement);
    assert.doesNotMatch(statement, /or\s+true/i, statement);
    assert.doesNotMatch(statement, /where\s+true/i, statement);
  }
  assert.equal(feedbackMutations(sql, "delete").length, 0);
  assert.doesNotMatch(sql, /delete\s+from\s+only\s+public\.feedback/i);
  assert.doesNotMatch(sql, /truncate\s+table\s+public\.feedback/i);
});

test("additive migration keeps old route compatible and final migration drops page", () => {
  assert.match(additiveSql, /alter column page drop not null/i);
  assert.match(additiveSql, /alter column page set default 'stats'/i);
  assert.doesNotMatch(additiveSql, /drop column if exists page/i);
  assert.doesNotMatch(additiveSql, /alter column type set not null/i);
  assert.match(finalizeSql, /drop column if exists page/i);

  for (const fragment of [
    "author_name",
    "author_email",
    "author_role",
    "feedback_type_check",
    "feedback_sections_allowed_check",
    "feedback_sections_unique_check",
    "feedback_status_check",
    "feedback_admin_class_check",
    "feedback_source_url_check",
    "source_url ~ '\\^https\\?://'",
    "idx_feedback_sections_gin",
  ]) {
    assert.match(sql, new RegExp(fragment));
  }
});

test("feedback SQL keeps product message limit at 10000 characters", () => {
  assert.match(additiveSql, /char_length\(message\) between 1 and 10000/i);
  assert.match(finalizeSql, /char_length\(message\) between 1 and 10000/i);
  assert.match(messageLimitSql, /drop constraint if exists feedback_message_length_check/i);
  assert.match(messageLimitSql, /char_length\(message\) between 1 and 10000/i);
  assert.doesNotMatch(sql, /char_length\(message\) between 1 and 5000/i);
});

test("generated feedback types expose new shape and no page requirement", () => {
  assert.match(types, /author_name: string \| null/);
  assert.match(types, /author_email: string/);
  assert.match(types, /author_role: "admin" \| "hr" \| "recruiter"/);
  assert.match(types, /type: "idea" \| "missing_feature" \| "usability" \| "question" \| "other"/);
  assert.match(types, /sections: string\[\]/);
  assert.match(types, /status: "new" \| "reviewed" \| "in_progress" \| "closed" \| "deferred"/);
  assert.doesNotMatch(types, /page: "stats"/);
});
