import type { RelayConfig } from "./config.js";
import type { SendTelegramMessageParams } from "./server.js";

type TelegramOk<T> = { ok: true; result: T };
type TelegramErr = { ok: false; error_code: number; description: string };

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function sendTelegramMessage(
  config: RelayConfig,
  params: SendTelegramMessageParams,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      (async () => {
        const response = await fetchImpl(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: params.chatId,
            text: params.text,
            disable_web_page_preview: params.disableWebPagePreview ?? true,
          }),
          signal: controller.signal,
        });

        const json = (await response.json().catch(() => null)) as TelegramOk<unknown> | TelegramErr | null;
        if (!response.ok || json?.ok !== true) {
          throw new Error(`TELEGRAM_SEND_FAILED status=${response.status}`);
        }
      })(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error("TELEGRAM_SEND_TIMEOUT"));
        }, config.telegramRequestTimeoutMs);
      }),
    ]);
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.message === "TELEGRAM_SEND_TIMEOUT")) {
      throw new Error("TELEGRAM_SEND_TIMEOUT");
    }
    if (error instanceof Error && error.message.startsWith("TELEGRAM_SEND_FAILED status=")) {
      throw error;
    }
    throw new Error("TELEGRAM_SEND_FAILED");
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
