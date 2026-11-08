import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCompanyContext } from "@/lib/access/company-guards";
import { zodErrorToUserFacingIssues } from "@/lib/api/user-facing-errors";
import { hrAssistantPlanAccessResponse, requireHrAssistantPlanAccess } from "@/lib/hr-assistant/access";
import {
  AssistantPersistenceError,
  createAssistantThread,
  listAssistantThreads,
} from "@/lib/hr-assistant/persistence";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const THREAD_TITLE_MESSAGE = "Введите название чата";
const THREAD_TITLE_LIMIT_MESSAGE = "Название чата не должно быть длиннее 160 символов";
const THREAD_SCOPE_MESSAGE = "Выберите доступный контекст чата";
const THREAD_MODE_MESSAGE = "Выберите режим чата";
const THREAD_SCOPE_ID_MESSAGE = "Выберите доступный объект для контекста чата";
const THREAD_INVALID_MESSAGE = "Проверьте параметры чата.";
const THREAD_SEARCH_MIN_MESSAGE = "Введите минимум 2 символа для поиска";
const THREAD_SEARCH_LIMIT_MESSAGE = "Поисковый запрос не должен быть длиннее 120 символов";

const ThreadScopeSchema = z.enum(["company", "vacancy", "candidate", "interview", "support", "client_account"], {
  error: THREAD_SCOPE_MESSAGE,
});
const ThreadModeSchema = z.enum(["general", "screening", "outreach", "interview", "pipeline", "support"], {
  error: THREAD_MODE_MESSAGE,
});

const BodySchema = z
  .object({
    title: z.string({ error: THREAD_TITLE_MESSAGE }).trim().min(1, THREAD_TITLE_MESSAGE).max(160, THREAD_TITLE_LIMIT_MESSAGE),
    scopeType: ThreadScopeSchema.default("company"),
    scopeId: z.string({ error: THREAD_SCOPE_ID_MESSAGE }).uuid(THREAD_SCOPE_ID_MESSAGE).nullable().optional(),
    mode: ThreadModeSchema.default("general"),
  })
  .refine((value) => ["company", "support", "client_account"].includes(value.scopeType) || Boolean(value.scopeId), {
    path: ["scopeId"],
    message: THREAD_SCOPE_ID_MESSAGE,
  });

const QuerySchema = z.object({
  includeArchived: z
    .enum(["true", "false"], { error: "Выберите, показывать ли архивные чаты" })
    .optional()
    .transform((value) => value === undefined ? undefined : value === "true"),
  search: z
    .string({ error: "Введите поисковый запрос" })
    .trim()
    .min(2, THREAD_SEARCH_MIN_MESSAGE)
    .max(120, THREAD_SEARCH_LIMIT_MESSAGE)
    .optional(),
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
    return NextResponse.json({ error: "UNAUTHORIZED", message: "Войдите в аккаунт, чтобы открыть чаты." }, { status: 401 });
  }

  if (status === 403) {
    return NextResponse.json({ error: "FORBIDDEN", message: "Чаты недоступны для вашей роли или компании." }, { status: 403 });
  }

  return NextResponse.json(
    { error: "INTERNAL_ERROR", message: "Не удалось проверить доступ к чатам." },
    { status: 500 }
  );
}

function persistenceErrorResponse(error: AssistantPersistenceError, fallback: string) {
  if (error.code === "ASSISTANT_SCOPE_NOT_FOUND") {
    return NextResponse.json({ error: "NOT_FOUND", message: "Выбранный контекст недоступен." }, { status: 404 });
  }

  if (error.code === "ASSISTANT_SCOPE_NOT_SUPPORTED_YET") {
    return NextResponse.json({ error: "UNSUPPORTED_SCOPE", message: "Этот контекст пока нельзя использовать для чата." }, { status: 400 });
  }

  return NextResponse.json({ error: "INTERNAL_ERROR", message: fallback }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();
    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return companyContextResponse(ctxRes.response.status);
    if (!(await requireHrAssistantPlanAccess(admin, ctxRes.data.companyId))) return hrAssistantPlanAccessResponse();

    const parsedQuery = QuerySchema.safeParse({
      includeArchived: req.nextUrl.searchParams.get("includeArchived") ?? undefined,
      search: req.nextUrl.searchParams.get("search") ?? undefined,
    });
    if (!parsedQuery.success) return validationResponse(parsedQuery.error);

    const includeArchived = parsedQuery.data.includeArchived;

    const threads = await listAssistantThreads(admin, ctxRes.data, {
      includeArchived,
      searchQuery: parsedQuery.data.search,
    });
    return NextResponse.json({ threads }, { status: 200 });
  } catch (error) {
    if (error instanceof AssistantPersistenceError) {
      return persistenceErrorResponse(error, "Не удалось загрузить чаты.");
    }

    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Не удалось загрузить чаты." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();
    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return companyContextResponse(ctxRes.response.status);
    if (!(await requireHrAssistantPlanAccess(admin, ctxRes.data.companyId))) return hrAssistantPlanAccessResponse();

    const bodyJson = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(bodyJson);
    if (!parsed.success) return validationResponse(parsed.error);

    const thread = await createAssistantThread(admin, ctxRes.data, parsed.data);
    return NextResponse.json({ thread }, { status: 201 });
  } catch (error) {
    if (error instanceof AssistantPersistenceError) {
      return persistenceErrorResponse(error, "Не удалось создать чат.");
    }

    return NextResponse.json({ error: "INTERNAL_ERROR", message: "Не удалось создать чат." }, { status: 500 });
  }
}
