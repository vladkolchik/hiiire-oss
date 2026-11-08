import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCandidateAccess, requireCompanyContext } from "@/lib/access/company-guards";
import { getCandidateResumeDownloadUrl } from "@/lib/candidates/resume-links";

const BodySchema = z.object({
  candidateId: z.string().min(1),
});

export async function POST(req: NextRequest) {
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
    const accessRes = await requireCandidateAccess(admin, ctx, candidateId);
    if (!accessRes.ok) return accessRes.response;

    const { data: cand, error: candErr } = await admin
      .from("candidates")
      .select("id,resume_url,resume_file_name")
      .eq("id", candidateId)
      .maybeSingle();
    if (candErr) return NextResponse.json({ error: "CANDIDATE_LOOKUP_FAILED" }, { status: 500 });
    if (!cand) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    if (!cand.resume_url) {
      return NextResponse.json({ error: "NO_RESUME" }, { status: 404 });
    }
    if (!isSupportedResumeUrl(cand.resume_url)) {
      return NextResponse.json({ error: "UNSUPPORTED_RESUME_URL" }, { status: 400 });
    }

    return NextResponse.json(
      {
        downloadUrl: getCandidateResumeDownloadUrl(candidateId),
        fileName: cand.resume_file_name ?? null,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

function isSupportedResumeUrl(resumeUrl: string): boolean {
  return (
    resumeUrl.startsWith("resumes/") ||
    resumeUrl.startsWith("/") ||
    resumeUrl.startsWith("http://") ||
    resumeUrl.startsWith("https://")
  );
}
