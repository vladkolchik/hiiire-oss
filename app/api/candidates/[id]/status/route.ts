import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { captureBusinessEvent } from "@/lib/analytics/business-events";
import { requireCandidateAccess, requireCompanyContext } from "@/lib/access/company-guards";
import { requireSameOriginRequest } from "@/lib/api/csrf";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CandidateStatusSchema = z.enum([
  "new",
  "reviewing",
  "security-check",
  "interview-scheduled",
  "interviewed",
  "offer",
  "hired",
  "rejected",
]);

const StatusBodySchema = z.object({
  status: CandidateStatusSchema,
  rejectionReasonId: z.string().uuid({ message: "Выберите причину отказа из списка." }).nullable().optional(),
  rejectionComment: z
    .string()
    .trim()
    .max(300, { message: "Комментарий к отказу — до 300 символов." })
    .nullable()
    .optional(),
});

function validationError(message: string, issues?: Array<{ path: Array<string | number>; message: string }>) {
  return NextResponse.json({ error: "INVALID_BODY", message, issues }, { status: 400 });
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const csrfRes = requireSameOriginRequest(req);
    if (!csrfRes.ok) return csrfRes.response;

    const params = await Promise.resolve(context.params);
    const candidateId = String(params.id ?? "").trim();
    if (!candidateId) return validationError("Проверьте кандидата и попробуйте ещё раз.");

    const bodyJson = await req.json().catch(() => null);
    const parsed = StatusBodySchema.safeParse(bodyJson);
    if (!parsed.success) {
      return validationError(
        "Проверьте статус кандидата.",
        parsed.error.issues.map((issue) => ({
          path: issue.path.map((part) => (typeof part === "symbol" ? String(part) : part)),
          message: issue.message,
        }))
      );
    }
    const body = {
      ...parsed.data,
      rejectionReasonId: parsed.data.status === "rejected" ? (parsed.data.rejectionReasonId ?? null) : null,
      rejectionComment: parsed.data.status === "rejected" ? (parsed.data.rejectionComment ?? null) : null,
    };

    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const accessRes = await requireCandidateAccess(admin, ctx, candidateId);
    if (!accessRes.ok) return accessRes.response;
    const accessCandidate = accessRes.data.candidate;

    const normalizedRejectionComment =
      body.status === "rejected" && typeof body.rejectionComment === "string" && body.rejectionComment.trim()
        ? body.rejectionComment.trim()
        : null;

    const { data: updatedRows, error: updateErr } = await (admin as any).rpc("analytics_update_candidate_status", {
      p_candidate_id: candidateId,
      p_company_id: ctx.companyId,
      p_actor_id: ctx.userId,
      p_actor_role: ctx.role,
      p_status: body.status,
      p_rejection_reason_id: body.rejectionReasonId ?? null,
      p_rejection_comment: normalizedRejectionComment,
    });

    if (updateErr) {
      const errMessage = typeof updateErr.message === "string" ? updateErr.message : "";
      if (errMessage.includes("REJECTION_REASON_NOT_FOUND")) {
        return validationError("Причина отказа недоступна. Выберите другую причину.");
      }
      if (errMessage.includes("CANDIDATE_NOT_FOUND")) {
        return NextResponse.json({ error: "NOT_FOUND", message: "Кандидат не найден." }, { status: 404 });
      }
      if (errMessage.includes("FORBIDDEN")) {
        return NextResponse.json({ error: "FORBIDDEN", message: "Нет доступа к этому кандидату." }, { status: 403 });
      }
      return NextResponse.json({ error: "CANDIDATE_STATUS_UPDATE_FAILED", message: "Не удалось обновить статус. Попробуйте ещё раз." }, { status: 500 });
    }

    const updated = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;
    if (!updated?.id) {
      return NextResponse.json({ error: "CANDIDATE_STATUS_UPDATE_FAILED", message: "Не удалось обновить статус. Попробуйте ещё раз." }, { status: 500 });
    }

    const candidate = {
      id: String(updated.id),
      status: String(updated.status),
      updated_at: String(updated.updated_at),
    };

    if (String(updated.from_status) !== body.status) {
      await captureBusinessEvent({
        event: "candidate_status_changed",
        userId: ctx.userId,
        companyId: ctx.companyId,
        role: ctx.role,
        properties: {
          candidate_id: candidateId,
          vacancy_id: accessCandidate.vacancyId,
          status: body.status,
          reason: body.status === "rejected" && body.rejectionReasonId ? "structured_rejection_reason" : null,
        },
      });
    }

    return NextResponse.json({ candidate }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Не удалось обновить статус. Попробуйте ещё раз." }, { status: 500 });
  }
}
