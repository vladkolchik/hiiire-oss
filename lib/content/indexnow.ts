import { getIndexNowPublishedUrls } from "./feeds.ts";
import { getAppOrigin } from "./seo.ts";

const DEFAULT_INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const INDEXNOW_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export type IndexNowPayload = {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
};

export type IndexNowSubmitResult = {
  endpoint: string;
  submittedUrls: string[];
  status: number;
  ok: boolean;
  body: string;
};

export function getIndexNowEndpoint(): string {
  const endpoint = process.env.INDEXNOW_ENDPOINT?.trim();
  return endpoint || DEFAULT_INDEXNOW_ENDPOINT;
}

export function getConfiguredIndexNowKey(): string | null {
  const key = process.env.INDEXNOW_KEY?.trim();

  if (!key) {
    return null;
  }

  if (!INDEXNOW_KEY_PATTERN.test(key)) {
    throw new Error("INDEXNOW_KEY must be 8-128 URL-safe characters");
  }

  return key;
}

export function getIndexNowUrlsFromEnv(): string[] {
  const configuredUrls = process.env.INDEXNOW_URLS?.trim();

  if (!configuredUrls) {
    return getIndexNowPublishedUrls();
  }

  return configuredUrls
    .split(/[,\n]/)
    .map((url) => url.trim())
    .filter(Boolean);
}

export function buildIndexNowPayload(
  urls: string[] = getIndexNowUrlsFromEnv(),
  key: string | null = getConfiguredIndexNowKey(),
): IndexNowPayload {
  if (!key) {
    throw new Error("INDEXNOW_KEY is required to submit IndexNow updates");
  }

  const origin = new URL(getAppOrigin());
  const uniqueUrls = [...new Set(urls)].filter((url) =>
    isSameOriginHttpUrl(url, origin.origin),
  );

  return {
    host: origin.host,
    key,
    keyLocation: `${origin.origin}/indexnow-key.txt`,
    urlList: uniqueUrls,
  };
}

export async function submitIndexNowUrls(
  urls: string[] = getIndexNowUrlsFromEnv(),
  options: { endpoint?: string; fetchImpl?: typeof fetch } = {},
): Promise<IndexNowSubmitResult> {
  const endpoint = options.endpoint ?? getIndexNowEndpoint();
  const fetchImpl = options.fetchImpl ?? fetch;
  const payload = buildIndexNowPayload(urls);

  if (payload.urlList.length === 0) {
    return {
      endpoint,
      submittedUrls: [],
      status: 204,
      ok: true,
      body: "No public URLs to submit",
    };
  }

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });
  const body = await response.text();

  return {
    endpoint,
    submittedUrls: payload.urlList,
    status: response.status,
    ok: response.ok,
    body,
  };
}

function isSameOriginHttpUrl(value: string, origin: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.origin === origin
    );
  } catch {
    return false;
  }
}
