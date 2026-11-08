import { NextResponse, type NextRequest } from "next/server";

import {
  clearVerificationContext,
  createVerificationContextFromPendingUser,
  getCooldownLeftSeconds,
  maskEmail,
  readVerificationContext,
  verificationContextCookieName,
  writeVerificationContext,
} from "@/lib/auth/verification-context.server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function isExistingContextEmailConfirmed(email: string) {
  try {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.rpc("get_signup_email_state", { p_email: email });
    if (error) return false;
    const state = Array.isArray(data) && data.length > 0 ? data[0] : null;
    return state?.email_confirmed === true;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  try {
    const existingContext = readVerificationContext(req);
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    const hasSessionUser = !error && Boolean(data.user);
    const trustedContext = hasSessionUser ? createVerificationContextFromPendingUser(data.user) : null;

    if (trustedContext) {
      if (existingContext?.email === trustedContext.email) {
        return NextResponse.json(
          {
            status: "pending",
            contextId: existingContext.contextId,
            email: existingContext.email,
            maskedEmail: maskEmail(existingContext.email),
            cooldownLeftSeconds: getCooldownLeftSeconds(existingContext),
          },
          { status: 200 }
        );
      }

      const res = NextResponse.json(
        {
          status: "pending",
          contextId: trustedContext.contextId,
          email: trustedContext.email,
          maskedEmail: maskEmail(trustedContext.email),
          cooldownLeftSeconds: getCooldownLeftSeconds(trustedContext),
        },
        { status: 200 }
      );
      writeVerificationContext(res, req, trustedContext);
      return res;
    }

    if (hasSessionUser) {
      const res = NextResponse.json(
        {
          status: "missing",
          contextId: null,
          email: null,
          maskedEmail: null,
          cooldownLeftSeconds: 0,
        },
        { status: 200 }
      );

      if (req.cookies.get(verificationContextCookieName)?.value) {
        clearVerificationContext(res, req);
      }
      return res;
    }

    if (existingContext) {
      if (await isExistingContextEmailConfirmed(existingContext.email)) {
        const res = NextResponse.json(
          {
            status: "confirmed",
            contextId: null,
            email: null,
            maskedEmail: null,
            cooldownLeftSeconds: 0,
          },
          { status: 200 }
        );
        clearVerificationContext(res, req);
        return res;
      }

      return NextResponse.json(
        {
          status: "pending",
          contextId: existingContext.contextId,
          email: existingContext.email,
          maskedEmail: maskEmail(existingContext.email),
          cooldownLeftSeconds: getCooldownLeftSeconds(existingContext),
        },
        { status: 200 }
      );
    }

    const res = NextResponse.json(
      {
        status: "missing",
        contextId: null,
        email: null,
        maskedEmail: null,
        cooldownLeftSeconds: 0,
      },
      { status: 200 }
    );

    if (req.cookies.get(verificationContextCookieName)?.value) {
      clearVerificationContext(res, req);
    }
    return res;
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ ok: true }, { status: 200 });
  clearVerificationContext(res, req);
  return res;
}
