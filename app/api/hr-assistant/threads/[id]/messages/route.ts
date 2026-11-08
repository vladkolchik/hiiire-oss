import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { zodErrorToUserFacingIssues } from "@/lib/api/user-facing-errors";
import { hrAssistantPlanAccessResponse, requireHrAssistantPlanAccess } from "@/lib/hr-assistant/access";
import { AssistantPersistenceError, listAssistantDisplayMessages } from "@/lib/hr-assistant/persistence";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const THREAD_ID_MESSAGE = "Чат не найден или недоступен.";

const ParamsSchema = z.object({
  id: z.string({ error: THREAD_ID_MESSAGE }).uuid(THREAD_ID_MESSAGE),
});

function validationResponse(error: z.ZodError) {
  const issues = zodErrorToUserFacingIssues(error, THREAD_ID_MESSAGE);
  return NextResponse.json(
    {
      error: "INVALID_PARAMS",
      message: issues[0]?.message ?? THREAD_ID_MESSAGE,
      issues,
    },
    { status: 400 }
  );
}

function companyContextResponse(status: number) {
  if (status === 401) {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "Войдите в аккаунт, чтобы открыть историю чата." }, { status: 401 });
  }

  if (status === 403) {
    return NextResponse.json({ error: "FORBIDDEN", message: "История чата недоступна для вашей роли или компании." }, { status: 403 });
  }

  return NextResponse.json(
    { error: "INTERNAL_ERROR", message: "Не удалось проверить доступ к истории чата." },
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

  return NextResponse.json({ error: "INTERNAL_ERROR", message: "Не удалось загрузить сообщения." }, { status: 500 });
}

export async function GET(
  _req: NextRequest,
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

    const messages = await listAssistantDisplayMessages(admin, ctxRes.data, id);
    return NextResponse.json({ messages }, { status: 200 });
  } catch (error) {
    if (error instanceof AssistantPersistenceError) return persistenceErrorResponse(error);

    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Не удалось загрузить сообщения." }, { status: 500 });
  }
}
