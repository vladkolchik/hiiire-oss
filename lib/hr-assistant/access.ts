import "server-only";

import { NextResponse } from "next/server";

import { loadCompanyPlanSnapshot, resolveBillingStatus } from "@/lib/billing/subscription";
import {
  HR_ASSISTANT_PLAN_REQUIRED_DESCRIPTION,
  HR_ASSISTANT_PLAN_REQUIRED_ERROR,
  HR_ASSISTANT_PLAN_REQUIRED_MESSAGE,
  requireHrAssistantPlanAccessForSnapshot,
  type HrAssistantPlanAccess,
} from "@/lib/hr-assistant/access-policy";

export {
  HR_ASSISTANT_ALLOWED_PLANS,
  HR_ASSISTANT_PLAN_REQUIRED_DESCRIPTION,
  HR_ASSISTANT_PLAN_REQUIRED_ERROR,
  HR_ASSISTANT_PLAN_REQUIRED_MESSAGE,
  requireHrAssistantPlanAccessForSnapshot,
  type HrAssistantPlanAccess,
} from "@/lib/hr-assistant/access-policy";

export async function loadHrAssistantPlanAccess(admin: any, companyId: string): Promise<HrAssistantPlanAccess> {
  const snapshot = await loadCompanyPlanSnapshot(admin, companyId);
  return {
    allowed: requireHrAssistantPlanAccessForSnapshot(snapshot),
    currentPlan: snapshot.currentPlan,
    billingStatus: resolveBillingStatus(snapshot),
  };
}

export async function requireHrAssistantPlanAccess(admin: any, companyId: string): Promise<boolean> {
  return (await loadHrAssistantPlanAccess(admin, companyId)).allowed;
}

export function hrAssistantPlanAccessResponse() {
  return NextResponse.json(
    {
      error: HR_ASSISTANT_PLAN_REQUIRED_ERROR,
      message: HR_ASSISTANT_PLAN_REQUIRED_MESSAGE,
      description: HR_ASSISTANT_PLAN_REQUIRED_DESCRIPTION,
    },
    { status: 403 }
  );
}
