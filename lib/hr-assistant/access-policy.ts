import { isAiAllowed, resolveBillingStatus, type CompanyPlanSnapshot } from "../billing/subscription-status.ts";
import type { PlanKey } from "../billing/plans.ts";

export const HR_ASSISTANT_ALLOWED_PLANS = ["trial", "starter", "professional", "enterprise"] as const satisfies readonly PlanKey[];
export const HR_ASSISTANT_PLAN_REQUIRED_ERROR = "PLAN_REQUIRED";
export const HR_ASSISTANT_PLAN_REQUIRED_MESSAGE = "HR-ассистент доступен на активном тарифе.";
export const HR_ASSISTANT_PLAN_REQUIRED_DESCRIPTION =
  "Подключите Starter, Professional или Enterprise, чтобы создавать чаты и работать с ассистентом.";

export type HrAssistantPlanAccess = {
  allowed: boolean;
  currentPlan: PlanKey;
  billingStatus: ReturnType<typeof resolveBillingStatus>;
};

export function requireHrAssistantPlanAccessForSnapshot(snapshot: CompanyPlanSnapshot, nowMs = Date.now()): boolean {
  return HR_ASSISTANT_ALLOWED_PLANS.includes(snapshot.currentPlan) && isAiAllowed(snapshot, nowMs);
}
