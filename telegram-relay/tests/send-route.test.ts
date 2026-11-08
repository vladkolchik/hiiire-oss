import assert from "node:assert/strict";
import test from "node:test";

import { buildServer, type BuildServerOptions, type SendTelegramMessageParams } from "../src/server.js";
import type { RelayConfig } from "../src/config.js";
import { sendTelegramMessage } from "../src/telegram.js";

function config(): RelayConfig {
  return {
    port: 3000,
    telegramBotToken: "bot-token",
    telegramBotUsername: "hiiire_com_bot",
    telegramWebhookSecret: "webhook-secret",
    telegramRelaySecret: "relay-secret",
    supabaseUrl: "https://example.supabase.co",
    supabaseServiceRoleKey: "service-role",
    telegramRequestTimeoutMs: 8000,
  };
}

function buildTestServer(overrides: Partial<BuildServerOptions["deps"]> = {}) {
  const sent: SendTelegramMessageParams[] = [];
  const app = buildServer({
    config: config(),
    deps: {
      sendTelegramMessage: async (params) => {
        sent.push(params);
      },
      store: {
        markLastSeen: async () => undefined,
        deleteUserLinkByChatId: async () => undefined,
        getConnectToken: async () => null,
        claimConnectToken: async () => null,
        getUserLinkByChatId: async () => null,
        upsertUserLink: async () => undefined,
      },
      ...overrides,
    },
  });

  return { app, sent };
}

test("send route rejects requests without the relay secret", async () => {
  const { app, sent } = buildTestServer();

  const response = await app.inject({
    method: "POST",
    url: "/api/telegram/send",
    payload: { chatId: 123, text: "Привет" },
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { ok: false, error: "UNAUTHORIZED" });
  assert.equal(sent.length, 0);
});

test("send route rejects invalid bodies before calling Telegram", async () => {
  const { app, sent } = buildTestServer();

  const response = await app.inject({
    method: "POST",
    url: "/api/telegram/send",
    headers: { "x-telegram-relay-secret": "relay-secret" },
    payload: { chatId: "not-a-number", text: "" },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { ok: false, error: "INVALID_BODY" });
  assert.equal(sent.length, 0);
});

test("send route rejects malformed JSON with a safe body error", async () => {
  const { app, sent } = buildTestServer();

  const response = await app.inject({
    method: "POST",
    url: "/api/telegram/send",
    headers: {
      "content-type": "application/json",
      "x-telegram-relay-secret": "relay-secret",
    },
    payload: "{not-json",
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { ok: false, error: "INVALID_BODY" });
  assert.equal(sent.length, 0);
});

test("send route sends a valid message through the injected Telegram client", async () => {
  const { app, sent } = buildTestServer();

  const response = await app.inject({
    method: "POST",
    url: "/api/telegram/send",
    headers: { "x-telegram-relay-secret": "relay-secret" },
    payload: { chatId: 123456789, text: "Готово", disableWebPagePreview: false },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true });
  assert.deepEqual(sent, [{ chatId: 123456789, text: "Готово", disableWebPagePreview: false }]);
});

test("send route returns a safe gateway error when Telegram sending fails", async () => {
  const { app } = buildTestServer({
    sendTelegramMessage: async () => {
      throw new Error("TELEGRAM_SEND_FAILED status=500 details=secret raw payload");
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/telegram/send",
    headers: { "x-telegram-relay-secret": "relay-secret" },
    payload: { chatId: 123456789, text: "Готово" },
  });

  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.json(), { ok: false, error: "TELEGRAM_SEND_FAILED" });
});

test("telegram client times out hung Bot API requests", async () => {
  await assert.rejects(
    () =>
      sendTelegramMessage(
        { ...config(), telegramRequestTimeoutMs: 1000 },
        { chatId: 123456789, text: "Готово" },
        async (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      ),
    /TELEGRAM_SEND_TIMEOUT/,
  );
});

test("telegram client times out hung Bot API response bodies", async () => {
  await assert.rejects(
    () =>
      sendTelegramMessage(
        { ...config(), telegramRequestTimeoutMs: 1000 },
        { chatId: 123456789, text: "Готово" },
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => new Promise<unknown>(() => undefined),
          }) as Response,
      ),
    /TELEGRAM_SEND_TIMEOUT/,
  );
});

test("telegram client rejects malformed successful Bot API responses", async () => {
  await assert.rejects(
    () =>
      sendTelegramMessage(
        { ...config(), telegramRequestTimeoutMs: 1000 },
        { chatId: 123456789, text: "Готово" },
        async () => new Response(JSON.stringify({ result: { message_id: 1 } }), { status: 200 }),
      ),
    /TELEGRAM_SEND_FAILED status=200/,
  );
});

test("telegram client hides raw provider response details", async () => {
  await assert.rejects(
    () =>
      sendTelegramMessage(
        { ...config(), telegramRequestTimeoutMs: 1000 },
        { chatId: 123456789, text: "Готово" },
        async () =>
          new Response(JSON.stringify({ ok: false, description: "Bad Request: bot token leaked raw text" }), {
            status: 400,
          }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "TELEGRAM_SEND_FAILED status=400");
      assert.doesNotMatch(error.message, /Bad Request|bot token|raw text/i);
      return true;
    },
  );
});

test("telegram client hides raw transport rejection details", async () => {
  await assert.rejects(
    () =>
      sendTelegramMessage(
        { ...config(), telegramRequestTimeoutMs: 1000 },
        { chatId: 123456789, text: "Готово" },
        async () => {
          throw new Error("fetch failed for https://api.telegram.org/bot123:SECRET/sendMessage");
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "TELEGRAM_SEND_FAILED");
      assert.doesNotMatch(error.message, /api\.telegram\.org|SECRET|sendMessage/i);
      return true;
    },
  );
});
