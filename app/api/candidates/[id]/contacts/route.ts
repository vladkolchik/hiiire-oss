import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireCandidateAccess, requireCompanyContext } from "@/lib/access/company-guards";
import { zodErrorToUserFacingIssues } from "@/lib/api/user-facing-errors";
import { requireSameOriginRequest } from "@/lib/api/csrf";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ContactBodySchema = z.object({
  type: z
    .string({ error: "Укажите тип контакта." })
    .trim()
    .min(1, { message: "Укажите тип контакта." })
    .max(40, { message: "Тип контакта — до 40 символов." }),
  value: z
    .string({ error: "Укажите значение контакта." })
    .trim()
    .min(1, { message: "Укажите значение контакта." })
    .max(500, { message: "Значение контакта — до 500 символов." }),
  label: z
    .string({ error: "Название контакта должно быть текстом." })
    .trim()
    .max(120, { message: "Название контакта — до 120 символов." })
    .optional(),
});

function validationError(message: string, issues?: Array<{ path: Array<string | number>; message: string }>) {
  return NextResponse.json({ error: "INVALID_BODY", message, issues }, { status: 400 });
}

function formatIssues(error: z.ZodError): Array<{ path: Array<string | number>; message: string }> {
  return zodErrorToUserFacingIssues(error, "Проверьте контакт.");
}

function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("cache-control", "no-store");
  return response;
}

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const params = await Promise.resolve(context.params);
    const candidateId = String(params.id ?? "").trim();
    if (!candidateId) return validationError("Проверьте кандидата и попробуйте ещё раз.");

    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const accessRes = await requireCandidateAccess(admin, ctx, candidateId);
    if (!accessRes.ok) return accessRes.response;

    const { data: contacts, error } = await admin
      .from("candidate_contacts")
      .select("*")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: true });
    if (error) {
      return noStoreJson(
        { error: "CANDIDATE_CONTACTS_LOOKUP_FAILED", message: "Не удалось загрузить контакты. Попробуйте ещё раз." },
        { status: 500 }
      );
    }

    return noStoreJson({ contacts: contacts ?? [] }, { status: 200 });
  } catch {
    return noStoreJson(
      { error: "INTERNAL_ERROR", message: "Не удалось загрузить контакты. Попробуйте ещё раз." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const csrfRes = requireSameOriginRequest(req);
    if (!csrfRes.ok) return csrfRes.response;

    const params = await Promise.resolve(context.params);
    const candidateId = String(params.id ?? "").trim();
    if (!candidateId) return validationError("Проверьте кандидата и попробуйте ещё раз.");

    const bodyJson = await req.json().catch(() => null);
    const parsed = ContactBodySchema.safeParse(bodyJson);
    if (!parsed.success) return validationError("Проверьте контакт.", formatIssues(parsed.error));
    const body = parsed.data;

    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const accessRes = await requireCandidateAccess(admin, ctx, candidateId);
    if (!accessRes.ok) return accessRes.response;

    const { data: contact, error } = await admin
      .from("candidate_contacts")
      .insert({
        candidate_id: candidateId,
        type: body.type,
        value: body.value,
        label: body.label ?? null,
      })
      .select("*")
      .single();
    if (error || !contact) {
      return NextResponse.json(
        { error: "CANDIDATE_CONTACT_CREATE_FAILED", message: "Не удалось добавить контакт. Попробуйте ещё раз." },
        { status: 500 }
      );
    }

    return NextResponse.json({ contact }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Не удалось добавить контакт. Попробуйте ещё раз." },
      { status: 500 }
    );
  }
}
