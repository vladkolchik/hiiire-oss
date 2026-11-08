import type { EmploymentForm } from "@/lib/vacancies/employment-forms";

// Core Types for hiiire.com

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  company: string;
  companyId?: string;
  role: 'admin' | 'hr' | 'recruiter';
  avatar?: string;
  createdAt: Date;
}

export interface Company {
  id: string;
  name: string;
  description?: string;
  website?: string;
  logo?: string;
  industry?: string;
  size?: string;
}

export interface Vacancy {
  id: string;
  title: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  salary?: {
    min?: number;
    max?: number;
    currency: string;
  };
  location: string;
  employmentType: 'full-time' | 'part-time' | 'contract' | 'internship';
  experienceLevel: 'trainee' | 'junior' | 'middle' | 'senior' | 'lead';
  status: 'draft' | 'active' | 'paused' | 'closed';
  closedAt?: string | null;

  /**
   * Real-world hiring fields (non-IT friendly)
   * All optional to keep MVP flows simple.
   */
  department?: string; // e.g. "Sales", "Warehouse", "Support"
  hiringManager?: string; // requester / manager name
  headcount?: number; // number of openings (1..)
  workSchedule?: string; // e.g. "5/2", "2/2", "сменный", "гибкий"
  employmentForms: EmploymentForm[]; // legal arrangements
  salaryPeriod?: "month" | "hour" | "shift";
  salaryTax?: "gross" | "net" | null;
  bonus?: string; // bonuses / KPI
  benefits?: string; // perks
  probationMonths?: number | null;
  travelPercent?: number | null;
  mandatoryRequirements?: string; // med book, driver license, clearances, etc.
  hiringProcess?: string; // steps / SLA / contacts

  companyId: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  hhruVacancyId?: string; // HH.ru integration
}

export interface Candidate {
  id: string;
  name: string;
  position: string;
  vacancyId: string;
  createdById: string;
  resumeUrl?: string;
  resumeText?: string;
  desiredSalaryText?: string | null;
  desiredSalaryAmount?: number | null;
  desiredSalaryCurrency?: string | null;
  desiredSalarySource?: "hh" | "ai_parser" | "regex" | null;
  avatar?: string;
  contacts?: CandidateContact[];
  
  // AI Analysis Results
  matchPercentage: number | null; // 0-100 (null пока AI не финализировал результат)
  aiAnalysis?: AIAnalysis;
  
  // Status tracking
  status: 'new' | 'reviewing' | 'security-check' | 'interview-scheduled' | 'interviewed' | 'offer' | 'hired' | 'rejected';
  source: 'hh.ru' | 'manual' | 'referral' | 'other';
  
  // Notes and comments
  comment?: string;
  
  // Metadata
  appliedAt: Date;
  updatedAt: Date;
  hhruResumeId?: string; // HH.ru integration
  hhAutoSurveyText?: string; // HH.ru chat bot auto-survey snapshot
}

export interface CandidateContact {
  id: string;
  candidateId: string;
  type: string;
  value: string;
  label?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AIAnalysis {
  overallScore: number;
  categories: {
    skills: CategoryScore;
    experience: CategoryScore;
    education: CategoryScore;
    achievements: CategoryScore;
    cultural_fit: CategoryScore;
  };
  /**
   * Optional richer AI output (planned): short resume summary.
   * Not yet persisted in DB in current schema; safe to be undefined.
   */
  summary?: string;
  /**
   * Optional richer AI output (planned): final conclusion / verdict.
   * Not yet persisted in DB in current schema; safe to be undefined.
   */
  verdict?: string;
  /**
   * Optional richer AI output (planned): prospects / potential in role.
   * Not yet persisted in DB in current schema; safe to be undefined.
   */
  prospects?: string;
  /**
   * Optional richer AI output (planned): 3 bullet reasons explaining the score.
   * Not yet persisted in DB in current schema; safe to be undefined.
   */
  reasons?: string[];
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  analyzedAt: Date;
}

export interface CategoryScore {
  score: number; // 0-100
  feedback: string;
  details?: string[];
  applicable?: boolean;
  includedInMatch?: boolean;
  criterionState?: "required" | "optional" | "not_required";
  criterionEvidence?: string[];
}

export interface Interview {
  id: string;
  companyId: string;
  candidateId: string;
  vacancyId: string;
  scheduledAt: Date;
  durationMinutes: number;
  type: 'phone' | 'video' | 'in-person' | 'technical';
  status: 'scheduled' | 'completed' | 'cancelled';
  interviewerIds: string[];
  meetingUrl?: string;
  location?: string;
  notes?: string;
  completionNote?: string;
  cancelNote?: string;
  completedAt?: Date;
  cancelledAt?: Date;
  externalProvider?: "google_calendar";
  externalEventId?: string;
  syncStatus: "not_connected" | "pending" | "synced" | "failed";
  syncError?: string;
  lastSyncedAt?: Date;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  updatedAtRaw: string;
}

export interface InterviewPersonSummary {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
}

export type InterviewAccessLevel = "manage" | "interviewer_only";

export interface FullInterviewListItem extends Interview {
  accessLevel: "manage";
  candidate: Pick<Candidate, "id" | "name" | "avatar" | "status">;
  vacancy: Pick<Vacancy, "id" | "title">;
  displayTitle: string;
  displaySubtitle: string;
  interviewers: InterviewPersonSummary[];
}

export interface LimitedInterviewListItem {
  id: string;
  accessLevel: "interviewer_only";
  scheduledAt: Date;
  durationMinutes: number;
  type: Interview["type"];
  status: Interview["status"];
  displayTitle: string;
  displaySubtitle: string;
  meetingUrl?: string;
  location?: string;
  interviewers: InterviewPersonSummary[];
}

export type InterviewListItem = FullInterviewListItem | LimitedInterviewListItem;

export interface InterviewFeedback {
  rating: number; // 1-5
  strengths: string[];
  concerns: string[];
  recommendation: 'strong-yes' | 'yes' | 'maybe' | 'no' | 'strong-no';
  notes: string;
  providedBy: string; // User ID
  providedAt: Date;
}

export interface Activity {
  id: string;
  type: 'vacancy_created' | 'candidate_added' | 'interview_scheduled' | 'candidate_status_changed' | 'ai_analysis_completed';
  userId: string;
  entityType: 'vacancy' | 'candidate' | 'interview';
  entityId: string;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

// Mock Auth Types
export interface AuthResponse {
  user: User;
  token: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

// Stats and Analytics
export interface DashboardStats {
  role?: User["role"];
  activeVacancies: number;
  totalCandidates: number;
  interviewsThisWeek: number;
  ownInterviewsUntilWeekEnd?: number;
  employeeInterviewsUntilWeekEnd?: number;
  serverNow?: string;
  weekEndAt?: string;
  avgResponseTime: number; // hours
  avgMatchPercentage: number;
  candidatesByStatus: Record<Candidate['status'], number>;
}

export interface ChartData {
  date: string;
  value: number;
  label?: string;
}

// Lead Request Types
export interface LeadRequest {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  companySize?: string;
  message?: string;
  requestedPlan: 'starter' | 'professional' | 'enterprise';
  status: 'new' | 'contacted' | 'qualified' | 'rejected';
  createdAt: Date;
}
