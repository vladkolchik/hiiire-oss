import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
export {
  canResendNow,
  createVerificationContext,
  createVerificationContextFromPendingUser,
  getCooldownLeftSeconds,
  maskEmail,
  verificationContextTtlMs,
} from "@/lib/auth/verification-context.core";
import { verificationContextTtlMs } from "@/lib/auth/verification-context.core";

export const verificationContextCookieName = "hiiire_email_verification_ctx";

type VerificationContextPayload = {
  contextId: string;
  email: string;
  expiresAt: number;
  lastResendAt: number | null;
  resendWindowStartedAt: number;
  resendCountInWindow: number;
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

function isValidPayload(payload: unknown): payload is VerificationContextPayload {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<VerificationContextPayload>;
  return (
    typeof candidate.contextId === "string" &&
    candidate.contextId.length > 0 &&
    typeof candidate.email === "string" &&
    candidate.email.length > 0 &&
    typeof candidate.expiresAt === "number" &&
    Number.isFinite(candidate.expiresAt) &&
    (candidate.lastResendAt === null || (typeof candidate.lastResendAt === "number" && Number.isFinite(candidate.lastResendAt))) &&
    typeof candidate.resendWindowStartedAt === "number" &&
    Number.isFinite(candidate.resendWindowStartedAt) &&
    typeof candidate.resendCountInWindow === "number" &&
    Number.isFinite(candidate.resendCountInWindow)
  );
}

function serialize(payload: VerificationContextPayload) {
  const payloadBase64Url = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(payloadBase64Url);
  return `${payloadBase64Url}.${signature}`;
}

function parse(raw: string | undefined | null): VerificationContextPayload | null {
  if (!raw) return null;
  const [payloadBase64Url, signature] = raw.split(".");
  if (!payloadBase64Url || !signature) return null;

  const expected = sign(payloadBase64Url);
  if (!safeEqual(signature, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payloadBase64Url, "base64url").toString("utf8")) as unknown;
    if (!isValidPayload(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isHttps(req: NextRequest) {
  return (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https";
}

export function readVerificationContext(req: NextRequest, now = Date.now()): VerificationContextPayload | null {
  const payload = parse(req.cookies.get(verificationContextCookieName)?.value);
  if (!payload) return null;
  if (payload.expiresAt <= now) return null;
  return payload;
}

export function writeVerificationContext(res: NextResponse, req: NextRequest, payload: VerificationContextPayload) {
  res.cookies.set({
    name: verificationContextCookieName,
    value: serialize(payload),
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    path: "/",
    maxAge: Math.floor(verificationContextTtlMs / 1000),
  });
}

export function clearVerificationContext(res: NextResponse, req: NextRequest) {
  res.cookies.set({
    name: verificationContextCookieName,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    path: "/",
    maxAge: 0,
  });
}
