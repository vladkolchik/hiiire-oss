import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCandidateAccess, requireCompanyContext } from "@/lib/access/company-guards";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const IdSchema = z.string().uuid();

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const params = await Promise.resolve(context.params);
    const candidateId = String(params.id ?? "").trim();
    if (!IdSchema.safeParse(candidateId).success) {
      return NextResponse.json({ error: "INVALID_ID", message: "Некорректная ссылка на кандидата." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const accessRes = await requireCandidateAccess(admin, ctx, candidateId);
    if (!accessRes.ok) return accessRes.response;

    const { data: candidate, error: candidateError } = await admin
      .from("candidates")
      .select("*")
      .eq("id", candidateId)
      .maybeSingle();
    if (candidateError) return NextResponse.json({ error: "CANDIDATE_LOOKUP_FAILED" }, { status: 500 });
    if (!candidate) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const { data: analysis, error: analysisError } = await admin
      .from("ai_analyses")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("analyzed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (analysisError) return NextResponse.json({ error: "AI_ANALYSIS_LOOKUP_FAILED" }, { status: 500 });

    const { data: contacts, error: contactsError } = await admin
      .from("candidate_contacts")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: true });
    if (contactsError) return NextResponse.json({ error: "CANDIDATE_CONTACTS_LOOKUP_FAILED" }, { status: 500 });

    let latestJobQuery = admin
      .from("jobs_ai")
      .select("status,updated_at,last_error,attempt,max_attempts")
      .eq("company_id", ctx.companyId)
      .eq("candidate_id", candidateId)
      .in("status", ["queued", "processing", "done", "failed"])
      .order("updated_at", { ascending: false })
      .limit(1);
    if (ctx.role !== "admin") latestJobQuery = latestJobQuery.eq("requested_by", ctx.userId);

    const { data: latestJob, error: latestJobError } = await latestJobQuery.maybeSingle();
    if (latestJobError) return NextResponse.json({ error: "LATEST_JOB_LOOKUP_FAILED" }, { status: 500 });

    return NextResponse.json(
      {
        candidate,
        analysis: analysis ?? null,
        contacts: contacts ?? [],
        latestJob: latestJob
          ? {
              status: latestJob.status,
              updatedAt: latestJob.updated_at,
              attempt: latestJob.attempt,
              maxAttempts: latestJob.max_attempts,
              lastError: latestJob.last_error,
            }
          : null,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
