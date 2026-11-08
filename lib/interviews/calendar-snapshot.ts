import type { CompanyContext } from "@/lib/access/company-guards";
import { getInterviewRangeQueryWindow, interviewOverlapsRange } from "@/lib/interviews/range";

import { buildCalendarVersion } from "./calendar-version";

type CalendarRange = {
  from: string;
  to: string;
};

export type VisibleInterviewAccessRow = {
  row: any;
  level: "manage" | "interviewer_only";
};

type AccessCandidateRow = {
  id: string;
  vacancy_id: string;
  created_by: string;
};

type AccessVacancyRow = {
  id: string;
  company_id: string;
  created_by: string;
};

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0)));
}

export async function loadVisibleInterviewAccessRows(admin: any, ctx: CompanyContext, rows: any[]): Promise<VisibleInterviewAccessRow[]> {
  if (rows.length === 0) return [];
  if (ctx.role === "admin") return rows.map((row) => ({ row, level: "manage" }));

  // Batched equivalent of requireInterviewReadAccess for snapshot/list reads.
  const candidateIds = uniqueStrings(rows.map((row) => row.candidate_id));
  const interviewVacancyIds = uniqueStrings(rows.map((row) => row.vacancy_id));

  const { data: candidates, error: candidatesError } = candidateIds.length
    ? await admin.from("candidates").select("id,vacancy_id,created_by").in("id", candidateIds)
    : { data: [], error: null };
  if (candidatesError) throw new Error("INTERVIEW_ACCESS_LOOKUP_FAILED");

  const candidateRows = (candidates ?? []) as AccessCandidateRow[];
  const candidateVacancyIds = uniqueStrings(candidateRows.map((candidate) => candidate.vacancy_id));
  const accessVacancyIds = uniqueStrings([...interviewVacancyIds, ...candidateVacancyIds]);

  const { data: vacancies, error: vacanciesError } = accessVacancyIds.length
    ? await admin.from("vacancies").select("id,company_id,created_by").in("id", accessVacancyIds)
    : { data: [], error: null };
  if (vacanciesError) throw new Error("INTERVIEW_ACCESS_LOOKUP_FAILED");

  const vacanciesById = new Map(((vacancies ?? []) as AccessVacancyRow[]).map((vacancy) => [vacancy.id, vacancy]));
  const manageableCandidateIds = new Set(
    candidateRows
      .filter((candidate) => {
        const vacancy = vacanciesById.get(candidate.vacancy_id);
        return vacancy?.company_id === ctx.companyId && candidate.created_by === ctx.userId;
      })
      .map((candidate) => candidate.id)
  );
  const manageableVacancyIds = new Set(
    ((vacancies ?? []) as AccessVacancyRow[])
      .filter((vacancy) => vacancy.company_id === ctx.companyId && vacancy.created_by === ctx.userId)
      .map((vacancy) => vacancy.id)
  );

  return rows.flatMap<VisibleInterviewAccessRow>((row) => {
    if (manageableCandidateIds.has(row.candidate_id) && manageableVacancyIds.has(row.vacancy_id)) {
      return [{ row, level: "manage" }];
    }

    if ((row.interviewer_ids ?? []).includes(ctx.userId)) {
      return [{ row, level: "interviewer_only" }];
    }

    return [];
  });
}

function toPerson(row: any) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatar_url: row.avatar_url ?? null,
  };
}

export async function enrichVisibleInterviewRows(admin: any, accessCheckedRows: VisibleInterviewAccessRow[]) {
  const rows = accessCheckedRows.map((item) => item.row);
  const candidateIds = Array.from(new Set(rows.map((row) => row.candidate_id)));
  const vacancyIds = Array.from(new Set(rows.map((row) => row.vacancy_id)));
  const interviewerIds = Array.from(new Set(rows.flatMap((row) => row.interviewer_ids ?? [])));

  const [{ data: candidates, error: candidatesError }, { data: vacancies, error: vacanciesError }, { data: profiles, error: profilesError }] = await Promise.all([
    candidateIds.length
      ? admin.from("candidates").select("id,name,avatar_url,status").in("id", candidateIds)
      : Promise.resolve({ data: [], error: null }),
    vacancyIds.length ? admin.from("vacancies").select("id,title").in("id", vacancyIds) : Promise.resolve({ data: [], error: null }),
    interviewerIds.length
      ? admin.from("profiles").select("id,name,email,avatar_url").in("id", interviewerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (candidatesError || vacanciesError || profilesError) throw new Error("INTERVIEW_LOOKUP_FAILED");

  const candidatesById = new Map((candidates ?? []).map((row: any) => [row.id, row]));
  const vacanciesById = new Map((vacancies ?? []).map((row: any) => [row.id, row]));
  const profilesById = new Map((profiles ?? []).map((row: any) => [row.id, row]));

  return accessCheckedRows.map(({ row, level }) => {
    const interviewers = (row.interviewer_ids ?? [])
      .map((id: string) => profilesById.get(id))
      .filter(Boolean)
      .map(toPerson);

    if (level === "interviewer_only") {
      const candidate = candidatesById.get(row.candidate_id) as any;
      const vacancy = vacanciesById.get(row.vacancy_id) as any;

      return {
        id: row.id,
        accessLevel: "interviewer_only",
        scheduledAt: row.scheduled_at,
        durationMinutes: row.duration_minutes,
        type: row.type,
        status: row.status,
        displayTitle: candidate?.name ?? "Кандидат",
        displaySubtitle: vacancy?.title ?? "Вакансия",
        meetingUrl: row.meeting_url ?? undefined,
        location: row.location ?? undefined,
        interviewers,
      };
    }

    const candidate = candidatesById.get(row.candidate_id) as any;
    const vacancy = vacanciesById.get(row.vacancy_id) as any;

    return {
      ...row,
      accessLevel: "manage",
      candidate: candidate ?? null,
      vacancy: vacancy ?? null,
      displayTitle: candidate?.name ?? "Кандидат",
      displaySubtitle: vacancy?.title ?? "Вакансия",
      interviewers,
    };
  });
}

export async function loadVisibleCalendarSnapshot(admin: any, ctx: CompanyContext, range: CalendarRange) {
  const window = getInterviewRangeQueryWindow(range);
  const { data: interviews, error } = await admin
    .from("interviews")
    .select("*")
    .eq("company_id", ctx.companyId)
    .gte("scheduled_at", window.queryFrom)
    .lt("scheduled_at", window.queryTo)
    .order("scheduled_at", { ascending: true });

  if (error) throw new Error("INTERVIEW_LOOKUP_FAILED");

  const overlappingRows = [];
  for (const row of interviews ?? []) {
    if (
      !interviewOverlapsRange({
        scheduledAt: row.scheduled_at,
        durationMinutes: row.duration_minutes,
        from: range.from,
        to: range.to,
      })
    ) {
      continue;
    }

    overlappingRows.push(row);
  }

  const accessCheckedRows = await loadVisibleInterviewAccessRows(admin, ctx, overlappingRows);
  const visibleInterviews = await enrichVisibleInterviewRows(admin, accessCheckedRows);

  return {
    interviews: visibleInterviews,
    version: buildCalendarVersion(visibleInterviews),
  };
}
