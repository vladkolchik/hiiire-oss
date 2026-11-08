export type RelayConfig = {
  port: number;
  telegramBotToken: string;
  telegramBotUsername: string;
  telegramWebhookSecret: string;
  telegramRelaySecret: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  telegramRequestTimeoutMs: number;
};

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function parsePort(value: string | undefined): number {
  if (!value) return 3000;
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
    throw new Error("Invalid PORT");
  }
  return port;
}

function parseTimeoutMs(value: string | undefined): number {
  if (!value) return 8000;
  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
    throw new Error("Invalid TELEGRAM_REQUEST_TIMEOUT_MS");
  }
  return timeoutMs;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RelayConfig {
  const rawUsername = requireEnv(env, "TELEGRAM_BOT_USERNAME");

  return {
    port: parsePort(env.PORT),
    telegramBotToken: requireEnv(env, "TELEGRAM_BOT_TOKEN"),
    telegramBotUsername: rawUsername.startsWith("@") ? rawUsername.slice(1) : rawUsername,
    telegramWebhookSecret: requireEnv(env, "TELEGRAM_WEBHOOK_SECRET"),
    telegramRelaySecret: requireEnv(env, "TELEGRAM_RELAY_SECRET"),
    supabaseUrl: requireEnv(env, "NEXT_PUBLIC_SUPABASE_URL"),
    supabaseServiceRoleKey: requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY"),
    telegramRequestTimeoutMs: parseTimeoutMs(env.TELEGRAM_REQUEST_TIMEOUT_MS),
  };
}
