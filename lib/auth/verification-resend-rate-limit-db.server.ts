import "server-only";

import {
  maxResendsPerWindow,
  resendCooldownSeconds,
  resendWindowMs,
} from "@/lib/auth/verification-resend.constants";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type VerificationResendRateLimitRow = {
  allowed: boolean | null;
  reason: string | null;
  cooldown_left_seconds: number | null;
  retry_after_seconds: number | null;
};

export async function consumeVerificationEmailResendRateLimitFromDatabase(email: string) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await (admin as any).rpc("consume_verification_email_resend_limit", {
    p_email: email,
    p_cooldown_seconds: resendCooldownSeconds,
    p_window_seconds: Math.floor(resendWindowMs / 1_000),
    p_max_resends: maxResendsPerWindow,
  });

  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : null) as VerificationResendRateLimitRow | null;
  if (!row || row.allowed !== false) {
    return { ok: true as const };
  }

  if (row.reason === "cooldown") {
    return {
      ok: false as const,
      reason: "cooldown" as const,
      cooldownLeftSeconds: Math.max(0, Math.floor(row.cooldown_left_seconds ?? 0)),
    };
  }

  if (row.reason === "rate_limit") {
    return {
      ok: false as const,
      reason: "rate_limit" as const,
      retryAfterSeconds: Math.max(1, Math.floor(row.retry_after_seconds ?? 1)),
    };
  }

  throw new Error("Unexpected verification resend rate limit response");
}
