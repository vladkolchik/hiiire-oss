import assert from "node:assert/strict";
import test from "node:test";

import { buildServer } from "../src/server.js";

test("health route reports the telegram relay service as ready", async () => {
  const app = buildServer({
    config: {
      port: 3000,
      telegramBotToken: "bot-token",
      telegramBotUsername: "hiiire_com_bot",
      telegramWebhookSecret: "webhook-secret",
      telegramRelaySecret: "relay-secret",
      supabaseUrl: "https://example.supabase.co",
      supabaseServiceRoleKey: "service-role",
      telegramRequestTimeoutMs: 8000,
    },
    deps: {
      sendTelegramMessage: async () => undefined,
      store: {
        markLastSeen: async () => undefined,
        deleteUserLinkByChatId: async () => undefined,
        getConnectToken: async () => null,
        claimConnectToken: async () => null,
        getUserLinkByChatId: async () => null,
        upsertUserLink: async () => undefined,
      },
    },
  });

  const response = await app.inject({ method: "GET", url: "/health" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    service: "telegram-relay",
  });
});
