type VerificationResendRecord = {
  lastResendAt: number | null;
  resendWindowStartedAt: number;
  resendCountInWindow: number;
};

type VerificationResendStore = Map<string, VerificationResendRecord>;

declare global {
  var __hiiireVerificationResendRateLimitStore: VerificationResendStore | undefined;
}

export const verificationResendCooldownSeconds = 60;
export const verificationResendWindowMs = 60 * 60 * 1000;
export const verificationMaxResendsPerWindow = 5;

function getStore() {
  if (!globalThis.__hiiireVerificationResendRateLimitStore) {
    globalThis.__hiiireVerificationResendRateLimitStore = new Map<string, VerificationResendRecord>();
  }

  return globalThis.__hiiireVerificationResendRateLimitStore;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function compactStore(now: number) {
  const store = getStore();
  for (const [email, record] of store.entries()) {
    if (now - record.resendWindowStartedAt >= verificationResendWindowMs) {
      store.delete(email);
    }
  }
}

function getCooldownLeftSeconds(record: VerificationResendRecord, now: number) {
  if (!record.lastResendAt) return 0;
  const leftMs = record.lastResendAt + verificationResendCooldownSeconds * 1_000 - now;
  if (leftMs <= 0) return 0;
  return Math.ceil(leftMs / 1_000);
}

export function consumeVerificationEmailResendRateLimit(email: string, now = Date.now()) {
  const normalizedEmail = normalizeEmail(email);
  const store = getStore();

  compactStore(now);

  const existing = store.get(normalizedEmail);
  const windowExpired = !existing || now - existing.resendWindowStartedAt >= verificationResendWindowMs;
  const current: VerificationResendRecord = windowExpired
    ? {
        lastResendAt: null,
        resendWindowStartedAt: now,
        resendCountInWindow: 0,
      }
    : existing;

  const cooldownLeftSeconds = getCooldownLeftSeconds(current, now);
  if (cooldownLeftSeconds > 0) {
    return {
      ok: false as const,
      reason: "cooldown" as const,
      cooldownLeftSeconds,
    };
  }

  if (current.resendCountInWindow >= verificationMaxResendsPerWindow) {
    const retryAfterMs = current.resendWindowStartedAt + verificationResendWindowMs - now;
    return {
      ok: false as const,
      reason: "rate_limit" as const,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1_000)),
    };
  }

  const next: VerificationResendRecord = {
    lastResendAt: now,
    resendWindowStartedAt: current.resendWindowStartedAt,
    resendCountInWindow: current.resendCountInWindow + 1,
  };

  store.set(normalizedEmail, next);

  return {
    ok: true as const,
  };
}
