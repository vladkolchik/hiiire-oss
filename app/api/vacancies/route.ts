import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { captureBusinessEvent } from "@/lib/analytics/business-events";
import { requireSameOriginRequest } from "@/lib/api/csrf";
import { getConfirmedServerUser } from "@/lib/auth/server-email-confirmation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { currencyCodeSchema, DEFAULT_CURRENCY_CODE } from "@/lib/currency";
import { addVacancySalaryIssues } from "@/lib/vacancies/salary";
import { EMPLOYMENT_FORM_VALUES, mergeEmploymentForms } from "@/lib/vacancies/employment-forms";
import { vacancyListApiSchema } from "@/lib/vacancies/lists";
import { mapVacancyValidationIssues } from "@/lib/vacancies/validation";

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

export async function POST(req: NextRequest) {
  const csrf = requireSameOriginRequest(req);
  if (!csrf.ok) return csrf.response;

  try {
    const supabase = await createSupabaseServerClient();
    const admin = getSupabaseAdminClient();

    const authRes = await getConfirmedServerUser(supabase);
    if (!authRes.ok) {
      return NextResponse.json(
        { error: authRes.reason === "pending_email" ? "EMAIL_NOT_CONFIRMED" : "UNAUTHORIZED" },
        { status: authRes.reason === "pending_email" ? 403 : 401 }
      );
    }

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
    const nowIso = new Date().toISOString();

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("company_id,role")
      .eq("id", authRes.user.id)
      .maybeSingle();
    if (profileError) return NextResponse.json({ error: "PROFILE_LOOKUP_FAILED" }, { status: 500 });
    if (!profile?.company_id) return NextResponse.json({ error: "NO_COMPANY" }, { status: 403 });

    const { data: vacancy, error: vacancyError } = await admin
      .from("vacancies")
      .insert({
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
        closed_at: status === "closed" ? nowIso : null,
        company_id: profile.company_id,
        created_by: authRes.user.id,
      })
      .select("id")
      .single();

    if (vacancyError || !vacancy) {
      return NextResponse.json({ error: "VACANCY_CREATE_FAILED" }, { status: 500 });
    }

    await captureBusinessEvent({
      event: "vacancy_created",
      userId: authRes.user.id,
      companyId: profile.company_id,
      role: typeof profile.role === "string" ? profile.role : null,
      properties: {
        vacancy_id: vacancy.id,
        status,
        employment_type: employmentType,
        experience_level: experienceLevel,
        department: department ?? null,
        headcount: typeof headcount === "number" ? headcount : 1,
      },
    });

    return NextResponse.json({ vacancyId: vacancy.id }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
