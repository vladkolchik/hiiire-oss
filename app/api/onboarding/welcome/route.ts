import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { requireSameOriginRequest } from "@/lib/api/csrf";
import { loadCompanyPlanSnapshot, resolveTrialDisplay } from "@/lib/billing/subscription";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };

const WelcomePatchSchema = z.object({
  onboardingCompleted: z.literal(true, {
    error: "Проверьте действие и попробуйте ещё раз.",
  }),
});

type WelcomeProfileRow = {
  onboarding_completed: boolean | null;
};

function welcomeResponse(input: { onboardingCompleted: boolean | null; trialDaysLeft: number | null }) {
  return {
    onboardingCompleted: input.onboardingCompleted,
    showWelcome: input.onboardingCompleted === false,
    trialDaysLeft: input.trialDaysLeft,
  };
}

async function loadWelcomeState(admin: any, ctx: { userId: string; companyId: string }) {
  const profileRes = await admin
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", ctx.userId)
    .eq("company_id", ctx.companyId)
    .maybeSingle();

  if (profileRes.error) throw new Error("PROFILE_LOOKUP_FAILED");
  const profile = profileRes.data as WelcomeProfileRow | null;
  const onboardingCompleted = profile?.onboarding_completed ?? null;
  const trialDaysLeft =
    onboardingCompleted === false
      ? resolveTrialDisplay(await loadCompanyPlanSnapshot(admin, ctx.companyId), Date.now()).trialDaysLeft
      : null;

  return welcomeResponse({
    onboardingCompleted,
    trialDaysLeft,
  });
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) {
      ctxRes.response.headers.set("Cache-Control", "no-store");
      return ctxRes.response;
    }

    const state = await loadWelcomeState(admin, ctxRes.data);
    return NextResponse.json(state, { status: 200, headers: noStoreHeaders });
  } catch {
    return NextResponse.json(
      { error: "WELCOME_LOOKUP_FAILED", message: "Не удалось загрузить приветствие. Обновите страницу." },
      { status: 500, headers: noStoreHeaders }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const csrfRes = requireSameOriginRequest(req);
    if (!csrfRes.ok) return csrfRes.response;

    const bodyJson = await req.json().catch(() => null);
    const parsed = WelcomePatchSchema.safeParse(bodyJson);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "INVALID_BODY", message: "Проверьте действие и попробуйте ещё раз." },
        { status: 400, headers: noStoreHeaders }
      );
    }

    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) {
      ctxRes.response.headers.set("Cache-Control", "no-store");
      return ctxRes.response;
    }
    const ctx = ctxRes.data;

    const { data: profile, error } = await admin
      .from("profiles")
      .update({
        onboarding_completed: parsed.data.onboardingCompleted,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ctx.userId)
      .eq("company_id", ctx.companyId)
      .select("onboarding_completed")
      .maybeSingle();

    if (error || !profile) {
      return NextResponse.json(
        { error: "WELCOME_UPDATE_FAILED", message: "Не удалось сохранить выбор. Попробуйте ещё раз." },
        { status: 500, headers: noStoreHeaders }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        ...welcomeResponse({
          onboardingCompleted: (profile as WelcomeProfileRow).onboarding_completed ?? null,
          trialDaysLeft: null,
        }),
      },
      { status: 200, headers: noStoreHeaders }
    );
  } catch {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Не удалось сохранить выбор. Попробуйте ещё раз." },
      { status: 500, headers: noStoreHeaders }
    );
  }
}
