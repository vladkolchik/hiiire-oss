export type LeadRequestedPlan = "starter" | "professional" | "enterprise";
export type LeadStatus = "new" | "contacted" | "qualified" | "rejected";

type ExistingLead = {
  requested_plan: LeadRequestedPlan;
  status: LeadStatus;
};

type EnterpriseRequestViewLead = {
  status: LeadStatus;
  decision_note: string | null;
};

export type EnterpriseLeadSubmissionDecision =
  | { action: "create" }
  | { action: "reopen" }
  | { action: "conflict"; message: string };

export type EnterpriseRequestStatusContent = {
  tone: "info" | "success" | "destructive";
  title: string;
  description: string;
  submitLabel: string;
  canResubmit: boolean;
};

const ACTIVE_ENTERPRISE_DUPLICATE_MESSAGE =
  "У вас уже есть заявка на Enterprise. Мы покажем её текущий статус на этой странице.";

const GENERIC_DUPLICATE_MESSAGE =
  "Заявка с этим email уже есть. Если нужно обновить данные, свяжитесь с нами, и мы поможем.";

export function decideEnterpriseLeadSubmission({
  existingLead,
}: {
  existingLead: ExistingLead | null;
}): EnterpriseLeadSubmissionDecision {
  if (!existingLead) {
    return { action: "create" };
  }

  if (existingLead.requested_plan === "enterprise" && existingLead.status === "rejected") {
    return { action: "reopen" };
  }

  if (existingLead.requested_plan === "enterprise") {
    return {
      action: "conflict",
      message: ACTIVE_ENTERPRISE_DUPLICATE_MESSAGE,
    };
  }

  return {
    action: "conflict",
    message: GENERIC_DUPLICATE_MESSAGE,
  };
}

function getRejectedDescription(decisionNote: string | null) {
  const normalizedNote = decisionNote?.trim();
  if (normalizedNote) {
    return `${normalizedNote} Вы можете обновить данные и отправить заявку снова.`;
  }

  return "Мы не смогли подтвердить подключение по прошлой заявке. Проверьте данные и попробуйте отправить заявку снова.";
}

export function getEnterpriseRequestStatusContent(
  lead: EnterpriseRequestViewLead | null
): EnterpriseRequestStatusContent | null {
  if (!lead) return null;

  if (lead.status === "rejected") {
    return {
      tone: "destructive",
      title: "Прошлая заявка отклонена",
      description: getRejectedDescription(lead.decision_note),
      submitLabel: "Отправить заявку снова",
      canResubmit: true,
    };
  }

  if (lead.status === "qualified") {
    return {
      tone: "success",
      title: "Заявка уже одобрена",
      description: "Мы уже подтвердили заявку на Enterprise. Проверьте почту или дождитесь сообщения от нашей команды.",
      submitLabel: "Ожидайте сообщение",
      canResubmit: false,
    };
  }

  if (lead.status === "contacted") {
    return {
      tone: "info",
      title: "Заявка в работе",
      description: "Команда уже рассматривает вашу заявку на Enterprise. Если понадобятся уточнения, мы свяжемся с вами.",
      submitLabel: "Заявка в работе",
      canResubmit: false,
    };
  }

  return {
    tone: "info",
    title: "Заявка уже отправлена",
    description: "Мы получили заявку на Enterprise. Как только появится решение, статус обновится на этой странице.",
    submitLabel: "Заявка уже отправлена",
    canResubmit: false,
  };
}
