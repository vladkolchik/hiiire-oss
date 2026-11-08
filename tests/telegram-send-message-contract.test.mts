import assert from "node:assert/strict";
import test from "node:test";

import {
  assertTelegramSendResponse,
  buildTelegramSendRequest,
  sendTelegramRequest,
} from "../lib/telegram/send-message.ts";

test("buildTelegramSendRequest uses relay mode when TELEGRAM_RELAY_URL is set", () => {
  const request = buildTelegramSendRequest(
    { chatId: 123, text: "Привет", disableWebPagePreview: false },
    {
      TELEGRAM_RELAY_URL: "https://tg.hiiire.com/",
      TELEGRAM_RELAY_SECRET: "relay-secret",
      TELEGRAM_BOT_TOKEN: "bot-token",
    },
  );

  assert.equal(request.url, "https://tg.hiiire.com/api/telegram/send");
  assert.equal(request.init.method, "POST");
  assert.deepEqual(request.init.headers, {
    "content-type": "application/json",
    "x-telegram-relay-secret": "relay-secret",
  });
  assert.equal(
    request.init.body,
    JSON.stringify({ chatId: 123, text: "Привет", disableWebPagePreview: false }),
  );
});

test("buildTelegramSendRequest requires TELEGRAM_RELAY_SECRET in relay mode", () => {
  assert.throws(
    () =>
      buildTelegramSendRequest(
        { chatId: 123, text: "Привет" },
        {
          TELEGRAM_RELAY_URL: "https://tg.hiiire.com",
          TELEGRAM_BOT_TOKEN: "bot-token",
        },
      ),
    /Missing environment variable: TELEGRAM_RELAY_SECRET/,
  );
});

test("buildTelegramSendRequest preserves direct Telegram API mode without relay env", () => {
  const request = buildTelegramSendRequest(
    { chatId: 123, text: "Привет" },
    {
      TELEGRAM_BOT_TOKEN: "bot-token",
    },
  );

  assert.equal(request.url, "https://api.telegram.org/botbot-token/sendMessage");
  assert.equal(
    request.init.body,
    JSON.stringify({
      chat_id: 123,
      text: "Привет",
      disable_web_page_preview: true,
    }),
  );
});

test("buildTelegramSendRequest uses direct Telegram API through an HTTP proxy", () => {
  const request = buildTelegramSendRequest(
    { chatId: 123, text: "Привет" },
    {
      TELEGRAM_BOT_TOKEN: "bot-token",
      TELEGRAM_PROXY_URL: "http://proxy-user:proxy-password@proxy.example.com:8080",
    },
  );

  assert.equal(request.url, "https://api.telegram.org/botbot-token/sendMessage");
  assert.equal(request.proxyUrl, "http://proxy-user:proxy-password@proxy.example.com:8080/");
  assert.equal(
    request.init.body,
    JSON.stringify({
      chat_id: 123,
      text: "Привет",
      disable_web_page_preview: true,
    }),
  );
});

test("buildTelegramSendRequest rejects ambiguous relay and proxy configuration", () => {
  assert.throws(
    () =>
      buildTelegramSendRequest(
        { chatId: 123, text: "Привет" },
        {
          TELEGRAM_RELAY_URL: "https://tg.hiiire.com",
          TELEGRAM_RELAY_SECRET: "relay-secret",
          TELEGRAM_PROXY_URL: "http://proxy-user:proxy-password@proxy.example.com:8080",
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Invalid Telegram transport configuration");
      assert.doesNotMatch(error.message, /proxy-user|proxy-password|proxy\.example\.com/);
      return true;
    },
  );
});

test("buildTelegramSendRequest rejects unsupported or malformed proxy URLs safely", () => {
  for (const proxyUrl of [
    "socks5://proxy.example.com:1080",
    "ftp://proxy.example.com",
    "http://proxy.example.com/path",
    "not-a-url",
  ]) {
    assert.throws(
      () =>
        buildTelegramSendRequest(
          { chatId: 123, text: "Привет" },
          {
            TELEGRAM_BOT_TOKEN: "bot-token",
            TELEGRAM_PROXY_URL: proxyUrl,
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, "Invalid TELEGRAM_PROXY_URL");
        assert.doesNotMatch(error.message, /proxy\.example\.com|not-a-url/);
        return true;
      },
    );
  }
});

test("sendTelegramRequest selects the configured proxy transport", async () => {
  let selectedProxyUrl: string | undefined;
  let requestedUrl: string | undefined;

  await sendTelegramRequest(
    { chatId: 123, text: "Привет" },
    {
      TELEGRAM_BOT_TOKEN: "bot-token",
      TELEGRAM_PROXY_URL: "https://proxy.example.com:8443",
    },
    async () => {
      throw new Error("direct fetch must not be used");
    },
    (proxyUrl) => {
      selectedProxyUrl = proxyUrl;
      return async (input) => {
        requestedUrl = String(input);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      };
    },
  );

  assert.equal(selectedProxyUrl, "https://proxy.example.com:8443/");
  assert.equal(requestedUrl, "https://api.telegram.org/botbot-token/sendMessage");
});

test("sendTelegramRequest hides proxy connection and credential details", async () => {
  await assert.rejects(
    () =>
      sendTelegramRequest(
        { chatId: 123, text: "Привет" },
        {
          TELEGRAM_BOT_TOKEN: "bot-token",
          TELEGRAM_PROXY_URL: "http://proxy-user:proxy-password@proxy.example.com:8080",
        },
        fetch,
        () => async () => {
          throw new Error("connect ECONNREFUSED proxy-user:proxy-password@proxy.example.com:8080");
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "TELEGRAM_SEND_FAILED");
      assert.doesNotMatch(error.message, /proxy-user|proxy-password|proxy\.example\.com|ECONNREFUSED/);
      return true;
    },
  );
});

test("sendTelegramRequest hides proxy dispatcher initialization details", async () => {
  await assert.rejects(
    () =>
      sendTelegramRequest(
        { chatId: 123, text: "Привет" },
        {
          TELEGRAM_BOT_TOKEN: "bot-token",
          TELEGRAM_PROXY_URL: "http://proxy-user:proxy-password@proxy.example.com:8080",
        },
        fetch,
        () => {
          throw new Error("failed to initialize proxy-user:proxy-password@proxy.example.com:8080");
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "TELEGRAM_SEND_FAILED");
      assert.doesNotMatch(error.message, /proxy-user|proxy-password|proxy\.example\.com/);
      return true;
    },
  );
});

test("sendTelegramRequest aborts a hung proxy request at the configured timeout", async () => {
  await assert.rejects(
    () =>
      sendTelegramRequest(
        { chatId: 123, text: "Привет" },
        {
          TELEGRAM_BOT_TOKEN: "bot-token",
          TELEGRAM_PROXY_URL: "http://proxy.example.com:8080",
          TELEGRAM_REQUEST_TIMEOUT_MS: "1000",
        },
        fetch,
        () => async (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("proxy request aborted")));
          }),
      ),
    /TELEGRAM_SEND_TIMEOUT/,
  );
});

test("assertTelegramSendResponse accepts ok relay and Telegram responses", async () => {
  await assertTelegramSendResponse(new Response(JSON.stringify({ ok: true }), { status: 200 }));
});

test("assertTelegramSendResponse throws a safe error on failed sends", async () => {
  await assert.rejects(
    () =>
      assertTelegramSendResponse(
        new Response(JSON.stringify({ ok: false, error: "TELEGRAM_SEND_FAILED" }), { status: 502 }),
      ),
    /TELEGRAM_SEND_FAILED status=502/,
  );
});

test("assertTelegramSendResponse does not expose raw provider or relay details", async () => {
  await assert.rejects(
    () =>
      assertTelegramSendResponse(
        new Response(JSON.stringify({ ok: false, error: "UPSTREAM_RAW_PROVIDER_PAYLOAD", description: "Bad Request: chat not found" }), {
          status: 502,
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "TELEGRAM_SEND_FAILED status=502");
      assert.doesNotMatch(error.message, /UPSTREAM_RAW_PROVIDER_PAYLOAD|Bad Request|chat not found/i);
      return true;
    },
  );
});

test("sendTelegramRequest hides raw transport rejection details", async () => {
  await assert.rejects(
    () =>
      sendTelegramRequest(
        { chatId: 123, text: "Привет" },
        {
          TELEGRAM_RELAY_URL: "https://tg.hiiire.com",
          TELEGRAM_RELAY_SECRET: "relay-secret",
          TELEGRAM_REQUEST_TIMEOUT_MS: "1000",
        },
        async () => {
          throw new Error("fetch failed for https://tg.hiiire.com/api/telegram/send relay-secret");
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "TELEGRAM_SEND_FAILED");
      assert.doesNotMatch(error.message, /tg\.hiiire\.com|relay-secret|api\/telegram\/send/i);
      return true;
    },
  );
});

test("sendTelegramRequest times out hung relay requests", async () => {
  await assert.rejects(
    () =>
      sendTelegramRequest(
        { chatId: 123, text: "Привет" },
        {
          TELEGRAM_RELAY_URL: "https://tg.hiiire.com",
          TELEGRAM_RELAY_SECRET: "relay-secret",
          TELEGRAM_REQUEST_TIMEOUT_MS: "1000",
        },
        async (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      ),
    /TELEGRAM_SEND_TIMEOUT/,
  );
});

test("sendTelegramRequest times out hung relay response bodies", async () => {
  await assert.rejects(
    () =>
      sendTelegramRequest(
        { chatId: 123, text: "Привет" },
        {
          TELEGRAM_RELAY_URL: "https://tg.hiiire.com",
          TELEGRAM_RELAY_SECRET: "relay-secret",
          TELEGRAM_REQUEST_TIMEOUT_MS: "1000",
        },
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

test("sendTelegramRequest times out hung direct Telegram response bodies", async () => {
  await assert.rejects(
    () =>
      sendTelegramRequest(
        { chatId: 123, text: "Привет" },
        {
          TELEGRAM_BOT_TOKEN: "bot-token",
          TELEGRAM_REQUEST_TIMEOUT_MS: "1000",
        },
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
