import { NextResponse } from "next/server";

import { getConfirmedServerUser } from "@/lib/auth/server-email-confirmation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Returns current company credits balance for the authenticated user.
 * Used for UX preflight before starting batch AI analysis.
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const authRes = await getConfirmedServerUser(supabase);
    if (!authRes.ok) {
      return NextResponse.json(
        { error: authRes.reason === "pending_email" ? "EMAIL_NOT_CONFIRMED" : "UNAUTHORIZED" },
        { status: authRes.reason === "pending_email" ? 403 : 401 }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", authRes.user.id)
      .maybeSingle();
    if (profileError) return NextResponse.json({ error: "PROFILE_LOOKUP_FAILED" }, { status: 500 });
    if (!profile?.company_id) return NextResponse.json({ error: "NO_COMPANY" }, { status: 403 });

    // Use admin client to avoid RLS issues on company_credits,
    // while still enforcing company boundary via profile.company_id.
    const { data: credits, error: creditsError } = await admin
      .from("company_credits")
      .select("balance,reserved")
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (creditsError) return NextResponse.json({ error: "CREDITS_LOOKUP_FAILED" }, { status: 500 });

    const balance = typeof credits?.balance === "number" ? credits.balance : 0;
    const reserved = typeof (credits as { reserved?: unknown } | null)?.reserved === "number" ? (credits as { reserved: number }).reserved : 0;
    const available = Math.max(0, balance - reserved);
    return NextResponse.json({ balance, reserved, available }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
