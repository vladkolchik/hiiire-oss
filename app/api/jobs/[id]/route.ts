import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCompanyContext, requireJobAiAccess } from "@/lib/access/company-guards";

const ParamsSchema = z.object({ id: z.string().min(1) });

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = ParamsSchema.parse(await ctx.params);

    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const companyCtx = ctxRes.data;

    // IMPORTANT: admin client bypasses RLS, so enforce the same access rules explicitly.
    const jobRes = await requireJobAiAccess(admin, companyCtx, id);
    if (!jobRes.ok) return jobRes.response;
    const job = jobRes.data.job;

    // Do not leak internal error details in UI by default. Provide a short message.
    const publicError = job.status === "failed" ? "AI_ANALYSIS_FAILED" : null;

    return NextResponse.json(
      {
        id: job.id,
        status: job.status,
        attempt: job.attempt,
        maxAttempts: job.maxAttempts,
        candidateId: job.candidateId,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        finishedAt: job.finishedAt,
        error: publicError,
        // Debug-only (optional): show last_error when explicitly requested by env.
        lastError: process.env.NODE_ENV !== "production" ? job.lastError : null,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

