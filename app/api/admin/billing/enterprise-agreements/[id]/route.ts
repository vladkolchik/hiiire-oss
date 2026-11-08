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

const UpdateTermsSchema = z.object({
  startsAt: z.string().trim().min(1),
  endsAt: z.string().trim().min(1).nullable().optional(),
  isOpenEnded: z.boolean(),
  creditsLimit: z.number().int().min(0).nullable().optional(),
  termsSummary: z.string().trim().min(1).max(5000),
  internalNote: z.string().trim().max(5000).nullable().optional(),
});

type UntypedSupabase = ReturnType<typeof getSupabaseAdminClient> & {
  from(table: string): any;
};

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

function validationError(reason: string) {
  return NextResponse.json({ error: reason }, { status: 400 });
}

async function agreementIdFromContext(context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await Promise.resolve(context.params);
  return String(params.id ?? "").trim();
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const adminRes = await requirePlatformAdminForApi();
    if (!adminRes.ok) return adminRes.response;

    const agreementId = await agreementIdFromContext(context);
    if (!agreementId) return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });

    const body = await req.json().catch(() => null);
    const parsed = UpdateTermsSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });

    const admin = getUntypedAdmin();
    const { data: current, error: lookupError } = await admin
      .from("enterprise_agreements")
      .select(ENTERPRISE_AGREEMENT_FIELDS)
      .eq("id", agreementId)
      .maybeSingle();

    if (lookupError) return NextResponse.json({ error: "AGREEMENT_LOOKUP_FAILED" }, { status: 500 });
    if (!current) return NextResponse.json({ error: "AGREEMENT_NOT_FOUND" }, { status: 404 });

    const currentAgreement = current as EnterpriseAgreementRow;
    if (currentAgreement.status !== "draft") {
      return NextResponse.json({ error: "AGREEMENT_NOT_EDITABLE" }, { status: 409 });
    }

    const guard = canSaveEnterpriseAgreementTerms({
      status: currentAgreement.status,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt ?? null,
      isOpenEnded: parsed.data.isOpenEnded,
      creditsLimit: parsed.data.creditsLimit ?? null,
      termsSummary: parsed.data.termsSummary,
    });

    if (!guard.ok) return validationError(guard.reason);

    const { data: updated, error: updateError } = await admin
      .from("enterprise_agreements")
      .update({
        ...normalizeEnterpriseAgreementTerms(parsed.data),
        updated_at: new Date().toISOString(),
      })
      .eq("id", agreementId)
      .eq("status", currentAgreement.status)
      .select(ENTERPRISE_AGREEMENT_FIELDS)
      .maybeSingle();

    if (updateError) return NextResponse.json({ error: "AGREEMENT_UPDATE_FAILED" }, { status: 500 });
    if (!updated) return NextResponse.json({ error: "AGREEMENT_STATUS_CHANGED" }, { status: 409 });

    return NextResponse.json({ agreement: toEnterpriseAgreementResponse(updated as EnterpriseAgreementRow) }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
