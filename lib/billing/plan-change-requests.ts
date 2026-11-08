import {
  getPlanChangeRequestKind,
  type PlanChangeRequestKind,
  type PlanChangeRequestSource,
} from "./enterprise-billing.ts";
import type { PlanKey } from "./plans.ts";

export type CompanyRole = "admin" | "hr" | "recruiter";
export type RequestAccessDestination = "lead" | "billing_request" | "forbidden";

export type ResolveRequestAccessDestinationInput = {
  isAuthenticated: boolean;
  hasCompany: boolean;
  role: CompanyRole | null;
};

export type BuildPlanChangeRequestInsertInput = {
  companyId: string;
  requestedBy: string;
  currentPlan: PlanKey;
  targetPlan: Exclude<PlanKey, "trial">;
  source: PlanChangeRequestSource;
  userMessage?: string | null;
};

export type PlanChangeRequestInsert = {
  company_id: string;
  requested_by: string;
  current_plan: PlanKey;
  target_plan: Exclude<PlanKey, "trial">;
  request_kind: PlanChangeRequestKind;
  source: PlanChangeRequestSource;
  status: "submitted";
  user_message: string | null;
};

export function resolveRequestAccessDestination(
  input: ResolveRequestAccessDestinationInput,
): RequestAccessDestination {
  if (!input.isAuthenticated || !input.hasCompany) return "lead";
  if (input.role === "admin") return "billing_request";
  return "forbidden";
}

export function buildPlanChangeRequestInsert(input: BuildPlanChangeRequestInsertInput): PlanChangeRequestInsert {
  const userMessage = input.userMessage?.trim() || null;

  return {
    company_id: input.companyId,
    requested_by: input.requestedBy,
    current_plan: input.currentPlan,
    target_plan: input.targetPlan,
    request_kind: getPlanChangeRequestKind(input.currentPlan, input.targetPlan),
    source: input.source,
    status: "submitted",
    user_message: userMessage,
  };
}
