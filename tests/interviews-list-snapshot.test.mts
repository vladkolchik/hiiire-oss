import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") {
      return nextResolve("next/server.js", context);
    }

    if (specifier.startsWith("@/")) {
      const withoutAlias = specifier.slice(2);
      const directPath = join(process.cwd(), withoutAlias);
      const resolvedPath = existsSync(directPath) ? directPath : `${directPath}.ts`;
      return nextResolve(pathToFileURL(resolvedPath).href, context);
    }

    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const directPath = join(dirname(fileURLToPath(context.parentURL)), specifier);
      if (!existsSync(directPath) && existsSync(`${directPath}.ts`)) {
        return nextResolve(pathToFileURL(`${directPath}.ts`).href, context);
      }
    }

    return nextResolve(specifier, context);
  },
});

const { loadVisibleCalendarSnapshot } = await import("../lib/interviews/calendar-snapshot.ts");
const { loadVisibleInterviewListPage } = await import("../lib/interviews/list-snapshot.ts");

type Row = Record<string, any>;

class FakeQuery {
  private filters: Array<{ op: "eq" | "gte" | "lt" | "in"; column: string; value: any }> = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private rangeBounds: { from: number; to: number } | null = null;
  private readonly admin: FakeAdmin;
  private readonly table: string;

  constructor(admin: FakeAdmin, table: string) {
    this.admin = admin;
    this.table = table;
  }

  select() {
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ op: "eq", column, value });
    return this;
  }

  gte(column: string, value: any) {
    this.filters.push({ op: "gte", column, value });
    return this;
  }

  lt(column: string, value: any) {
    this.filters.push({ op: "lt", column, value });
    return this;
  }

  in(column: string, value: any[]) {
    this.filters.push({ op: "in", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending ?? true });
    return this;
  }

  range(from: number, to: number) {
    this.rangeBounds = { from, to };
    return this;
  }

  maybeSingle() {
    const data = this.executeRows()[0] ?? null;
    return Promise.resolve({ data, error: null });
  }

  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({ data: this.executeRows(), error: null }).then(onfulfilled, onrejected);
  }

  private executeRows() {
    let rows = [...(this.admin.tables[this.table] ?? [])];
    this.admin.queryCounts[this.table] = (this.admin.queryCounts[this.table] ?? 0) + 1;

    for (const filter of this.filters) {
      rows = rows.filter((row) => {
        const value = row[filter.column];
        if (filter.op === "eq") return value === filter.value;
        if (filter.op === "gte") return String(value) >= String(filter.value);
        if (filter.op === "lt") return String(value) < String(filter.value);
        return filter.value.includes(value);
      });
    }

    for (const order of this.orders) {
      rows.sort((a, b) => {
        const result = String(a[order.column]).localeCompare(String(b[order.column]));
        return order.ascending ? result : -result;
      });
    }

    if (this.table === "interviews") {
      this.admin.interviewRowsRead += this.rangeBounds ? Math.max(0, this.rangeBounds.to - this.rangeBounds.from + 1) : rows.length;
      if (this.rangeBounds) this.admin.interviewRanges.push(this.rangeBounds);
    }

    if (this.rangeBounds) rows = rows.slice(this.rangeBounds.from, this.rangeBounds.to + 1);
    return rows;
  }
}

class FakeAdmin {
  interviewRowsRead = 0;
  interviewRanges: Array<{ from: number; to: number }> = [];
  queryCounts: Record<string, number> = {};
  readonly tables: Record<string, Row[]>;

  constructor(tables: Record<string, Row[]>) {
    this.tables = tables;
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

function makeInterview(overrides: Partial<Row>): Row {
  return {
    id: overrides.id ?? "interview-1",
    company_id: overrides.company_id ?? "company-1",
    candidate_id: overrides.candidate_id ?? "candidate-1",
    vacancy_id: overrides.vacancy_id ?? "vacancy-1",
    scheduled_at: overrides.scheduled_at ?? "2026-05-20T10:00:00.000Z",
    duration_minutes: overrides.duration_minutes ?? 60,
    type: overrides.type ?? "technical",
    status: overrides.status ?? "scheduled",
    interviewer_ids: overrides.interviewer_ids ?? ["admin-user"],
    meeting_url: overrides.meeting_url ?? null,
    location: overrides.location ?? null,
    notes: overrides.notes ?? null,
    created_by: overrides.created_by ?? "owner-user",
    updated_at: overrides.updated_at ?? "2026-05-01T10:00:00.000Z",
  };
}

function makeAdmin(rows: {
  interviews: Row[];
  candidates?: Row[];
  vacancies?: Row[];
  profiles?: Row[];
}) {
  return new FakeAdmin({
    interviews: rows.interviews,
    candidates: rows.candidates ?? [{ id: "candidate-1", vacancy_id: "vacancy-1", name: "Анна Петрова", avatar_url: null, status: "new", created_by: "owner-user" }],
    vacancies: rows.vacancies ?? [{ id: "vacancy-1", company_id: "company-1", title: "Frontend", created_by: "owner-user" }],
    profiles: rows.profiles ?? [{ id: "admin-user", company_id: "company-1", name: "Ирина HR", email: "hr@example.com", avatar_url: null }],
  });
}

test("loadVisibleInterviewListPage filters by upcoming scope and status", async () => {
  const admin = makeAdmin({
    interviews: [
      makeInterview({ id: "past", scheduled_at: "2026-05-10T10:00:00.000Z", status: "scheduled" }),
      makeInterview({ id: "future-completed", scheduled_at: "2026-05-21T10:00:00.000Z", status: "completed" }),
      makeInterview({ id: "future-scheduled", scheduled_at: "2026-05-22T10:00:00.000Z", status: "scheduled" }),
    ],
  });

  const result = await loadVisibleInterviewListPage(
    admin,
    { userId: "admin-user", companyId: "company-1", role: "admin" },
    { scope: "upcoming", status: "scheduled", page: 1, pageSize: 10, now: new Date("2026-05-17T00:00:00.000Z") }
  );

  assert.deepEqual(result.interviews.map((interview: Row) => interview.id), ["future-scheduled"]);
  assert.equal(result.total, 1);
  assert.equal(result.hasMore, false);
  assert.equal(result.totalIsExact, true);
});

test("loadVisibleInterviewListPage searches visible fields before page slicing", async () => {
  const admin = makeAdmin({
    interviews: [
      makeInterview({ id: "first", candidate_id: "candidate-1", vacancy_id: "vacancy-1", scheduled_at: "2026-05-20T10:00:00.000Z" }),
      makeInterview({ id: "second", candidate_id: "candidate-2", vacancy_id: "vacancy-2", scheduled_at: "2026-05-21T10:00:00.000Z" }),
      makeInterview({ id: "third", candidate_id: "candidate-3", vacancy_id: "vacancy-3", scheduled_at: "2026-05-22T10:00:00.000Z" }),
    ],
    candidates: [
      { id: "candidate-1", vacancy_id: "vacancy-1", name: "Анна Иванова", avatar_url: null, status: "new", created_by: "owner-user" },
      { id: "candidate-2", vacancy_id: "vacancy-2", name: "Борис Смирнов", avatar_url: null, status: "new", created_by: "owner-user" },
      { id: "candidate-3", vacancy_id: "vacancy-3", name: "Анна Соколова", avatar_url: null, status: "new", created_by: "owner-user" },
    ],
    vacancies: [
      { id: "vacancy-1", company_id: "company-1", title: "Frontend", created_by: "owner-user" },
      { id: "vacancy-2", company_id: "company-1", title: "Backend", created_by: "owner-user" },
      { id: "vacancy-3", company_id: "company-1", title: "Design", created_by: "owner-user" },
    ],
  });

  const result = await loadVisibleInterviewListPage(
    admin,
    { userId: "admin-user", companyId: "company-1", role: "admin" },
    { scope: "upcoming", search: "Анна", page: 2, pageSize: 1, now: new Date("2026-05-17T00:00:00.000Z") }
  );

  assert.deepEqual(result.interviews.map((interview: Row) => interview.id), ["third"]);
  assert.equal(result.total, 2);
  assert.equal(result.hasMore, false);
});

test("loadVisibleInterviewListPage lets interviewer-only rows be found by visible candidate and vacancy names", async () => {
  const hiddenInterview = makeInterview({
    id: "limited",
    candidate_id: "hidden-candidate",
    vacancy_id: "hidden-vacancy",
    interviewer_ids: ["viewer-user"],
    meeting_url: "https://meet.example.com/interview",
    location: "Zoom",
    created_by: "other-user",
  });
  const baseRows = {
    interviews: [hiddenInterview],
    candidates: [{ id: "hidden-candidate", vacancy_id: "hidden-vacancy", name: "Секретный Кандидат", avatar_url: null, status: "new", created_by: "other-user" }],
    vacancies: [{ id: "hidden-vacancy", company_id: "company-1", title: "Закрытая вакансия", created_by: "other-user" }],
    profiles: [{ id: "viewer-user", company_id: "company-1", name: "Интервьюер", email: "viewer@example.com", avatar_url: null }],
  };

  const candidateSearch = await loadVisibleInterviewListPage(
    makeAdmin(baseRows),
    { userId: "viewer-user", companyId: "company-1", role: "recruiter" },
    { scope: "upcoming", search: "Секретный", page: 1, pageSize: 10, now: new Date("2026-05-17T00:00:00.000Z") }
  );
  assert.equal(candidateSearch.interviews.length, 1);
  assert.equal(candidateSearch.interviews[0].accessLevel, "interviewer_only");
  assert.equal(candidateSearch.interviews[0].displayTitle, "Секретный Кандидат");
  assert.equal(candidateSearch.interviews[0].displaySubtitle, "Закрытая вакансия");

  const vacancySearch = await loadVisibleInterviewListPage(
    makeAdmin(baseRows),
    { userId: "viewer-user", companyId: "company-1", role: "recruiter" },
    { scope: "upcoming", search: "Закрытая", page: 1, pageSize: 10, now: new Date("2026-05-17T00:00:00.000Z") }
  );

  assert.equal(vacancySearch.interviews.length, 1);
  assert.equal(vacancySearch.interviews[0].meetingUrl, "https://meet.example.com/interview");
  assert.equal(vacancySearch.interviews[0].location, "Zoom");
  assert.equal("candidate" in vacancySearch.interviews[0], false);
  assert.equal("vacancy" in vacancySearch.interviews[0], false);
});

test("loadVisibleInterviewListPage bounds interview row scans before enriching list results", async () => {
  const interviews = Array.from({ length: 1500 }, (_, index) =>
    makeInterview({
      id: `interview-${index}`,
      scheduled_at: new Date(Date.UTC(2026, 4, 20, 10, index)).toISOString(),
      interviewer_ids: ["other-user"],
    })
  );
  interviews[2] = makeInterview({ id: "visible-a", scheduled_at: "2026-05-20T10:02:00.000Z", interviewer_ids: ["viewer-user"] });
  interviews[5] = makeInterview({ id: "visible-b", scheduled_at: "2026-05-20T10:05:00.000Z", interviewer_ids: ["viewer-user"] });

  const admin = makeAdmin({
    interviews,
    candidates: [{ id: "candidate-1", vacancy_id: "vacancy-1", name: "Анна Петрова", avatar_url: null, status: "new", created_by: "other-user" }],
    vacancies: [{ id: "vacancy-1", company_id: "company-1", title: "Frontend", created_by: "other-user" }],
    profiles: [{ id: "viewer-user", company_id: "company-1", name: "Интервьюер", email: "viewer@example.com", avatar_url: null }],
  });

  const result = await loadVisibleInterviewListPage(
    admin,
    { userId: "viewer-user", companyId: "company-1", role: "recruiter" },
    { scope: "upcoming", page: 1, pageSize: 2, now: new Date("2026-05-17T00:00:00.000Z") }
  );

  assert.deepEqual(result.interviews.map((interview: Row) => interview.id), ["visible-a", "visible-b"]);
  assert.ok(admin.interviewRanges.length > 0, "loader should use ranged interview queries");
  assert.ok(admin.interviewRowsRead < 1500, "loader must not read every matching interview before slicing");
  assert.equal(result.totalIsExact, false);
});

test("loadVisibleInterviewListPage marks search results incomplete when the scan limit is reached", async () => {
  const interviews = Array.from({ length: 1001 }, (_, index) =>
    makeInterview({
      id: `interview-${index}`,
      candidate_id: `candidate-${index}`,
      vacancy_id: `vacancy-${index}`,
      scheduled_at: new Date(Date.UTC(2026, 4, 20, 10, index)).toISOString(),
    })
  );

  const admin = makeAdmin({
    interviews,
    candidates: interviews.map((row, index) => ({
      id: row.candidate_id,
      vacancy_id: row.vacancy_id,
      name: index === 1000 ? "Нужный кандидат" : `Кандидат ${index}`,
      avatar_url: null,
      status: "new",
      created_by: "owner-user",
    })),
    vacancies: interviews.map((row, index) => ({
      id: row.vacancy_id,
      company_id: "company-1",
      title: `Вакансия ${index}`,
      created_by: "owner-user",
    })),
  });

  const result = await loadVisibleInterviewListPage(
    admin,
    { userId: "admin-user", companyId: "company-1", role: "admin" },
    { scope: "upcoming", search: "Нужный", page: 1, pageSize: 10, now: new Date("2026-05-17T00:00:00.000Z") }
  );

  assert.deepEqual(result.interviews, []);
  assert.equal(result.totalIsExact, false);
  assert.equal(result.scanLimitReached, true);
});

test("loadVisibleInterviewListPage batches non-admin access checks without leaking limited rows", async () => {
  const interviews = Array.from({ length: 24 }, (_, index) =>
    makeInterview({
      id: `limited-${index}`,
      candidate_id: `hidden-candidate-${index}`,
      vacancy_id: `hidden-vacancy-${index}`,
      scheduled_at: new Date(Date.UTC(2026, 4, 20, 10, index)).toISOString(),
      interviewer_ids: ["viewer-user"],
      created_by: "other-user",
    })
  );
  interviews[0] = makeInterview({
    id: "managed",
    candidate_id: "managed-candidate",
    vacancy_id: "managed-vacancy",
    scheduled_at: "2026-05-20T10:00:00.000Z",
    interviewer_ids: ["viewer-user"],
    created_by: "viewer-user",
  });

  const admin = makeAdmin({
    interviews,
    candidates: interviews.map((row) => ({
      id: row.candidate_id,
      vacancy_id: row.vacancy_id,
      name: row.id === "managed" ? "Видимый кандидат" : `Скрытый кандидат ${row.id}`,
      avatar_url: null,
      status: "new",
      created_by: row.id === "managed" ? "viewer-user" : "other-user",
    })),
    vacancies: interviews.map((row) => ({
      id: row.vacancy_id,
      company_id: "company-1",
      title: row.id === "managed" ? "Видимая вакансия" : `Скрытая вакансия ${row.id}`,
      created_by: row.id === "managed" ? "viewer-user" : "other-user",
    })),
    profiles: [{ id: "viewer-user", company_id: "company-1", name: "Интервьюер", email: "viewer@example.com", avatar_url: null }],
  });

  const result = await loadVisibleInterviewListPage(
    admin,
    { userId: "viewer-user", companyId: "company-1", role: "recruiter" },
    { scope: "upcoming", page: 1, pageSize: 10, now: new Date("2026-05-17T00:00:00.000Z") }
  );

  assert.ok((admin.queryCounts.candidates ?? 0) <= 2, "candidate access and enrichment should be batched");
  assert.ok((admin.queryCounts.vacancies ?? 0) <= 3, "vacancy access and enrichment should be batched");
  assert.deepEqual(result.interviews.map((interview: Row) => interview.id), [
    "managed",
    "limited-1",
    "limited-2",
    "limited-3",
    "limited-4",
    "limited-5",
    "limited-6",
    "limited-7",
    "limited-8",
    "limited-9",
  ]);
  const limited = result.interviews.find((interview: Row) => interview.id === "limited-1");
  assert.equal(limited.accessLevel, "interviewer_only");
  assert.equal(limited.displayTitle, "Скрытый кандидат limited-1");
  assert.equal(limited.displaySubtitle, "Скрытая вакансия limited-1");
  assert.equal("candidate" in limited, false);
  assert.equal("vacancy" in limited, false);
});

test("loadVisibleCalendarSnapshot batches access checks while keeping interviewer-only rows sanitized", async () => {
  const interviews = Array.from({ length: 18 }, (_, index) =>
    makeInterview({
      id: `calendar-limited-${index}`,
      candidate_id: `calendar-hidden-candidate-${index}`,
      vacancy_id: `calendar-hidden-vacancy-${index}`,
      scheduled_at: new Date(Date.UTC(2026, 4, 20, 10, index)).toISOString(),
      interviewer_ids: ["viewer-user"],
      meeting_url: index === 1 ? "https://meet.example.com/calendar-limited" : null,
      location: index === 1 ? "Zoom" : null,
      created_by: "other-user",
    })
  );
  interviews[0] = makeInterview({
    id: "calendar-managed",
    candidate_id: "calendar-managed-candidate",
    vacancy_id: "calendar-managed-vacancy",
    scheduled_at: "2026-05-20T10:00:00.000Z",
    interviewer_ids: ["viewer-user"],
    created_by: "viewer-user",
  });

  const admin = makeAdmin({
    interviews,
    candidates: interviews.map((row) => ({
      id: row.candidate_id,
      vacancy_id: row.vacancy_id,
      name: row.id === "calendar-managed" ? "Кандидат календаря" : `Скрытый кандидат ${row.id}`,
      avatar_url: null,
      status: "new",
      created_by: row.id === "calendar-managed" ? "viewer-user" : "other-user",
    })),
    vacancies: interviews.map((row) => ({
      id: row.vacancy_id,
      company_id: "company-1",
      title: row.id === "calendar-managed" ? "Вакансия календаря" : `Скрытая вакансия ${row.id}`,
      created_by: row.id === "calendar-managed" ? "viewer-user" : "other-user",
    })),
    profiles: [{ id: "viewer-user", company_id: "company-1", name: "Интервьюер", email: "viewer@example.com", avatar_url: null }],
  });

  const result = await loadVisibleCalendarSnapshot(
    admin,
    { userId: "viewer-user", companyId: "company-1", role: "recruiter" },
    { from: "2026-05-20T00:00:00.000Z", to: "2026-05-21T00:00:00.000Z" }
  );

  assert.ok((admin.queryCounts.candidates ?? 0) <= 2, "calendar candidate access and enrichment should be batched");
  assert.ok((admin.queryCounts.vacancies ?? 0) <= 3, "calendar vacancy access and enrichment should be batched");
  assert.equal(result.interviews.length, 18);
  assert.equal(result.interviews[0].accessLevel, "manage");
  const limited = result.interviews.find((interview: Row) => interview.id === "calendar-limited-1");
  assert.equal(limited.accessLevel, "interviewer_only");
  assert.equal(limited.displayTitle, "Скрытый кандидат calendar-limited-1");
  assert.equal(limited.displaySubtitle, "Скрытая вакансия calendar-limited-1");
  assert.equal(limited.meetingUrl, "https://meet.example.com/calendar-limited");
  assert.equal(limited.location, "Zoom");
  assert.equal("candidate" in limited, false);
  assert.equal("vacancy" in limited, false);
  assert.equal("candidateId" in limited, false);
  assert.equal("vacancyId" in limited, false);
  assert.equal("candidateHref" in limited, false);
  assert.equal("vacancyHref" in limited, false);
  assert.equal("notes" in limited, false);
  assert.equal("createdById" in limited, false);
});
