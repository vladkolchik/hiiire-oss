import type { User } from "@/types";

const MS_PER_DAY = 86_400_000;
export const DASHBOARD_WEEK_TIME_ZONE = "Europe/Moscow";

export type DashboardInterviewParticipantRow = {
  interviewer_ids?: string[] | null;
};

export type DashboardInterviewCounts = {
  ownInterviewsUntilWeekEnd: number;
  employeeInterviewsUntilWeekEnd: number;
  interviewsThisWeek: number;
};

type DashboardInterviewWeekWindow = {
  serverNow: string;
  weekEndAt: string;
};

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getZonedDateParts(date: Date, timeZone: string): ZonedDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: Number.parseInt(get("year"), 10),
    month: Number.parseInt(get("month"), 10),
    day: Number.parseInt(get("day"), 10),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? date.getUTCDay(),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number.parseInt(parts.find((part) => part.type === type)?.value ?? "0", 10);
  const zonedAsUtcMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));

  return zonedAsUtcMs - date.getTime();
}

function zonedMidnightToUtc(year: number, month: number, day: number, timeZone: string): Date {
  const wallClockUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const firstOffsetMs = getTimeZoneOffsetMs(new Date(wallClockUtcMs), timeZone);
  const firstUtcMs = wallClockUtcMs - firstOffsetMs;
  const finalOffsetMs = getTimeZoneOffsetMs(new Date(firstUtcMs), timeZone);

  return new Date(wallClockUtcMs - finalOffsetMs);
}

export function getDashboardInterviewWeekWindow(nowMs: number): { serverNow: string; weekEndAt: string } {
  const now = new Date(nowMs);
  const zonedNow = getZonedDateParts(now, DASHBOARD_WEEK_TIME_ZONE);
  const daysUntilNextMonday = zonedNow.weekday === 0 ? 1 : 8 - zonedNow.weekday;

  return {
    serverNow: now.toISOString(),
    weekEndAt: zonedMidnightToUtc(zonedNow.year, zonedNow.month, zonedNow.day + daysUntilNextMonday, DASHBOARD_WEEK_TIME_ZONE).toISOString(),
  };
}

export function countDashboardInterviewsUntilWeekEnd(
  rows: DashboardInterviewParticipantRow[],
  userId: string,
  role: User["role"]
): DashboardInterviewCounts {
  let ownInterviewsUntilWeekEnd = 0;
  let employeeInterviewsUntilWeekEnd = 0;

  for (const row of rows) {
    const interviewerIds = Array.isArray(row.interviewer_ids) ? row.interviewer_ids : [];
    if (interviewerIds.includes(userId)) ownInterviewsUntilWeekEnd += 1;
    if (role === "admin" && interviewerIds.some((id) => id !== userId)) employeeInterviewsUntilWeekEnd += 1;
  }

  return {
    ownInterviewsUntilWeekEnd,
    employeeInterviewsUntilWeekEnd,
    interviewsThisWeek: role === "admin" ? ownInterviewsUntilWeekEnd + employeeInterviewsUntilWeekEnd : ownInterviewsUntilWeekEnd,
  };
}

function applyInterviewCountFilters(query: any, companyId: string, window: DashboardInterviewWeekWindow) {
  return query
    .select("id", { head: true, count: "exact" })
    .eq("company_id", companyId)
    .eq("status", "scheduled")
    .gte("scheduled_at", window.serverNow)
    .lt("scheduled_at", window.weekEndAt);
}

async function loadExactCount(query: any): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error("INTERVIEWS_LOOKUP_FAILED");

  return count ?? 0;
}

function toPostgresTextArrayLiteral(values: string[]): string {
  const escaped = values.map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);

  return `{${escaped.join(",")}}`;
}

export async function loadDashboardInterviewCounts(
  admin: any,
  ctx: { companyId: string; userId: string; role: User["role"] },
  window: DashboardInterviewWeekWindow
): Promise<DashboardInterviewCounts> {
  const ownCountReq = loadExactCount(
    applyInterviewCountFilters(admin.from("interviews"), ctx.companyId, window).contains("interviewer_ids", [ctx.userId])
  );

  if (ctx.role !== "admin") {
    const ownInterviewsUntilWeekEnd = await ownCountReq;
    return {
      ownInterviewsUntilWeekEnd,
      employeeInterviewsUntilWeekEnd: 0,
      interviewsThisWeek: ownInterviewsUntilWeekEnd,
    };
  }

  const [ownInterviewsUntilWeekEnd, employeeInterviewsUntilWeekEnd] = await Promise.all([
    ownCountReq,
    loadExactCount(
      applyInterviewCountFilters(admin.from("interviews"), ctx.companyId, window).not(
        "interviewer_ids",
        "cd",
        toPostgresTextArrayLiteral([ctx.userId])
      )
    ),
  ]);

  return {
    ownInterviewsUntilWeekEnd,
    employeeInterviewsUntilWeekEnd,
    interviewsThisWeek: ownInterviewsUntilWeekEnd + employeeInterviewsUntilWeekEnd,
  };
}
