import { NextResponse, type NextRequest } from "next/server";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { buildCandidateCardHref, buildVacancyCardHref } from "@/lib/dashboard/deep-links";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type ActivityType = "all" | "candidates" | "vacancies" | "credits";
type ActivityKind = "candidate_created" | "vacancy_created" | "credits_spent";

type ActivityRpcRow = Database["public"]["Functions"]["list_dashboard_activity"]["Returns"][number];

const ACTIVITY_LOAD_ERROR = "Не удалось загрузить активность. Попробуйте обновить страницу.";

function validationError(message: string) {
  return NextResponse.json(
    { error: "INVALID_QUERY", message },
    { status: 400, headers: { "Cache-Control": "no-store" } }
  );
}

function activityLookupError() {
  return NextResponse.json(
    { error: "ACTIVITY_LOOKUP_FAILED", message: ACTIVITY_LOAD_ERROR },
    { status: 500, headers: { "Cache-Control": "no-store" } }
  );
}

function parseActivityTypeOrError(value: string | null): ActivityType | NextResponse {
  if (value === null || value === "all") return "all";
  if (value === "candidates" || value === "vacancies" || value === "credits") return value;
  return validationError("Выберите корректный тип активности.");
}

function parsePositiveIntOrError(value: string | null, fallback: number, max: number, message: string): number | NextResponse {
  if (value === null) return fallback;
  if (!/^[1-9]\d*$/.test(value)) return validationError(message);

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed > max) return validationError(message);

  return parsed;
}

function parsePageOrError(value: string | null): number | NextResponse {
  const page = parsePositiveIntOrError(value, 1, 10_000, "Проверьте номер страницы.");
  if (page instanceof NextResponse) return validationError("Проверьте номер страницы.");
  return page;
}

function parsePageSizeOrError(value: string | null): number | NextResponse {
  const pageSize = parsePositiveIntOrError(value, 25, 200, "Проверьте размер страницы.");
  if (pageSize instanceof NextResponse) return validationError("Проверьте размер страницы.");
  return pageSize;
}

function parseKindOrError(value: string): ActivityKind | NextResponse {
  if (value === "candidate_created" || value === "vacancy_created" || value === "credits_spent") return value;
  return activityLookupError();
}

function parseTotalOrError(value: number | string | null | undefined): number | NextResponse {
  if (typeof value === "number") {
    if (Number.isSafeInteger(value) && value >= 0) return value;
    return activityLookupError();
  }

  if (typeof value === "string") {
    if (!/^\d+$/.test(value)) return activityLookupError();
    const parsed = Number.parseInt(value, 10);
    if (Number.isSafeInteger(parsed)) return parsed;
  }

  return activityLookupError();
}

function formatCreditCount(amount: number): string {
  const mod10 = amount % 10;
  const mod100 = amount % 100;
  if (mod10 === 1 && mod100 !== 11) return `${amount} кредит`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${amount} кредита`;
  return `${amount} кредитов`;
}

function mapActivityRow(row: ActivityRpcRow) {
  const kind = parseKindOrError(row.activity_kind);
  if (kind instanceof NextResponse) return kind;

  const actorName = row.actor_name?.trim() ? String(row.actor_name).trim() : null;
  const entityName = row.entity_name?.trim() ? String(row.entity_name).trim() : null;
  const creditDelta = typeof row.credit_delta === "number" ? row.credit_delta : null;
  const creditAmount = typeof creditDelta === "number" ? Math.abs(creditDelta) : null;
  const title =
    kind === "vacancy_created"
      ? "Создана вакансия"
      : kind === "candidate_created"
        ? "Добавлен кандидат"
        : "Списаны кредиты";
  const description =
    kind === "credits_spent"
      ? creditAmount === null
        ? "AI-анализ резюме"
        : `AI-анализ резюме: ${formatCreditCount(creditAmount)}`
      : entityName;
  const entity =
    kind === "credits_spent"
      ? null
      : row.entity_type === "candidate" && row.entity_id && entityName
        ? {
            type: "candidate" as const,
            id: String(row.entity_id),
            name: entityName,
            href: buildCandidateCardHref(String(row.entity_id)),
          }
        : row.entity_type === "vacancy" && row.entity_id && entityName
          ? {
              type: "vacancy" as const,
              id: String(row.entity_id),
              title: entityName,
              href: buildVacancyCardHref(String(row.entity_id)),
            }
          : null;

  return {
    id: String(row.activity_id),
    kind: kind,
    occurredAt: String(row.occurred_at),
    actor: {
      id: row.actor_id ? String(row.actor_id) : null,
      name: kind === "credits_spent" ? actorName ?? "Участник команды" : actorName,
      email: kind === "credits_spent" ? null : row.actor_email ? String(row.actor_email) : null,
    },
    title,
    description,
    creditDelta,
    entity,
  };
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
    const searchParams = req.nextUrl.searchParams;

    const type = parseActivityTypeOrError(searchParams.get("type"));
    if (type instanceof NextResponse) return type;

    const page = parsePageOrError(searchParams.get("page"));
    if (page instanceof NextResponse) return page;

    const pageSize = parsePageSizeOrError(searchParams.get("pageSize"));
    if (pageSize instanceof NextResponse) return pageSize;

    const rpcParams = {
      p_company_id: ctx.companyId,
      p_user_id: ctx.userId,
      p_role: ctx.role,
      p_type: type,
    };

    const [{ data, error }, { data: countData, error: countError }] = await Promise.all([
      admin.rpc("list_dashboard_activity", {
        ...rpcParams,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
      }),
      admin.rpc("count_dashboard_activity", rpcParams),
    ]);

    if (error || countError) return activityLookupError();
    if (!Array.isArray(data)) return activityLookupError();

    const items = [];
    for (const row of data) {
      const item = mapActivityRow(row);
      if (item instanceof NextResponse) return item;
      items.push(item);
    }

    const total = parseTotalOrError(countData);
    if (total instanceof NextResponse) return total;

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return NextResponse.json(
      { items, pagination: { page, pageSize, total, totalPages }, total, page, pageSize },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: ACTIVITY_LOAD_ERROR },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
