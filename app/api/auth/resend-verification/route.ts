import { NextResponse, type NextRequest } from "next/server";

import {
  canResendNow,
  clearVerificationContext,
  readVerificationContext,
  writeVerificationContext,
} from "@/lib/auth/verification-context.server";
import { resendCooldownSeconds } from "@/lib/auth/verification-resend.constants";
import { consumeVerificationEmailResendRateLimitFromDatabase } from "@/lib/auth/verification-resend-rate-limit-db.server";
import { consumeVerificationEmailResendRateLimit } from "@/lib/auth/verification-resend-rate-limit.server";
import { getRequestOrigin } from "@/lib/http/request-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const context = readVerificationContext(req);
    if (!context) {
      const res = NextResponse.json({ error: "CONTEXT_MISSING" }, { status: 400 });
      clearVerificationContext(res, req);
      return res;
    }

    const decision = canResendNow(context);
    if (!decision.ok) {
      if (decision.reason === "cooldown") {
        return NextResponse.json(
          { error: "COOLDOWN", cooldownLeftSeconds: decision.cooldownLeftSeconds },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: "RATE_LIMIT", retryAfterSeconds: decision.retryAfterSeconds },
        { status: 429 }
      );
    }

    let sharedDecision;
    try {
      sharedDecision = await consumeVerificationEmailResendRateLimitFromDatabase(context.email);
    } catch {
      sharedDecision = consumeVerificationEmailResendRateLimit(context.email);
    }

    if (!sharedDecision.ok) {
      if (sharedDecision.reason === "cooldown") {
        return NextResponse.json(
          { error: "COOLDOWN", cooldownLeftSeconds: sharedDecision.cooldownLeftSeconds },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: "RATE_LIMIT", retryAfterSeconds: sharedDecision.retryAfterSeconds },
        { status: 429 }
      );
    }

    const supabase = await createSupabaseServerClient();
    const emailRedirectTo = `${getRequestOrigin(req)}/auth/callback?next=/dashboard`;
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: decision.next.email,
      options: { emailRedirectTo },
    });

    if (error) {
      const status = /rate.?limit/i.test(error.message) ? 429 : 502;
      const res = NextResponse.json({ error: status === 429 ? "SUPABASE_RATE_LIMIT" : "RESEND_FAILED" }, { status });
      writeVerificationContext(res, req, decision.next);
      return res;
    }

    const res = NextResponse.json({ ok: true, cooldownLeftSeconds: resendCooldownSeconds }, { status: 200 });
    writeVerificationContext(res, req, decision.next);
    return res;
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
