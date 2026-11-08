import type { HrAssistantApprovalMode, HrAssistantPolicyDecision } from "./types";

export type HrAssistantToolRisk =
  | "read"
  | "draft"
  | "crm_write"
  | "calendar_write"
  | "ai_cost"
  | "external"
  | "bulk"
  | "destructive";

export type HrAssistantPolicyInput = {
  mode: HrAssistantApprovalMode;
  risk: HrAssistantToolRisk;
  isSupported: boolean;
  hasAccess: boolean;
  hasCredits: boolean;
};

export type HrAssistantPolicyResult = {
  decision: HrAssistantPolicyDecision;
  userMessage: string;
};

export function decideHrAssistantPolicy(input: HrAssistantPolicyInput): HrAssistantPolicyResult {
  if (!input.isSupported) {
    return {
      decision: "not_supported_yet",
      userMessage: "Пока HR-ассистент может подготовить черновик, но не выполняет это действие.",
    };
  }

  if (!input.hasAccess) {
    return {
      decision: "failed_access_check",
      userMessage: "Это действие недоступно для вашей роли или текущего контекста.",
    };
  }

  if (!input.hasCredits) {
    return {
      decision: "failed_credit_check",
      userMessage: "Недостаточно доступных кредитов для запуска AI-действия.",
    };
  }

  if (input.risk === "read" || input.risk === "draft") {
    return {
      decision: "auto_approved",
      userMessage: "Действие выполнено автоматически.",
    };
  }

  if (input.mode === "manual") {
    return {
      decision: "manual_approval_required",
      userMessage: "Проверьте действие перед применением.",
    };
  }

  if (input.risk === "crm_write" || input.risk === "calendar_write" || input.risk === "ai_cost") {
    return {
      decision: "manual_approval_required",
      userMessage: "Перед применением нужно подтверждение.",
    };
  }

  return {
    decision: "manual_approval_required",
    userMessage: "Это действие требует подтверждения.",
  };
}
