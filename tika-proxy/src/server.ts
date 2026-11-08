import crypto from "node:crypto";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";

import type { ProxyConfig } from "./config.js";
import { logJson, type SafeFields } from "./logger.js";
import type { Telemetry, TikaProxyEventName } from "./posthog.js";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const BODY_LIMIT_BYTES = 6 * 1024 * 1024;
const MAX_UPSTREAM_TEXT_BYTES = 256 * 1024;
const HEALTH_TIMEOUT_MS = 1_500;
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;
const VALID_FILE_KINDS = new Set(["pdf", "doc", "docx", "txt"]);
const RESUME_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);
const RAW_CONTENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
  "text/plain",
] as const;

type BuildServerOptions = {
  config: ProxyConfig;
  telemetry: Telemetry;
  fetchImpl?: FetchLike;
};

type RequestContext = {
  requestId: string;
  fileKind: string;
  fileSizeBytes: number;
  startedAt: number;
};

function getSingleHeader(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  return value;
}

function sanitizeRequestId(value: string | string[] | undefined): string {
  const requestId = getSingleHeader(value);

  if (!requestId || !SAFE_REQUEST_ID_PATTERN.test(requestId)) {
    return crypto.randomUUID();
  }

  return requestId;
}

function sanitizeFileKind(value: string | string[] | undefined): string {
  const fileKind = getSingleHeader(value)?.trim().toLowerCase();

  if (!fileKind || !VALID_FILE_KINDS.has(fileKind)) {
    return "unknown";
  }

  return fileKind;
}

function normalizeContentType(value: string | string[] | undefined): string | null {
  const rawContentType = getSingleHeader(value);
  const contentType = rawContentType?.split(";")[0]?.trim().toLowerCase();

  return contentType || null;
}

function isSupportedResumeContentType(request: FastifyRequest): boolean {
  const contentType = normalizeContentType(request.headers["content-type"]);

  if (!contentType) {
    return false;
  }

  if (RESUME_CONTENT_TYPES.has(contentType)) {
    return true;
  }

  if (contentType === "application/octet-stream") {
    return VALID_FILE_KINDS.has(sanitizeFileKind(request.headers["x-hiiire-file-kind"]));
  }

  return false;
}

function getForwardableContentType(request: FastifyRequest): string | null {
  const contentType = normalizeContentType(request.headers["content-type"]);

  if (!contentType || !isSupportedResumeContentType(request)) {
    return null;
  }

  return contentType;
}

function sha256(value: string): Buffer {
  return crypto.createHash("sha256").update(value).digest();
}

function hasValidAuth(header: string | string[] | undefined, expectedToken: string): boolean {
  const authorization = getSingleHeader(header);
  const prefix = "Bearer ";

  if (!authorization?.startsWith(prefix)) {
    return false;
  }

  const suppliedToken = authorization.slice(prefix.length);
  if (!suppliedToken) {
    return false;
  }

  return crypto.timingSafeEqual(sha256(suppliedToken), sha256(expectedToken));
}

function durationSince(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function getErrorKind(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "timeout";
  }

  if (error instanceof Error && error.name === "AbortError") {
    return "timeout";
  }

  if (error instanceof TypeError) {
    return "network_error";
  }

  return "upstream_error";
}

function isTimeoutError(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || getErrorKind(error) === "timeout";
}

function safeCapture(
  telemetry: Telemetry,
  event: TikaProxyEventName,
  fields: SafeFields,
): void {
  try {
    telemetry.capture(event, fields);
  } catch (error) {
    logJson("warn", "telemetry_capture_failed", {
      error_kind: getErrorKind(error),
    });
  }
}

function logAndCapture(
  telemetry: Telemetry,
  level: "info" | "warn" | "error",
  event: TikaProxyEventName,
  fields: SafeFields,
): void {
  logJson(level, event, fields);
  safeCapture(telemetry, event, fields);
}

function registerRawBodyParsers(app: FastifyInstance): void {
  for (const contentType of RAW_CONTENT_TYPES) {
    if (contentType === "text/plain") {
      app.removeContentTypeParser(contentType);
    }

    app.addContentTypeParser(
      contentType,
      { parseAs: "buffer", bodyLimit: BODY_LIMIT_BYTES },
      (_request, body, done) => {
        done(null, body);
      },
    );
  }
}

async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
  config: ProxyConfig,
  telemetry: Telemetry,
): Promise<boolean> {
  if (hasValidAuth(request.headers.authorization, config.authToken)) {
    return true;
  }

  const requestId = sanitizeRequestId(request.headers["x-hiiire-request-id"]);
  logAndCapture(telemetry, "warn", "tika_proxy_request_rejected", {
    request_id: requestId,
    error_kind: "unauthorized",
    result_code: "unauthorized",
  });

  await reply.code(401).type("text/plain").send("Unauthorized");
  return false;
}

async function authenticateAndValidateRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  config: ProxyConfig,
  telemetry: Telemetry,
): Promise<void> {
  const isAuthenticated = await authenticate(request, reply, config, telemetry);
  if (!isAuthenticated) {
    return;
  }

  if (isSupportedResumeContentType(request)) {
    return;
  }

  logAndCapture(telemetry, "warn", "tika_proxy_request_rejected", {
    request_id: sanitizeRequestId(request.headers["x-hiiire-request-id"]),
    file_kind: sanitizeFileKind(request.headers["x-hiiire-file-kind"]),
    error_kind: "unsupported_content_type",
    result_code: "unsupported_content_type",
  });

  await reply.code(415).type("text/plain").send("Unsupported file type");
}

function getRequestContext(request: FastifyRequest): RequestContext {
  const body = request.body;

  return {
    requestId: sanitizeRequestId(request.headers["x-hiiire-request-id"]),
    fileKind: sanitizeFileKind(request.headers["x-hiiire-file-kind"]),
    fileSizeBytes: Buffer.isBuffer(body) ? body.length : 0,
    startedAt: performance.now(),
  };
}

async function proxyToTika(
  request: FastifyRequest,
  reply: FastifyReply,
  config: ProxyConfig,
  telemetry: Telemetry,
  fetchImpl: FetchLike,
): Promise<void> {
  const context = getRequestContext(request);

  if (!Buffer.isBuffer(request.body)) {
    const fields = {
      request_id: context.requestId,
      file_kind: context.fileKind,
      file_size_bytes: 0,
      duration_ms: durationSince(context.startedAt),
      error_kind: "invalid_body",
      result_code: "bad_request",
    };
    logAndCapture(telemetry, "warn", "tika_proxy_request_failed", fields);
    await reply.code(400).type("text/plain").send("Invalid request body");
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.tikaUpstreamTimeoutMs);
  const contentType = getForwardableContentType(request);

  if (!contentType) {
    const fields = {
      request_id: context.requestId,
      file_kind: context.fileKind,
      file_size_bytes: context.fileSizeBytes,
      duration_ms: durationSince(context.startedAt),
      error_kind: "unsupported_content_type",
      result_code: "unsupported_content_type",
    };
    logAndCapture(telemetry, "warn", "tika_proxy_request_rejected", fields);
    await reply.code(415).type("text/plain").send("Unsupported file type");
    clearTimeout(timeout);
    return;
  }

  try {
    const response = await fetchImpl(`${config.tikaUpstreamUrl}/tika`, {
      method: "PUT",
      headers: {
        accept: "text/plain",
        "content-type": contentType,
      },
      body: request.body as unknown as BodyInit,
      signal: controller.signal,
    });

    const baseFields = {
      request_id: context.requestId,
      file_kind: context.fileKind,
      file_size_bytes: context.fileSizeBytes,
      duration_ms: durationSince(context.startedAt),
      upstream_status: response.status,
    };

    if (!response.ok) {
      await cancelResponseBody(response);

      const isTimeoutStatus = response.status === 408 || response.status === 504;
      const fields = {
        ...baseFields,
        error_kind: isTimeoutStatus ? "timeout" : "upstream_error",
        result_code: isTimeoutStatus ? "timeout" : "upstream_error",
      };

      logAndCapture(telemetry, "warn", "tika_proxy_request_failed", fields);

      if (isTimeoutStatus) {
        await reply.code(504).type("text/plain").send("Tika upstream timeout");
        return;
      }

      await reply.code(502).type("text/plain").send("File could not be processed");
      return;
    }

    const upstreamText = await readResponseTextWithLimit(response, MAX_UPSTREAM_TEXT_BYTES);
    if (!upstreamText.ok) {
      logAndCapture(telemetry, "warn", "tika_proxy_request_failed", {
        ...baseFields,
        error_kind: "upstream_response_too_large",
        result_code: "upstream_response_too_large",
      });

      await reply.code(502).type("text/plain").send("File could not be processed");
      return;
    }

    logAndCapture(telemetry, "info", "tika_proxy_request_completed", {
      ...baseFields,
      result_code: "ok",
    });

    await reply.code(200).type("text/plain").send(upstreamText.text);
  } catch (error) {
    const timeoutError = isTimeoutError(error, controller.signal);
    const fields = {
      request_id: context.requestId,
      file_kind: context.fileKind,
      file_size_bytes: context.fileSizeBytes,
      duration_ms: durationSince(context.startedAt),
      error_kind: timeoutError ? "timeout" : "network_error",
      result_code: timeoutError ? "timeout" : "unavailable",
    };

    if (timeoutError) {
      logAndCapture(telemetry, "warn", "tika_proxy_request_failed", fields);
      await reply.code(504).type("text/plain").send("Tika upstream timeout");
      return;
    }

    logAndCapture(telemetry, "error", "tika_proxy_upstream_unavailable", fields);
    await reply.code(503).type("text/plain").send("Tika upstream unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

async function cancelResponseBody(response: Response): Promise<void> {
  if (!response.body) {
    return;
  }

  try {
    await response.body.cancel();
  } catch {
    // Best-effort cleanup only; response handling must keep returning safe errors.
  }
}

async function readResponseTextWithLimit(
  response: Response,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false }> {
  if (!response.body) {
    return { ok: true, text: "" };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      return { ok: false };
    }

    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return { ok: true, text };
}

async function checkTikaHealth(config: ProxyConfig, fetchImpl: FetchLike): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetchImpl(`${config.tikaUpstreamUrl}/version`, {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      await cancelResponseBody(response);
      return false;
    }

    await cancelResponseBody(response);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function buildServer(options: BuildServerOptions): FastifyInstance {
  const { config, telemetry, fetchImpl = fetch } = options;
  const app = Fastify({
    bodyLimit: BODY_LIMIT_BYTES,
    logger: false,
  });

  registerRawBodyParsers(app);

  app.get("/health", async (_request, reply) => {
    const tikaReady = await checkTikaHealth(config, fetchImpl);

    if (!tikaReady) {
      return reply.code(503).send({
        ok: false,
        service: config.posthogServiceName,
        upstream: "unavailable",
      });
    }

    return reply.send({
      ok: true,
      service: config.posthogServiceName,
      upstream: "ready",
    });
  });

  app.put(
    "/tika",
    {
      onRequest: async (request, reply) => authenticateAndValidateRequest(request, reply, config, telemetry),
    },
    async (request, reply) => proxyToTika(request, reply, config, telemetry, fetchImpl),
  );

  return app;
}
