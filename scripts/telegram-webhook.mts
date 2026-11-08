import { createTelegramProxyFetch, type TelegramFetchLike } from "../lib/telegram/proxy-fetch.ts";

type Action = "set" | "get" | "delete";

const DEFAULT_WEBHOOK_URL = "https://tg.hiiire.com/api/telegram/webhook";

function usage(): string {
  return [
    "Usage:",
    "  npm run telegram:webhook -- set",
    "  npm run telegram:webhook -- get",
    "  npm run telegram:webhook -- delete",
    "  node --no-warnings --experimental-strip-types scripts/telegram-webhook.mts set --url https://tg.hiiire.com/api/telegram/webhook",
    "",
    "Env:",
    "  TELEGRAM_BOT_TOKEN          required unless --token is passed",
    "  TELEGRAM_WEBHOOK_SECRET     required for set unless --secret is passed",
    "  TELEGRAM_WEBHOOK_URL        optional, defaults to tg.hiiire.com relay",
    "  TELEGRAM_PROXY_URL          optional HTTP(S) proxy for Telegram Bot API calls",
    "",
    "Options:",
    "  --token <token>",
    "  --secret <secret>",
    "  --url <webhook-url>",
    "  --proxy-url <proxy-url>",
    "  --drop-pending-updates",
  ].join("\n");
}

function readOption(args: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  const inlineValue = args.find((arg) => arg.startsWith(prefix));
  if (inlineValue) return inlineValue.slice(prefix.length);

  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function requireSecretValue(value: string | undefined, label: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  if (/\s/.test(trimmed)) {
    throw new Error(`${label} must not contain whitespace`);
  }
  return trimmed;
}

function botApiUrl(token: string, method: string): string {
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function readTelegramJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, http_status: response.status, body: text };
  }
}

async function callTelegram(
  fetchImpl: TelegramFetchLike,
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetchImpl(botApiUrl(token, method), {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await readTelegramJson(response);

  if (!response.ok || (typeof json === "object" && json !== null && "ok" in json && json.ok === false)) {
    process.exitCode = 1;
  }

  return json;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const action = args[0] as Action | undefined;
  if (!action || action === ("--help" as Action) || action === ("-h" as Action) || !["set", "get", "delete"].includes(action)) {
    console.log(usage());
    process.exitCode = action && action !== ("--help" as Action) && action !== ("-h" as Action) ? 1 : 0;
    return;
  }

  const token = requireSecretValue(readOption(args, "--token") ?? process.env.TELEGRAM_BOT_TOKEN, "Telegram bot token");
  const proxyUrl = readOption(args, "--proxy-url") ?? process.env.TELEGRAM_PROXY_URL;
  const fetchImpl = proxyUrl?.trim() ? createTelegramProxyFetch(proxyUrl.trim()) : fetch;

  if (action === "get") {
    console.log(JSON.stringify(await callTelegram(fetchImpl, token, "getWebhookInfo"), null, 2));
    return;
  }

  if (action === "delete") {
    console.log(
      JSON.stringify(
        await callTelegram(fetchImpl, token, "deleteWebhook", {
          drop_pending_updates: hasFlag(args, "--drop-pending-updates"),
        }),
        null,
        2
      )
    );
    return;
  }

  const webhookUrl = readOption(args, "--url") ?? process.env.TELEGRAM_WEBHOOK_URL ?? DEFAULT_WEBHOOK_URL;
  const secret = requireSecretValue(
    readOption(args, "--secret") ?? process.env.TELEGRAM_WEBHOOK_SECRET,
    "Telegram webhook secret"
  );

  console.log(
    JSON.stringify(
      await callTelegram(fetchImpl, token, "setWebhook", {
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: ["message"],
        drop_pending_updates: hasFlag(args, "--drop-pending-updates"),
      }),
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error && error.message === "Invalid TELEGRAM_PROXY_URL"
      ? error.message
      : "Telegram webhook request failed";
  console.error(message);
  process.exitCode = 1;
});
