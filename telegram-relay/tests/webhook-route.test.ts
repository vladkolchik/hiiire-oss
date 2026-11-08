import assert from "node:assert/strict";
import test from "node:test";

import { buildServer, type ConnectTokenRow, type SendTelegramMessageParams, type TelegramRelayStore } from "../src/server.js";
import type { RelayConfig } from "../src/config.js";

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

function createStore(
  tokenRow: ConnectTokenRow | null = null,
  options: { failUpsert?: boolean; failDelete?: boolean; failGetConnectToken?: boolean; failExistingLinkLookup?: boolean } = {},
) {
  const calls: string[] = [];
  let existingLink: { userId: string; chatId: number } | null = null;
  let claimed = false;

  const store: TelegramRelayStore = {
    markLastSeen: async () => {
      calls.push("markLastSeen");
    },
    deleteUserLinkByChatId: async () => {
      calls.push("deleteUserLinkByChatId");
      if (options.failDelete) throw new Error("delete failed");
    },
    getConnectToken: async () => {
      calls.push("getConnectToken");
      if (options.failGetConnectToken) throw new Error("token lookup failed");
      return tokenRow;
    },
    claimConnectToken: async () => {
      calls.push("claimConnectToken");
      if (!tokenRow || claimed || tokenRow.usedAt) return null;
      claimed = true;
      return tokenRow;
    },
    getUserLinkByChatId: async () => {
      calls.push("getUserLinkByChatId");
      if (options.failExistingLinkLookup) throw new Error("lookup failed");
      return existingLink;
    },
    upsertUserLink: async () => {
      calls.push("upsertUserLink");
      if (options.failUpsert) throw new Error("upsert failed");
    },
  };

  return {
    store,
    calls,
    setExistingLink(link: { userId: string; chatId: number } | null) {
      existingLink = link;
    },
  };
}

function telegramUpdate(text: string, chatType: "private" | "group" | "supergroup" | "channel" = "private") {
  return {
    update_id: 99,
    message: {
      message_id: 1,
      date: 1,
      text,
      chat: { id: 777, type: chatType },
      from: { id: 777, username: "test" },
    },
  };
}

test("webhook rejects invalid Telegram secrets so misconfiguration is visible", async () => {
  const store = createStore();
  const sent: SendTelegramMessageParams[] = [];
  const app = buildServer({
    config: config(),
    deps: {
      store: store.store,
      sendTelegramMessage: async (params) => {
        sent.push(params);
      },
      now: () => new Date("2026-05-29T10:00:00.000Z"),
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/telegram/webhook",
    headers: { "x-telegram-bot-api-secret-token": "wrong" },
    payload: telegramUpdate("/start token-1"),
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { ok: false, error: "UNAUTHORIZED" });
  assert.deepEqual(store.calls, []);
  assert.deepEqual(sent, []);
});

test("webhook returns 200 for malformed JSON so Telegram does not retry forever", async () => {
  const store = createStore();
  const app = buildServer({
    config: config(),
    deps: {
      store: store.store,
      sendTelegramMessage: async () => undefined,
      now: () => new Date("2026-05-29T10:00:00.000Z"),
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/telegram/webhook",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": "webhook-secret",
    },
    payload: "{not-json",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true });
  assert.deepEqual(store.calls, []);
});

test("webhook connects a valid start token and sends a success message", async () => {
  const store = createStore({
    token: "token-1",
    userId: "user-1",
    expiresAt: "2026-05-29T10:15:00.000Z",
    usedAt: null,
  });
  const sent: SendTelegramMessageParams[] = [];
  const app = buildServer({
    config: config(),
    deps: {
      store: store.store,
      sendTelegramMessage: async (params) => {
        sent.push(params);
      },
      now: () => new Date("2026-05-29T10:00:00.000Z"),
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/telegram/webhook",
    headers: { "x-telegram-bot-api-secret-token": "webhook-secret" },
    payload: telegramUpdate("/start token-1"),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true });
  assert.deepEqual(store.calls, [
    "markLastSeen",
    "getConnectToken",
    "getUserLinkByChatId",
    "claimConnectToken",
    "upsertUserLink",
  ]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.chatId, 777);
  assert.match(sent[0]?.text ?? "", /Готово! Telegram уведомления подключены/);
});

test("webhook sends a safe failure message for used tokens", async () => {
  const store = createStore({
    token: "token-1",
    userId: "user-1",
    expiresAt: "2026-05-29T10:15:00.000Z",
    usedAt: "2026-05-29T10:01:00.000Z",
  });
  const sent: SendTelegramMessageParams[] = [];
  const app = buildServer({
    config: config(),
    deps: {
      store: store.store,
      sendTelegramMessage: async (params) => {
        sent.push(params);
      },
      now: () => new Date("2026-05-29T10:00:00.000Z"),
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/telegram/webhook",
    headers: { "x-telegram-bot-api-secret-token": "webhook-secret" },
    payload: telegramUpdate("/start token-1"),
  });

  assert.equal(response.statusCode, 200);
  assert.ok(store.calls.includes("getConnectToken"));
  assert.ok(!store.calls.includes("upsertUserLink"));
  assert.equal(sent.length, 1);
  assert.match(sent[0]?.text ?? "", /ссылка уже использована или истекла/);
});

test("webhook ignores unsupported start-like commands", async () => {
  const store = createStore({
    token: "token-1",
    userId: "user-1",
    expiresAt: "2026-05-29T10:15:00.000Z",
    usedAt: null,
  });
  const sent: SendTelegramMessageParams[] = [];
  const app = buildServer({
    config: config(),
    deps: {
      store: store.store,
      sendTelegramMessage: async (params) => {
        sent.push(params);
      },
      now: () => new Date("2026-05-29T10:00:00.000Z"),
    },
  });

  for (const text of ["/startfoo token-1", "/starter token-1", "/start token-1 extra"]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": "webhook-secret" },
      payload: telegramUpdate(text),
    });

    assert.equal(response.statusCode, 200);
  }

  assert.deepEqual(store.calls, ["markLastSeen", "markLastSeen", "markLastSeen"]);
  assert.equal(sent.length, 0);
});

test("webhook refuses to connect tokens from non-private chats", async () => {
  const store = createStore({
    token: "token-1",
    userId: "user-1",
    expiresAt: "2026-05-29T10:15:00.000Z",
    usedAt: null,
  });
  const sent: SendTelegramMessageParams[] = [];
  const app = buildServer({
    config: config(),
    deps: {
      store: store.store,
      sendTelegramMessage: async (params) => {
        sent.push(params);
      },
      now: () => new Date("2026-05-29T10:00:00.000Z"),
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/telegram/webhook",
    headers: { "x-telegram-bot-api-secret-token": "webhook-secret" },
    payload: telegramUpdate("/start token-1", "supergroup"),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true });
  assert.deepEqual(store.calls, []);
  assert.equal(sent.length, 1);
  assert.match(sent[0]?.text ?? "", /личном чате с ботом/);
});

test("webhook does not claim a token when chat ownership lookup fails", async () => {
  const store = createStore(
    {
      token: "token-1",
      userId: "user-1",
      expiresAt: "2026-05-29T10:15:00.000Z",
      usedAt: null,
    },
    { failExistingLinkLookup: true },
  );
  const sent: SendTelegramMessageParams[] = [];
  const app = buildServer({
    config: config(),
    deps: {
      store: store.store,
      sendTelegramMessage: async (params) => {
        sent.push(params);
      },
      now: () => new Date("2026-05-29T10:00:00.000Z"),
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/telegram/webhook",
    headers: { "x-telegram-bot-api-secret-token": "webhook-secret" },
    payload: telegramUpdate("/start token-1"),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(store.calls, ["markLastSeen", "getConnectToken", "getUserLinkByChatId"]);
  assert.equal(sent.length, 1);
  assert.match(sent[0]?.text ?? "", /попробуйте ещё раз/);
});

test("webhook does not claim a token when token lookup storage fails", async () => {
  const store = createStore(null, { failGetConnectToken: true });
  const sent: SendTelegramMessageParams[] = [];
  const app = buildServer({
    config: config(),
    deps: {
      store: store.store,
      sendTelegramMessage: async (params) => {
        sent.push(params);
      },
      now: () => new Date("2026-05-29T10:00:00.000Z"),
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/telegram/webhook",
    headers: { "x-telegram-bot-api-secret-token": "webhook-secret" },
    payload: telegramUpdate("/start token-1"),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(store.calls, ["markLastSeen", "getConnectToken"]);
  assert.equal(sent.length, 1);
  assert.match(sent[0]?.text ?? "", /попробуйте ещё раз/);
  assert.doesNotMatch(sent[0]?.text ?? "", /недействительна|истекла/);
});

test("webhook lets only one concurrent start claim the same token", async () => {
  const store = createStore({
    token: "token-1",
    userId: "user-1",
    expiresAt: "2026-05-29T10:15:00.000Z",
    usedAt: null,
  });
  const sent: SendTelegramMessageParams[] = [];
  const app = buildServer({
    config: config(),
    deps: {
      store: store.store,
      sendTelegramMessage: async (params) => {
        sent.push(params);
      },
      now: () => new Date("2026-05-29T10:00:00.000Z"),
    },
  });

  const request = {
    method: "POST" as const,
    url: "/api/telegram/webhook",
    headers: { "x-telegram-bot-api-secret-token": "webhook-secret" },
    payload: telegramUpdate("/start token-1"),
  };

  const [first, second] = await Promise.all([app.inject(request), app.inject(request)]);

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(store.calls.filter((call) => call === "claimConnectToken").length, 2);
  assert.equal(store.calls.filter((call) => call === "upsertUserLink").length, 1);
  assert.equal(sent.filter((message) => /Готово!/.test(message.text)).length, 1);
  assert.equal(sent.filter((message) => /уже использована или истекла/.test(message.text)).length, 1);
});

test("webhook tells the user to generate a fresh link if linking fails after token claim", async () => {
  const store = createStore(
    {
      token: "token-1",
      userId: "user-1",
      expiresAt: "2026-05-29T10:15:00.000Z",
      usedAt: null,
    },
    { failUpsert: true },
  );
  const sent: SendTelegramMessageParams[] = [];
  const app = buildServer({
    config: config(),
    deps: {
      store: store.store,
      sendTelegramMessage: async (params) => {
        sent.push(params);
      },
      now: () => new Date("2026-05-29T10:00:00.000Z"),
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/telegram/webhook",
    headers: { "x-telegram-bot-api-secret-token": "webhook-secret" },
    payload: telegramUpdate("/start token-1"),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(store.calls, [
    "markLastSeen",
    "getConnectToken",
    "getUserLinkByChatId",
    "claimConnectToken",
    "upsertUserLink",
  ]);
  assert.equal(sent.length, 1);
  assert.match(sent[0]?.text ?? "", /сгенерируйте новую ссылку/);
  assert.doesNotMatch(sent[0]?.text ?? "", /ошибка базы|повторите|retry|database/i);
});

test("webhook unlinks a chat on stop commands", async () => {
  const store = createStore();
  const sent: SendTelegramMessageParams[] = [];
  const app = buildServer({
    config: config(),
    deps: {
      store: store.store,
      sendTelegramMessage: async (params) => {
        sent.push(params);
      },
      now: () => new Date("2026-05-29T10:00:00.000Z"),
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/telegram/webhook",
    headers: { "x-telegram-bot-api-secret-token": "webhook-secret" },
    payload: telegramUpdate("/unlink"),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(store.calls, ["markLastSeen", "deleteUserLinkByChatId"]);
  assert.equal(sent.length, 1);
  assert.match(sent[0]?.text ?? "", /отключил уведомления/);
});

test("webhook does not confirm unlink when deleting the link fails", async () => {
  const store = createStore(null, { failDelete: true });
  const sent: SendTelegramMessageParams[] = [];
  const app = buildServer({
    config: config(),
    deps: {
      store: store.store,
      sendTelegramMessage: async (params) => {
        sent.push(params);
      },
      now: () => new Date("2026-05-29T10:00:00.000Z"),
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/telegram/webhook",
    headers: { "x-telegram-bot-api-secret-token": "webhook-secret" },
    payload: telegramUpdate("/unlink"),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(store.calls, ["markLastSeen", "deleteUserLinkByChatId"]);
  assert.equal(sent.length, 1);
  assert.match(sent[0]?.text ?? "", /не удалось отключить/);
  assert.doesNotMatch(sent[0]?.text ?? "", /отключил уведомления/);
});
