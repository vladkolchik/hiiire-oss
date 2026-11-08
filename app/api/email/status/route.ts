import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireCompanyContext } from "@/lib/access/company-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const [{ data: prefs, error: prefsErr }, { data: profile, error: profileErr }] = await Promise.all([
      supabase.from("email_notification_settings").select("email_enabled").eq("user_id", ctx.userId).maybeSingle(),
      supabase.from("profiles").select("email").eq("id", ctx.userId).maybeSingle(),
    ]);

    if (prefsErr || profileErr) return NextResponse.json({ error: "LOOKUP_FAILED" }, { status: 500 });

    return NextResponse.json(
      {
        email: typeof profile?.email === "string" ? profile.email : null,
        emailEnabled: (prefs?.email_enabled ?? true) === true, // missing row => enabled by default
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

