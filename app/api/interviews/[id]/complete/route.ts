import { NextResponse, type NextRequest } from "next/server";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { requireSameOriginRequest } from "@/lib/api/csrf";
import { requireInterviewManageAccess } from "@/lib/interviews/access";
import { assertFreshInterviewPrecondition } from "@/lib/interviews/stale-precondition";
import { CompleteInterviewBodySchema, mapInterviewValidationIssues } from "@/lib/interviews/validation";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const csrfRes = requireSameOriginRequest(req);
    if (!csrfRes.ok) return csrfRes.response;

    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();
    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const accessRes = await requireInterviewManageAccess(admin, ctx, id);
    if (!accessRes.ok) return accessRes.response;

    const bodyJson = await req.json().catch(() => ({}));
    const parsed = CompleteInterviewBodySchema.safeParse(bodyJson ?? {});
    if (!parsed.success) {
      const issues = mapInterviewValidationIssues(parsed.error);
      return NextResponse.json({ error: "INVALID_BODY", message: issues[0]?.message, issues }, { status: 400 });
    }

    const staleRes = assertFreshInterviewPrecondition(accessRes.data.interview.updatedAt, parsed.data.expectedUpdatedAt);
    if (staleRes) return staleRes;

    if (accessRes.data.interview.status !== "scheduled") {
      return NextResponse.json(
        { error: "INTERVIEW_NOT_EDITABLE", message: "Это собеседование уже нельзя завершить." },
        { status: 409 }
      );
    }

    const { data, error } = await admin
      .rpc("complete_interview_mvp", {
        p_interview_id: id,
        p_company_id: ctx.companyId,
        p_completion_note: parsed.data.completionNote ?? null,
        p_expected_updated_at: parsed.data.expectedUpdatedAt,
      })
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "INTERVIEW_COMPLETE_FAILED", message: "Не удалось завершить собеседование." }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "INTERVIEW_CHANGED", message: "Собеседование уже изменилось. Обновите календарь и попробуйте ещё раз." },
        { status: 409 }
      );
    }

    return NextResponse.json({ interview: data }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Не удалось выполнить действие." }, { status: 500 });
  }
}
