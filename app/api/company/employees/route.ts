import { NextResponse } from "next/server";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type EmployeeRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "hr" | "recruiter";
};

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    if (ctx.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const { data, error } = await admin
      .from("profiles")
      .select("id,name,email,role")
      .eq("company_id", ctx.companyId)
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: "PROFILE_LOOKUP_FAILED" }, { status: 500 });
    }

    const employees: EmployeeRow[] = ((data ?? []) as EmployeeRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
    }));

    return NextResponse.json({ employees }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
