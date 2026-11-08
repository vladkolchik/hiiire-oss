import "server-only";

type RateLimitRecord = {
  count: number;
  windowStartedAt: number;
};

type RateLimitStore = Map<string, RateLimitRecord>;

declare global {
  var __hiiireRateLimitStore: RateLimitStore | undefined;
}

function getStore(): RateLimitStore {
  if (!globalThis.__hiiireRateLimitStore) {
    globalThis.__hiiireRateLimitStore = new Map<string, RateLimitRecord>();
  }
  return globalThis.__hiiireRateLimitStore;
}

function compactStore(now: number, windowMs: number) {
  const store = getStore();
  for (const [key, record] of store.entries()) {
    if (now - record.windowStartedAt >= windowMs) {
      store.delete(key);
    }
  }
}

export function checkFixedWindowRateLimit(options: {
  namespace: string;
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}) {
  const now = options.now ?? Date.now();
  const scopedKey = `${options.namespace}:${options.key}`;
  const store = getStore();

  compactStore(now, options.windowMs);

  const current = store.get(scopedKey);
  if (!current || now - current.windowStartedAt >= options.windowMs) {
    store.set(scopedKey, { count: 1, windowStartedAt: now });
    return {
      allowed: true as const,
      retryAfterSeconds: 0,
      remaining: Math.max(0, options.limit - 1),
    };
  }

  if (current.count >= options.limit) {
    const retryAfterMs = current.windowStartedAt + options.windowMs - now;
    return {
      allowed: false as const,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      remaining: 0,
    };
  }

  current.count += 1;
  store.set(scopedKey, current);
  return {
    allowed: true as const,
    retryAfterSeconds: 0,
    remaining: Math.max(0, options.limit - current.count),
  };
}
