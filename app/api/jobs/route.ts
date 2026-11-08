import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireSameOriginRequest } from "@/lib/api/csrf";
import { isAiAllowed, loadCompanyPlanSnapshot } from "@/lib/billing/subscription";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCandidateAccess, requireCompanyContext } from "@/lib/access/company-guards";

const BodySchema = z.object({
  candidateId: z.string().min(1),
});

/**
 * Create (or retry) AI analysis job for an existing candidate.
 */
export async function POST(req: NextRequest) {
  const csrf = requireSameOriginRequest(req);
  if (!csrf.ok) return csrf.response;

  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const bodyJson = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(bodyJson);
    if (!parsed.success) {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    }

    const { candidateId } = parsed.data;

    // IMPORTANT: admin client bypasses RLS, so enforce the same access rules explicitly.
    const candRes = await requireCandidateAccess(admin, ctx, candidateId);
    if (!candRes.ok) return candRes.response;

    const planSnapshot = await loadCompanyPlanSnapshot(admin, ctx.companyId);
    if (!isAiAllowed(planSnapshot)) {
      return NextResponse.json({ error: "SUBSCRIPTION_INACTIVE" }, { status: 402 });
    }

    const { data: job, error: jobError } = await admin.rpc("enqueue_ai_job_with_credit_reserve", {
      p_company_id: ctx.companyId,
      p_candidate_id: candidateId,
      p_requested_by: ctx.userId,
      p_credits_to_reserve: 1,
    });

    if (jobError || !job || typeof (job as { id?: unknown }).id !== "string") {
      return NextResponse.json({ error: "JOB_CREATE_FAILED" }, { status: 500 });
    }

    return NextResponse.json({ jobId: (job as { id: string }).id }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
