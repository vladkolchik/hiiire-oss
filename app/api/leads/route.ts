import { NextResponse, type NextRequest } from "next/server";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { zodErrorToUserFacingIssues } from "@/lib/api/user-facing-errors";
import { captureBusinessEvent } from "@/lib/analytics/business-events";
import {
  ACTIVE_PLAN_CHANGE_REQUEST_STATUSES,
  getPlanChangeRequestStatusCopy,
  type PlanChangeRequestStatus,
} from "@/lib/billing/enterprise-billing";
import { buildPlanChangeRequestInsert } from "@/lib/billing/plan-change-requests";
import { loadCompanyPlanSnapshot } from "@/lib/billing/subscription";
import {
  decideEnterpriseLeadSubmission,
  type LeadRequestedPlan,
  type LeadStatus,
} from "@/lib/leads/enterprise-request";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notifyOwners } from "@/lib/telegram/notify";
import { formatOwnerLeadMessage } from "@/lib/telegram/format";
import { LeadRequestBodySchema } from "@/lib/validation/leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const GENERIC_DUPLICATE_EMAIL_MESSAGE =
  "Заявка с этим email уже есть. Если нужно обновить данные, свяжитесь с нами, и мы поможем.";
const BILLING_REQUEST_RESPONSE_FIELDS =
  "id,current_plan,target_plan,request_kind,status,public_response,created_at,updated_at";

type LeadLookupRow = {
  id: string;
  email: string;
  requested_plan: LeadRequestedPlan;
  status: LeadStatus;
  decision_note: string | null;
  created_at: string;
  handled_at: string | null;
};

type PlanChangeRequestRow = Pick<
  Database["public"]["Tables"]["billing_plan_change_requests"]["Row"],
  "id" | "current_plan" | "target_plan" | "request_kind" | "status" | "public_response" | "created_at" | "updated_at"
>;

function toLowerEmail(value: string) {
  return value.trim().toLowerCase();
}

async function findLeadByEmail(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  email: string,
  requestedPlan?: LeadRequestedPlan
) {
  let query = admin
    .from("leads")
    .select("id,email,requested_plan,status,decision_note,created_at,handled_at")
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(20);

  if (requestedPlan) {
    query = query.eq("requested_plan", requestedPlan);
  }

  const { data, error } = await query;
  if (error) {
    return { data: null as LeadLookupRow | null, error };
  }

  const normalizedEmail = toLowerEmail(email);
  const exactMatch =
    ((data ?? []) as LeadLookupRow[]).find((lead) => toLowerEmail(lead.email) === normalizedEmail) ?? null;

  return { data: exactMatch, error: null };
}

function toLeadResponse(lead: LeadLookupRow | null) {
  if (!lead) return null;

  return {
    id: lead.id,
    status: lead.status,
    decisionNote: lead.decision_note,
    createdAt: lead.created_at,
    handledAt: lead.handled_at,
  };
}

function toBillingRequestResponse(row: PlanChangeRequestRow) {
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

async function loadActiveBillingRequest(companyId: string): Promise<{ data: PlanChangeRequestRow | null; error: unknown }> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("billing_plan_change_requests")
    .select(BILLING_REQUEST_RESPONSE_FIELDS)
    .eq("company_id", companyId)
    .in("status", [...ACTIVE_PLAN_CHANGE_REQUEST_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data, error };
}

async function createOrReuseBillingRequest(input: {
  companyId: string;
  userId: string;
  role: "admin" | "hr" | "recruiter";
  requestedPlan: LeadRequestedPlan;
  message?: string | null;
}) {
  if (input.role !== "admin") {
    return NextResponse.json({ error: "PLAN_CHANGE_REQUIRES_ADMIN" }, { status: 403 });
  }

  const admin = getSupabaseAdminClient();
  const snapshot = await loadCompanyPlanSnapshot(admin, input.companyId);

  const isEnterpriseTermsChange = snapshot.currentPlan === "enterprise" && input.requestedPlan === "enterprise";

  if (snapshot.currentPlan === input.requestedPlan && !isEnterpriseTermsChange) {
    return NextResponse.json(
      {
        error: "PLAN_ALREADY_ACTIVE",
        currentPlan: snapshot.currentPlan,
      },
      { status: 409 },
    );
  }

  const insert = buildPlanChangeRequestInsert({
    companyId: input.companyId,
    requestedBy: input.userId,
    currentPlan: snapshot.currentPlan,
    targetPlan: input.requestedPlan,
    source: "landing",
    userMessage: input.message ?? null,
  });

  const { data, error } = await admin
    .from("billing_plan_change_requests")
    .insert(insert)
    .select(BILLING_REQUEST_RESPONSE_FIELDS)
    .maybeSingle();

  if (error?.code === "23505") {
    const { data: existing, error: existingError } = await loadActiveBillingRequest(input.companyId);
    if (existingError || !existing) {
      return NextResponse.json({ error: "REQUEST_LOOKUP_FAILED" }, { status: 500 });
    }

    return NextResponse.json({ request: toBillingRequestResponse(existing), reused: true }, { status: 200 });
  }

  if (error || !data) return NextResponse.json({ error: "REQUEST_CREATE_FAILED" }, { status: 500 });
  await captureBusinessEvent({
    event: "enterprise_request_created",
    userId: input.userId,
    companyId: input.companyId,
    role: input.role,
    properties: {
      request_id: data.id,
      requested_plan: input.requestedPlan,
      from_plan: snapshot.currentPlan,
    },
  });
  return NextResponse.json({ request: toBillingRequestResponse(data), reused: false }, { status: 201 });
}

export async function GET(req: NextRequest) {
  try {
    const requestedPlan = req.nextUrl.searchParams.get("requestedPlan");
    if (requestedPlan !== "enterprise") {
      return NextResponse.json({ lead: null }, { status: 200 });
    }

    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    const email = auth.user?.email?.trim();

    if (!email) {
      return NextResponse.json({ lead: null }, { status: 200 });
    }

    const admin = getSupabaseAdminClient();
    const { data: lead, error } = await findLeadByEmail(admin, email, "enterprise");

    if (error) {
      return NextResponse.json({ error: "LOOKUP_FAILED" }, { status: 500 });
    }

    return NextResponse.json({ lead: toLeadResponse(lead) }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const bodyJson = await req.json().catch(() => null);
    const parsed = LeadRequestBodySchema.safeParse(bodyJson);
    if (!parsed.success) {
      const issues = zodErrorToUserFacingIssues(parsed.error, "Проверьте поля заявки.");
      return NextResponse.json(
        {
          error: "INVALID_BODY",
          message: issues[0]?.message ?? "Проверьте поля заявки.",
          issues,
        },
        { status: 400 }
      );
    }

    const { fullName, email, phone, company, companySize, message, requestedPlan } = parsed.data;
    const { data: auth } = await supabase.auth.getUser();

    if (auth.user) {
      const ctxRes = await requireCompanyContext(supabase);
      if (ctxRes.ok) {
        return createOrReuseBillingRequest({
          companyId: ctxRes.data.companyId,
          userId: ctxRes.data.userId,
          role: ctxRes.data.role,
          requestedPlan,
          message: message ?? null,
        });
      } else if (ctxRes.response.status >= 500) {
        return ctxRes.response;
      }
    }

    const admin = getSupabaseAdminClient();
    const { data: existingLead, error: lookupError } = await findLeadByEmail(admin, email);

    if (lookupError) {
      return NextResponse.json({ error: "LOOKUP_FAILED" }, { status: 500 });
    }

    const decision =
      requestedPlan === "enterprise"
        ? decideEnterpriseLeadSubmission({
            existingLead: existingLead
              ? {
                  requested_plan: existingLead.requested_plan,
                  status: existingLead.status,
                }
              : null,
          })
        : existingLead
        ? { action: "conflict" as const, message: GENERIC_DUPLICATE_EMAIL_MESSAGE }
        : { action: "create" as const };

    if (decision.action === "conflict") {
      return NextResponse.json(
        {
          error: "DUPLICATE_EMAIL",
          message: decision.message,
        },
        { status: 409 }
      );
    }

    let data: { id: string; created_at: string } | null = null;
    let error: { code?: string } | null = null;

    if (decision.action === "reopen" && existingLead) {
      const reopenedAt = new Date().toISOString();
      const result = await admin
        .from("leads")
        .update({
          full_name: fullName,
          email,
          phone,
          company,
          company_size: companySize ?? null,
          message: message ?? null,
          requested_plan: requestedPlan,
          status: "new",
          handled_by: null,
          handled_at: null,
          decision_note: null,
          created_at: reopenedAt,
        })
        .eq("id", existingLead.id)
        .select("id,created_at")
        .maybeSingle();

      data = result.data ? { id: String(result.data.id), created_at: String(result.data.created_at) } : null;
      error = result.error;
    } else {
      const result = await admin
        .from("leads")
        .insert({
          full_name: fullName,
          email,
          phone,
          company,
          company_size: companySize ?? null,
          message: message ?? null,
          requested_plan: requestedPlan,
          status: "new",
        })
        .select("id,created_at")
        .maybeSingle();

      data = result.data ? { id: String(result.data.id), created_at: String(result.data.created_at) } : null;
      error = result.error;
    }

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          {
            error: "DUPLICATE_EMAIL",
            message: GENERIC_DUPLICATE_EMAIL_MESSAGE,
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "INSERT_FAILED" }, { status: 500 });
    }

    if (data) {
      await captureBusinessEvent({
        event: decision.action === "reopen" ? "enterprise_lead_reopened" : "enterprise_lead_created",
        properties: {
          lead_id: data.id,
          requested_plan: requestedPlan,
          company_size: companySize ?? null,
        },
      });
    }

    // Best-effort owner notification (should not affect the lead UX).
    const text = formatOwnerLeadMessage({
      fullName,
      email,
      phone,
      company,
      companySize: companySize ?? null,
      message: message ?? null,
      requestedPlan,
    });
    await notifyOwners(text).catch(() => null);

    return NextResponse.json({ ok: true, lead: data ? { id: String(data.id), createdAt: String(data.created_at) } : null }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
