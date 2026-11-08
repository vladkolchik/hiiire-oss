import { NextResponse, type NextRequest } from "next/server";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { requireSameOriginRequest } from "@/lib/api/csrf";
import { requireInterviewCreateAccess } from "@/lib/interviews/access";
import { loadVisibleCalendarSnapshot } from "@/lib/interviews/calendar-snapshot";
import { findInterviewConflicts, type ConflictCandidateInterview } from "@/lib/interviews/conflicts";
import { loadVisibleInterviewListPage } from "@/lib/interviews/list-snapshot";
import { getInterviewRangeQueryWindow, interviewOverlapsRange } from "@/lib/interviews/range";
import { CreateInterviewBodySchema, mapInterviewValidationIssues } from "@/lib/interviews/validation";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function parseDateBound(value: string | null): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function parseRequiredRange(req: NextRequest): { from: string; to: string } | NextResponse {
  const url = new URL(req.url);
  const from = parseDateBound(url.searchParams.get("from"));
  const to = parseDateBound(url.searchParams.get("to"));
  if (!from || !to) {
    return NextResponse.json(
      { error: "INVALID_RANGE", message: "Выберите период календаря." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const days = (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000;
  if (days <= 0 || days > 45) {
    return NextResponse.json(
      { error: "INVALID_RANGE", message: "Выберите период календаря до 45 дней." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  return { from, to };
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

function conflictWindow(scheduledAtIso: string) {
  const start = new Date(scheduledAtIso);
  return {
    from: new Date(start.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    to: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();
    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) {
      ctxRes.response.headers.set("Cache-Control", "no-store");
      return ctxRes.response;
    }

    if (url.searchParams.get("mode") === "list") {
      const result = await loadVisibleInterviewListPage(admin, ctxRes.data, {
        scope: url.searchParams.get("scope"),
        status: url.searchParams.get("status"),
        search: url.searchParams.get("q"),
        page: Number.parseInt(url.searchParams.get("page") ?? "1", 10),
        pageSize: Number.parseInt(url.searchParams.get("pageSize") ?? "25", 10),
      });
      return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    const range = parseRequiredRange(req);
    if (range instanceof NextResponse) return range;

    const { interviews, version } = await loadVisibleCalendarSnapshot(admin, ctxRes.data, range);
    return NextResponse.json({ interviews, version }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { error: "INTERVIEW_LOOKUP_FAILED", message: "Не удалось загрузить собеседования." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const csrfRes = requireSameOriginRequest(req);
    if (!csrfRes.ok) return csrfRes.response;

    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();
    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const bodyJson = await req.json().catch(() => null);
    const parsed = CreateInterviewBodySchema.safeParse(bodyJson);
    if (!parsed.success) {
      const issues = mapInterviewValidationIssues(parsed.error);
      return NextResponse.json({ error: "INVALID_BODY", message: issues[0]?.message, issues }, { status: 400 });
    }

    const accessRes = await requireInterviewCreateAccess(admin, ctx, parsed.data);
    if (!accessRes.ok) return accessRes.response;

    const scheduledAtIso = new Date(parsed.data.scheduledAt).toISOString();
    const window = conflictWindow(scheduledAtIso);
    const existing = await loadConflictCandidates(admin, ctx.companyId, window.from, window.to);
    const namesById = Object.fromEntries(accessRes.data.interviewers.map((row) => [row.id, row.name]));
    const conflicts = findInterviewConflicts({
      scheduledAt: scheduledAtIso,
      durationMinutes: parsed.data.durationMinutes,
      candidateId: parsed.data.candidateId,
      interviewerIds: parsed.data.interviewerIds,
      existing: existing.map((row) => ({ ...row, interviewerNamesById: namesById })),
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

    const { data: interview, error } = await admin
      .rpc("create_interview_mvp", {
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
        p_created_by: ctx.userId,
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
    if (error || !interview) {
      return NextResponse.json({ error: "INTERVIEW_CREATE_FAILED", message: "Не удалось назначить собеседование." }, { status: 500 });
    }

    return NextResponse.json({ interview, conflicts }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Не удалось выполнить действие." }, { status: 500 });
  }
}
