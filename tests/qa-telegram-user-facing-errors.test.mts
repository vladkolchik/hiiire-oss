import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("QA assistant page maps API errors to safe user-facing copy", () => {
  const source = readFileSync("app/(dashboard)/dashboard/qa-assistant/page.tsx", "utf8");

  assert.match(source, /readUserFacingApiErrorMessage/);
  assert.match(source, /Не удалось получить ответ QA-ассистента\. Попробуйте ещё раз\./);
  assert.doesNotMatch(source, /throw new Error\(code\)/);
  assert.doesNotMatch(source, /json\?\.error \?\? "Не удалось получить ответ QA-ассистента"/);
});

test("QA chat API returns safe messages for validation and service failures", () => {
  const source = readFileSync("app/api/qa-chat/route.ts", "utf8");

  assert.match(source, /message:\s*firstUserFacingIssueMessage\(issues,\s*QA_INVALID_BODY_MESSAGE\)/);
  assert.match(source, /const issues = zodErrorToUserFacingIssues\(parsed\.error/);
  assert.match(source, /\bissues,\s*\n/);
  assert.match(source, /message:\s*QA_SERVICE_ERROR_MESSAGE/);
  assert.doesNotMatch(source, /NextResponse\.json\(\{\s*error:\s*"INVALID_BODY"\s*\}/);
  assert.doesNotMatch(source, /NextResponse\.json\(\{\s*error:\s*"INTERNAL_ERROR"\s*\}/);
});

test("Telegram settings flow does not surface raw API error codes in toasts", () => {
  const source = readFileSync("app/(dashboard)/dashboard/settings/page.tsx", "utf8");
  const connect = source.slice(source.indexOf("const handleConnectTelegram"), source.indexOf("const handleDisconnectTelegram"));
  const disconnect = source.slice(source.indexOf("const handleDisconnectTelegram"), source.indexOf("const handleToggleTelegramEnabled"));

  assert.match(source, /readUserFacingApiErrorMessage/);
  assert.match(connect, /readUserFacingApiErrorMessage\(json,\s*"Не удалось подготовить ссылку Telegram\. Попробуйте ещё раз\."\)/);
  assert.match(disconnect, /readUserFacingApiErrorMessage\(json,\s*"Не удалось отключить Telegram\. Попробуйте ещё раз\."\)/);
  assert.doesNotMatch(connect, /String\(json\?\.error/);
  assert.doesNotMatch(disconnect, /String\(json\?\.error/);
});

test("Telegram connection API responses include safe user-facing messages", () => {
  const connectRoute = readFileSync("app/api/telegram/connect-link/route.ts", "utf8");
  const disconnectRoute = readFileSync("app/api/telegram/disconnect/route.ts", "utf8");

  assert.match(connectRoute, /message:\s*TELEGRAM_CONNECT_LINK_ERROR_MESSAGE/);
  assert.match(disconnectRoute, /message:\s*TELEGRAM_DISCONNECT_ERROR_MESSAGE/);
  assert.doesNotMatch(connectRoute, /NextResponse\.json\(\{\s*error:\s*"TOKEN_INSERT_FAILED"\s*\}/);
  assert.doesNotMatch(disconnectRoute, /NextResponse\.json\(\{\s*error:\s*"DELETE_FAILED"\s*\}/);
});

test("junior QA guide explicitly checks safe error copy for QA assistant and Telegram connection", () => {
  const source = readFileSync("docs/For_juniors/hiiire_for_junior.md", "utf8");

  assert.match(source, /QA-ассистент[\s\S]+не показывает `INVALID_BODY`, `INTERNAL_ERROR`/);
  assert.match(source, /Подключение Telegram[\s\S]+не показывает `TOKEN_INSERT_FAILED`, `DELETE_FAILED`, `INTERNAL_ERROR`/);
});
