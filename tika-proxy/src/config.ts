export type ProxyConfig = {
  port: number;
  authToken: string;
  tikaUpstreamUrl: string;
  tikaUpstreamTimeoutMs: number;
  nodeEnv: string;
  posthogKey: string;
  posthogHost: string;
  posthogServiceName: string;
};

type Env = Record<string, string | undefined>;

const DEFAULT_PORT = 3000;
const DEFAULT_TIKA_UPSTREAM_URL = "http://tika:9998";
const DEFAULT_TIKA_UPSTREAM_TIMEOUT_MS = 12_000;
const DEFAULT_NODE_ENV = "production";
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const DEFAULT_POSTHOG_SERVICE_NAME = "tika-proxy";

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function loadConfig(env: Env = process.env): ProxyConfig {
  const authToken = env.TIKA_AUTH_TOKEN?.trim();

  if (!authToken) {
    throw new Error("TIKA_AUTH_TOKEN is required");
  }

  const tikaUpstreamUrl = trimTrailingSlash(
    env.TIKA_UPSTREAM_URL?.trim() || DEFAULT_TIKA_UPSTREAM_URL,
  );

  return {
    port: parsePositiveInteger(env.PORT, DEFAULT_PORT),
    authToken,
    tikaUpstreamUrl,
    tikaUpstreamTimeoutMs: parsePositiveInteger(
      env.TIKA_UPSTREAM_TIMEOUT_MS,
      DEFAULT_TIKA_UPSTREAM_TIMEOUT_MS,
    ),
    nodeEnv: env.NODE_ENV?.trim() || DEFAULT_NODE_ENV,
    posthogKey: env.POSTHOG_KEY?.trim() || "",
    posthogHost: env.POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST,
    posthogServiceName: env.POSTHOG_SERVICE_NAME?.trim() || DEFAULT_POSTHOG_SERVICE_NAME,
  };
}
