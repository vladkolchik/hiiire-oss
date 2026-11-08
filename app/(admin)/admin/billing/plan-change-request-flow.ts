export type PlanKey = "trial" | "starter" | "professional" | "enterprise";

export type PlanChangeRequestStatus =
  | "submitted"
  | "in_review"
  | "contacted"
  | "approved"
  | "applied"
  | "rejected"
  | "canceled";

export type PlanChangeRequestKind =
  | "upgrade_to_enterprise"
  | "enterprise_exit"
  | "enterprise_terms_change"
  | "manual_plan_change";

export type PlanChangeRequestFlowRow = {
  status: PlanChangeRequestStatus;
  request_kind: PlanChangeRequestKind;
  target_plan: Exclude<PlanKey, "trial">;
};

export type EditablePlanChangeRequestStatus = "in_review" | "contacted" | "approved" | "rejected" | "canceled";

export type FlowStageKey =
  | "work"
  | "decision"
  | "terms"
  | "connection"
  | "terms_update"
  | "exit"
  | "manual"
  | "finished";

export type FlowStage = {
  key: FlowStageKey;
  label: string;
  description: string;
  state: "done" | "current" | "future";
  helper?: string;
};

export const REQUEST_KIND_LABEL: Record<PlanChangeRequestKind, string> = {
  upgrade_to_enterprise: "Переход на Enterprise",
  enterprise_exit: "Выход из Enterprise",
  enterprise_terms_change: "Изменение условий Enterprise",
  manual_plan_change: "Ручное изменение тарифа",
};

export const REQUEST_SOURCE_LABEL = {
  landing: "Лендинг",
  settings: "Настройки",
  admin: "Админка",
} as const;

export const WORK_DESCRIPTION = "Заявка у команды. Клиенту ничего не отправляем.";
export const DECISION_DESCRIPTION = "Решение отвечает на вопрос: продолжаем по этой заявке или нет.";
export const DECISION_SECONDARY_DESCRIPTION =
  "После одобрения можно будет заполнить условия Enterprise. Enterprise ещё не включится.";
export const EXIT_DECISION_SECONDARY_DESCRIPTION =
  "После одобрения можно будет подтвердить отключение и сменить тариф.";
export const MANUAL_DECISION_SECONDARY_DESCRIPTION = "После одобрения тариф можно будет изменить вручную.";
export const ENTERPRISE_TERMS_DESCRIPTION =
  "Это условия, по которым клиенту должен предоставляться тариф: срок, кредиты и дополнительные опции.";
export const MANUAL_PLAN_CHANGE_DESCRIPTION =
  "Это ручное изменение тарифа. Проверьте заявку и примените нужный тариф вручную.";

export const CLIENT_RESPONSE_PLACEHOLDER: Record<PlanChangeRequestKind, string> = {
  upgrade_to_enterprise: "Например: заявка одобрена, подготовим условия Enterprise",
  enterprise_terms_change: "Например: заявка одобрена, подготовим новые условия Enterprise",
  enterprise_exit: "Например: заявка одобрена, отключим Enterprise и сменим тариф",
  manual_plan_change: "Например: заявка одобрена, тариф изменим вручную",
};

export function isTerminalStatus(status: PlanChangeRequestStatus) {
  return status === "applied" || status === "rejected" || status === "canceled";
}

export function isEnterpriseTermsRequest(row: PlanChangeRequestFlowRow) {
  return (
    row.target_plan === "enterprise" &&
    (row.request_kind === "upgrade_to_enterprise" || row.request_kind === "enterprise_terms_change")
  );
}

export function decisionPrimaryAction(row: PlanChangeRequestFlowRow) {
  if (row.status === "submitted") {
    return { status: "in_review" as const, label: "Взять в работу" };
  }
  if (row.request_kind === "enterprise_exit") {
    return { status: "approved" as const, label: "Одобрить выход из Enterprise" };
  }
  if (row.request_kind === "manual_plan_change") {
    return { status: "approved" as const, label: "Одобрить изменение тарифа" };
  }
  return { status: "approved" as const, label: "Одобрить и перейти к условиям" };
}

export function decisionSecondaryDescription(row: PlanChangeRequestFlowRow) {
  if (row.status === "submitted") return null;
  if (row.request_kind === "enterprise_exit") return EXIT_DECISION_SECONDARY_DESCRIPTION;
  if (row.request_kind === "manual_plan_change") return MANUAL_DECISION_SECONDARY_DESCRIPTION;
  return DECISION_SECONDARY_DESCRIPTION;
}

export function currentStageKey(row: PlanChangeRequestFlowRow, hasOpenAgreement: boolean): FlowStageKey {
  if (isTerminalStatus(row.status)) return "finished";
  if (row.status === "submitted") return "work";
  if (row.request_kind === "manual_plan_change" && row.status === "approved") return "manual";
  if (row.request_kind === "manual_plan_change") return "decision";
  if (row.status === "in_review" || row.status === "contacted") return "decision";
  if (row.status === "approved" && row.request_kind === "enterprise_exit") return "exit";
  if (row.status === "approved" && isEnterpriseTermsRequest(row) && !hasOpenAgreement) return "terms";
  if (row.status === "approved" && row.request_kind === "enterprise_terms_change" && hasOpenAgreement) return "terms_update";
  if (row.status === "approved" && isEnterpriseTermsRequest(row) && hasOpenAgreement) return "connection";
  return "decision";
}

function stageState(stage: FlowStageKey, current: FlowStageKey, row: PlanChangeRequestFlowRow): FlowStage["state"] {
  if (current === "finished") {
    if (row.status === "applied") return "done";
    return stage === "work" || stage === "decision" ? "done" : "future";
  }

  const order: FlowStageKey[] = ["work", "decision", "terms", "connection", "terms_update", "exit", "manual", "finished"];
  if (stage === current) return "current";
  return order.indexOf(stage) < order.indexOf(current) ? "done" : "future";
}

export function flowStages(row: PlanChangeRequestFlowRow, hasOpenAgreement: boolean): FlowStage[] {
  const current = currentStageKey(row, hasOpenAgreement);
  const stages: Array<Omit<FlowStage, "state">> =
    row.request_kind === "manual_plan_change"
      ? [
          { key: "work", label: "В работе", description: WORK_DESCRIPTION },
          { key: "decision", label: "Решение", description: DECISION_DESCRIPTION },
          { key: "manual", label: "Ручное изменение тарифа", description: MANUAL_PLAN_CHANGE_DESCRIPTION },
        ]
      : row.request_kind === "enterprise_exit"
        ? [
            { key: "work", label: "В работе", description: WORK_DESCRIPTION },
            { key: "decision", label: "Решение", description: DECISION_DESCRIPTION },
            { key: "exit", label: "Отключение Enterprise", description: "Подтвердите выход, чтобы отключить Enterprise и сменить тариф." },
          ]
        : [
            { key: "work", label: "В работе", description: WORK_DESCRIPTION },
            { key: "decision", label: "Решение", description: DECISION_DESCRIPTION },
            {
              key: "terms",
              label: "Условия Enterprise",
              description: ENTERPRISE_TERMS_DESCRIPTION,
              helper: row.request_kind === "enterprise_terms_change" ? "новые условия" : "после одобрения",
            },
            row.request_kind === "enterprise_terms_change"
              ? { key: "terms_update", label: "Обновление условий", description: "Примените новые условия, когда они готовы." }
              : { key: "connection", label: "Подключение", description: "Включите Enterprise, когда условия готовы или счёт оплачен." },
          ];

  return stages.map((stage) => ({
    ...stage,
    state: stageState(stage.key, current, row),
  }));
}

export function currentStageLabel(row: PlanChangeRequestFlowRow, hasOpenAgreement: boolean) {
  const stage = flowStages(row, hasOpenAgreement).find((item) => item.key === currentStageKey(row, hasOpenAgreement));
  return stage?.label ?? "Решение";
}
