import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("package exposes a Telegram webhook operator script", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts?: Record<string, string> };

  assert.equal(pkg.scripts?.["telegram:webhook"], "node --no-warnings --experimental-strip-types scripts/telegram-webhook.mts");
});

test("Telegram webhook CLI supports set, get, and delete without printing secrets", () => {
  const source = readFileSync("scripts/telegram-webhook.mts", "utf8");

  assert.match(source, /setWebhook/);
  assert.match(source, /getWebhookInfo/);
  assert.match(source, /deleteWebhook/);
  assert.match(source, /TELEGRAM_PROXY_URL/);
  assert.match(source, /--proxy-url/);
  assert.match(source, /createTelegramProxyFetch/);
  assert.match(source, /secret_token/);
  assert.match(source, /allowed_updates/);
  assert.doesNotMatch(source, /console\.log\([^)]*TELEGRAM_BOT_TOKEN/);
  assert.doesNotMatch(source, /console\.log\([^)]*TELEGRAM_WEBHOOK_SECRET/);
});

test("Telegram webhook CLI help exits without requiring secrets or network", () => {
  const result = spawnSync(
    process.execPath,
    ["--no-warnings", "--experimental-strip-types", "scripts/telegram-webhook.mts", "--help"],
    { encoding: "utf8" }
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /npm run telegram:webhook -- set/);
  assert.match(result.stdout, /TELEGRAM_BOT_TOKEN/);
  assert.equal(result.stderr, "");
});

test("Telegram webhook CLI rejects unsupported proxies without printing credentials", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--no-warnings",
      "--experimental-strip-types",
      "scripts/telegram-webhook.mts",
      "get",
      "--token",
      "test-token",
      "--proxy-url",
      "socks5://proxy-user:proxy-password@proxy.example.com:1080",
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid TELEGRAM_PROXY_URL/);
  assert.doesNotMatch(result.stderr, /proxy-user|proxy-password|proxy\.example\.com/);
});

test("local Telegram webhook HTML submits a native form instead of browser fetch", () => {
  const source = readFileSync("scripts/telegram-webhook.html", "utf8");

  assert.match(source, /https:\/\/api\.telegram\.org\/bot/);
  assert.match(source, /setWebhook/);
  assert.match(source, /getWebhookInfo/);
  assert.match(source, /deleteWebhook/);
  assert.match(source, /target="_blank"/);
  assert.match(source, /allowed_updates/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});
