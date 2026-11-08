import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { captureBusinessEvent } from "@/lib/analytics/business-events";
import { requireSameOriginRequest } from "@/lib/api/csrf";
import { zodErrorToUserFacingIssues } from "@/lib/api/user-facing-errors";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const NAME_REQUIRED_MESSAGE = "Название сохранённого вида обязательно.";
const NAME_MAX_MESSAGE = "Название сохранённого вида должно быть не длиннее 80 символов.";
const FILTERS_OBJECT_MESSAGE = "Фильтры сохранённого вида должны быть объектом.";
const VALIDATION_MESSAGE = "Проверьте данные сохранённого вида.";
const COMPANY_VIEW_ADMIN_MESSAGE = "Опубликовать общий вид может только администратор.";
const VIEW_NOT_FOUND_MESSAGE = "Сохранённый вид не найден или недоступен.";
const VIEW_SAVE_FAILED_MESSAGE = "Не удалось сохранить вид. Попробуйте ещё раз.";
const VIEW_UPDATE_FAILED_MESSAGE = "Не удалось обновить вид. Попробуйте ещё раз.";
const VIEW_DELETE_FAILED_MESSAGE = "Не удалось удалить вид. Попробуйте ещё раз.";

const JsonObjectSchema = z.custom<Record<string, unknown>>(
  (value) => typeof value === "object" && value !== null && !Array.isArray(value),
  FILTERS_OBJECT_MESSAGE
);

const VisibilitySchema = z.enum(["private", "company"], { error: "Выберите доступность сохранённого вида." });

const CreateSavedViewSchema = z.object({
  name: z.string({ error: NAME_REQUIRED_MESSAGE }).trim().min(1, NAME_REQUIRED_MESSAGE).max(80, NAME_MAX_MESSAGE),
  visibility: VisibilitySchema.default("private"),
  filters: JsonObjectSchema,
});

const PatchSavedViewSchema = z
  .object({
    id: z.string({ error: VIEW_NOT_FOUND_MESSAGE }).uuid(VIEW_NOT_FOUND_MESSAGE),
    name: z.string({ error: NAME_REQUIRED_MESSAGE }).trim().min(1, NAME_REQUIRED_MESSAGE).max(80, NAME_MAX_MESSAGE).optional(),
    visibility: VisibilitySchema.optional(),
    filters: JsonObjectSchema.optional(),
  })
  .refine((value) => value.name !== undefined || value.visibility !== undefined || value.filters !== undefined, {
    message: "Укажите, что нужно изменить в сохранённом виде.",
  });

type SavedViewRow = {
  id: string;
  company_id: string;
  owner_id: string;
  name: string;
  visibility: "private" | "company";
  filters: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validationResponse(error: z.ZodError) {
  const issues = zodErrorToUserFacingIssues(error, VALIDATION_MESSAGE);
  return NextResponse.json({ error: "INVALID_BODY", message: issues[0]?.message ?? VALIDATION_MESSAGE, issues }, { status: 400 });
}

function forbidden(message = "У вас нет доступа к этому действию.") {
  return NextResponse.json({ error: "FORBIDDEN", message }, { status: 403 });
}

function normalizeView(row: SavedViewRow) {
  return {
    id: row.id,
    name: row.name,
    visibility: row.visibility,
    filters: row.filters,
    ownerId: row.owner_id,
    companyId: row.company_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function filterEventProperties(filters: Record<string, unknown>) {
  const keys = Object.keys(filters).sort();
  return {
    filter_count: keys.length,
    filter_keys: keys.join(","),
  };
}

async function loadAnalyticsEventContext(admin: any, companyId: string) {
  const { data } = await admin.from("company_plans").select("current_plan").eq("company_id", companyId).maybeSingle();
  const planTier = typeof data?.current_plan === "string" ? data.current_plan : null;

  return {
    feature: "analytics_v1",
    feature_available: true,
    entitlement_state: planTier ? "available" : null,
    plan_tier: planTier,
  };
}

async function getContext() {
  const supabase = await createSupabaseServerClient();
  const admin = getSupabaseAdminClient() as any;
  const ctxRes = await requireCompanyContext(supabase);
  if (!ctxRes.ok) return { ok: false as const, response: ctxRes.response };

  return { ok: true as const, admin, ctx: ctxRes.data };
}

async function loadExistingView(admin: any, ctx: { companyId: string }, id: string): Promise<SavedViewRow | null> {
  const { data, error } = await admin
    .from("analytics_filter_views")
    .select("id,company_id,owner_id,name,visibility,filters,created_at,updated_at")
    .eq("company_id", ctx.companyId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data as SavedViewRow | null;
}

function canMutateExistingView(
  ctx: { userId: string; role: string },
  existing: Pick<SavedViewRow, "visibility" | "owner_id">
) {
  if (existing.visibility === "private" && existing.owner_id !== ctx.userId) return false;
  if (existing.visibility === "company" && ctx.role !== "admin") return false;
  return true;
}

export async function GET() {
  try {
    const context = await getContext();
    if (!context.ok) return context.response;
    const { admin, ctx } = context;

    const { data, error } = await admin
      .from("analytics_filter_views")
      .select("id,company_id,owner_id,name,visibility,filters,created_at,updated_at")
      .eq("company_id", ctx.companyId)
      .or(`visibility.eq.company,owner_id.eq.${ctx.userId}`)
      .order("updated_at", { ascending: false });

    if (error) return NextResponse.json({ error: "LOOKUP_FAILED", message: "Не удалось загрузить сохранённые виды." }, { status: 500 });

    return NextResponse.json({ views: ((data ?? []) as SavedViewRow[]).map(normalizeView) }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Не удалось загрузить сохранённые виды." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const csrf = requireSameOriginRequest(req);
  if (!csrf.ok) return csrf.response;

  try {
    const context = await getContext();
    if (!context.ok) return context.response;
    const { admin, ctx } = context;

    const parsed = CreateSavedViewSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationResponse(parsed.error);

    const { name, visibility, filters } = parsed.data;
    if (ctx.role !== "admin" && visibility === "company") return forbidden(COMPANY_VIEW_ADMIN_MESSAGE);

    const { data, error } = await admin
      .from("analytics_filter_views")
      .insert({
        company_id: ctx.companyId,
        owner_id: ctx.userId,
        name,
        visibility,
        filters,
      })
      .select("id,company_id,owner_id,name,visibility,filters,created_at,updated_at")
      .single();

    if (error) return NextResponse.json({ error: "SAVE_FAILED", message: VIEW_SAVE_FAILED_MESSAGE }, { status: 500 });

    const eventContext = await loadAnalyticsEventContext(admin, ctx.companyId);
    void captureBusinessEvent({
      event: "analytics_saved_view_created",
      userId: ctx.userId,
      companyId: ctx.companyId,
      role: ctx.role,
      properties: { ...eventContext, visibility, ...filterEventProperties(filters) },
    });

    return NextResponse.json({ view: normalizeView(data as SavedViewRow) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: VIEW_SAVE_FAILED_MESSAGE }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const csrf = requireSameOriginRequest(req);
  if (!csrf.ok) return csrf.response;

  try {
    const context = await getContext();
    if (!context.ok) return context.response;
    const { admin, ctx } = context;

    const parsed = PatchSavedViewSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationResponse(parsed.error);

    const existing = await loadExistingView(admin, ctx, parsed.data.id);
    if (!existing) return NextResponse.json({ error: "NOT_FOUND", message: VIEW_NOT_FOUND_MESSAGE }, { status: 404 });
    if (!canMutateExistingView(ctx, existing)) return forbidden(VIEW_NOT_FOUND_MESSAGE);

    const nextVisibility = parsed.data.visibility ?? existing.visibility;
    if (ctx.role !== "admin" && nextVisibility === "company") return forbidden(COMPANY_VIEW_ADMIN_MESSAGE);

    const patch: Partial<Pick<SavedViewRow, "name" | "visibility" | "filters">> = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.visibility !== undefined) patch.visibility = parsed.data.visibility;
    if (parsed.data.filters !== undefined) patch.filters = parsed.data.filters;

    const { data, error } = await admin
      .from("analytics_filter_views")
      .update(patch)
      .eq("company_id", ctx.companyId)
      .eq("id", parsed.data.id)
      .select("id,company_id,owner_id,name,visibility,filters,created_at,updated_at")
      .single();

    if (error) return NextResponse.json({ error: "UPDATE_FAILED", message: VIEW_UPDATE_FAILED_MESSAGE }, { status: 500 });

    const eventContext = await loadAnalyticsEventContext(admin, ctx.companyId);
    const eventFilters = parsed.data.filters ?? existing.filters;
    void captureBusinessEvent({
      event: "analytics_saved_view_updated",
      userId: ctx.userId,
      companyId: ctx.companyId,
      role: ctx.role,
      properties: { ...eventContext, visibility: nextVisibility, ...filterEventProperties(eventFilters) },
    });

    return NextResponse.json({ view: normalizeView(data as SavedViewRow) }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: VIEW_UPDATE_FAILED_MESSAGE }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const csrf = requireSameOriginRequest(req);
  if (!csrf.ok) return csrf.response;

  try {
    const context = await getContext();
    if (!context.ok) return context.response;
    const { admin, ctx } = context;

    const id = req.nextUrl.searchParams.get("id");
    const parsed = z.string({ error: VIEW_NOT_FOUND_MESSAGE }).uuid(VIEW_NOT_FOUND_MESSAGE).safeParse(id);
    if (!parsed.success) return validationResponse(parsed.error);

    const existing = await loadExistingView(admin, ctx, parsed.data);
    if (!existing) return NextResponse.json({ error: "NOT_FOUND", message: VIEW_NOT_FOUND_MESSAGE }, { status: 404 });
    if (!canMutateExistingView(ctx, existing)) return forbidden(VIEW_NOT_FOUND_MESSAGE);

    const { error } = await admin.from("analytics_filter_views").delete().eq("company_id", ctx.companyId).eq("id", parsed.data);
    if (error) return NextResponse.json({ error: "DELETE_FAILED", message: VIEW_DELETE_FAILED_MESSAGE }, { status: 500 });

    const eventContext = await loadAnalyticsEventContext(admin, ctx.companyId);
    void captureBusinessEvent({
      event: "analytics_saved_view_deleted",
      userId: ctx.userId,
      companyId: ctx.companyId,
      role: ctx.role,
      properties: { ...eventContext, visibility: existing.visibility, ...filterEventProperties(existing.filters) },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: VIEW_DELETE_FAILED_MESSAGE }, { status: 500 });
  }
}
