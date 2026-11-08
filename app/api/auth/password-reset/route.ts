import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  canRequestPasswordReset,
  clearPasswordResetContext,
  clearPasswordResetRecoveryMarker,
  createPasswordResetContext,
  getPasswordResetCooldownLeftSeconds,
  maskPasswordResetEmail,
  passwordResetContextCookieName,
  passwordResetCooldownSeconds,
  readPasswordResetContext,
  readPasswordResetRecoveryMarker,
  writePasswordResetContext,
} from "@/lib/auth/password-reset-context.server";
import { getPasswordResetRequestErrorMessage } from "@/lib/auth/user-facing-errors";
import { getRequestOrigin } from "@/lib/http/request-origin";
import { requireSameOriginRequest } from "@/lib/api/csrf";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  email: z.string().trim().email().max(320),
});

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function buildResetPasswordRedirect(req: NextRequest) {
  const resetPath = "/reset-password?recovery=1";
  return `${getRequestOrigin(req)}/auth/callback?next=${encodeURIComponent(resetPath)}`;
}

export async function GET(req: NextRequest) {
  try {
    const context = readPasswordResetContext(req);
    const recoveryMarker = readPasswordResetRecoveryMarker(req);
    const recoveryVerified = Boolean(recoveryMarker);

    const res = NextResponse.json(
      {
        contextId: context?.contextId ?? null,
        email: context?.email ?? recoveryMarker?.email ?? null,
        maskedEmail: context?.email
          ? maskPasswordResetEmail(context.email)
          : recoveryMarker?.email
            ? maskPasswordResetEmail(recoveryMarker.email)
            : null,
        cooldownLeftSeconds: context ? getPasswordResetCooldownLeftSeconds(context) : 0,
        recoveryVerified,
      },
      { status: 200 }
    );

    if (!context && req.cookies.get(passwordResetContextCookieName)?.value) {
      clearPasswordResetContext(res, req);
    }
    return res;
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const csrf = requireSameOriginRequest(req);
    if (!csrf.ok) return csrf.response;

    const body = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "INVALID_BODY",
          message: getPasswordResetRequestErrorMessage({ error: "INVALID_BODY" }),
        },
        { status: 400 }
      );
    }

    const requestedEmail = normalizeEmail(parsed.data.email);
    const existingContext = readPasswordResetContext(req);
    const baseContext =
      existingContext && existingContext.email === requestedEmail
        ? existingContext
        : createPasswordResetContext(requestedEmail);

    const decision = canRequestPasswordReset(baseContext);
    if (!decision.ok) {
      const res =
        decision.reason === "cooldown"
          ? NextResponse.json(
              { error: "COOLDOWN", cooldownLeftSeconds: decision.cooldownLeftSeconds },
              { status: 429 }
            )
          : NextResponse.json(
              { error: "RATE_LIMIT", retryAfterSeconds: decision.retryAfterSeconds },
              { status: 429 }
            );
      writePasswordResetContext(res, req, baseContext);
      return res;
    }

    const nextContext = decision.next;
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(nextContext.email, {
      redirectTo: buildResetPasswordRedirect(req),
    });

    if (error) {
      const isRateLimit = /rate.?limit/i.test(error.message);
      const status = isRateLimit ? 429 : 502;
      const errorCode = isRateLimit ? "SUPABASE_RATE_LIMIT" : "REQUEST_FAILED";
      const res = NextResponse.json(
        {
          error: errorCode,
          message: getPasswordResetRequestErrorMessage({ error: errorCode }),
        },
        { status }
      );
      writePasswordResetContext(res, req, nextContext);
      return res;
    }

    const res = NextResponse.json(
      {
        ok: true,
        maskedEmail: maskPasswordResetEmail(nextContext.email),
        cooldownLeftSeconds: passwordResetCooldownSeconds,
      },
      { status: 200 }
    );
    writePasswordResetContext(res, req, nextContext);
    return res;
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const csrf = requireSameOriginRequest(req);
  if (!csrf.ok) return csrf.response;

  const res = NextResponse.json({ ok: true }, { status: 200 });
  clearPasswordResetContext(res, req);
  clearPasswordResetRecoveryMarker(res, req);
  return res;
}
