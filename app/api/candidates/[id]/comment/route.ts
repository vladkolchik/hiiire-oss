import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCandidateAccess, requireCompanyContext } from "@/lib/access/company-guards";
import { zodErrorToUserFacingIssues } from "@/lib/api/user-facing-errors";
import { requireSameOriginRequest } from "@/lib/api/csrf";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CommentBodySchema = z.object({
  comment: z
    .string({ error: "Комментарий должен быть текстом." })
    .max(10_000, { message: "Комментарий — до 10000 символов." }),
});

function validationError(message: string, issues?: Array<{ path: Array<string | number>; message: string }>) {
  return NextResponse.json({ error: "INVALID_BODY", message, issues }, { status: 400 });
}

function formatIssues(error: z.ZodError): Array<{ path: Array<string | number>; message: string }> {
  return zodErrorToUserFacingIssues(error, "Проверьте комментарий.");
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const csrfRes = requireSameOriginRequest(req);
    if (!csrfRes.ok) return csrfRes.response;

    const params = await Promise.resolve(context.params);
    const candidateId = String(params.id ?? "").trim();
    if (!candidateId) return validationError("Проверьте кандидата и попробуйте ещё раз.");

    const bodyJson = await req.json().catch(() => null);
    const parsed = CommentBodySchema.safeParse(bodyJson);
    if (!parsed.success) return validationError("Проверьте комментарий.", formatIssues(parsed.error));

    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const accessRes = await requireCandidateAccess(admin, ctx, candidateId);
    if (!accessRes.ok) return accessRes.response;

    const { error } = await admin.from("candidates").update({ comment: parsed.data.comment }).eq("id", candidateId);
    if (error) {
      return NextResponse.json(
        { error: "CANDIDATE_COMMENT_UPDATE_FAILED", message: "Не удалось сохранить комментарий. Попробуйте ещё раз." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Не удалось сохранить комментарий. Попробуйте ещё раз." },
      { status: 500 }
    );
  }
}
