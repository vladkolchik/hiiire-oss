import { loadConfig } from "./config.js";
import { logJson } from "./logger.js";
import { buildServer } from "./server.js";
import { createSupabaseTelegramStore } from "./supabase.js";
import { sendTelegramMessage } from "./telegram.js";

const config = loadConfig();
const app = buildServer({
  config,
  deps: {
    sendTelegramMessage: (params) => sendTelegramMessage(config, params),
    store: createSupabaseTelegramStore(config),
  },
});

try {
  await app.listen({ host: "0.0.0.0", port: config.port });
  logJson("info", "telegram_relay_started", { port: config.port });
} catch (error) {
  logJson("error", "telegram_relay_start_failed", {
    error_kind: error instanceof Error ? error.name : "unknown",
  });
  process.exit(1);
}
