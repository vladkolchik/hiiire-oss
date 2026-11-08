import { NextResponse, type NextRequest } from "next/server";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };
const MAX_CANDIDATE_IDS = 200;
const JOB_STATUS_LOAD_MESSAGE = "Не удалось загрузить статусы анализа.";

type LatestJobRow = {
  candidate_id: string;
  status: "queued" | "processing" | "done" | "failed";
  updated_at: string;
  last_error: string | null;
  attempt: number;
  max_attempts: number;
};

function parseCandidateIds(value: string | null): { ok: true; ids: string[] } | { ok: false } {
  const ids = Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    )
  );

  if (ids.length > MAX_CANDIDATE_IDS) return { ok: false };
  return { ok: true, ids };
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) {
      ctxRes.response.headers.set("Cache-Control", "no-store");
      return ctxRes.response;
    }
    const ctx = ctxRes.data;

    const parsedIds = parseCandidateIds(req.nextUrl.searchParams.get("candidateIds"));
    if (!parsedIds.ok) {
      return NextResponse.json(
        { error: "TOO_MANY_IDS", message: "Запросите не больше 200 статусов за раз." },
        { status: 400, headers: noStoreHeaders }
      );
    }

    const candidateIds = parsedIds.ids;
    if (candidateIds.length === 0) {
      return NextResponse.json({ jobs: [] }, { status: 200, headers: noStoreHeaders });
    }

    let query = admin
      .from("jobs_ai")
      .select("candidate_id,status,updated_at,last_error,attempt,max_attempts")
      .eq("company_id", ctx.companyId)
      .in("candidate_id", candidateIds)
      .in("status", ["queued", "processing", "done", "failed"])
      .order("updated_at", { ascending: false });

    if (ctx.role !== "admin") query = query.eq("requested_by", ctx.userId);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json(
        { error: "JOBS_LOOKUP_FAILED", message: JOB_STATUS_LOAD_MESSAGE },
        { status: 500, headers: noStoreHeaders }
      );
    }

    const byCandidate = new Map<string, LatestJobRow>();
    for (const row of (data ?? []) as LatestJobRow[]) {
      if (byCandidate.has(row.candidate_id)) continue;
      byCandidate.set(row.candidate_id, row);
    }

    return NextResponse.json(
      {
        jobs: Array.from(byCandidate.values()).map((row) => ({
          candidateId: row.candidate_id,
          status: row.status,
          updatedAt: row.updated_at,
          attempt: row.attempt,
          maxAttempts: row.max_attempts,
          lastError: row.last_error,
        })),
      },
      { status: 200, headers: noStoreHeaders }
    );
  } catch {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: JOB_STATUS_LOAD_MESSAGE },
      { status: 500, headers: noStoreHeaders }
    );
  }
}
