import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { zodErrorToUserFacingIssues } from "@/lib/api/user-facing-errors";
import { hrAssistantPlanAccessResponse, requireHrAssistantPlanAccess } from "@/lib/hr-assistant/access";
import { AssistantPersistenceError, requireAssistantThreadAccess } from "@/lib/hr-assistant/persistence";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const THREAD_TITLE_MESSAGE = "Введите название чата";
const THREAD_TITLE_LIMIT_MESSAGE = "Название чата не должно быть длиннее 160 символов";
const THREAD_INVALID_MESSAGE = "Проверьте параметры чата.";
const THREAD_ID_MESSAGE = "Чат не найден или недоступен.";

type AssistantThreadUpdate = Database["public"]["Tables"]["assistant_threads"]["Update"];

const ParamsSchema = z.object({
  id: z.string({ error: THREAD_ID_MESSAGE }).uuid(THREAD_ID_MESSAGE),
});

const BodySchema = z
  .object({
    title: z.string({ error: THREAD_TITLE_MESSAGE }).trim().min(1, THREAD_TITLE_MESSAGE).max(160, THREAD_TITLE_LIMIT_MESSAGE).optional(),
    archived: z.boolean({ error: "Выберите, нужно ли архивировать чат" }).optional(),
    pinned: z.boolean({ error: "Выберите, нужно ли закрепить чат" }).optional(),
  })
  .refine((value) => value.title !== undefined || value.archived !== undefined || value.pinned !== undefined, {
    message: "Выберите, что изменить в чате.",
  });

function validationResponse(error: z.ZodError) {
  const issues = zodErrorToUserFacingIssues(error, THREAD_INVALID_MESSAGE);
  return NextResponse.json(
    {
      error: "INVALID_BODY",
      message: issues[0]?.message ?? THREAD_INVALID_MESSAGE,
      issues,
    },
    { status: 400 }
  );
}

function companyContextResponse(status: number) {
  if (status === 401) {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "Войдите в аккаунт, чтобы изменить чат." }, { status: 401 });
  }

  if (status === 403) {
    return NextResponse.json({ error: "FORBIDDEN", message: "Чат недоступен для вашей роли или компании." }, { status: 403 });
  }

  return NextResponse.json(
    { error: "INTERNAL_ERROR", message: "Не удалось проверить доступ к чату." },
    { status: 500 }
  );
}

function persistenceErrorResponse(error: AssistantPersistenceError) {
  if (error.code === "ASSISTANT_THREAD_NOT_FOUND" || error.code === "ASSISTANT_SCOPE_NOT_FOUND") {
    return NextResponse.json({ error: "NOT_FOUND", message: "Чат не найден или недоступен." }, { status: 404 });
  }

  if (error.code === "ASSISTANT_SCOPE_NOT_SUPPORTED_YET") {
    return NextResponse.json({ error: "UNSUPPORTED_SCOPE", message: "Этот контекст пока нельзя использовать для чата." }, { status: 400 });
  }

  return NextResponse.json({ error: "INTERNAL_ERROR", message: "Не удалось обновить чат." }, { status: 500 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const paramsResult = ParamsSchema.safeParse(await Promise.resolve(params));
    if (!paramsResult.success) return validationResponse(paramsResult.error);
    const { id } = paramsResult.data;
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();
    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return companyContextResponse(ctxRes.response.status);
    if (!(await requireHrAssistantPlanAccess(admin, ctxRes.data.companyId))) return hrAssistantPlanAccessResponse();
    const ctx = ctxRes.data;

    await requireAssistantThreadAccess(admin, ctx, id);

    const bodyJson = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(bodyJson);
    if (!parsed.success) return validationResponse(parsed.error);

    const patch: AssistantThreadUpdate = { updated_at: new Date().toISOString() };
    if (parsed.data.title !== undefined) patch.title = parsed.data.title;
    if (typeof parsed.data.archived === "boolean") {
      patch.archived_at = parsed.data.archived ? new Date().toISOString() : null;
    }
    if (typeof parsed.data.pinned === "boolean") {
      patch.pinned_at = parsed.data.pinned ? new Date().toISOString() : null;
    }

    const { data, error } = await admin
      .from("assistant_threads")
      .update(patch)
      .eq("id", id)
      .eq("company_id", ctx.companyId)
      .select("id,title,scope_type,scope_id,mode,summary,updated_at,archived_at,pinned_at,owner_id,visibility")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "UPDATE_FAILED", message: "Не удалось обновить чат." }, { status: 500 });
    }

    return NextResponse.json({ thread: data }, { status: 200 });
  } catch (error) {
    if (error instanceof AssistantPersistenceError) return persistenceErrorResponse(error);

    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Не удалось обновить чат." }, { status: 500 });
  }
}
