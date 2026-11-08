import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("package scripts expose focused telegram relay verification", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };

  assert.equal(packageJson.scripts["telegram-relay:build"], "npm --prefix telegram-relay run build");
  assert.equal(packageJson.scripts["telegram-relay:test"], "npm --prefix telegram-relay test");
  assert.equal(packageJson.scripts["telegram:webhook"], "node --no-warnings --experimental-strip-types scripts/telegram-webhook.mts");
  assert.match(packageJson.scripts["test:telegram"], /telegram-send-message-contract\.test\.mts/);
  assert.match(packageJson.scripts["test:telegram"], /telegram-relay-docs-contract\.test\.mts/);
  assert.match(packageJson.scripts["test:telegram"], /telegram-webhook-rollback-contract\.test\.mts/);
  assert.match(packageJson.scripts["test:telegram"], /telegram-webhook-operator-tools\.test\.mts/);
});

test("env example documents relay and proxy variables for the main web app", () => {
  const source = readFileSync(".env.example", "utf8");

  assert.match(source, /# TELEGRAM_RELAY_URL=https:\/\/tg\.hiiire\.com/);
  assert.match(source, /# TELEGRAM_RELAY_SECRET=long-random-relay-secret/);
  assert.match(source, /# TELEGRAM_PROXY_URL=http:\/\/user:password@proxy\.example\.com:8080/);
  assert.match(source, /# TELEGRAM_REQUEST_TIMEOUT_MS=8000/);
  assert.doesNotMatch(source, /^TELEGRAM_RELAY_URL=/m);
  assert.doesNotMatch(source, /^TELEGRAM_RELAY_SECRET=/m);
  assert.doesNotMatch(source, /^TELEGRAM_PROXY_URL=/m);
});

test("technical reference documents Telegram relay and proxy deployment", () => {
  const source = readFileSync("docs/technical-reference.md", "utf8");

  assert.match(source, /tg\.hiiire\.com/);
  assert.match(source, /telegram-relay/);
  assert.match(source, /TELEGRAM_RELAY_URL/);
  assert.match(source, /TELEGRAM_RELAY_SECRET/);
  assert.match(source, /TELEGRAM_PROXY_URL/);
  assert.match(source, /HTTP\(S\) forward proxy/);
  assert.match(source, /должен оставаться публично доступным для Telegram по HTTPS/);
  assert.match(source, /SOCKS-прокси не поддерживаются/);
  assert.match(source, /Не включайте relay и proxy одновременно/);
  assert.match(source, /TELEGRAM_REQUEST_TIMEOUT_MS/);
  assert.match(source, /telegram:webhook/);
  assert.match(source, /scripts\/telegram-webhook\.html/);
  assert.match(source, /https:\/\/tg\.hiiire\.com\/api\/telegram\/webhook/);
  assert.match(source, /Откат[\s\S]*https:\/\/hiiire\.com\/api\/telegram\/webhook/);
});

test("deployment guide documents Telegram relay and proxy operations", () => {
  const source = readFileSync("DEPLOYMENT.md", "utf8");

  assert.match(source, /hiiire-telegram-relay/);
  assert.match(source, /Project directory.*telegram-relay/s);
  assert.match(source, /Health check.*\/health/s);
  assert.match(source, /telegram-relay\/Dockerfile/);
  assert.match(source, /telegram:webhook/);
  assert.match(source, /scripts\/telegram-webhook\.html/);
  assert.match(source, /root `docker-compose\.yml`.*Tika/s);
  assert.match(source, /TELEGRAM_REQUEST_TIMEOUT_MS/);
  assert.match(source, /TELEGRAM_PROXY_URL/);
  assert.match(source, /mutually exclusive transports/);
  assert.match(source, /does not make the incoming webhook reachable/);
  assert.match(source, /Rollback[\s\S]*TELEGRAM_RELAY_URL[\s\S]*https:\/\/hiiire\.com\/api\/telegram\/webhook/s);
});

test("manual QA guide covers the Telegram relay connection contract", () => {
  const source = readFileSync("docs/For_juniors/hiiire_for_junior.md", "utf8");

  assert.match(source, /Telegram/);
  assert.match(source, /Start/);
  assert.match(source, /\/start <token>/);
  assert.match(source, /60 секунд/);
  assert.match(source, /использована или истекла/);
  assert.match(source, /\/unlink/);
  assert.match(source, /не должно быть технических сообщений|без технических сообщений/);
});

test("telegram relay failures do not surface raw provider errors in user-facing notification paths", () => {
  const broadcastSource = readFileSync("app/(admin)/admin/broadcast/actions.ts", "utf8");
  const notifySource = readFileSync("lib/telegram/notify.ts", "utf8");
  const creditsSource = readFileSync("app/(admin)/admin/credits/actions.ts", "utf8");
  const billingSource = readFileSync("app/api/billing/robokassa-webhook/route.ts", "utf8");
  const leadsSource = readFileSync("app/api/leads/route.ts", "utf8");

  assert.match(broadcastSource, /Promise\.allSettled\(batch\.map\(\(chatId\) => sendTelegramMessage/);
  assert.match(broadcastSource, /Рассылка завершена: отправлено/);
  assert.doesNotMatch(broadcastSource, /reason\.message|TELEGRAM_SEND_FAILED/);

  assert.match(notifySource, /Promise\.allSettled/);
  assert.match(notifySource, /failed:\s*chatIds\.length - sent/);
  assert.doesNotMatch(notifySource, /throw results|reason\.message/);

  assert.match(creditsSource, /try \{[\s\S]*notifyCompanyAdmins/);
  assert.match(creditsSource, /catch \{[\s\S]*ignore/);
  assert.match(billingSource, /notifyCompanyAdmins\([\s\S]*\.catch\(\(\) => null\)|Promise\.allSettled\(\[[\s\S]*notifyCompanyAdmins/);
  assert.match(leadsSource, /notifyOwners\(text\)\.catch\(\(\) => null\)/);
});
