import type { CandidateContact } from "@/types";
import type { Database } from "@/lib/supabase/database.types";
import { readUserFacingApiErrorMessage } from "@/lib/api/user-facing-errors";
import { z } from "zod";

type ContactRow = Database["public"]["Tables"]["candidate_contacts"]["Row"];

function mapRow(row: ContactRow): CandidateContact {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    type: row.type,
    value: row.value,
    label: row.label ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function listCandidateContacts(candidateId: string): Promise<CandidateContact[]> {
  const res = await fetch(`/api/candidates/${encodeURIComponent(candidateId)}/contacts`, { method: "GET", cache: "no-store" });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(readUserFacingApiErrorMessage(json, "Не удалось загрузить контакты. Попробуйте ещё раз."));
  }

  const ok = z.object({ contacts: z.array(z.any()) }).safeParse(json);
  if (!ok.success) throw new Error("Некорректный ответ сервера");
  return (ok.data.contacts as ContactRow[]).map(mapRow);
}

export async function createCandidateContact(input: {
  candidateId: string;
  type: string;
  value: string;
  label?: string;
}): Promise<CandidateContact> {
  const res = await fetch(`/api/candidates/${encodeURIComponent(input.candidateId)}/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: input.type,
      value: input.value,
      label: input.label,
    }),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(readUserFacingApiErrorMessage(json, "Не удалось добавить контакт. Попробуйте ещё раз."));
  }

  const ok = z.object({ contact: z.any() }).safeParse(json);
  if (!ok.success) throw new Error("Некорректный ответ сервера");
  return mapRow(ok.data.contact as ContactRow);
}

export async function updateCandidateContact(input: {
  candidateId: string;
  id: string;
  type: string;
  value: string;
  label?: string;
}): Promise<CandidateContact> {
  const res = await fetch(`/api/candidates/${encodeURIComponent(input.candidateId)}/contacts/${encodeURIComponent(input.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: input.type,
      value: input.value,
      label: input.label,
    }),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(readUserFacingApiErrorMessage(json, "Не удалось обновить контакт. Попробуйте ещё раз."));
  }

  const ok = z.object({ contact: z.any() }).safeParse(json);
  if (!ok.success) throw new Error("Некорректный ответ сервера");
  return mapRow(ok.data.contact as ContactRow);
}

export async function deleteCandidateContact(candidateId: string, id: string): Promise<void> {
  const res = await fetch(`/api/candidates/${encodeURIComponent(candidateId)}/contacts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(readUserFacingApiErrorMessage(json, "Не удалось удалить контакт. Попробуйте ещё раз."));
  }

  const ok = z.object({ ok: z.literal(true) }).safeParse(json);
  if (!ok.success) throw new Error("Некорректный ответ сервера");
}
