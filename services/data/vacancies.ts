import type { Vacancy } from "@/types";
import type { Database } from "@/lib/supabase/database.types";
import { mapVacancyRow } from "./mappers";
import { z } from "zod";
import { toSupportedCurrencyCodeOrThrow } from "@/lib/currency";
import { readUserFacingApiErrorMessage } from "@/lib/api/user-facing-errors";

export type ListVacanciesPageInput = {
  page: number;
  pageSize: number;
  status?: Vacancy["status"] | "all";
  vacancyId?: string | null;
};

export type ListVacanciesPageResult = {
  items: Vacancy[];
  total: number;
  totalAllStatuses: number;
};

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, Math.trunc(v)));
}

function getVacancyApiErrorMessage(json: unknown, fallback: string): string {
  if (!json || typeof json !== "object" || (json as { error?: unknown }).error !== "INVALID_BODY") return fallback;
  return readUserFacingApiErrorMessage(json, fallback);
}

function readVacancyListRows(json: unknown, fallback: string): {
  rows: Database["public"]["Tables"]["vacancies"]["Row"][];
  total: number;
  totalAllStatuses: number;
} {
  const ok = z.object({
    items: z.array(z.any()),
    total: z.number(),
    totalAllStatuses: z.number(),
  }).safeParse(json);
  if (!ok.success) throw new Error(fallback);

  return {
    rows: ok.data.items as Database["public"]["Tables"]["vacancies"]["Row"][],
    total: ok.data.total,
    totalAllStatuses: ok.data.totalAllStatuses,
  };
}

export async function listVacanciesPage(input: ListVacanciesPageInput): Promise<ListVacanciesPageResult> {
  const page = clampInt(input.page, 1, 10_000);
  const pageSize = clampInt(input.pageSize, 1, 200);
  const status = input.status ?? "all";
  const vacancyId = input.vacancyId?.trim() || null;

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  params.set("status", status);
  if (vacancyId) params.set("vacancyId", vacancyId);

  const res = await fetch(`/api/vacancies/list?${params.toString()}`, { method: "GET", cache: "no-store" });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(readUserFacingApiErrorMessage(json, "Не удалось загрузить вакансии"));

  const { rows, total, totalAllStatuses } = readVacancyListRows(json, "Некорректный ответ сервера");
  const items = rows.map(mapVacancyRow);
  return { items, total, totalAllStatuses };
}

export async function listVacancies(): Promise<Vacancy[]> {
  const params = new URLSearchParams();
  params.set("all", "true");
  params.set("status", "all");

  const res = await fetch(`/api/vacancies/list?${params.toString()}`, { method: "GET", cache: "no-store" });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(readUserFacingApiErrorMessage(json, "Не удалось загрузить вакансии"));

  const { rows } = readVacancyListRows(json, "Некорректный ответ сервера");
  return rows.map(mapVacancyRow);
}

export async function getVacancyById(vacancyId: string): Promise<Vacancy | null> {
  const id = vacancyId.trim();
  if (!id) return null;

  const res = await fetch(`/api/vacancies/${encodeURIComponent(id)}`, { method: "GET" });
  const json: unknown = await res.json().catch(() => null);
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) {
    throw new Error(getVacancyApiErrorMessage(json, "Не удалось открыть вакансию"));
  }

  const ok = z.object({ vacancy: z.any() }).safeParse(json);
  if (!ok.success) throw new Error("Некорректный ответ сервера");

  return mapVacancyRow(ok.data.vacancy as Database["public"]["Tables"]["vacancies"]["Row"]);
}

export async function createVacancy(input: {
  title: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency: string;
  location: string;
  employmentType: Vacancy["employmentType"];
  experienceLevel: Vacancy["experienceLevel"];
  status: Vacancy["status"];

  // Real-world hiring fields (optional)
  department?: string;
  hiringManager?: string;
  headcount?: number;
  workSchedule?: string;
  employmentForms?: Vacancy["employmentForms"];
  salaryPeriod?: NonNullable<Vacancy["salaryPeriod"]>;
  salaryTax?: Vacancy["salaryTax"];
  bonus?: string;
  benefits?: string;
  probationMonths?: Vacancy["probationMonths"];
  travelPercent?: Vacancy["travelPercent"];
  mandatoryRequirements?: string;
  hiringProcess?: string;
}): Promise<{ vacancyId: string }> {
  const salaryCurrency = toSupportedCurrencyCodeOrThrow(input.salaryCurrency);

  const res = await fetch("/api/vacancies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, salaryCurrency }),
  });

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(getVacancyApiErrorMessage(json, "Не удалось создать вакансию"));
  }
  if (!json || typeof json !== "object") {
    throw new Error("Не удалось создать вакансию");
  }

  const vacancyId = (json as { vacancyId?: unknown }).vacancyId;
  if (typeof vacancyId !== "string" || !vacancyId) {
    throw new Error("Не удалось создать вакансию");
  }

  return { vacancyId };
}

export async function updateVacancy(
  vacancyId: string,
  input: {
    title: string;
    description: string;
    requirements: string[];
    responsibilities: string[];
    salaryMin?: number | null;
    salaryMax?: number | null;
    salaryCurrency: string;
    location: string;
    employmentType: Vacancy["employmentType"];
    experienceLevel: Vacancy["experienceLevel"];
    status: Vacancy["status"];

    // Real-world hiring fields (optional)
    department?: string;
    hiringManager?: string;
    headcount?: number;
    workSchedule?: string;
    employmentForms?: Vacancy["employmentForms"];
    salaryPeriod?: NonNullable<Vacancy["salaryPeriod"]>;
    salaryTax?: Vacancy["salaryTax"];
    bonus?: string;
    benefits?: string;
    probationMonths?: Vacancy["probationMonths"];
    travelPercent?: Vacancy["travelPercent"];
    mandatoryRequirements?: string;
    hiringProcess?: string;
  }
): Promise<Vacancy> {
  const salaryCurrency = toSupportedCurrencyCodeOrThrow(input.salaryCurrency);

  const res = await fetch(`/api/vacancies/${encodeURIComponent(vacancyId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, salaryCurrency }),
  });

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(getVacancyApiErrorMessage(json, "Не удалось обновить вакансию"));
  }

  const ok = z.object({ vacancy: z.any() }).safeParse(json);
  if (!ok.success) throw new Error("Некорректный ответ сервера");

  const row = ok.data.vacancy as Database["public"]["Tables"]["vacancies"]["Row"];
  return mapVacancyRow(row);
}

export async function updateVacancyStatus(vacancyId: string, status: Vacancy["status"]): Promise<Vacancy> {
  const res = await fetch(`/api/vacancies/${encodeURIComponent(vacancyId)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(readUserFacingApiErrorMessage(json, "Не удалось обновить статус вакансии"));
  }

  const ok = z.object({ vacancy: z.any() }).safeParse(json);
  if (!ok.success) throw new Error("Некорректный ответ сервера");

  const row = ok.data.vacancy as Database["public"]["Tables"]["vacancies"]["Row"];
  return mapVacancyRow(row);
}

export async function syncVacancyFromHh(vacancyId: string): Promise<Vacancy> {
  const res = await fetch(`/api/vacancies/${encodeURIComponent(vacancyId)}/sync-hh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = z.object({ error: z.string().optional() }).safeParse(json);
    throw new Error(err.success && err.data.error ? err.data.error : "Не удалось синхронизировать вакансию");
  }

  const ok = z.object({ vacancy: z.any() }).safeParse(json);
  if (!ok.success) throw new Error("Некорректный ответ сервера");

  const row = ok.data.vacancy as Database["public"]["Tables"]["vacancies"]["Row"];
  return mapVacancyRow(row);
}
