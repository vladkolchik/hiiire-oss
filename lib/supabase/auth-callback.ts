import "server-only";

import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import {
  clearPasswordResetContext,
  clearPasswordResetRecoveryMarker,
  createPasswordResetRecoveryMarker,
  writePasswordResetRecoveryMarker,
} from "@/lib/auth/password-reset-context.server";
import { clearVerificationContext } from "@/lib/auth/verification-context.server";
import { getRequestOrigin } from "@/lib/http/request-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const DEFAULT_REDIRECT_PATH = "/dashboard";
const CALLBACK_ERROR_PATH = "/verify-email?error=invalid_or_expired";
const RECOVERY_CALLBACK_ERROR_PATH = "/forgot-password?error=invalid_or_expired";

function sanitizeNextPath(nextPath: string | null): string {
  if (!nextPath) return DEFAULT_REDIRECT_PATH;
  if (!nextPath.startsWith("/")) return DEFAULT_REDIRECT_PATH;
  if (nextPath.startsWith("//")) return DEFAULT_REDIRECT_PATH;
  return nextPath;
}

function isEmailOtpType(value: string | null): value is EmailOtpType {
  if (!value) return false;
  return ["signup", "invite", "magiclink", "recovery", "email_change", "email"].includes(value);
}

function isRecoveryFlow(nextPath: string, otpType: string | null) {
  return otpType === "recovery" || nextPath.startsWith("/reset-password");
}

export async function handleSupabaseAuthCallback(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = url.searchParams.get("type");
  const next = sanitizeNextPath(url.searchParams.get("next"));
  const origin = getRequestOrigin(request);
  const recoveryFlow = isRecoveryFlow(next, otpType);
  const errorPath = recoveryFlow ? RECOVERY_CALLBACK_ERROR_PATH : CALLBACK_ERROR_PATH;

  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, origin));

  try {
    const supabase = await createSupabaseServerClient();

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const res = redirectTo(next);
        clearVerificationContext(res, request);
        if (recoveryFlow) {
          const { data } = await supabase.auth.getUser();
          const email = data.user?.email?.trim().toLowerCase();
          if (email) {
            writePasswordResetRecoveryMarker(res, request, createPasswordResetRecoveryMarker(email));
          }
        } else {
          clearPasswordResetContext(res, request);
          clearPasswordResetRecoveryMarker(res, request);
        }
        return res;
      }
    }

    if (tokenHash && isEmailOtpType(otpType)) {
      const { error } = await supabase.auth.verifyOtp({
        type: otpType,
        token_hash: tokenHash,
      });
      if (!error) {
        const res = redirectTo(next);
        clearVerificationContext(res, request);
        if (recoveryFlow) {
          const { data } = await supabase.auth.getUser();
          const email = data.user?.email?.trim().toLowerCase();
          if (email) {
            writePasswordResetRecoveryMarker(res, request, createPasswordResetRecoveryMarker(email));
          }
        } else {
          clearPasswordResetContext(res, request);
          clearPasswordResetRecoveryMarker(res, request);
        }
        return res;
      }
    }
  } catch {
    // Fall through to invalid callback redirect.
  }

  return redirectTo(errorPath);
}
