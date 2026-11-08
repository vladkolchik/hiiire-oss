import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCompanyContext } from "@/lib/access/company-guards";
import {
  ACTIVE_PLAN_CHANGE_REQUEST_STATUSES,
  getPlanChangeRequestStatusCopy,
  type PlanChangeRequestStatus,
} from "@/lib/billing/enterprise-billing";
import { buildPlanChangeRequestInsert } from "@/lib/billing/plan-change-requests";
import { loadCompanyPlanSnapshot } from "@/lib/billing/subscription";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESPONSE_FIELDS = "id,current_plan,target_plan,request_kind,status,public_response,created_at,updated_at";
const TARGET_PLAN_MESSAGE = "Выберите тариф из списка.";
const SOURCE_MESSAGE = "Выберите источник заявки.";
const COMMENT_MESSAGE = "Комментарий должен быть текстом.";
const COMMENT_MAX_MESSAGE = "Комментарий не должен быть длиннее 2000 символов.";
const VALIDATION_MESSAGE = "Проверьте заявку на смену тарифа.";
const SAFE_VALIDATION_MESSAGES = new Set([
  TARGET_PLAN_MESSAGE,
  SOURCE_MESSAGE,
  COMMENT_MESSAGE,
  COMMENT_MAX_MESSAGE,
]);

const BodySchema = z.object({
  targetPlan: z.enum(["starter", "professional", "enterprise"], { error: TARGET_PLAN_MESSAGE }),
  source: z.enum(["landing", "settings"], { error: SOURCE_MESSAGE }).optional().default("settings"),
  message: z.string({ error: COMMENT_MESSAGE }).trim().max(2000, COMMENT_MAX_MESSAGE).optional(),
});

type PlanChangeRequestRow = Pick<
  Database["public"]["Tables"]["billing_plan_change_requests"]["Row"],
  "id" | "current_plan" | "target_plan" | "request_kind" | "status" | "public_response" | "created_at" | "updated_at"
>;

function toResponse(row: PlanChangeRequestRow) {
  const status = row.status as PlanChangeRequestStatus;
  const copy = getPlanChangeRequestStatusCopy(row.request_kind, status);

  return {
    id: row.id,
    currentPlan: row.current_plan,
    targetPlan: row.target_plan,
    requestKind: row.request_kind,
    status,
    statusTitle: copy.title,
    statusDescription: copy.description,
    publicResponse: row.public_response,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeValidationIssueMessage(message: string) {
  return SAFE_VALIDATION_MESSAGES.has(message) ? message : VALIDATION_MESSAGE;
}

function validationError(error: z.ZodError) {
  const issues = error.issues.map((issue) => ({
    path: issue.path,
    message: safeValidationIssueMessage(issue.message),
  }));

  return NextResponse.json(
    {
      error: "INVALID_BODY",
      message: issues[0]?.message ?? VALIDATION_MESSAGE,
      issues,
    },
    { status: 400 },
  );
}

async function loadActiveRequest(companyId: string): Promise<{ data: PlanChangeRequestRow | null; error: unknown }> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("billing_plan_change_requests")
    .select(RESPONSE_FIELDS)
    .eq("company_id", companyId)
    .in("status", [...ACTIVE_PLAN_CHANGE_REQUEST_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data, error };
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;

    const { data, error } = await loadActiveRequest(ctxRes.data.companyId);
    if (error) return NextResponse.json({ error: "REQUEST_LOOKUP_FAILED" }, { status: 500 });

    return NextResponse.json({ request: data ? toResponse(data) : null }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    if (ctxRes.data.role !== "admin") {
      return NextResponse.json({ error: "PLAN_CHANGE_REQUIRES_ADMIN" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const admin = getSupabaseAdminClient();
    const snapshot = await loadCompanyPlanSnapshot(admin, ctxRes.data.companyId);

    const isEnterpriseTermsChange =
      snapshot.currentPlan === "enterprise" && parsed.data.targetPlan === "enterprise";

    if (snapshot.currentPlan === parsed.data.targetPlan && !isEnterpriseTermsChange) {
      return NextResponse.json(
        {
          error: "PLAN_ALREADY_ACTIVE",
          currentPlan: snapshot.currentPlan,
        },
        { status: 409 },
      );
    }

    const insert = buildPlanChangeRequestInsert({
      companyId: ctxRes.data.companyId,
      requestedBy: ctxRes.data.userId,
      currentPlan: snapshot.currentPlan,
      targetPlan: parsed.data.targetPlan,
      source: parsed.data.source,
      userMessage: parsed.data.message ?? null,
    });

    const { data, error } = await admin
      .from("billing_plan_change_requests")
      .insert(insert)
      .select(RESPONSE_FIELDS)
      .maybeSingle();

    if (error?.code === "23505") {
      const { data: existing, error: existingError } = await loadActiveRequest(ctxRes.data.companyId);
      if (existingError || !existing) {
        return NextResponse.json({ error: "REQUEST_LOOKUP_FAILED" }, { status: 500 });
      }

      return NextResponse.json({ request: toResponse(existing), reused: true }, { status: 200 });
    }

    if (error || !data) return NextResponse.json({ error: "REQUEST_CREATE_FAILED" }, { status: 500 });
    return NextResponse.json({ request: toResponse(data), reused: false }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
