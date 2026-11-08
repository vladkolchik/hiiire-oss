import { NextResponse, type NextRequest } from "next/server";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { requireSameOriginRequest } from "@/lib/api/csrf";
import { requireInterviewManageAccess, requireInterviewMutationAccess } from "@/lib/interviews/access";
import { findInterviewConflicts, type ConflictCandidateInterview } from "@/lib/interviews/conflicts";
import { getInterviewRangeQueryWindow, interviewOverlapsRange } from "@/lib/interviews/range";
import { assertFreshInterviewPrecondition } from "@/lib/interviews/stale-precondition";
import { UpdateInterviewBodySchema, mapInterviewValidationIssues } from "@/lib/interviews/validation";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function conflictWindow(scheduledAtIso: string) {
  const start = new Date(scheduledAtIso);
  return {
    from: new Date(start.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    to: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

async function loadConflictCandidates(
  admin: any,
  companyId: string,
  fromIso: string,
  toIso: string
): Promise<ConflictCandidateInterview[]> {
  const window = getInterviewRangeQueryWindow({ from: fromIso, to: toIso });
  const { data } = await admin
    .from("interviews")
    .select("id,candidate_id,scheduled_at,duration_minutes,status,interviewer_ids")
    .eq("company_id", companyId)
    .eq("status", "scheduled")
    .gte("scheduled_at", window.queryFrom)
    .lt("scheduled_at", window.queryTo);

  return (data ?? [])
    .filter((row: any) =>
      interviewOverlapsRange({ scheduledAt: row.scheduled_at, durationMinutes: row.duration_minutes, from: fromIso, to: toIso })
    )
    .map((row: any) => ({
      id: row.id,
      candidateId: row.candidate_id,
      scheduledAt: row.scheduled_at,
      durationMinutes: row.duration_minutes,
      status: row.status,
      interviewerIds: row.interviewer_ids,
    }));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const bodyJson = await req.json().catch(() => null);
    const parsed = UpdateInterviewBodySchema.safeParse(bodyJson);
    if (!parsed.success) {
      const issues = mapInterviewValidationIssues(parsed.error);
      return NextResponse.json({ error: "INVALID_BODY", message: issues[0]?.message, issues }, { status: 400 });
    }

    const staleRes = assertFreshInterviewPrecondition(accessRes.data.interview.updatedAt, parsed.data.expectedUpdatedAt);
    if (staleRes) return staleRes;

    if (accessRes.data.interview.status !== "scheduled") {
      return NextResponse.json(
        { error: "INTERVIEW_NOT_EDITABLE", message: "Это собеседование уже нельзя изменить." },
        { status: 409 }
      );
    }

    const mutationAccessRes = await requireInterviewMutationAccess(admin, ctx, parsed.data);
    if (!mutationAccessRes.ok) return mutationAccessRes.response;

    const scheduledAtIso = new Date(parsed.data.scheduledAt).toISOString();
    const window = conflictWindow(scheduledAtIso);
    const existing = await loadConflictCandidates(admin, ctx.companyId, window.from, window.to);
    const namesById = Object.fromEntries(mutationAccessRes.data.interviewers.map((row) => [row.id, row.name]));
    const conflicts = findInterviewConflicts({
      scheduledAt: scheduledAtIso,
      durationMinutes: parsed.data.durationMinutes,
      candidateId: parsed.data.candidateId,
      interviewerIds: parsed.data.interviewerIds,
      existing: existing.map((row) => ({ ...row, interviewerNamesById: namesById })),
      ignoreInterviewId: id,
    });

    if (conflicts.length > 0 && !parsed.data.allowConflicts) {
      return NextResponse.json(
        {
          error: "INTERVIEW_CONFLICTS",
          message: "Есть пересечение по времени. Проверьте предупреждение и сохраните ещё раз, если всё верно.",
          conflicts,
        },
        { status: 409 }
      );
    }

    const { data, error } = await admin
      .rpc("update_interview_mvp", {
        p_interview_id: id,
        p_company_id: ctx.companyId,
        p_candidate_id: parsed.data.candidateId,
        p_vacancy_id: parsed.data.vacancyId,
        p_scheduled_at: scheduledAtIso,
        p_duration_minutes: parsed.data.durationMinutes,
        p_type: parsed.data.type,
        p_interviewer_ids: parsed.data.interviewerIds,
        p_meeting_url: parsed.data.meetingUrl ?? null,
        p_location: parsed.data.location ?? null,
        p_notes: parsed.data.notes ?? null,
        p_expected_updated_at: parsed.data.expectedUpdatedAt,
        p_allow_conflicts: parsed.data.allowConflicts,
      })
      .maybeSingle();

    if (error?.message?.includes("INTERVIEW_CONFLICTS")) {
      const latestExisting = await loadConflictCandidates(admin, ctx.companyId, window.from, window.to);
      const latestConflicts = findInterviewConflicts({
        scheduledAt: scheduledAtIso,
        durationMinutes: parsed.data.durationMinutes,
        candidateId: parsed.data.candidateId,
        interviewerIds: parsed.data.interviewerIds,
        existing: latestExisting.map((row) => ({ ...row, interviewerNamesById: namesById })),
        ignoreInterviewId: id,
      });
      return NextResponse.json(
        {
          error: "INTERVIEW_CONFLICTS",
          message: "Есть пересечение по времени. Проверьте предупреждение и сохраните ещё раз, если всё верно.",
          conflicts: latestConflicts,
        },
        { status: 409 }
      );
    }
    if (error) {
      return NextResponse.json({ error: "INTERVIEW_UPDATE_FAILED", message: "Не удалось обновить собеседование." }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: "INTERVIEW_CHANGED", message: "Собеседование уже изменилось. Обновите календарь и попробуйте ещё раз." },
        { status: 409 }
      );
    }

    return NextResponse.json({ interview: data, conflicts }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Не удалось выполнить действие." }, { status: 500 });
  }
}
