import { NextResponse, type NextRequest } from "next/server";

import { captureBusinessEvent } from "@/lib/analytics/business-events";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCompanyContext } from "@/lib/access/company-guards";
import { getHhDefaultHost, getHhRedirectUri, getHhUserAgent } from "@/lib/hh/config";
import {
  HH_CALLBACK_REASON_EMPLOYER_ACCOUNT_REQUIRED,
  HhCallbackMeSchema,
  readHhEmployerContext,
} from "@/lib/hh/callback";
import { exchangeHhCodeForToken } from "@/lib/hh/oauth";
import { getRequestOrigin } from "@/lib/http/request-origin";

const STATE_COOKIE = "hiiire_hh_oauth_state";
const RETURN_CONTEXT_COOKIE = "hiiire_hh_oauth_return_context";
const FIRST_AI_ONBOARDING_CONTEXT = "first-ai-onboarding";

function buildReturnContextValue(state: string): string {
  return `${FIRST_AI_ONBOARDING_CONTEXT}:${state}`;
}

function buildSettingsRedirect(appOrigin: string, hh: "connected" | "error", reason?: string, from?: string): string {
  const url = new URL("/dashboard/settings", appOrigin);
  url.searchParams.set("tab", "integrations");
  url.searchParams.set("hh", hh);
  if (from === FIRST_AI_ONBOARDING_CONTEXT) url.searchParams.set("from", "first-ai-onboarding");
  if (reason) url.searchParams.set("reason", reason);
  return url.toString();
}

async function persistFirstAiHhContext(admin: any, userId: string, nowIso: string, status: "started" | "error") {
  const patch = {
    user_id: userId,
    started_path: "hh" as const,
    hh_started_at: nowIso,
    hh_oauth_error_at: status === "error" ? nowIso : null,
    updated_at: nowIso,
  };

  const { error } = await admin.from("first_ai_onboarding_states").upsert(patch, { onConflict: "user_id" });
  if (error) console.warn("[hh-callback] first ai onboarding state upsert failed");
}

function withClearedOauthContext(res: NextResponse): NextResponse {
  res.cookies.set({ name: STATE_COOKIE, value: "", maxAge: 0, path: "/" });
  res.cookies.set({ name: RETURN_CONTEXT_COOKIE, value: "", maxAge: 0, path: "/" });
  return res;
}

function getTrustedReturnContext(returnContext: string, state: string, expectedState: string): string | undefined {
  if (state !== expectedState) return undefined;
  return returnContext === buildReturnContextValue(expectedState) ? FIRST_AI_ONBOARDING_CONTEXT : undefined;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const appOrigin = getRequestOrigin(req);
    const { searchParams } = req.nextUrl;
    const error = searchParams.get("error");
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const expectedState = req.cookies.get(STATE_COOKIE)?.value ?? "";
    const returnContext = req.cookies.get(RETURN_CONTEXT_COOKIE)?.value ?? "";
    const nowIso = new Date().toISOString();

    if (!expectedState || !state || state !== expectedState) {
      return withClearedOauthContext(NextResponse.redirect(buildSettingsRedirect(appOrigin, "error"), { status: 302 }));
    }

    const trustedReturnContext = getTrustedReturnContext(returnContext, state, expectedState);
    const isFirstAiOnboarding = trustedReturnContext === FIRST_AI_ONBOARDING_CONTEXT;
    const redirectError = async (reason?: string) => {
      if (isFirstAiOnboarding) await persistFirstAiHhContext(admin, ctx.userId, nowIso, "error");
      return withClearedOauthContext(NextResponse.redirect(buildSettingsRedirect(appOrigin, "error", reason, trustedReturnContext), { status: 302 }));
    };

    if (error) {
      return redirectError(error);
    }
    if (!code) {
      return redirectError();
    }

    const redirectUri = await getHhRedirectUri();
    const token = await exchangeHhCodeForToken({ code, redirectUri }).catch(() => null);
    if (!token) return redirectError();

    const host = getHhDefaultHost();
    const meRes = await fetch(`https://api.hh.ru/me?host=${encodeURIComponent(host)}`, {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        Accept: "application/json",
        "HH-User-Agent": getHhUserAgent(),
      },
      cache: "no-store",
    }).catch(() => null);
    if (!meRes) return redirectError();
    const meJson: unknown = await meRes.json().catch(() => null);
    if (!meRes.ok) {
      return redirectError();
    }

    const meParsed = HhCallbackMeSchema.safeParse(meJson);
    if (!meParsed.success) {
      return redirectError();
    }
    const me = meParsed.data;

    const employerContext = readHhEmployerContext(me);
    if (!employerContext.ok) {
      return redirectError(HH_CALLBACK_REASON_EMPLOYER_ACCOUNT_REQUIRED);
    }

    const expiresAt =
      typeof token.expires_in === "number" && Number.isFinite(token.expires_in)
        ? new Date(Date.now() + Math.max(0, token.expires_in) * 1000).toISOString()
        : null;

    const { error: upsertErr } = await admin.from("integrations_accounts").upsert(
      {
        company_id: ctx.companyId,
        user_id: ctx.userId,
        provider: "hh.ru",
        is_active: true,
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? null,
        token_expires_at: expiresAt,
        settings: {
          host,
          employer_id: employerContext.employerId,
          manager_id: employerContext.managerId,
          auth_type: me.auth_type ?? null,
          employer_name: employerContext.employerName,
          manager_has_admin_rights: employerContext.managerHasAdminRights,
          manager_has_multiple_accounts: employerContext.managerHasMultipleAccounts,
        },
        connected_at: nowIso,
        updated_at: nowIso,
      } as any,
      { onConflict: "user_id,provider" }
    );

    if (upsertErr) return isFirstAiOnboarding ? redirectError() : NextResponse.json({ error: "INTEGRATION_SAVE_FAILED" }, { status: 500 });
    if (isFirstAiOnboarding) await persistFirstAiHhContext(admin, ctx.userId, nowIso, "started");

    await captureBusinessEvent({
      event: "hh_connected",
      userId: ctx.userId,
      companyId: ctx.companyId,
      role: ctx.role,
      properties: {
        provider: "hh.ru",
      },
    });

    return withClearedOauthContext(NextResponse.redirect(buildSettingsRedirect(appOrigin, "connected", undefined, trustedReturnContext), { status: 302 }));
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
