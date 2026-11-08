import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireSameOriginRequest } from "@/lib/api/csrf";
import { hasPendingEmailConfirmation } from "@/lib/auth/email-confirmation";
import { createVerificationContext, writeVerificationContext } from "@/lib/auth/verification-context.server";
import { getClientIp } from "@/lib/http/client-ip";
import { checkFixedWindowRateLimit } from "@/lib/security/fixed-window-rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_BY_IP = 60;
const LOGIN_RATE_LIMIT_BY_IP_AND_EMAIL = 12;

const LoginBodySchema = z.object({
  email: z.string().trim().email("Введите корректный email").max(320, "Email слишком длинный"),
  password: z.string().min(1, "Введите пароль").max(72, "Пароль слишком длинный"),
});

function isEmailNotConfirmedError(error: { message?: string; code?: string }) {
  const raw = `${error.message ?? ""} ${error.code ?? ""}`.toUpperCase();
  return raw.includes("EMAIL_NOT_CONFIRMED") || raw.includes("EMAIL NOT CONFIRMED");
}

function buildEmailNotConfirmedResponse(req: NextRequest, email: string) {
  const res = NextResponse.json(
    { error: "EMAIL_NOT_CONFIRMED", message: "Подтвердите email, чтобы войти", email },
    { status: 403 }
  );
  writeVerificationContext(res, req, createVerificationContext(email));
  return res;
}

function buildRateLimitResponse(retryAfterSeconds: number) {
  const res = NextResponse.json(
    {
      error: "RATE_LIMIT",
      message: "Слишком много попыток входа. Попробуйте позже.",
      retryAfterSeconds,
    },
    { status: 429 }
  );
  res.headers.set("Retry-After", String(retryAfterSeconds));
  return res;
}

export async function POST(req: NextRequest) {
  try {
    const csrf = requireSameOriginRequest(req);
    if (!csrf.ok) return csrf.response;

    const body = await req.json().catch(() => null);
    const parsed = LoginBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "INVALID_BODY",
          message: parsed.error.issues[0]?.message ?? "Проверьте email и пароль.",
          issues: parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
        },
        { status: 400 }
      );
    }

    const normalizedEmail = parsed.data.email.trim().toLowerCase();
    const clientIp = getClientIp(req);
    const ipLimit = checkFixedWindowRateLimit({
      namespace: "auth-login-ip",
      key: clientIp,
      limit: LOGIN_RATE_LIMIT_BY_IP,
      windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
    });
    if (!ipLimit.allowed) {
      return buildRateLimitResponse(ipLimit.retryAfterSeconds);
    }

    const ipEmailLimit = checkFixedWindowRateLimit({
      namespace: "auth-login-ip-email",
      key: `${clientIp}:${normalizedEmail}`,
      limit: LOGIN_RATE_LIMIT_BY_IP_AND_EMAIL,
      windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
    });
    if (!ipEmailLimit.allowed) {
      return buildRateLimitResponse(ipEmailLimit.retryAfterSeconds);
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: parsed.data.password,
    });
    if (error) {
      if (isEmailNotConfirmedError({ message: error.message, code: (error as { code?: string }).code })) {
        return buildEmailNotConfirmedResponse(req, normalizedEmail);
      }
      return NextResponse.json({ error: "INVALID_CREDENTIALS", message: "Неверный email или пароль" }, { status: 401 });
    }

    if (!data.user || !data.session) {
      return NextResponse.json({ error: "INVALID_CREDENTIALS", message: "Неверный email или пароль" }, { status: 401 });
    }

    if (hasPendingEmailConfirmation(data.user)) {
      const email = data.user.email?.trim().toLowerCase() || normalizedEmail;
      await supabase.auth.signOut();
      return buildEmailNotConfirmedResponse(req, email);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Не удалось войти. Попробуйте ещё раз." }, { status: 500 });
  }
}
