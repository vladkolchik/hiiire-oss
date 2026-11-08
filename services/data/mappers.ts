import type { Candidate, Vacancy, AIAnalysis, Interview } from "@/types";
import type { Database } from "@/lib/supabase/database.types";
import { mergeEmploymentForms } from "@/lib/vacancies/employment-forms";

type VacancyRow = Database["public"]["Tables"]["vacancies"]["Row"];
type CandidateRow = Database["public"]["Tables"]["candidates"]["Row"];
type InterviewRow = Database["public"]["Tables"]["interviews"]["Row"];
type AiRow = Database["public"]["Tables"]["ai_analyses"]["Row"];
type CandidateContactRow = Database["public"]["Tables"]["candidate_contacts"]["Row"];

export function mapVacancyRow(row: VacancyRow): Vacancy {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    requirements: row.requirements,
    responsibilities: row.responsibilities,
    salary: {
      min: row.salary_min ?? undefined,
      max: row.salary_max ?? undefined,
      currency: row.salary_currency,
    },
    location: row.location,
    employmentType: row.employment_type,
    experienceLevel: row.experience_level,
    status: row.status,
    closedAt: row.closed_at ?? null,
    department: row.department ?? undefined,
    hiringManager: row.hiring_manager ?? undefined,
    headcount: typeof row.headcount === "number" ? row.headcount : undefined,
    workSchedule: row.work_schedule ?? undefined,
    employmentForms: mergeEmploymentForms(row.employment_forms, row.employment_form),
    salaryPeriod: row.salary_period ?? undefined,
    salaryTax: row.salary_tax ?? null,
    bonus: row.bonus_text ?? undefined,
    benefits: row.benefits_text ?? undefined,
    probationMonths: row.probation_months ?? null,
    travelPercent: row.travel_percent ?? null,
    mandatoryRequirements: row.mandatory_requirements_text ?? undefined,
    hiringProcess: row.hiring_process_text ?? undefined,
    companyId: row.company_id,
    createdById: row.created_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    hhruVacancyId: row.hhru_vacancy_id ?? undefined,
  };
}

export function mapCandidateRow(row: CandidateRow, ai?: AiRow | null, contacts?: CandidateContactRow[] | null): Candidate {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    vacancyId: row.vacancy_id,
    createdById: row.created_by,
    resumeUrl: row.resume_url ?? undefined,
    resumeText: row.resume_text ?? undefined,
    desiredSalaryText: row.desired_salary_text,
    desiredSalaryAmount: row.desired_salary_amount,
    desiredSalaryCurrency: row.desired_salary_currency,
    desiredSalarySource: row.desired_salary_source,
    avatar: row.avatar_url ?? undefined,
    contacts: (contacts ?? []).map((c) => ({
      id: c.id,
      candidateId: c.candidate_id,
      type: c.type,
      value: c.value,
      label: c.label ?? undefined,
      createdAt: new Date(c.created_at),
      updatedAt: new Date(c.updated_at),
    })),
    matchPercentage: row.match_percentage ?? null,
    aiAnalysis: ai ? mapAiRow(ai) : undefined,
    status: row.status,
    source: row.source,
    comment: row.comment ?? undefined,
    appliedAt: new Date(row.applied_at),
    updatedAt: new Date(row.updated_at),
    hhruResumeId: row.hhru_resume_id ?? undefined,
    hhAutoSurveyText: row.hh_auto_survey_text ?? undefined,
  };
}

export function mapInterviewRow(row: InterviewRow): Interview {
  return {
    id: row.id,
    companyId: row.company_id,
    candidateId: row.candidate_id,
    vacancyId: row.vacancy_id,
    scheduledAt: new Date(row.scheduled_at),
    durationMinutes: row.duration_minutes,
    type: row.type,
    status: row.status,
    interviewerIds: row.interviewer_ids,
    meetingUrl: row.meeting_url ?? undefined,
    location: row.location ?? undefined,
    notes: row.notes ?? undefined,
    completionNote: row.completion_note ?? undefined,
    cancelNote: row.cancel_note ?? undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : undefined,
    externalProvider: row.external_provider ?? undefined,
    externalEventId: row.external_event_id ?? undefined,
    syncStatus: row.sync_status,
    syncError: row.sync_error ?? undefined,
    lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at) : undefined,
    createdById: row.created_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedAtRaw: row.updated_at,
  };
}

export function mapAiRow(row: AiRow): AIAnalysis {
  return {
    overallScore: row.overall_score,
    categories: row.category_scores as unknown as AIAnalysis["categories"],
    summary: row.summary ?? undefined,
    verdict: row.verdict ?? undefined,
    reasons: row.reasons ?? undefined,
    prospects: row.prospects ?? undefined,
    strengths: row.strengths,
    weaknesses: row.weaknesses,
    recommendations: row.recommendations,
    analyzedAt: new Date(row.analyzed_at),
  };
}
