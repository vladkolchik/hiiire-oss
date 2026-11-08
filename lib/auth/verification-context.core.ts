import { hasPendingEmailConfirmation, type SupabaseEmailConfirmationUserLike } from "./email-confirmation.ts";
import { maxResendsPerWindow, resendCooldownSeconds, resendWindowMs } from "./verification-resend.constants.ts";

export const verificationContextTtlMs = 15 * 60 * 1000;

export type VerificationContextPayload = {
  contextId: string;
  email: string;
  expiresAt: number;
  lastResendAt: number | null;
  resendWindowStartedAt: number;
  resendCountInWindow: number;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function createVerificationContext(email: string, now = Date.now()): VerificationContextPayload {
  const normalizedEmail = normalizeEmail(email);
  return {
    contextId: globalThis.crypto.randomUUID(),
    email: normalizedEmail,
    expiresAt: now + verificationContextTtlMs,
    lastResendAt: null,
    resendWindowStartedAt: now,
    resendCountInWindow: 0,
  };
}

export function createVerificationContextFromPendingUser(
  user: SupabaseEmailConfirmationUserLike | null | undefined,
  now = Date.now()
) {
  if (!user) return null;
  if (!hasPendingEmailConfirmation(user) || !user.email) return null;
  return createVerificationContext(user.email, now);
}

export function getCooldownLeftSeconds(payload: VerificationContextPayload, now = Date.now()) {
  if (!payload.lastResendAt) return 0;
  const leftMs = payload.lastResendAt + resendCooldownSeconds * 1000 - now;
  if (leftMs <= 0) return 0;
  return Math.ceil(leftMs / 1000);
}

export function canResendNow(payload: VerificationContextPayload, now = Date.now()) {
  const cooldownLeftSeconds = getCooldownLeftSeconds(payload, now);
  if (cooldownLeftSeconds > 0) {
    return { ok: false as const, reason: "cooldown" as const, cooldownLeftSeconds };
  }

  const windowExpired = now - payload.resendWindowStartedAt >= resendWindowMs;
  const countInWindow = windowExpired ? 0 : payload.resendCountInWindow;
  const windowStartedAt = windowExpired ? now : payload.resendWindowStartedAt;

  if (countInWindow >= maxResendsPerWindow) {
    const retryAfterMs = windowStartedAt + resendWindowMs - now;
    return {
      ok: false as const,
      reason: "rate_limit" as const,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  return {
    ok: true as const,
    next: {
      ...payload,
      lastResendAt: now,
      resendWindowStartedAt: windowStartedAt,
      resendCountInWindow: countInWindow + 1,
    },
  };
}

export function maskEmail(email: string) {
  const normalized = normalizeEmail(email);
  const [localPart = "", domainPart = ""] = normalized.split("@");
  if (!localPart || !domainPart) return normalized;

  const [domainName = "", tld = ""] = domainPart.split(".");
  const maskedLocal = localPart.length <= 2 ? `${localPart[0] ?? "*"}*` : `${localPart.slice(0, 2)}***`;
  const maskedDomain = domainName.length <= 2 ? `${domainName[0] ?? "*"}*` : `${domainName.slice(0, 2)}***`;

  return tld ? `${maskedLocal}@${maskedDomain}.${tld}` : `${maskedLocal}@${maskedDomain}`;
}
