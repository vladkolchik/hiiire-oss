import assert from "node:assert/strict";
import test from "node:test";

import {
  countDashboardInterviewsUntilWeekEnd,
  DASHBOARD_WEEK_TIME_ZONE,
  getDashboardInterviewWeekWindow,
  loadDashboardInterviewCounts,
} from "../lib/dashboard/interview-week.ts";
import { buildDashboardInterviewStatCards } from "../lib/dashboard/interview-stat-cards.ts";

type MockRow = Record<string, any>;

class MockQuery {
  private filters: Array<(row: MockRow) => boolean> = [];
  private countOnly = false;

  private readonly rows: MockRow[];

  constructor(rows: MockRow[]) {
    this.rows = rows;
  }

  select(_columns: string, options?: { head?: boolean; count?: "exact" }) {
    this.countOnly = Boolean(options?.head && options.count === "exact");
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  gte(column: string, value: string) {
    this.filters.push((row) => typeof row[column] === "string" && row[column] >= value);
    return this;
  }

  lt(column: string, value: string) {
    this.filters.push((row) => typeof row[column] === "string" && row[column] < value);
    return this;
  }

  contains(column: string, values: string[]) {
    this.filters.push((row) => Array.isArray(row[column]) && values.every((value) => row[column].includes(value)));
    return this;
  }

  overlaps(column: string, values: string[]) {
    this.filters.push((row) => Array.isArray(row[column]) && row[column].some((value: string) => values.includes(value)));
    return this;
  }

  not(column: string, operator: string, value: string) {
    if (operator !== "cd") throw new Error(`Unsupported not operator: ${operator}`);
    const allowedValues = value
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);

    this.filters.push((row) => {
      const rowValues = Array.isArray(row[column]) ? row[column] : [];
      return !rowValues.every((item: string) => allowedValues.includes(item));
    });
    return this;
  }

  then(resolve: (value: { data: MockRow[] | null; count: number | null; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }

  private execute() {
    const data = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    return {
      data: this.countOnly ? null : data,
      count: this.countOnly ? data.length : null,
      error: null,
    };
  }
}

function mockAdmin(fixtures: Record<string, MockRow[]>) {
  return {
    from(table: string) {
      return new MockQuery(fixtures[table] ?? []);
    },
  };
}

test("dashboard interview week window uses one server timestamp and Europe/Moscow week boundary", () => {
  assert.equal(DASHBOARD_WEEK_TIME_ZONE, "Europe/Moscow");
  assert.deepEqual(
    getDashboardInterviewWeekWindow(Date.parse("2026-05-30T10:15:00.000Z")),
    {
      serverNow: "2026-05-30T10:15:00.000Z",
      weekEndAt: "2026-05-31T21:00:00.000Z",
    }
  );
});

test("dashboard interview week includes Sunday and excludes next Monday in product timezone", () => {
  assert.deepEqual(
    getDashboardInterviewWeekWindow(Date.parse("2026-05-31T20:59:59.999Z")),
    {
      serverNow: "2026-05-31T20:59:59.999Z",
      weekEndAt: "2026-05-31T21:00:00.000Z",
    }
  );
  assert.deepEqual(
    getDashboardInterviewWeekWindow(Date.parse("2026-05-31T21:00:00.000Z")),
    {
      serverNow: "2026-05-31T21:00:00.000Z",
      weekEndAt: "2026-06-07T21:00:00.000Z",
    }
  );
});

test("dashboard interview counts split admin own and employee interviews", () => {
  const rows = [
    { interviewer_ids: ["admin"] },
    { interviewer_ids: ["employee"] },
    { interviewer_ids: ["admin", "employee"] },
    { interviewer_ids: [] },
  ];

  assert.deepEqual(countDashboardInterviewsUntilWeekEnd(rows, "admin", "admin"), {
    ownInterviewsUntilWeekEnd: 2,
    employeeInterviewsUntilWeekEnd: 2,
    interviewsThisWeek: 4,
  });
});

test("dashboard interview counts for hr and recruiter include only their own interviews", () => {
  const rows = [
    { interviewer_ids: ["hr"] },
    { interviewer_ids: ["other"] },
    { interviewer_ids: ["hr", "other"] },
  ];

  assert.deepEqual(countDashboardInterviewsUntilWeekEnd(rows, "hr", "hr"), {
    ownInterviewsUntilWeekEnd: 2,
    employeeInterviewsUntilWeekEnd: 0,
    interviewsThisWeek: 2,
  });
  assert.deepEqual(countDashboardInterviewsUntilWeekEnd(rows, "hr", "recruiter"), {
    ownInterviewsUntilWeekEnd: 2,
    employeeInterviewsUntilWeekEnd: 0,
    interviewsThisWeek: 2,
  });
});

test("dashboard interview count loader uses exact count queries for role and time contract", async () => {
  const admin = mockAdmin({
    interviews: [
      { id: "past", company_id: "company-a", status: "scheduled", scheduled_at: "2026-05-30T09:59:59.999Z", interviewer_ids: ["admin"] },
      { id: "own-now", company_id: "company-a", status: "scheduled", scheduled_at: "2026-05-30T10:00:00.000Z", interviewer_ids: ["admin"] },
      { id: "employee", company_id: "company-a", status: "scheduled", scheduled_at: "2026-05-30T11:00:00.000Z", interviewer_ids: ["employee"] },
      { id: "shared", company_id: "company-a", status: "scheduled", scheduled_at: "2026-05-30T12:00:00.000Z", interviewer_ids: ["admin", "employee"] },
      { id: "cancelled", company_id: "company-a", status: "cancelled", scheduled_at: "2026-05-30T12:00:00.000Z", interviewer_ids: ["admin"] },
      { id: "next-week", company_id: "company-a", status: "scheduled", scheduled_at: "2026-05-31T21:00:00.000Z", interviewer_ids: ["admin"] },
      { id: "other-company", company_id: "company-b", status: "scheduled", scheduled_at: "2026-05-30T12:00:00.000Z", interviewer_ids: ["admin"] },
    ],
  });

  assert.deepEqual(
    await loadDashboardInterviewCounts(
      admin,
      { companyId: "company-a", userId: "admin", role: "admin" },
      { serverNow: "2026-05-30T10:00:00.000Z", weekEndAt: "2026-05-31T21:00:00.000Z" }
    ),
    {
      ownInterviewsUntilWeekEnd: 2,
      employeeInterviewsUntilWeekEnd: 2,
      interviewsThisWeek: 4,
    }
  );
  assert.deepEqual(
    await loadDashboardInterviewCounts(
      admin,
      { companyId: "company-a", userId: "employee", role: "recruiter" },
      { serverNow: "2026-05-30T10:00:00.000Z", weekEndAt: "2026-05-31T21:00:00.000Z" }
    ),
    {
      ownInterviewsUntilWeekEnd: 2,
      employeeInterviewsUntilWeekEnd: 0,
      interviewsThisWeek: 2,
    }
  );
});

test("dashboard interview card builder covers admin and employee role matrix", () => {
  const base = {
    activeVacancies: 0,
    totalCandidates: 0,
    interviewsThisWeek: 0,
    avgResponseTime: 0,
    avgMatchPercentage: 0,
    candidatesByStatus: {
      new: 0,
      reviewing: 0,
      "security-check": 0,
      "interview-scheduled": 0,
      interviewed: 0,
      offer: 0,
      hired: 0,
      rejected: 0,
    },
  } as const;

  assert.deepEqual(buildDashboardInterviewStatCards(null), [
    { key: "interviews-own", title: "Собеседования", value: "—", description: "Статистика недоступна" },
  ]);
  assert.deepEqual(buildDashboardInterviewStatCards({ ...base, role: "hr", ownInterviewsUntilWeekEnd: 3, employeeInterviewsUntilWeekEnd: 0 }), [
    { key: "interviews-own", title: "Собеседования", value: 3, description: "У вас будет до конца недели" },
  ]);
  assert.deepEqual(buildDashboardInterviewStatCards({ ...base, role: "admin", ownInterviewsUntilWeekEnd: 0, employeeInterviewsUntilWeekEnd: 4 }), [
    { key: "interviews-employees", title: "Собеседования", value: 4, description: "Будет у сотрудников до конца недели" },
  ]);
  assert.deepEqual(buildDashboardInterviewStatCards({ ...base, role: "admin", ownInterviewsUntilWeekEnd: 2, employeeInterviewsUntilWeekEnd: 0 }), [
    { key: "interviews-own", title: "Собеседования", value: 2, description: "У вас будет до конца недели" },
  ]);
  assert.deepEqual(buildDashboardInterviewStatCards({ ...base, role: "admin", ownInterviewsUntilWeekEnd: 0, employeeInterviewsUntilWeekEnd: 0 }), [
    { key: "interviews-own", title: "Собеседования", value: 0, description: "У вас будет до конца недели" },
  ]);
  assert.deepEqual(buildDashboardInterviewStatCards({ ...base, role: "admin", ownInterviewsUntilWeekEnd: 2, employeeInterviewsUntilWeekEnd: 4 }), [
    { key: "interviews-employees", title: "Собеседования", value: 4, description: "Будет у сотрудников до конца недели" },
    { key: "interviews-own", title: "Собеседования", value: 2, description: "У вас будет до конца недели" },
  ]);
});
