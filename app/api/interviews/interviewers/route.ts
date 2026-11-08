import { NextResponse } from "next/server";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();
    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const { data, error } = await admin
      .from("profiles")
      .select("id,name,email,avatar_url,role")
      .eq("company_id", ctx.companyId)
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "INTERVIEWER_LOOKUP_FAILED", message: "Не удалось загрузить интервьюеров." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        interviewers: (data ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          avatar: row.avatar_url ?? null,
          role: row.role,
        })),
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Не удалось загрузить интервьюеров." }, { status: 500 });
  }
}
