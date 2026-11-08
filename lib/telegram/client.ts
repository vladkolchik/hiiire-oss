import "server-only";

import { sendTelegramRequest, type TelegramSendEnv, type TelegramSendParams } from "@/lib/telegram/send-message";

export async function sendTelegramMessage(params: TelegramSendParams): Promise<void> {
  const env: TelegramSendEnv = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    TELEGRAM_RELAY_URL: process.env.TELEGRAM_RELAY_URL,
    TELEGRAM_RELAY_SECRET: process.env.TELEGRAM_RELAY_SECRET,
    TELEGRAM_PROXY_URL: process.env.TELEGRAM_PROXY_URL,
    TELEGRAM_REQUEST_TIMEOUT_MS: process.env.TELEGRAM_REQUEST_TIMEOUT_MS,
  };

  await sendTelegramRequest(params, env);
}

