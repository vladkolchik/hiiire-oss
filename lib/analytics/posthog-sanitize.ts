import type { CaptureResult } from "posthog-js";

const CLICK_ID_QUERY_PARAMS = new Set(["gclid", "fbclid", "msclkid"]);

function isClickIdPropertyKey(key: string) {
  const normalized = key
    .toLowerCase()
    .replace(/^\$/, "")
    .replace(/^initial_/, "")
    .replace(/^(first|last)_/, "");
  return CLICK_ID_QUERY_PARAMS.has(normalized);
}

export function sanitizePostHogUrl(value: string) {
  if (!/^https?:/i.test(value) && !value.startsWith("/") && !value.startsWith("?")) {
    return value;
  }

  let url: URL;
  let isRelative = false;

  try {
    url = new URL(value);
  } catch {
    try {
      url = new URL(value, "https://hiiire.local");
      isRelative = !/^https?:/i.test(value);
    } catch {
      return value;
    }
  }

  for (const key of Array.from(url.searchParams.keys())) {
    if (CLICK_ID_QUERY_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }

  return isRelative ? `${url.pathname}${url.search}${url.hash}` : url.toString();
}

function sanitizePostHogValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizePostHogUrl(value);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizePostHogValue);
  }

  if (value && typeof value === "object") {
    return sanitizePostHogProperties(value as Record<string, unknown>);
  }

  return value;
}

function sanitizePostHogProperties(properties: Record<string, unknown>) {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(properties)) {
    if (isClickIdPropertyKey(key)) continue;
    sanitized[key] = sanitizePostHogValue(value);
  }

  return sanitized;
}

export function sanitizePostHogCaptureResult(captureResult: CaptureResult | null): CaptureResult | null {
  if (!captureResult) return captureResult;

  return {
    ...captureResult,
    properties: sanitizePostHogProperties(captureResult.properties as Record<string, unknown>) as CaptureResult["properties"],
    $set: captureResult.$set ? sanitizePostHogProperties(captureResult.$set as Record<string, unknown>) as CaptureResult["$set"] : captureResult.$set,
    $set_once: captureResult.$set_once ? sanitizePostHogProperties(captureResult.$set_once as Record<string, unknown>) as CaptureResult["$set_once"] : captureResult.$set_once,
  };
}
