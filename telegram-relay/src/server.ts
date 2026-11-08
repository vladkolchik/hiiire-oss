import crypto from "node:crypto";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";

import type { RelayConfig } from "./config.js";
import { logJson } from "./logger.js";

const MAX_TELEGRAM_TEXT_LENGTH = 4096;

export type SendTelegramMessageParams = {
  chatId: number;
  text: string;
  disableWebPagePreview?: boolean;
};

export type ConnectTokenRow = {
  token: string;
  userId: string;
  expiresAt: string;
  usedAt: string | null;
};

export type UserLinkRow = {
  userId: string;
  chatId: number;
};

export type TelegramRelayStore = {
  markLastSeen(chatId: number, seenAt: string): Promise<void>;
  deleteUserLinkByChatId(chatId: number): Promise<void>;
  getConnectToken(token: string): Promise<ConnectTokenRow | null>;
  claimConnectToken(token: string, usedAt: string): Promise<ConnectTokenRow | null>;
  getUserLinkByChatId(chatId: number): Promise<UserLinkRow | null>;
  upsertUserLink(input: { userId: string; chatId: number; connectedAt: string; lastSeenAt: string }): Promise<void>;
};

export type TelegramRelayDeps = {
  sendTelegramMessage(params: SendTelegramMessageParams): Promise<void>;
  store: TelegramRelayStore;
  now?: () => Date;
};

export type BuildServerOptions = {
  config: RelayConfig;
  deps: TelegramRelayDeps;
};

type SendBody = {
  chatId?: unknown;
  text?: unknown;
  disableWebPagePreview?: unknown;
};

type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    date?: number;
    text?: string;
    chat?: { id: number; type?: string };
    from?: { id: number; username?: string; first_name?: string; last_name?: string };
  };
};

function sha256(value: string): Buffer {
  return crypto.createHash("sha256").update(value).digest();
}

function safeSecretEqual(supplied: string | undefined, expected: string): boolean {
  if (!supplied) return false;
  return crypto.timingSafeEqual(sha256(supplied), sha256(expected));
}

function getSingleHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseSendBody(body: unknown): SendTelegramMessageParams | null {
  const input = body as SendBody | null;
  if (!input || typeof input !== "object") return null;

  const chatId = input.chatId;
  const text = input.text;
  const disableWebPagePreview = input.disableWebPagePreview;

  if (typeof chatId !== "number" || !Number.isSafeInteger(chatId)) return null;
  if (typeof text !== "string") return null;

  const trimmedText = text.trim();
  if (!trimmedText || trimmedText.length > MAX_TELEGRAM_TEXT_LENGTH) return null;
  if (disableWebPagePreview !== undefined && typeof disableWebPagePreview !== "boolean") return null;

  return {
    chatId,
    text: trimmedText,
    ...(disableWebPagePreview === undefined ? {} : { disableWebPagePreview }),
  };
}

async function handleSendRoute(request: FastifyRequest, reply: FastifyReply, options: BuildServerOptions): Promise<void> {
  const suppliedSecret = getSingleHeader(request.headers["x-telegram-relay-secret"]);
  if (!safeSecretEqual(suppliedSecret, options.config.telegramRelaySecret)) {
    await reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });
    return;
  }

  const parsed = parseSendBody(request.body);
  if (!parsed) {
    await reply.code(400).send({ ok: false, error: "INVALID_BODY" });
    return;
  }

  try {
    await options.deps.sendTelegramMessage(parsed);
    await reply.send({ ok: true });
  } catch {
    logJson("warn", "telegram_relay_send_failed", { result_code: "telegram_send_failed" });
    await reply.code(502).send({ ok: false, error: "TELEGRAM_SEND_FAILED" });
  }
}

function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseStartToken(text: string): string | null {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  const command = parts[0];
  if (command !== "/start") return null;
  return parts.length === 2 ? (parts[1] ?? null) : null;
}

async function sendBestEffort(deps: TelegramRelayDeps, params: SendTelegramMessageParams): Promise<void> {
  await deps.sendTelegramMessage(params).catch(() => undefined);
}

async function handleWebhookRoute(
  request: FastifyRequest,
  reply: FastifyReply,
  options: BuildServerOptions,
): Promise<void> {
  const suppliedSecret = getSingleHeader(request.headers["x-telegram-bot-api-secret-token"]);
  if (!safeSecretEqual(suppliedSecret, options.config.telegramWebhookSecret)) {
    await reply.code(401).send({ ok: false, error: "UNAUTHORIZED" });
    return;
  }

  const update = request.body as TelegramUpdate | null;
  const message = update?.message;
  const chatId = message?.chat?.id;
  const chatType = message?.chat?.type;
  if (!message || typeof chatId !== "number" || !Number.isSafeInteger(chatId)) {
    await reply.send({ ok: true });
    return;
  }

  const now = options.deps.now?.() ?? new Date();
  const nowIso = now.toISOString();
  const text = safeTrim(message.text);
  const token = parseStartToken(text);

  if (token && chatType !== "private") {
    await sendBestEffort(options.deps, {
      chatId,
      text: "Подключение доступно только в личном чате с ботом.\n\nОткройте hiiire: Настройки → Уведомления → Telegram и нажмите «Подключить Telegram» ещё раз.",
    });
    await reply.send({ ok: true });
    return;
  }

  await options.deps.store.markLastSeen(chatId, nowIso).catch(() => undefined);

  if (text === "/unlink" || text === "/stop") {
    const deleted = await options.deps.store
      .deleteUserLinkByChatId(chatId)
      .then(() => true)
      .catch(() => false);
    if (!deleted) {
      await sendBestEffort(options.deps, {
        chatId,
        text: "К сожалению, не удалось отключить уведомления. Попробуйте ещё раз через пару минут или отключите Telegram в hiiire: Настройки → Уведомления.",
      });
      await reply.send({ ok: true });
      return;
    }

    await sendBestEffort(options.deps, {
      chatId,
      text: "Ок, отключил уведомления для этого чата.\n\nЕсли захотите подключить снова — зайдите в hiiire: Настройки → Уведомления → Telegram.",
    });
    await reply.send({ ok: true });
    return;
  }

  if (!token) {
    await reply.send({ ok: true });
    return;
  }

  let tokenRow: ConnectTokenRow | null;
  try {
    tokenRow = await options.deps.store.getConnectToken(token);
  } catch {
    await sendBestEffort(options.deps, {
      chatId,
      text: "Сейчас не удалось проверить ссылку Telegram, попробуйте ещё раз через пару минут.",
    });
    await reply.send({ ok: true });
    return;
  }

  if (!tokenRow) {
    await sendBestEffort(options.deps, {
      chatId,
      text: "Не удалось подключить: ссылка недействительна.\n\nОткройте hiiire: Настройки → Уведомления → Telegram и сгенерируйте новую ссылку.",
    });
    await reply.send({ ok: true });
    return;
  }

  const expiresAt = new Date(tokenRow.expiresAt);
  const isExpired = !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < now.getTime();
  if (tokenRow.usedAt || isExpired) {
    await sendBestEffort(options.deps, {
      chatId,
      text: "Не удалось подключить: ссылка уже использована или истекла.\n\nОткройте hiiire: Настройки → Уведомления → Telegram и сгенерируйте новую ссылку.",
    });
    await reply.send({ ok: true });
    return;
  }

  let existingByChat: UserLinkRow | null;
  try {
    existingByChat = await options.deps.store.getUserLinkByChatId(chatId);
  } catch {
    await sendBestEffort(options.deps, {
      chatId,
      text: "Сейчас не удалось проверить подключение Telegram-чата, попробуйте ещё раз через пару минут.",
    });
    await reply.send({ ok: true });
    return;
  }
  if (existingByChat?.userId && existingByChat.userId !== tokenRow.userId) {
    await sendBestEffort(options.deps, {
      chatId,
      text: "Этот Telegram-чат уже подключён к другому аккаунту hiiire.\n\nЕсли это ошибка — сначала выполните /unlink, затем повторите подключение из нужного аккаунта.",
    });
    await reply.send({ ok: true });
    return;
  }

  const claimedToken = await options.deps.store.claimConnectToken(token, nowIso).catch(() => null);
  if (!claimedToken) {
    await sendBestEffort(options.deps, {
      chatId,
      text: "Не удалось подключить: ссылка уже использована или истекла.\n\nОткройте hiiire: Настройки → Уведомления → Telegram и сгенерируйте новую ссылку.",
    });
    await reply.send({ ok: true });
    return;
  }

  try {
    await options.deps.store.upsertUserLink({
      userId: claimedToken.userId,
      chatId,
      connectedAt: nowIso,
      lastSeenAt: nowIso,
    });
  } catch {
    await sendBestEffort(options.deps, {
      chatId,
      text: "Не удалось подключить уведомления.\n\nОткройте hiiire: Настройки → Уведомления → Telegram и сгенерируйте новую ссылку.",
    });
    await reply.send({ ok: true });
    return;
  }

  await sendBestEffort(options.deps, {
    chatId,
    text: "Готово! Telegram уведомления подключены.\n\nЧтобы отключить — отправьте /unlink или сделайте это в hiiire: Настройки → Уведомления → Telegram.",
  });
  await reply.send({ ok: true });
}

export function buildServer(options: BuildServerOptions): FastifyInstance {
  const app = Fastify({ logger: false });

  app.setErrorHandler(async (error: { statusCode?: number }, request, reply) => {
    if (request.url === "/api/telegram/webhook" && error.statusCode === 400) {
      await reply.code(200).send({ ok: true });
      return;
    }

    if (request.url === "/api/telegram/send" && error.statusCode === 400) {
      await reply.code(400).send({ ok: false, error: "INVALID_BODY" });
      return;
    }

    throw error;
  });

  app.get("/health", async () => ({
    ok: true,
    service: "telegram-relay",
  }));

  app.post("/api/telegram/send", async (request, reply) => handleSendRoute(request, reply, options));
  app.post("/api/telegram/webhook", async (request, reply) => handleWebhookRoute(request, reply, options));

  return app;
}
