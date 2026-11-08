import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getConfirmedServerUser } from "@/lib/auth/server-email-confirmation";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClientReadonly } from "@/lib/supabase/server-readonly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    status: z.enum(["in_review", "contacted", "approved", "applied", "rejected", "canceled"]).optional(),
    adminNote: z.string().trim().max(4000).optional(),
    publicResponse: z.string().trim().max(4000).optional(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .refine((value) => value.status || value.adminNote !== undefined || value.publicResponse !== undefined, {
    message: "NOTE_ONLY_UPDATE",
  });

type EditableStatus = NonNullable<z.infer<typeof BodySchema>["status"]>;
type RequestStatus = EditableStatus | "submitted" | "applied";

const ALLOWED_REGULAR_STATUS_TRANSITIONS: Record<RequestStatus, readonly EditableStatus[]> = {
  submitted: ["in_review", "rejected", "canceled"],
  in_review: ["contacted", "approved", "rejected", "canceled"],
  contacted: ["approved", "rejected", "canceled"],
  approved: ["applied", "rejected", "canceled"],
  applied: [],
  rejected: [],
  canceled: [],
};

function terminalTimestamps(status: EditableStatus, nowIso: string) {
  const timestamps: Record<string, string> = {};
  if (status === "approved") timestamps.approved_at = nowIso;
  if (status === "applied") timestamps.applied_at = nowIso;
  if (status === "rejected") timestamps.rejected_at = nowIso;
  if (status === "canceled") timestamps.canceled_at = nowIso;
  return timestamps;
}

function isTerminalStatus(status: unknown) {
  return status === "applied" || status === "rejected" || status === "canceled";
}

function canApplyManually(existing: { request_kind?: unknown; status?: unknown }) {
  return existing.status === "approved" && existing.request_kind === "manual_plan_change";
}

function closesApprovedRequest(currentStatus: unknown, nextStatus: EditableStatus) {
  return currentStatus === "approved" && (nextStatus === "rejected" || nextStatus === "canceled");
}

function dbErrorReason(error: { message?: string } | null | undefined, reasons: readonly string[]) {
  const message = String(error?.message ?? "");
  return reasons.find((reason) => message.includes(reason)) ?? null;
}

async function requirePlatformAdminForApi() {
  const supabase = await createSupabaseServerClientReadonly();
  const authRes = await getConfirmedServerUser(supabase);
  if (!authRes.ok) {
    return { ok: false as const, response: NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 }) };
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", authRes.user.id)
    .maybeSingle();

  if (error || !data) {
    return { ok: false as const, response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  }

  return { ok: true as const, user: authRes.user };
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const params = await Promise.resolve(context.params);
    const requestId = String(params.id ?? "").trim();
    if (!requestId) return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });

    const guard = await requirePlatformAdminForApi();
    if (!guard.ok) return guard.response;

    const bodyJson = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(bodyJson);
    if (!parsed.success) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

    const nowIso = new Date().toISOString();
    const admin = getSupabaseAdminClient();
    const { data: existing, error: existingError } = await admin
      .from("billing_plan_change_requests")
      .select("id,status,request_kind,updated_at")
      .eq("id", requestId)
      .maybeSingle();

    if (existingError) return NextResponse.json({ error: "REQUEST_STATUS_LOOKUP_FAILED" }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "REQUEST_NOT_FOUND" }, { status: 404 });
    if (isTerminalStatus(existing.status)) {
      return NextResponse.json({ error: "TRANSITION_INVALID" }, { status: 409 });
    }

    if (!parsed.data.status) {
      const { data, error } = await admin
        .from("billing_plan_change_requests")
        .update({
          admin_note: parsed.data.adminNote || null,
          public_response: parsed.data.publicResponse || null,
          handled_by: guard.user.id,
          handled_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", requestId)
        .eq("status", existing.status)
        .eq("updated_at", parsed.data.updatedAt)
        .select("*")
        .maybeSingle();

      if (error) return NextResponse.json({ error: "REQUEST_STATUS_UPDATE_FAILED" }, { status: 500 });
      if (!data) return NextResponse.json({ error: "REQUEST_STATUS_CHANGED" }, { status: 409 });

      return NextResponse.json({ request: data }, { status: 200 });
    }

    const allowedTargets = ALLOWED_REGULAR_STATUS_TRANSITIONS[existing.status as RequestStatus] ?? [];
    if (!allowedTargets.includes(parsed.data.status)) {
      return NextResponse.json({ error: "TRANSITION_INVALID" }, { status: 409 });
    }
    if (parsed.data.status === "applied" && !canApplyManually(existing)) {
      return NextResponse.json({ error: "TRANSITION_INVALID" }, { status: 409 });
    }

    if (closesApprovedRequest(existing.status, parsed.data.status)) {
      const { data: openAgreement, error: openAgreementError } = await admin
        .from("enterprise_agreements")
        .select("id")
        .eq("source_request_id", requestId)
        .in("status", ["draft", "pending_payment", "active"])
        .limit(1)
        .maybeSingle();

      if (openAgreementError) return NextResponse.json({ error: "AGREEMENT_LOOKUP_FAILED" }, { status: 500 });
      if (openAgreement) return NextResponse.json({ error: "SOURCE_REQUEST_HAS_OPEN_AGREEMENT" }, { status: 409 });
    }

    const { data, error } = await admin
      .from("billing_plan_change_requests")
      .update({
        status: parsed.data.status,
        admin_note: parsed.data.adminNote || null,
        public_response: parsed.data.publicResponse || null,
        handled_by: guard.user.id,
        handled_at: nowIso,
        updated_at: nowIso,
        ...terminalTimestamps(parsed.data.status, nowIso),
      })
      .eq("id", requestId)
      .eq("status", existing.status)
      .eq("updated_at", parsed.data.updatedAt)
      .select("*")
      .maybeSingle();

    if (error) {
      const lifecycleError = dbErrorReason(error, ["SOURCE_REQUEST_HAS_OPEN_AGREEMENT"]);
      if (lifecycleError) return NextResponse.json({ error: lifecycleError }, { status: 409 });
      return NextResponse.json({ error: "REQUEST_STATUS_UPDATE_FAILED" }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "REQUEST_STATUS_CHANGED" }, { status: 409 });

    return NextResponse.json({ request: data }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
