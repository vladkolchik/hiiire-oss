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

function contactNotFound() {
  return NextResponse.json({ error: "NOT_FOUND", message: "Контакт не найден." }, { status: 404 });
}

function formatIssues(error: z.ZodError): Array<{ path: Array<string | number>; message: string }> {
  return zodErrorToUserFacingIssues(error, "Проверьте контакт.");
}

async function requireScopedContact(admin: ReturnType<typeof getSupabaseAdminClient>, candidateId: string, contactId: string) {
  const { data: contact, error } = await admin
    .from("candidate_contacts")
    .select("*")
    .eq("id", contactId)
    .maybeSingle();
  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "CANDIDATE_CONTACT_LOOKUP_FAILED", message: "Не удалось открыть контакт. Попробуйте ещё раз." },
        { status: 500 }
      ),
    };
  }
  if (!contact || contact.candidate_id !== candidateId) return { ok: false as const, response: contactNotFound() };
  return { ok: true as const, contact };
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string; contactId: string }> | { id: string; contactId: string } }) {
  try {
    const csrfRes = requireSameOriginRequest(req);
    if (!csrfRes.ok) return csrfRes.response;

    const params = await Promise.resolve(context.params);
    const candidateId = String(params.id ?? "").trim();
    const contactId = String(params.contactId ?? "").trim();
    if (!candidateId || !contactId) return validationError("Проверьте контакт и попробуйте ещё раз.");

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

    const contactRes = await requireScopedContact(admin, candidateId, contactId);
    if (!contactRes.ok) return contactRes.response;

    const { data: contact, error } = await admin
      .from("candidate_contacts")
      .update({ type: body.type, value: body.value, label: body.label ?? null })
      .eq("id", contactId)
      .select("*")
      .single();
    if (error || !contact) {
      return NextResponse.json(
        { error: "CANDIDATE_CONTACT_UPDATE_FAILED", message: "Не удалось обновить контакт. Попробуйте ещё раз." },
        { status: 500 }
      );
    }

    return NextResponse.json({ contact }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Не удалось обновить контакт. Попробуйте ещё раз." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string; contactId: string }> | { id: string; contactId: string } }) {
  try {
    const csrfRes = requireSameOriginRequest(req);
    if (!csrfRes.ok) return csrfRes.response;

    const params = await Promise.resolve(context.params);
    const candidateId = String(params.id ?? "").trim();
    const contactId = String(params.contactId ?? "").trim();
    if (!candidateId || !contactId) return validationError("Проверьте контакт и попробуйте ещё раз.");

    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const accessRes = await requireCandidateAccess(admin, ctx, candidateId);
    if (!accessRes.ok) return accessRes.response;

    const contactRes = await requireScopedContact(admin, candidateId, contactId);
    if (!contactRes.ok) return contactRes.response;

    const { error } = await admin.from("candidate_contacts").delete().eq("id", contactId);
    if (error) {
      return NextResponse.json(
        { error: "CANDIDATE_CONTACT_DELETE_FAILED", message: "Не удалось удалить контакт. Попробуйте ещё раз." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Не удалось удалить контакт. Попробуйте ещё раз." },
      { status: 500 }
    );
  }
}
