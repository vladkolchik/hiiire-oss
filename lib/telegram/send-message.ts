import {
  createTelegramProxyFetch,
  normalizeTelegramProxyUrl,
  type TelegramFetchLike,
} from "./proxy-fetch.ts";

export type TelegramSendParams = {
  chatId: number;
  text: string;
  disableWebPagePreview?: boolean;
};

export type TelegramSendEnv = {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_RELAY_URL?: string;
  TELEGRAM_RELAY_SECRET?: string;
  TELEGRAM_PROXY_URL?: string;
  TELEGRAM_REQUEST_TIMEOUT_MS?: string;
};

export type TelegramSendRequest = {
  url: string;
  init: RequestInit;
  timeoutMs: number;
  proxyUrl?: string;
};

export type FetchLike = TelegramFetchLike;

export type TelegramProxyFetchFactory = (proxyUrl: string) => FetchLike;

function requireEnv(env: TelegramSendEnv, name: keyof TelegramSendEnv): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function normalizeRelayUrl(rawUrl: string): string {
  const base = rawUrl.endsWith("/") ? rawUrl : `${rawUrl}/`;
  return new URL("/api/telegram/send", base).toString();
}

function parseTimeoutMs(rawValue: string | undefined): number {
  if (!rawValue) return 8000;
  const timeoutMs = Number(rawValue);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) {
    throw new Error("Invalid TELEGRAM_REQUEST_TIMEOUT_MS");
  }
  return timeoutMs;
}

export function buildTelegramSendRequest(params: TelegramSendParams, env: TelegramSendEnv): TelegramSendRequest {
  const relayUrl = env.TELEGRAM_RELAY_URL?.trim();
  const proxyUrl = env.TELEGRAM_PROXY_URL?.trim();

  if (relayUrl && proxyUrl) {
    throw new Error("Invalid Telegram transport configuration");
  }

  if (relayUrl) {
    const relaySecret = requireEnv(env, "TELEGRAM_RELAY_SECRET");
    return {
      url: normalizeRelayUrl(relayUrl),
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-relay-secret": relaySecret,
        },
        body: JSON.stringify({
          chatId: params.chatId,
          text: params.text,
          disableWebPagePreview: params.disableWebPagePreview ?? true,
        }),
      },
      timeoutMs: parseTimeoutMs(env.TELEGRAM_REQUEST_TIMEOUT_MS),
    };
  }

  const botToken = requireEnv(env, "TELEGRAM_BOT_TOKEN");
  return {
    url: `https://api.telegram.org/bot${botToken}/sendMessage`,
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: params.chatId,
        text: params.text,
        disable_web_page_preview: params.disableWebPagePreview ?? true,
      }),
    },
    timeoutMs: parseTimeoutMs(env.TELEGRAM_REQUEST_TIMEOUT_MS),
    proxyUrl: proxyUrl ? normalizeTelegramProxyUrl(proxyUrl) : undefined,
  };
}

export async function sendTelegramRequest(
  params: TelegramSendParams,
  env: TelegramSendEnv,
  fetchImpl: FetchLike = fetch,
  proxyFetchFactory: TelegramProxyFetchFactory = createTelegramProxyFetch,
): Promise<void> {
  const request = buildTelegramSendRequest(params, env);
  let transportFetch: FetchLike;

  try {
    transportFetch = request.proxyUrl ? proxyFetchFactory(request.proxyUrl) : fetchImpl;
  } catch {
    throw new Error("TELEGRAM_SEND_FAILED");
  }

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      (async () => {
        const response = await transportFetch(request.url, {
          ...request.init,
          signal: controller.signal,
        });
        await assertTelegramSendResponse(response);
      })(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error("TELEGRAM_SEND_TIMEOUT"));
        }, request.timeoutMs);
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

export async function assertTelegramSendResponse(response: Response): Promise<void> {
  const json = (await response.json().catch(() => null)) as { ok?: unknown; description?: unknown; error?: unknown } | null;

  if (response.ok && json?.ok === true) {
    return;
  }

  throw new Error(`TELEGRAM_SEND_FAILED status=${response.status}`);
}
