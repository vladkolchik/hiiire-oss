import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireSameOriginRequest } from "@/lib/api/csrf";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireCompanyContext, requireVacancyAccess } from "@/lib/access/company-guards";
import { currencyCodeSchema, DEFAULT_CURRENCY_CODE } from "@/lib/currency";
import { addVacancySalaryIssues } from "@/lib/vacancies/salary";
import { EMPLOYMENT_FORM_VALUES, mergeEmploymentForms } from "@/lib/vacancies/employment-forms";
import { vacancyListApiSchema } from "@/lib/vacancies/lists";
import { mapVacancyValidationIssues } from "@/lib/vacancies/validation";

const VACANCY_LOOKUP_FAILED_MESSAGE = "Не удалось проверить вакансию. Попробуйте ещё раз.";
const VACANCY_UPDATE_FAILED_MESSAGE = "Не удалось обновить вакансию. Попробуйте ещё раз.";
const VACANCY_CHANGED_MESSAGE = "Вакансия уже изменилась. Обновите страницу и попробуйте ещё раз.";

const EmploymentFormSchema = z.enum(EMPLOYMENT_FORM_VALUES);

const BodySchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Введите название вакансии")
    .max(120, "Название вакансии не должно быть длиннее 120 символов"),
  description: z
    .string()
    .trim()
    .min(20, "Описание вакансии должно быть не короче 20 символов")
    .max(20_000, "Описание вакансии не должно быть длиннее 20000 символов"),
  requirements: vacancyListApiSchema(),
  responsibilities: vacancyListApiSchema(),

  salaryMin: z.number().int().nullable().optional(),
  salaryMax: z.number().int().nullable().optional(),
  salaryCurrency: currencyCodeSchema().default(DEFAULT_CURRENCY_CODE),

  location: z.string().trim().min(2, "Укажите локацию").max(120, "Локация не должна быть длиннее 120 символов"),
  employmentType: z.enum(["full-time", "part-time", "contract", "internship"]),
  experienceLevel: z.enum(["trainee", "junior", "middle", "senior", "lead"]),
  status: z.enum(["draft", "active", "paused", "closed"]).default("draft"),

  // Real-world hiring fields (optional)
  department: z.string().trim().min(1, "Укажите отдел").max(120, "Отдел не должен быть длиннее 120 символов").optional(),
  hiringManager: z
    .string()
    .trim()
    .min(1, "Укажите ответственного")
    .max(120, "Ответственный не должен быть длиннее 120 символов")
    .optional(),
  headcount: z.number().int().min(1).max(1000).optional(),
  workSchedule: z.string().trim().min(1, "Укажите график").max(80, "График не должен быть длиннее 80 символов").optional(),
  employmentForms: z.array(EmploymentFormSchema).optional(),
  employmentForm: EmploymentFormSchema.optional(),
  salaryPeriod: z.enum(["month", "hour", "shift"]).optional(),
  salaryTax: z.enum(["gross", "net"]).nullable().optional(),
  bonus: z.string().trim().min(1, "Опишите бонусы").max(5000, "Бонусы не должны быть длиннее 5000 символов").optional(),
  benefits: z.string().trim().min(1, "Опишите условия").max(5000, "Условия не должны быть длиннее 5000 символов").optional(),
  probationMonths: z.number().int().min(0).max(24).nullable().optional(),
  travelPercent: z.number().int().min(0).max(100).nullable().optional(),
  mandatoryRequirements: z
    .string()
    .trim()
    .min(1, "Опишите обязательные требования")
    .max(10_000, "Обязательные требования не должны быть длиннее 10000 символов")
    .optional(),
  hiringProcess: z
    .string()
    .trim()
    .min(1, "Опишите этапы отбора")
    .max(10_000, "Этапы отбора не должны быть длиннее 10000 символов")
    .optional(),
}).superRefine((val, ctx) => {
  addVacancySalaryIssues(val, ctx);
}).transform((value) => {
  const employmentForms = mergeEmploymentForms(value.employmentForms, value.employmentForm);

  return {
    ...value,
    employmentForms,
    employmentForm: employmentForms[0],
  };
});

const IdSchema = z.string().uuid();

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const params = await Promise.resolve(context.params);
    const vacancyId = String(params.id ?? "").trim();
    if (!IdSchema.safeParse(vacancyId).success) {
      return NextResponse.json({ error: "INVALID_ID", message: "Некорректная ссылка на вакансию." }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const accessRes = await requireVacancyAccess(admin, ctx, vacancyId);
    if (!accessRes.ok) return accessRes.response;

    const { data: vacancy, error } = await admin
      .from("vacancies")
      .select("*")
      .eq("id", vacancyId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: "VACANCY_LOOKUP_FAILED" }, { status: 500 });
    if (!vacancy) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    return NextResponse.json({ vacancy }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> | { id: string } }) {
  const csrf = requireSameOriginRequest(req);
  if (!csrf.ok) return csrf.response;

  try {
    const params = await Promise.resolve(context.params);
    const vacancyId = String(params.id ?? "").trim();
    if (!vacancyId) return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });

    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const ctxRes = await requireCompanyContext(supabase);
    if (!ctxRes.ok) return ctxRes.response;
    const ctx = ctxRes.data;

    const accessRes = await requireVacancyAccess(admin, ctx, vacancyId);
    if (!accessRes.ok) return accessRes.response;

    const bodyJson = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(bodyJson);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "INVALID_BODY",
          issues: mapVacancyValidationIssues(parsed.error),
        },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const {
      title,
      description,
      requirements,
      responsibilities,
      salaryMin,
      salaryMax,
      salaryCurrency,
      location,
      employmentType,
      experienceLevel,
      status,
      department,
      hiringManager,
      headcount,
      workSchedule,
      employmentForms,
      employmentForm,
      salaryPeriod,
      salaryTax,
      bonus,
      benefits,
      probationMonths,
      travelPercent,
      mandatoryRequirements,
      hiringProcess,
    } = parsed.data;

    const { data: existingVacancy, error: existingVacancyError } = await admin
      .from("vacancies")
      .select("status,closed_at,updated_at")
      .eq("id", vacancyId)
      .eq("company_id", ctx.companyId)
      .maybeSingle();

    if (existingVacancyError || !existingVacancy) {
      return NextResponse.json(
        { error: "VACANCY_LOOKUP_FAILED", message: VACANCY_LOOKUP_FAILED_MESSAGE },
        { status: 500 }
      );
    }

    const { data: updated, error } = await admin
      .from("vacancies")
      .update({
        title,
        description,
        requirements,
        responsibilities,
        salary_min: salaryMin ?? null,
        salary_max: salaryMax ?? null,
        salary_currency: salaryCurrency,
        location,
        employment_type: employmentType,
        experience_level: experienceLevel,
        status,
        department: department ?? null,
        hiring_manager: hiringManager ?? null,
        headcount: typeof headcount === "number" ? headcount : 1,
        work_schedule: workSchedule ?? null,
        employment_form: employmentForm ?? null,
        employment_forms: employmentForms,
        salary_period: salaryPeriod ?? "month",
        salary_tax: salaryTax ?? null,
        bonus_text: bonus ?? null,
        benefits_text: benefits ?? null,
        probation_months: probationMonths ?? null,
        travel_percent: travelPercent ?? null,
        mandatory_requirements_text: mandatoryRequirements ?? null,
        hiring_process_text: hiringProcess ?? null,
        closed_at:
          status === "closed"
            ? existingVacancy.status === "closed" ? existingVacancy.closed_at : nowIso
            : null,
        updated_at: nowIso,
      })
      .eq("id", vacancyId)
      .eq("company_id", ctx.companyId)
      .eq("updated_at", existingVacancy.updated_at)
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "VACANCY_UPDATE_FAILED", message: VACANCY_UPDATE_FAILED_MESSAGE }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: "VACANCY_CHANGED", message: VACANCY_CHANGED_MESSAGE }, { status: 409 });
    }

    return NextResponse.json({ vacancy: updated }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR", message: VACANCY_UPDATE_FAILED_MESSAGE }, { status: 500 });
  }
}
