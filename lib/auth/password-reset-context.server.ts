import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const passwordResetContextCookieName = "hiiire_password_reset_ctx";
export const passwordResetRecoveryMarkerCookieName = "hiiire_password_reset_recovery";
export const passwordResetContextTtlMs = 15 * 60 * 1000;
export const passwordResetCooldownSeconds = 60;
export const passwordResetWindowMs = 60 * 60 * 1000;
export const maxPasswordResetRequestsPerWindow = 5;

type PasswordResetContextPayload = {
  contextId: string;
  email: string;
  expiresAt: number;
  lastRequestedAt: number | null;
  requestWindowStartedAt: number;
  requestCountInWindow: number;
};

export type PasswordResetRecoveryMarkerPayload = {
  email: string;
  expiresAt: number;
};

function getSigningSecret() {
  const value = process.env.AUTH_VERIFICATION_CONTEXT_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) {
    throw new Error("Missing AUTH_VERIFICATION_CONTEXT_SECRET (or SUPABASE_SERVICE_ROLE_KEY fallback)");
  }
  return value;
}

function sign(payloadBase64Url: string) {
  return createHmac("sha256", getSigningSecret()).update(payloadBase64Url).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function isValidPayload(payload: unknown): payload is PasswordResetContextPayload {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<PasswordResetContextPayload>;
  return (
    typeof candidate.contextId === "string" &&
    candidate.contextId.length > 0 &&
    typeof candidate.email === "string" &&
    candidate.email.length > 0 &&
    typeof candidate.expiresAt === "number" &&
    Number.isFinite(candidate.expiresAt) &&
    (candidate.lastRequestedAt === null ||
      (typeof candidate.lastRequestedAt === "number" && Number.isFinite(candidate.lastRequestedAt))) &&
    typeof candidate.requestWindowStartedAt === "number" &&
    Number.isFinite(candidate.requestWindowStartedAt) &&
    typeof candidate.requestCountInWindow === "number" &&
    Number.isFinite(candidate.requestCountInWindow)
  );
}

function serialize(payload: PasswordResetContextPayload | PasswordResetRecoveryMarkerPayload) {
  const payloadBase64Url = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(payloadBase64Url);
  return `${payloadBase64Url}.${signature}`;
}

function parseSignedJson(raw: string | undefined | null): unknown {
  if (!raw) return null;
  const [payloadBase64Url, signature] = raw.split(".");
  if (!payloadBase64Url || !signature) return null;

  const expected = sign(payloadBase64Url);
  if (!safeEqual(signature, expected)) return null;

  try {
    return JSON.parse(Buffer.from(payloadBase64Url, "base64url").toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

function parse(raw: string | undefined | null): PasswordResetContextPayload | null {
  const parsed = parseSignedJson(raw);
  return isValidPayload(parsed) ? parsed : null;
}

function isValidRecoveryMarkerPayload(payload: unknown): payload is PasswordResetRecoveryMarkerPayload {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<PasswordResetRecoveryMarkerPayload>;
  return (
    typeof candidate.email === "string" &&
    candidate.email.length > 0 &&
    typeof candidate.expiresAt === "number" &&
    Number.isFinite(candidate.expiresAt)
  );
}

function isHttps(req: NextRequest) {
  return (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function createPasswordResetContext(email: string, now = Date.now()): PasswordResetContextPayload {
  const normalizedEmail = normalizeEmail(email);
  return {
    contextId: randomUUID(),
    email: normalizedEmail,
    expiresAt: now + passwordResetContextTtlMs,
    lastRequestedAt: null,
    requestWindowStartedAt: now,
    requestCountInWindow: 0,
  };
}

export function createPasswordResetRecoveryMarker(
  email: string,
  now = Date.now()
): PasswordResetRecoveryMarkerPayload {
  return {
    email: normalizeEmail(email),
    expiresAt: now + passwordResetContextTtlMs,
  };
}

export function readPasswordResetContext(req: NextRequest, now = Date.now()): PasswordResetContextPayload | null {
  const payload = parse(req.cookies.get(passwordResetContextCookieName)?.value);
  if (!payload) return null;
  if (payload.expiresAt <= now) return null;
  return payload;
}

export function readPasswordResetRecoveryMarker(
  req: NextRequest,
  now = Date.now()
): PasswordResetRecoveryMarkerPayload | null {
  const parsed = parseSignedJson(req.cookies.get(passwordResetRecoveryMarkerCookieName)?.value);
  if (!isValidRecoveryMarkerPayload(parsed)) return null;
  if (parsed.expiresAt <= now) return null;
  return parsed;
}

export function writePasswordResetContext(res: NextResponse, req: NextRequest, payload: PasswordResetContextPayload) {
  res.cookies.set({
    name: passwordResetContextCookieName,
    value: serialize(payload),
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    path: "/",
    maxAge: Math.floor(passwordResetContextTtlMs / 1000),
  });
}

export function writePasswordResetRecoveryMarker(
  res: NextResponse,
  req: NextRequest,
  payload: PasswordResetRecoveryMarkerPayload
) {
  res.cookies.set({
    name: passwordResetRecoveryMarkerCookieName,
    value: serialize(payload),
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    path: "/",
    maxAge: Math.floor(passwordResetContextTtlMs / 1000),
  });
}

export function clearPasswordResetContext(res: NextResponse, req: NextRequest) {
  res.cookies.set({
    name: passwordResetContextCookieName,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    path: "/",
    maxAge: 0,
  });
}

export function clearPasswordResetRecoveryMarker(res: NextResponse, req: NextRequest) {
  res.cookies.set({
    name: passwordResetRecoveryMarkerCookieName,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    path: "/",
    maxAge: 0,
  });
}

export function getPasswordResetCooldownLeftSeconds(payload: PasswordResetContextPayload, now = Date.now()) {
  if (!payload.lastRequestedAt) return 0;
  const leftMs = payload.lastRequestedAt + passwordResetCooldownSeconds * 1000 - now;
  if (leftMs <= 0) return 0;
  return Math.ceil(leftMs / 1000);
}

export function canRequestPasswordReset(payload: PasswordResetContextPayload, now = Date.now()) {
  const cooldownLeftSeconds = getPasswordResetCooldownLeftSeconds(payload, now);
  if (cooldownLeftSeconds > 0) {
    return { ok: false as const, reason: "cooldown" as const, cooldownLeftSeconds };
  }

  const windowExpired = now - payload.requestWindowStartedAt >= passwordResetWindowMs;
  const countInWindow = windowExpired ? 0 : payload.requestCountInWindow;
  const windowStartedAt = windowExpired ? now : payload.requestWindowStartedAt;

  if (countInWindow >= maxPasswordResetRequestsPerWindow) {
    const retryAfterMs = windowStartedAt + passwordResetWindowMs - now;
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
      lastRequestedAt: now,
      requestWindowStartedAt: windowStartedAt,
      requestCountInWindow: countInWindow + 1,
    },
  };
}

export function maskPasswordResetEmail(email: string) {
  const normalized = normalizeEmail(email);
  const [localPart = "", domainPart = ""] = normalized.split("@");
  if (!localPart || !domainPart) return normalized;

  const [domainName = "", tld = ""] = domainPart.split(".");
  const maskedLocal = localPart.length <= 2 ? `${localPart[0] ?? "*"}*` : `${localPart.slice(0, 2)}***`;
  const maskedDomain = domainName.length <= 2 ? `${domainName[0] ?? "*"}*` : `${domainName.slice(0, 2)}***`;

  return tld ? `${maskedLocal}@${maskedDomain}.${tld}` : `${maskedLocal}@${maskedDomain}`;
}
