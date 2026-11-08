import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCompanyContext } from "@/lib/access/company-guards";
import { buildHhAuthorizeUrl } from "@/lib/hh/oauth";

const STATE_COOKIE = "hiiire_hh_oauth_state";
const RETURN_CONTEXT_COOKIE = "hiiire_hh_oauth_return_context";
const FIRST_AI_ONBOARDING_CONTEXT = "first-ai-onboarding";

function buildReturnContextValue(state: string): string {
  return `${FIRST_AI_ONBOARDING_CONTEXT}:${state}`;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const state = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const url = await buildHhAuthorizeUrl({ state });
    const from = req.nextUrl.searchParams.get("from");
    const isFirstAiOnboarding = from === FIRST_AI_ONBOARDING_CONTEXT;
    const nowIso = new Date().toISOString();

    if (isFirstAiOnboarding) {
      const admin = getSupabaseAdminClient();
      const { error } = await admin.from("first_ai_onboarding_states").upsert(
        {
          user_id: ctx.userId,
          started_path: "hh",
          hh_started_at: nowIso,
          hh_oauth_error_at: null,
          updated_at: nowIso,
        },
        { onConflict: "user_id" }
      );

      if (error) {
        console.warn("[hh-start] first ai onboarding state upsert failed");
      }
    }

    const res = NextResponse.redirect(url, { status: 302 });
    const secure = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https";
    res.cookies.set({
      name: STATE_COOKIE,
      value: state,
      httpOnly: true,
      sameSite: "lax",
      // Respect reverse proxies (x-forwarded-proto) to keep cookie secure in prod.
      secure,
      path: "/",
      maxAge: 10 * 60,
    });
    if (isFirstAiOnboarding) {
      res.cookies.set({
        name: RETURN_CONTEXT_COOKIE,
        value: buildReturnContextValue(state),
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 10 * 60,
      });
    } else {
      res.cookies.set({ name: RETURN_CONTEXT_COOKIE, value: "", maxAge: 0, path: "/" });
    }
    return res;
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export const hhStateCookieName = STATE_COOKIE;
export const hhReturnContextCookieName = RETURN_CONTEXT_COOKIE;

