import { NextResponse } from "next/server";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { getDashboardInterviewWeekWindow, loadDashboardInterviewCounts } from "@/lib/dashboard/interview-week";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Candidate, DashboardStats } from "@/types";

type ActivityDto = {
  id: string;
  type: "vacancy_created" | "candidate_added" | "ai_analysis_completed" | "candidate_status_changed" | "interview_scheduled";
  entityType: "vacancy" | "candidate" | "interview";
  entityId: string;
  description: string;
  createdAt: string; // ISO
};

function emptyCandidateByStatus(): DashboardStats["candidatesByStatus"] {
  return {
    new: 0,
    reviewing: 0,
    "security-check": 0,
    "interview-scheduled": 0,
    interviewed: 0,
    offer: 0,
    hired: 0,
    rejected: 0,
  };
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;
    const now = Date.now();
    const { serverNow, weekEndAt } = getDashboardInterviewWeekWindow(now);

    // Vacancies: active count (RLS limits by company)
    const activeVacanciesReq = supabase
      .from("vacancies")
      .select("id", { head: true, count: "exact" })
      .eq("status", "active");

    // Candidates: in-process count (exclude final states)
    const inProcessStatuses: Candidate["status"][] = [
      "new",
      "reviewing",
      "security-check",
      "interview-scheduled",
      "interviewed",
      "offer",
    ];
    const totalCandidatesReq = supabase
      .from("candidates")
      .select("id", { head: true, count: "exact" })
      .in("status", inProcessStatuses);

    // Per-status counts (small N, predictable)
    const statusKeys = Object.keys(emptyCandidateByStatus()) as Array<keyof DashboardStats["candidatesByStatus"]>;
    const perStatusReqs = statusKeys.map((status) =>
      supabase
        .from("candidates")
        .select("id", { head: true, count: "exact" })
        .eq("status", status)
    );

    // Average match percentage (computed in API; OK for MVP)
    const matchReq = supabase.from("candidates").select("match_percentage").not("match_percentage", "is", null);

    // Recent activity (best-effort): latest candidates + vacancies
    const latestCandidatesReq = supabase
      .from("candidates")
      .select("id,name,created_at")
      .order("created_at", { ascending: false })
      .limit(5);
    const latestVacanciesReq = supabase
      .from("vacancies")
      .select("id,title,created_at")
      .order("created_at", { ascending: false })
      .limit(5);
    const interviewCountsReq = loadDashboardInterviewCounts(admin, ctx, { serverNow, weekEndAt });

    const [
      activeVacanciesRes,
      totalCandidatesRes,
      ...rest
    ] = await Promise.all([activeVacanciesReq, totalCandidatesReq, ...perStatusReqs, matchReq, latestCandidatesReq, latestVacanciesReq, interviewCountsReq]);

    const matchRes = rest[perStatusReqs.length] as Awaited<typeof matchReq>;
    const latestCandidatesRes = rest[perStatusReqs.length + 1] as Awaited<typeof latestCandidatesReq>;
    const latestVacanciesRes = rest[perStatusReqs.length + 2] as Awaited<typeof latestVacanciesReq>;
    const interviewCounts = rest[perStatusReqs.length + 3] as Awaited<typeof interviewCountsReq>;

    if (activeVacanciesRes.error) return NextResponse.json({ error: "VACANCIES_LOOKUP_FAILED" }, { status: 500 });
    if (totalCandidatesRes.error) return NextResponse.json({ error: "CANDIDATES_LOOKUP_FAILED" }, { status: 500 });

    const candidatesByStatus = emptyCandidateByStatus();
    for (let i = 0; i < perStatusReqs.length; i++) {
      const status = statusKeys[i];
      const res = rest[i] as Awaited<(typeof perStatusReqs)[number]>;
      if (res.error) return NextResponse.json({ error: "CANDIDATES_STATUS_LOOKUP_FAILED" }, { status: 500 });
      candidatesByStatus[status] = res.count ?? 0;
    }

    const matches = (matchRes.data ?? []).map((r) => r.match_percentage).filter((v): v is number => typeof v === "number");
    const avgMatchPercentage =
      matches.length === 0 ? 0 : Math.round((matches.reduce((s, v) => s + v, 0) / matches.length) * 10) / 10;

    const stats: DashboardStats = {
      role: ctx.role,
      activeVacancies: activeVacanciesRes.count ?? 0,
      totalCandidates: totalCandidatesRes.count ?? 0,
      interviewsThisWeek: interviewCounts.interviewsThisWeek,
      ownInterviewsUntilWeekEnd: interviewCounts.ownInterviewsUntilWeekEnd,
      employeeInterviewsUntilWeekEnd: interviewCounts.employeeInterviewsUntilWeekEnd,
      serverNow,
      weekEndAt,
      avgMatchPercentage,
      candidatesByStatus,
      avgResponseTime: 0,
    };

    const activities: ActivityDto[] = [];
    if (!latestVacanciesRes.error && latestVacanciesRes.data) {
      for (const v of latestVacanciesRes.data) {
        activities.push({
          id: `vacancy-${v.id}`,
          type: "vacancy_created",
          entityType: "vacancy",
          entityId: v.id,
          description: `Создана вакансия «${v.title}»`,
          createdAt: v.created_at,
        });
      }
    }
    if (!latestCandidatesRes.error && latestCandidatesRes.data) {
      for (const c of latestCandidatesRes.data) {
        activities.push({
          id: `candidate-${c.id}`,
          type: "candidate_added",
          entityType: "candidate",
          entityId: c.id,
          description: `Добавлен кандидат ${c.name}`,
          createdAt: c.created_at,
        });
      }
    }
    activities.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

    return NextResponse.json(
      { stats, activities: activities.slice(0, 5) },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "INTERVIEWS_LOOKUP_FAILED") {
      return NextResponse.json({ error: "INTERVIEWS_LOOKUP_FAILED" }, { status: 500 });
    }

    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
