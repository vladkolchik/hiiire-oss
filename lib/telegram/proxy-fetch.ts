import { fetch as undiciFetch, ProxyAgent } from "undici";

export type TelegramFetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const proxyAgents = new Map<string, ProxyAgent>();

export function normalizeTelegramProxyUrl(rawValue: string): string {
  let proxyUrl: URL;

  try {
    proxyUrl = new URL(rawValue);
  } catch {
    throw new Error("Invalid TELEGRAM_PROXY_URL");
  }

  if (!["http:", "https:"].includes(proxyUrl.protocol)) {
    throw new Error("Invalid TELEGRAM_PROXY_URL");
  }

  if (
    !proxyUrl.hostname ||
    (proxyUrl.pathname !== "/" && proxyUrl.pathname !== "") ||
    proxyUrl.search ||
    proxyUrl.hash
  ) {
    throw new Error("Invalid TELEGRAM_PROXY_URL");
  }

  return proxyUrl.toString();
}

function getProxyAgent(proxyUrl: string): ProxyAgent {
  const existing = proxyAgents.get(proxyUrl);
  if (existing) return existing;

  const agent = new ProxyAgent(proxyUrl);
  proxyAgents.set(proxyUrl, agent);
  return agent;
}

export function createTelegramProxyFetch(rawProxyUrl: string): TelegramFetchLike {
  const proxyUrl = normalizeTelegramProxyUrl(rawProxyUrl);
  const dispatcher = getProxyAgent(proxyUrl);

  return async (input, init) => {
    const response = await undiciFetch(input as Parameters<typeof undiciFetch>[0], {
      ...(init as Parameters<typeof undiciFetch>[1]),
      dispatcher,
    });

    return response as unknown as Response;
  };
}
