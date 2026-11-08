import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { captureBusinessEvent } from "@/lib/analytics/business-events";
import { requireSameOriginRequest } from "@/lib/api/csrf";
import { zodErrorToUserFacingIssues } from "@/lib/api/user-facing-errors";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const VALIDATION_MESSAGE = "Проверьте параметры цели найма.";
const ADMIN_ONLY_MESSAGE = "Только администратор может изменять цели найма.";
const LOOKUP_FAILED_MESSAGE = "Не удалось загрузить цели найма.";
const SAVE_FAILED_MESSAGE = "Не удалось сохранить цель найма. Попробуйте ещё раз.";
const PERIOD_START_MESSAGE = "Дата начала периода обязательна.";
const PERIOD_END_MESSAGE = "Дата окончания периода обязательна.";
const PERIOD_ORDER_MESSAGE = "Дата окончания периода должна быть не раньше даты начала.";
const NON_NEGATIVE_MESSAGE = "Цель найма не может быть отрицательной.";
const CONVERSION_MESSAGE = "Конверсия должна быть от 0 до 100.";

const DateSchema = (message: string) => z.string({ error: message }).regex(/^\d{4}-\d{2}-\d{2}$/, message);
const NonNegativeIntegerSchema = z.number({ error: NON_NEGATIVE_MESSAGE }).int(NON_NEGATIVE_MESSAGE).min(0, NON_NEGATIVE_MESSAGE).nullable().optional();

const HiringTargetBodySchema = z
  .object({
    id: z.string({ error: "Цель найма не найдена." }).uuid("Цель найма не найдена.").optional(),
    scope_type: z.enum(["company", "vacancy", "recruiter"], { error: "Выберите область цели найма." }).default("company"),
    scope_id: z.string({ error: "Проверьте область цели найма." }).uuid("Проверьте область цели найма.").nullable().optional(),
    metric_name: z
      .string({ error: "Название метрики обязательно." })
      .trim()
      .min(1, "Название метрики обязательно.")
      .max(80, "Название метрики должно быть не длиннее 80 символов.")
      .default("hires"),
    period_start: DateSchema(PERIOD_START_MESSAGE),
    period_end: DateSchema(PERIOD_END_MESSAGE),
    target_hires: NonNegativeIntegerSchema,
    target_time_to_fill_days: NonNegativeIntegerSchema,
    target_time_to_hire_days: NonNegativeIntegerSchema,
    sla_feedback_hours: NonNegativeIntegerSchema,
    minimum_pipeline_size: NonNegativeIntegerSchema,
    target_interview_to_offer_conversion: z
      .number({ error: CONVERSION_MESSAGE })
      .min(0, CONVERSION_MESSAGE)
      .max(100, CONVERSION_MESSAGE)
      .nullable()
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.period_end < value.period_start) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: PERIOD_ORDER_MESSAGE, path: ["period_end"] });
    }
    if (value.scope_type === "company" && value.scope_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Для цели компании область должна быть пустой.", path: ["scope_id"] });
    }
    if (value.scope_type !== "company" && !value.scope_id) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Выберите область цели найма.", path: ["scope_id"] });
    }
  });

type HiringTargetRow = {
  id: string;
  company_id: string;
  scope_type: "company" | "department" | "vacancy" | "recruiter";
  scope_id: string | null;
  metric_name: string;
  period_start: string;
  period_end: string;
  target_hires: number | null;
  target_time_to_fill_days: number | null;
  target_time_to_hire_days: number | null;
  sla_feedback_hours: number | null;
  minimum_pipeline_size: number | null;
  target_interview_to_offer_conversion: number | null;
  created_at: string;
  updated_at: string;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validationResponse(error: z.ZodError) {
  const issues = zodErrorToUserFacingIssues(error, VALIDATION_MESSAGE);
  return NextResponse.json({ error: "INVALID_BODY", message: issues[0]?.message ?? VALIDATION_MESSAGE, issues }, { status: 400 });
}

function normalizeTarget(row: HiringTargetRow) {
  return {
    id: row.id,
    companyId: row.company_id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    metricName: row.metric_name,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    targetHires: row.target_hires,
    targetTimeToFillDays: row.target_time_to_fill_days,
    targetTimeToHireDays: row.target_time_to_hire_days,
    slaFeedbackHours: row.sla_feedback_hours,
    minimumPipelineSize: row.minimum_pipeline_size,
    targetInterviewToOfferConversion: row.target_interview_to_offer_conversion,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getContext() {
  const supabase = await createSupabaseServerClient();
  const admin = getSupabaseAdminClient() as any;
  const ctxRes = await requireCompanyContext(supabase);
  if (!ctxRes.ok) return { ok: false as const, response: ctxRes.response };

  return { ok: true as const, admin, ctx: ctxRes.data };
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

function targetFields(body: z.infer<typeof HiringTargetBodySchema>, companyId: string) {
  return {
    company_id: companyId,
    scope_type: body.scope_type,
    scope_id: body.scope_id ?? null,
    metric_name: body.metric_name,
    period_start: body.period_start,
    period_end: body.period_end,
    target_hires: body.target_hires ?? null,
    target_time_to_fill_days: body.target_time_to_fill_days ?? null,
    target_time_to_hire_days: body.target_time_to_hire_days ?? null,
    sla_feedback_hours: body.sla_feedback_hours ?? null,
    minimum_pipeline_size: body.minimum_pipeline_size ?? null,
    target_interview_to_offer_conversion: body.target_interview_to_offer_conversion ?? null,
  };
}

async function loadExistingTarget(admin: any, fields: ReturnType<typeof targetFields>, id?: string) {
  let query = admin
    .from("hiring_targets")
    .select("id,company_id,scope_type,scope_id,metric_name,period_start,period_end,target_hires,target_time_to_fill_days,target_time_to_hire_days,sla_feedback_hours,minimum_pipeline_size,target_interview_to_offer_conversion,created_at,updated_at")
    .eq("company_id", fields.company_id);

  if (id) {
    query = query.eq("id", id);
  } else {
    query = query
      .eq("scope_type", fields.scope_type)
      .eq("metric_name", fields.metric_name)
      .eq("period_start", fields.period_start)
      .eq("period_end", fields.period_end);
    query = fields.scope_id ? query.eq("scope_id", fields.scope_id) : query.is("scope_id", null);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as HiringTargetRow | null;
}

export async function GET() {
  try {
    const context = await getContext();
    if (!context.ok) return context.response;
    const { admin, ctx } = context;

    if (ctx.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN", message: ADMIN_ONLY_MESSAGE }, { status: 403 });
    }

    const { data, error } = await admin
      .from("hiring_targets")
      .select("id,company_id,scope_type,scope_id,metric_name,period_start,period_end,target_hires,target_time_to_fill_days,target_time_to_hire_days,sla_feedback_hours,minimum_pipeline_size,target_interview_to_offer_conversion,created_at,updated_at")
      .eq("company_id", ctx.companyId)
      .order("period_start", { ascending: false })
      .order("scope_type", { ascending: true });

    if (error) return NextResponse.json({ error: "LOOKUP_FAILED", message: LOOKUP_FAILED_MESSAGE }, { status: 500 });

    return NextResponse.json({ targets: ((data ?? []) as HiringTargetRow[]).map(normalizeTarget) }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: LOOKUP_FAILED_MESSAGE }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const csrf = requireSameOriginRequest(req);
  if (!csrf.ok) return csrf.response;

  try {
    const context = await getContext();
    if (!context.ok) return context.response;
    const { admin, ctx } = context;

    if (ctx.role !== "admin") {
      return NextResponse.json({ error: "FORBIDDEN", message: ADMIN_ONLY_MESSAGE }, { status: 403 });
    }

    const parsed = HiringTargetBodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return validationResponse(parsed.error);

    const fields = targetFields(parsed.data, ctx.companyId);
    const existing = await loadExistingTarget(admin, fields, parsed.data.id);
    const writeQuery = existing
      ? admin.from("hiring_targets").update(fields).eq("company_id", ctx.companyId).eq("id", existing.id)
      : admin.from("hiring_targets").insert(fields);

    const { data, error } = await writeQuery
      .select("id,company_id,scope_type,scope_id,metric_name,period_start,period_end,target_hires,target_time_to_fill_days,target_time_to_hire_days,sla_feedback_hours,minimum_pipeline_size,target_interview_to_offer_conversion,created_at,updated_at")
      .single();

    if (error) return NextResponse.json({ error: "SAVE_FAILED", message: SAVE_FAILED_MESSAGE }, { status: 500 });

    const eventContext = await loadAnalyticsEventContext(admin, ctx.companyId);
    void captureBusinessEvent({
      event: "analytics_hiring_target_updated",
      userId: ctx.userId,
      companyId: ctx.companyId,
      role: ctx.role,
      properties: {
        ...eventContext,
        analytics_view: "targets",
        period_mode: "period_event",
        target_hires: fields.target_hires,
        scope_type: fields.scope_type,
        metric_name: fields.metric_name,
      },
    });

    return NextResponse.json({ target: normalizeTarget(data as HiringTargetRow) }, { status: existing ? 200 : 201 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: SAVE_FAILED_MESSAGE }, { status: 500 });
  }
}
