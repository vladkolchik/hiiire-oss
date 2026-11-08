import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(
  new URL("../app/(admin)/admin/(protected)/feedback/page.tsx", import.meta.url),
  "utf8"
);
const actions = readFileSync(new URL("../app/(admin)/admin/feedback/actions.ts", import.meta.url), "utf8");
const table = readFileSync(
  new URL("../app/(admin)/admin/feedback/feedback-admin-table.tsx", import.meta.url),
  "utf8"
);
const sidebar = readFileSync(new URL("../components/admin/admin-sidebar.tsx", import.meta.url), "utf8");

test("admin sidebar links to product feedback", () => {
  assert.match(sidebar, /title:\s*"Обратная связь"/);
  assert.match(sidebar, /href:\s*"\/admin\/feedback"/);
});

test("admin feedback page requires platform admin and loads latest 200 via service-role client", () => {
  assert.match(page, /requirePlatformAdmin\(\)/);
  assert.match(page, /getSupabaseAdminClient\(\)/);
  assert.match(page, /\.from\("feedback"\)/);
  assert.match(
    page,
    /\.select\("id,company_id,user_id,author_name,author_email,author_role,type,sections,message,status,admin_class,admin_note,external_url,source_url,reviewed_by,reviewed_at,created_at"\)/
  );
  assert.match(page, /\.order\("created_at",\s*\{\s*ascending:\s*false\s*\}\)/);
  assert.match(page, /\.limit\(200\)/);
  assert.match(page, /FeedbackAdminTable/);
});

test("admin feedback table renders review fields and preserves empty classification sentinel", () => {
  for (const text of [
    "Дата",
    "Компания",
    "Автор",
    "Тип",
    "Разделы",
    "Сообщение",
    "Статус",
    "Класс",
    "Заметка",
    "Внешняя ссылка",
  ]) {
    assert.match(table, new RegExp(text));
  }

  assert.match(table, /__none/);
  assert.match(table, /safeFeedbackSourceHref/);
  assert.match(table, /const sourceHref = safeFeedbackSourceHref\(row\.source_url\)/);
  assert.match(table, /href=\{sourceHref\}/);
  assert.doesNotMatch(table, /href=\{row\.source_url\}/);
  assert.match(table, /name="adminClass"/);
  assert.doesNotMatch(table, /value=\{[^}]*admin_class\s*\?\?\s*"other"/);
  assert.doesNotMatch(table, /toast\.error\([^)]*error\.message/);
});

test("admin feedback action validates input, updates only processing fields, and revalidates list", () => {
  assert.match(actions, /"use server"/);
  assert.match(actions, /FeedbackAdminUpdateSchema/);
  assert.match(actions, /requirePlatformAdmin\(\)/);
  assert.match(actions, /getSupabaseAdminClient\(\)/);
  assert.match(actions, /\.from\("feedback"\)\s*\.\s*update\(\{/);
  assert.match(actions, /status:\s*parsed\.data\.status/);
  assert.match(actions, /admin_class:\s*parsed\.data\.adminClass\s*\?\?\s*null/);
  assert.match(actions, /admin_note:\s*parsed\.data\.adminNote\s*\?\?\s*null/);
  assert.match(actions, /external_url:\s*parsed\.data\.externalUrl\s*\?\?\s*null/);
  assert.match(actions, /reviewed_by:\s*user\.id/);
  assert.match(actions, /reviewed_at:\s*new Date\(\)\.toISOString\(\)/);
  assert.match(actions, /\.eq\("id",\s*parsed\.data\.feedbackId\)/);
  assert.match(actions, /revalidatePath\("\/admin\/feedback"\)/);
  assert.doesNotMatch(actions, /message:\s*`[^`]*\$\{[^}]*error\.message[^}]*\}/);
  assert.doesNotMatch(actions, /message:\s*[^,\n]*error\.message/);
});
