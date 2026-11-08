export type BillingStatus = "active" | "grace" | "inactive";
export type PlanKey = "trial" | "starter" | "professional" | "enterprise";
export type BillablePlan = "starter" | "professional";
export type PlanActionKind = "same" | "upgrade" | "downgrade" | "subscribe";

export type CurrentPlanStatusBadge = {
  label: string;
  className: string;
};

export type PaidPlanButtonLabelInput = {
  targetPlan: BillablePlan;
  currentPlan: PlanKey;
  billingStatus: BillingStatus;
  userRole: string | null | undefined;
  checkoutLoadingPlan: BillablePlan | null;
  activePlanChangeRequestTargetPlan: PlanKey | null;
};

export type MatchingScheduledPlanInput = {
  targetPlan: BillablePlan;
  scheduledPlan: PlanKey | null;
  scheduledPlanEffectiveAt: string | null;
  expectedEffectiveAt: string | null;
};

function parseTime(value: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function getCurrentPlanStatusBadge(status: BillingStatus): CurrentPlanStatusBadge {
  if (status === "grace") {
    return {
      label: "Ожидает оплату",
      className: "shrink-0 border-amber-500 bg-amber-50 text-amber-700",
    };
  }

  if (status === "inactive") {
    return {
      label: "Не активен",
      className: "shrink-0 border-destructive/50 bg-destructive/10 text-destructive",
    };
  }

  return {
    label: "Активен",
    className: "shrink-0 bg-primary text-primary-foreground",
  };
}

export function getPlanActionKind(currentPlan: PlanKey, targetPlan: BillablePlan): PlanActionKind {
  if (currentPlan === "trial") return "subscribe";
  if (currentPlan === targetPlan) return "same";
  if (currentPlan === "starter" && targetPlan === "professional") return "upgrade";
  return "downgrade";
}

export function isMatchingScheduledPlan(input: MatchingScheduledPlanInput): boolean {
  if (input.scheduledPlan !== input.targetPlan) return false;
  const scheduledTime = parseTime(input.scheduledPlanEffectiveAt);
  const expectedTime = parseTime(input.expectedEffectiveAt);
  return scheduledTime !== null && scheduledTime === expectedTime;
}

export function getPaidPlanButtonLabel(input: PaidPlanButtonLabelInput): string {
  if (input.currentPlan === input.targetPlan && input.billingStatus === "active") return "Текущий тариф";
  if (input.userRole !== "admin") return "Недоступно";
  if (input.currentPlan === "enterprise" && input.activePlanChangeRequestTargetPlan === input.targetPlan) return "Уже есть заявка";
  if (input.currentPlan === "enterprise" && input.activePlanChangeRequestTargetPlan) return "Заявка в работе";
  if (input.currentPlan === "enterprise") return "Оставить заявку";
  if (input.checkoutLoadingPlan === input.targetPlan) return "Переход к оплате…";

  const action = getPlanActionKind(input.currentPlan, input.targetPlan);
  if (action === "upgrade") return "Повысить";
  if (action === "downgrade") return "Понизить";
  return "Оформить";
}
