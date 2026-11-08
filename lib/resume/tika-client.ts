export type TikaResult =
  | { ok: true; text: string }
  | {
      ok: false;
      code: "TIKA_NOT_CONFIGURED" | "TIKA_AUTH_FAILED" | "TIKA_UNAVAILABLE" | "TIKA_TIMEOUT" | "TIKA_PARSE_FAILED";
      status?: number;
    };

export type TikaClientInput = {
  file: File;
  fileKind?: string;
  requestId?: string;
  timeoutMs?: number;
};

export const DEFAULT_TIKA_TIMEOUT_MS = 20_000;
const RESUME_FILE_KIND_VALUES = new Set(["pdf", "doc", "docx", "txt"]);
const CONTENT_TYPE_BY_FILE_KIND: Record<string, string> = {
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  txt: "text/plain",
};

export function getTikaTimeoutMs(explicitTimeoutMs?: number): number {
  if (explicitTimeoutMs !== undefined && Number.isFinite(explicitTimeoutMs) && explicitTimeoutMs > 0) {
    return explicitTimeoutMs;
  }

  const envTimeoutMs = Number(process.env.TIKA_TIMEOUT_MS);
  if (Number.isFinite(envTimeoutMs) && envTimeoutMs > 0) {
    return envTimeoutMs;
  }

  return DEFAULT_TIKA_TIMEOUT_MS;
}

function getTikaBaseUrl(): string | null {
  const baseUrl = process.env.TIKA_BASE_URL?.trim();
  if (!baseUrl) {
    return null;
  }

  return baseUrl.replace(/\/+$/, "");
}

function sanitizeResumeFileKind(fileKind?: string): string | null {
  const normalized = fileKind?.trim().toLowerCase();
  if (!normalized || !RESUME_FILE_KIND_VALUES.has(normalized)) {
    return null;
  }

  return normalized;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export async function extractPlainTextWithTika(input: TikaClientInput): Promise<TikaResult> {
  const baseUrl = getTikaBaseUrl();
  if (!baseUrl) {
    return { ok: false, code: "TIKA_NOT_CONFIGURED" };
  }

  const timeoutMs = getTikaTimeoutMs(input.timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers({
    Accept: "text/plain",
  });
  const authToken = process.env.TIKA_AUTH_TOKEN?.trim();
  const fileKind = sanitizeResumeFileKind(input.fileKind);

  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }
  if (input.requestId) {
    headers.set("X-Hiiire-Request-Id", input.requestId);
  }
  if (fileKind) {
    headers.set("X-Hiiire-File-Kind", fileKind);
    headers.set("Content-Type", CONTENT_TYPE_BY_FILE_KIND[fileKind]);
  } else if (input.file.type) {
    headers.set("Content-Type", input.file.type);
  }

  try {
    const response = await fetch(`${baseUrl}/tika`, {
      method: "PUT",
      body: input.file,
      headers,
      signal: controller.signal,
    });

    if (response.status === 408 || response.status === 504) {
      return { ok: false, code: "TIKA_TIMEOUT", status: response.status };
    }

    if (response.status === 401 || response.status === 403) {
      return { ok: false, code: "TIKA_AUTH_FAILED", status: response.status };
    }

    if (response.status === 503) {
      return { ok: false, code: "TIKA_UNAVAILABLE", status: response.status };
    }

    if (!response.ok) {
      return { ok: false, code: "TIKA_PARSE_FAILED", status: response.status };
    }

    return { ok: true, text: await response.text() };
  } catch (error) {
    if (isAbortError(error)) {
      return { ok: false, code: "TIKA_TIMEOUT" };
    }

    return { ok: false, code: "TIKA_UNAVAILABLE" };
  } finally {
    clearTimeout(timeout);
  }
}
