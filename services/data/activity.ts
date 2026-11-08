import { z } from "zod";

import { readUserFacingApiErrorMessage } from "@/lib/api/user-facing-errors";

export type DashboardActivityFilter = "all" | "candidates" | "vacancies" | "credits";
export type DashboardActivityKind = "candidate_created" | "vacancy_created" | "credits_spent";

export type DashboardActivityItem = {
  id: string;
  kind: DashboardActivityKind;
  occurredAt: string;
  actor: {
    id: string | null;
    name: string | null;
    email: string | null;
  };
  title: string;
  description: string | null;
  creditDelta: number | null;
  entity:
    | { type: "candidate"; id: string; name: string; href: string }
    | { type: "vacancy"; id: string; title: string; href: string }
    | null;
};

export type DashboardActivityPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type DashboardActivityPage = {
  items: DashboardActivityItem[];
  pagination: DashboardActivityPagination;
  total: number;
  page: number;
  pageSize: number;
};

const ACTIVITY_LOAD_ERROR = "Не удалось загрузить активность. Попробуйте обновить страницу.";

const ActivityItemSchema = z.object({
  id: z.string(),
  kind: z.enum(["candidate_created", "vacancy_created", "credits_spent"]),
  occurredAt: z.string(),
  actor: z.object({
    id: z.string().nullable(),
    name: z.string().nullable(),
    email: z.string().nullable(),
  }),
  title: z.string(),
  description: z.string().nullable(),
  creditDelta: z.number().nullable(),
  entity: z
    .union([
      z.object({ type: z.literal("candidate"), id: z.string(), name: z.string(), href: z.string() }),
      z.object({ type: z.literal("vacancy"), id: z.string(), title: z.string(), href: z.string() }),
    ])
    .nullable(),
});

const ActivityPageSchema = z.object({
  items: z.array(ActivityItemSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().positive(),
  }),
  total: z.number().int().nonnegative().optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().optional(),
});

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, Math.trunc(v)));
}

export async function listDashboardActivity(input: {
  type: DashboardActivityFilter;
  page: number;
  pageSize: number;
  signal?: AbortSignal;
}): Promise<DashboardActivityPage> {
  const params = new URLSearchParams();
  params.set("type", input.type);
  params.set("page", String(clampInt(input.page, 1, 10_000)));
  params.set("pageSize", String(clampInt(input.pageSize, 1, 200)));

  const res = await fetch(`/api/dashboard/activity?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
    signal: input.signal,
  });

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(readUserFacingApiErrorMessage(json, ACTIVITY_LOAD_ERROR));
  }

  const parsed = ActivityPageSchema.safeParse(json);
  if (!parsed.success) throw new Error(ACTIVITY_LOAD_ERROR);

  return {
    items: parsed.data.items,
    pagination: parsed.data.pagination,
    total: parsed.data.total ?? parsed.data.pagination.total,
    page: parsed.data.page ?? parsed.data.pagination.page,
    pageSize: parsed.data.pageSize ?? parsed.data.pagination.pageSize,
  };
}
