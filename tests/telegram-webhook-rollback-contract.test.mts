import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/api/telegram/webhook/route.ts", "utf8");

test("legacy telegram webhook keeps rollback private-chat-only", () => {
  assert.match(source, /chatType\s*=\s*msg\?\.chat\?\.type|chatType\s*=\s*message\?\.chat\?\.type/);
  assert.match(source, /chatType !== "private"/);
  assert.match(source, /личном чате с ботом/);
});

test("legacy telegram webhook parses only exact start commands", () => {
  assert.match(source, /command !== "\/start"/);
  assert.match(source, /parts\.length === 2/);
  assert.doesNotMatch(source, /startsWith\("\/start"\)/);
});

test("legacy telegram webhook claims connect tokens before writing links", () => {
  const claimMatch = /\.from\("telegram_connect_tokens"\)[\s\S]*?\.update\(\{ used_at: nowIso \}\)/.exec(source);
  const linkIndex = source.indexOf('.from("telegram_user_links").upsert');

  assert.ok(claimMatch?.index !== undefined);
  assert.notEqual(linkIndex, -1);
  assert.ok(claimMatch.index < linkIndex);
  assert.match(source, /\.is\("used_at", null\)/);
  assert.match(source, /\.gt\("expires_at", nowIso\)/);
  assert.doesNotMatch(source, /\.update\(\{ used_at: nowIso \}\)\.eq\("token", token\)/);
});

test("legacy telegram webhook uses safe post-claim failure copy", () => {
  assert.match(source, /Не удалось подключить уведомления\.[\s\S]*сгенерируйте новую ссылку/);
  assert.doesNotMatch(source, /ошибка базы|database|provider|relay/i);
});

test("legacy telegram webhook does not claim when token lookup storage fails", () => {
  assert.match(source, /tokenErr[\s\S]*Попробуйте ещё раз через пару минут/);
  const tokenErrIndex = source.indexOf("tokenErr");
  const claimIndex = /\.from\("telegram_connect_tokens"\)\s*\.update\(\{ used_at: nowIso \}\)/.exec(source)?.index ?? -1;
  assert.ok(tokenErrIndex !== -1 && claimIndex !== -1);
  assert.ok(tokenErrIndex < claimIndex);
});

test("legacy telegram webhook does not claim when chat ownership lookup fails", () => {
  assert.match(source, /existingErr[\s\S]*Попробуйте ещё раз через пару минут/);
  const existingErrIndex = source.indexOf("existingErr");
  const claimIndex = /\.from\("telegram_connect_tokens"\)\s*\.update\(\{ used_at: nowIso \}\)/.exec(source)?.index ?? -1;
  assert.ok(existingErrIndex !== -1 && claimIndex !== -1);
  assert.ok(existingErrIndex < claimIndex);
});

test("legacy telegram webhook confirms unlink only after delete succeeds", () => {
  assert.match(source, /deleteErr[\s\S]*не удалось отключить/i);
  assert.match(source, /deleteErr[\s\S]*NextResponse\.json\(\{ ok: true \}, \{ status: 200 \}\)/);
});

test("legacy telegram webhook treats malformed JSON as an ignored update", () => {
  assert.match(source, /req\.json\(\)\.catch\(\(\) => null\)/);
  assert.match(source, /if \(!msg \|\| typeof chatId !== "number" \|\| !Number\.isSafeInteger\(chatId\)\) \{[\s\S]*NextResponse\.json\(\{ ok: true \}, \{ status: 200 \}\)/);
});
