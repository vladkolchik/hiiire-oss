import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCandidateAccess, requireCompanyContext } from "@/lib/access/company-guards";
import { zodErrorToUserFacingIssues } from "@/lib/api/user-facing-errors";
import { requireSameOriginRequest } from "@/lib/api/csrf";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const NameBodySchema = z.object({
  name: z
    .string({ error: "Укажите имя кандидата." })
    .trim()
    .min(1, { message: "Укажите имя кандидата." })
    .max(120, { message: "Имя кандидата — до 120 символов." }),
});

function validationError(message: string, issues?: Array<{ path: Array<string | number>; message: string }>) {
  return NextResponse.json({ error: "INVALID_BODY", message, issues }, { status: 400 });
}

function formatIssues(error: z.ZodError): Array<{ path: Array<string | number>; message: string }> {
  return zodErrorToUserFacingIssues(error, "Проверьте имя кандидата.");
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const csrfRes = requireSameOriginRequest(req);
    if (!csrfRes.ok) return csrfRes.response;

    const params = await Promise.resolve(context.params);
    const candidateId = String(params.id ?? "").trim();
    if (!candidateId) return validationError("Проверьте кандидата и попробуйте ещё раз.");

    const bodyJson = await req.json().catch(() => null);
    const parsed = NameBodySchema.safeParse(bodyJson);
    if (!parsed.success) return validationError("Проверьте имя кандидата.", formatIssues(parsed.error));

    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const accessRes = await requireCandidateAccess(admin, ctx, candidateId);
    if (!accessRes.ok) return accessRes.response;

    const { error } = await admin
      .from("candidates")
      .update({ name: parsed.data.name, updated_at: new Date().toISOString() })
      .eq("id", candidateId);
    if (error) {
      return NextResponse.json(
        { error: "CANDIDATE_NAME_UPDATE_FAILED", message: "Не удалось переименовать кандидата. Попробуйте ещё раз." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Не удалось переименовать кандидата. Попробуйте ещё раз." },
      { status: 500 }
    );
  }
}
