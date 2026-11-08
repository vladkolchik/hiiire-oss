import { NextResponse, type NextRequest } from "next/server";

import { requireSameOriginRequest } from "@/lib/api/csrf";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const csrf = requireSameOriginRequest(req);
    if (!csrf.ok) return csrf.response;

    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
