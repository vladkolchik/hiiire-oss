import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/admin/platform-guard";
import {
  ENTERPRISE_AGREEMENT_FIELDS,
  canSaveEnterpriseAgreementTerms,
  normalizeEnterpriseAgreementTerms,
  toEnterpriseAgreementResponse,
  type EnterpriseAgreementRow,
} from "@/lib/billing/enterprise-billing";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TermsSchema = z.object({
  startsAt: z.string().trim().min(1),
  endsAt: z.string().trim().min(1).nullable().optional(),
  isOpenEnded: z.boolean(),
  creditsLimit: z.number().int().min(0).nullable().optional(),
  termsSummary: z.string().trim().min(1).max(5000),
  internalNote: z.string().trim().max(5000).nullable().optional(),
});

const CreateAgreementSchema = TermsSchema.extend({
  sourceRequestId: z.string().uuid(),
  sourceRequestUpdatedAt: z.string().datetime({ offset: true }),
  replacesAgreementId: z.string().uuid().nullable().optional(),
});

type UntypedSupabase = ReturnType<typeof getSupabaseAdminClient> & {
  from(table: string): any;
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
};

function validationError(reason: string) {
  return NextResponse.json({ error: reason }, { status: 400 });
}

function dbErrorReason(error: { message?: string } | null | undefined, reasons: readonly string[]) {
  const message = String(error?.message ?? "");
  return reasons.find((reason) => message.includes(reason)) ?? null;
}

async function requirePlatformAdminForApi() {
  const { user, isPlatformAdmin } = await requirePlatformAdmin();
  if (!isPlatformAdmin) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }),
    };
  }
  return { ok: true as const, user };
}

function getUntypedAdmin(): UntypedSupabase {
  return getSupabaseAdminClient() as UntypedSupabase;
}

function normalizeTerms(input: z.infer<typeof TermsSchema>) {
  return normalizeEnterpriseAgreementTerms(input);
}

function validateAgreementTerms(input: z.infer<typeof TermsSchema>) {
  return canSaveEnterpriseAgreementTerms({
    status: "draft",
    startsAt: input.startsAt,
    endsAt: input.endsAt ?? null,
    isOpenEnded: input.isOpenEnded,
    creditsLimit: input.creditsLimit ?? null,
    termsSummary: input.termsSummary,
  });
}

async function findExistingSourceAgreement(admin: UntypedSupabase, sourceRequestId: string) {
  return admin
    .from("enterprise_agreements")
    .select(ENTERPRISE_AGREEMENT_FIELDS)
    .eq("source_request_id", sourceRequestId)
    .in("status", ["draft", "pending_payment", "active"])
    .limit(1)
    .maybeSingle();
}

function agreementAlreadyExistsResponse(existingAgreement: EnterpriseAgreementRow | null = null) {
  return NextResponse.json(
    {
      error: "AGREEMENT_ALREADY_EXISTS",
      ...(existingAgreement ? { agreement: toEnterpriseAgreementResponse(existingAgreement) } : {}),
    },
    { status: 409 },
  );
}

export async function GET() {
  try {
    const adminRes = await requirePlatformAdminForApi();
    if (!adminRes.ok) return adminRes.response;

    const admin = getUntypedAdmin();
    const { data, error } = await admin
      .from("enterprise_agreements")
      .select(`${ENTERPRISE_AGREEMENT_FIELDS},companies(name)`)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return NextResponse.json({ error: "AGREEMENTS_LOOKUP_FAILED" }, { status: 500 });

    const agreements = ((data ?? []) as Array<EnterpriseAgreementRow & { companies?: { name?: string | null } | null }>).map(
      (row) => toEnterpriseAgreementResponse(row, row.companies?.name ?? null),
    );

    return NextResponse.json({ agreements }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminRes = await requirePlatformAdminForApi();
    if (!adminRes.ok) return adminRes.response;

    const body = await req.json().catch(() => null);
    const parsed = CreateAgreementSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
    const termsGuard = validateAgreementTerms(parsed.data);
    if (!termsGuard.ok) return validationError(termsGuard.reason);

    const admin = getUntypedAdmin();
    const { data: existingAgreement, error: existingAgreementError } = await findExistingSourceAgreement(admin, parsed.data.sourceRequestId);

    if (existingAgreementError) {
      return NextResponse.json({ error: "AGREEMENT_LOOKUP_FAILED" }, { status: 500 });
    }
    if (existingAgreement) {
      return agreementAlreadyExistsResponse(existingAgreement as EnterpriseAgreementRow);
    }

    const normalizedTerms = normalizeTerms(parsed.data);
    const { data: createdAgreement, error: createError } = await admin.rpc("create_enterprise_agreement_from_request", {
      p_source_request_id: parsed.data.sourceRequestId,
      p_source_request_updated_at: parsed.data.sourceRequestUpdatedAt,
      p_actor_id: adminRes.user.id,
      p_starts_at: normalizedTerms.starts_at,
      p_ends_at: normalizedTerms.ends_at,
      p_is_open_ended: normalizedTerms.is_open_ended,
      p_credits_limit: normalizedTerms.credits_limit,
      p_terms_summary: normalizedTerms.terms_summary,
      p_internal_note: normalizedTerms.internal_note,
      p_replaces_agreement_id: parsed.data.replacesAgreementId ?? null,
    });

    if (createError?.code === "23505") {
      const { data: conflictAgreement } = await findExistingSourceAgreement(admin, parsed.data.sourceRequestId);
      return agreementAlreadyExistsResponse((conflictAgreement as EnterpriseAgreementRow | null) ?? null);
    }

    const lifecycleError = dbErrorReason(createError, [
      "REQUEST_NOT_FOUND",
      "REQUEST_STATUS_CHANGED",
      "SOURCE_REQUEST_STATUS_INVALID",
      "SOURCE_REQUEST_TARGET_PLAN_INVALID",
      "SOURCE_REQUEST_KIND_INVALID",
      "SOURCE_REQUEST_CURRENT_PLAN_INVALID",
      "SOURCE_REQUEST_HAS_OPEN_AGREEMENT",
      "REPLACED_AGREEMENT_NOT_FOUND",
      "REPLACED_AGREEMENT_NOT_ACTIVE",
    ]);
    if (lifecycleError) return NextResponse.json({ error: lifecycleError }, { status: lifecycleError === "REQUEST_NOT_FOUND" ? 404 : 409 });

    if (createError || !createdAgreement) {
      return NextResponse.json({ error: "AGREEMENT_CREATE_FAILED" }, { status: 500 });
    }

    const createdId = String((createdAgreement as { id?: string } | null)?.id ?? "");
    const { data: created, error: createdLookupError } = await admin
      .from("enterprise_agreements")
      .select(ENTERPRISE_AGREEMENT_FIELDS)
      .eq("id", createdId)
      .maybeSingle();

    if (createdLookupError || !created) {
      return NextResponse.json({ error: "AGREEMENT_CREATE_FAILED" }, { status: 500 });
    }

    return NextResponse.json({ agreement: toEnterpriseAgreementResponse(created as EnterpriseAgreementRow) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
