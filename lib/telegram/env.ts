import "server-only";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function getTelegramBotToken(): string {
  return requireEnv("TELEGRAM_BOT_TOKEN");
}

export function getTelegramBotUsername(): string {
  // Accept both "mybot" and "@mybot"
  const raw = requireEnv("TELEGRAM_BOT_USERNAME").trim();
  return raw.startsWith("@") ? raw.slice(1) : raw;
}

export function getTelegramWebhookSecret(): string {
  return requireEnv("TELEGRAM_WEBHOOK_SECRET");
}

export function getTelegramOwnerChatIds(): number[] {
  const raw = String(process.env.TELEGRAM_OWNER_CHAT_IDS ?? "");
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const ids: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (Number.isSafeInteger(n)) ids.push(n);
  }

  return ids;
}

