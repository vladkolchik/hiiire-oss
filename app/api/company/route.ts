import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCompanyContext } from "@/lib/access/company-guards";
import { CompanyPatchSchema, getCompanyValidationMessage, mapCompanyValidationIssues } from "@/lib/company/validation";
import type { Database } from "@/lib/supabase/database.types";

type CompanyUpdate = Database["public"]["Tables"]["companies"]["Update"];

function mapCompanyRow(row: {
  id: string;
  name: string;
  industry: string | null;
  size: string | null;
  description: string | null;
  website: string | null;
  logo_url: string | null;
  updated_at: string | null;
}) {
  return {
    id: String(row.id),
    name: row.name,
    industry: row.industry,
    size: row.size,
    description: row.description,
    website: row.website,
    logoUrl: row.logo_url,
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const { data: row, error } = await admin
      .from("companies")
      .select("id,name,industry,size,description,website,logo_url,updated_at")
      .eq("id", ctx.companyId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: "COMPANY_LOOKUP_FAILED" }, { status: 500 });
    if (!row) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    return NextResponse.json({ company: mapCompanyRow(row) }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    if (ctx.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const bodyJson = await req.json().catch(() => null);
    const parsed = CompanyPatchSchema.safeParse(bodyJson);
    if (!parsed.success) {
      const issues = mapCompanyValidationIssues(parsed.error);
      return NextResponse.json(
        {
          error: "INVALID_BODY",
          message: getCompanyValidationMessage(issues),
          issues,
        },
        { status: 400 }
      );
    }

    const update: CompanyUpdate = {};

    if (parsed.data.name !== undefined) update.name = parsed.data.name;
    if (parsed.data.industry !== undefined) update.industry = parsed.data.industry;
    if (parsed.data.size !== undefined) update.size = parsed.data.size;
    if (parsed.data.description !== undefined) update.description = parsed.data.description;
    if (parsed.data.website !== undefined) update.website = parsed.data.website;
    if (parsed.data.logoUrl !== undefined) update.logo_url = parsed.data.logoUrl;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "EMPTY_BODY" }, { status: 400 });
    }

    const { data: row, error } = await admin
      .from("companies")
      .update(update)
      .eq("id", ctx.companyId)
      .select("id,name,industry,size,description,website,logo_url,updated_at")
      .maybeSingle();

    if (error) return NextResponse.json({ error: "COMPANY_UPDATE_FAILED" }, { status: 500 });
    if (!row) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    return NextResponse.json({ ok: true, company: mapCompanyRow(row) }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
