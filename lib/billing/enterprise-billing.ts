import type { PlanKey } from "@/lib/billing/plans";

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

export type PlanChangeRequestSource = "landing" | "settings" | "admin";

export type EnterpriseAgreementStatus = "draft" | "pending_payment" | "active" | "ended" | "canceled";

export const ENTERPRISE_AGREEMENT_FIELDS =
  "id,company_id,source_request_id,replaces_agreement_id,ended_by_request_id,status,starts_at,ends_at,is_open_ended,credits_limit,terms_summary,internal_note,created_by,activated_by,activated_at,ended_by,ended_at,ended_reason,created_at,updated_at";

export type ManualInvoiceStatus =
  | "draft"
  | "issued"
  | "paid"
  | "expired"
  | "canceled"
  | "refunded"
  | "requires_review";

export const ENTERPRISE_AGREEMENT_CANCEL_BLOCKING_INVOICE_STATUSES = [
  "draft",
  "issued",
  "paid",
  "requires_review",
] as const satisfies readonly ManualInvoiceStatus[];

export const ACTIVE_PLAN_CHANGE_REQUEST_STATUSES = [
  "submitted",
  "in_review",
  "contacted",
  "approved",
] as const satisfies readonly PlanChangeRequestStatus[];

export const FINISHED_PLAN_CHANGE_REQUEST_STATUSES = [
  "applied",
  "rejected",
  "canceled",
] as const satisfies readonly PlanChangeRequestStatus[];

export const ENTERPRISE_BILLING_STATUS_COPY: Record<
  PlanChangeRequestStatus,
  { title: string; description: string }
> = {
  submitted: {
    title: "Заявка отправлена",
    description: "Мы получили заявку и скоро вернёмся с ответом.",
  },
  in_review: {
    title: "Заявка на рассмотрении",
    description: "Мы проверяем условия тарифа и подготовим следующий шаг.",
  },
  contacted: {
    title: "Мы связались с вами",
    description: "Проверьте почту или дождитесь сообщения от нашей команды.",
  },
  approved: {
    title: "Заявка одобрена",
    description: "Мы согласовали условия и подготовим изменение тарифа.",
  },
  applied: {
    title: "Тариф изменён",
    description: "Изменение тарифа применено.",
  },
  rejected: {
    title: "Заявка отклонена",
    description: "Мы не смогли применить изменение тарифа по этой заявке.",
  },
  canceled: {
    title: "Заявка отменена",
    description: "Заявка больше не находится в работе.",
  },
};

const ENTERPRISE_EXIT_STATUS_COPY: Partial<Record<PlanChangeRequestStatus, { title: string; description: string }>> = {
  submitted: {
    title: "Переход из Enterprise запрошен",
    description: "Enterprise остаётся активным, пока мы проверяем заявку. После применения перехода выбранный тариф нужно будет оплатить.",
  },
  in_review: {
    title: "Переход на рассмотрении",
    description: "Проверяем условия и подготовим следующий шаг. Enterprise пока остаётся активным, а выбранный тариф нужно будет оплатить после применения перехода.",
  },
  contacted: {
    title: "Мы связались с вами",
    description: "Проверьте почту или дождитесь сообщения команды. Enterprise пока остаётся активным, а выбранный тариф нужно будет оплатить после применения перехода.",
  },
  approved: {
    title: "Переход одобрен",
    description: "Мы согласовали переход и применим изменение тарифа. До применения Enterprise остаётся активным, а выбранный тариф нужно будет оплатить после перехода.",
  },
};

export function getPlanChangeRequestStatusCopy(
  requestKind: PlanChangeRequestKind,
  status: PlanChangeRequestStatus,
): { title: string; description: string } {
  if (requestKind === "enterprise_exit") {
    return ENTERPRISE_EXIT_STATUS_COPY[status] ?? ENTERPRISE_BILLING_STATUS_COPY[status];
  }

  return ENTERPRISE_BILLING_STATUS_COPY[status];
}

export function isActivePlanChangeRequestStatus(
  value: unknown,
): value is (typeof ACTIVE_PLAN_CHANGE_REQUEST_STATUSES)[number] {
  return ACTIVE_PLAN_CHANGE_REQUEST_STATUSES.includes(value as never);
}

export function isFinishedPlanChangeRequestStatus(
  value: unknown,
): value is (typeof FINISHED_PLAN_CHANGE_REQUEST_STATUSES)[number] {
  return FINISHED_PLAN_CHANGE_REQUEST_STATUSES.includes(value as never);
}

export function getPlanChangeRequestKind(currentPlan: PlanKey, targetPlan: PlanKey): PlanChangeRequestKind {
  if (targetPlan === "enterprise" && currentPlan !== "enterprise") return "upgrade_to_enterprise";
  if (currentPlan === "enterprise" && (targetPlan === "starter" || targetPlan === "professional")) {
    return "enterprise_exit";
  }
  if (currentPlan === "enterprise" && targetPlan === "enterprise") return "enterprise_terms_change";
  return "manual_plan_change";
}

export type EnterpriseAgreementGuardResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "AGREEMENT_NOT_ACTIVATABLE"
        | "ACTIVE_AGREEMENT_EXISTS"
        | "REPLACED_AGREEMENT_NOT_FOUND"
        | "REPLACED_AGREEMENT_COMPANY_MISMATCH"
        | "REPLACED_AGREEMENT_NOT_ACTIVE"
        | "STARTS_AT_INVALID"
        | "ENDS_AT_REQUIRED"
        | "ENDS_AT_MUST_BE_AFTER_STARTS_AT"
        | "CREDITS_LIMIT_INVALID"
        | "TERMS_SUMMARY_REQUIRED"
        | "AGREEMENT_NOT_ACTIVE"
        | "END_REASON_REQUIRED"
        | "TARGET_PLAN_INVALID";
    };

export type EnterpriseAgreementActivationInput = {
  status: EnterpriseAgreementStatus;
  startsAt: string | Date | null | undefined;
  endsAt: string | Date | null | undefined;
  isOpenEnded: boolean;
  creditsLimit: number | null | undefined;
  termsSummary: string | null | undefined;
  hasActiveAgreementForCompany?: boolean;
  replacesAgreementId?: string | null | undefined;
};

export type EnterpriseAgreementEndInput = {
  status: EnterpriseAgreementStatus;
  reason: string | null | undefined;
  targetPlan?: PlanKey | null | undefined;
};

export type EnterpriseAgreementCancelInput = {
  status: EnterpriseAgreementStatus;
  hasBlockingInvoice: boolean;
};

export type EnterpriseAgreementCancelGuardResult =
  | { ok: true }
  | { ok: false; reason: "AGREEMENT_NOT_CANCELABLE" | "AGREEMENT_HAS_OPEN_INVOICE" };

export type EnterpriseAgreementTermsInput = {
  startsAt: string;
  endsAt?: string | null;
  isOpenEnded: boolean;
  creditsLimit?: number | null;
  termsSummary: string;
  internalNote?: string | null;
};

export type EnterpriseAgreementRow = {
  id: string;
  company_id: string;
  source_request_id: string | null;
  replaces_agreement_id: string | null;
  ended_by_request_id: string | null;
  status: EnterpriseAgreementStatus;
  starts_at: string;
  ends_at: string | null;
  is_open_ended: boolean;
  credits_limit: number | null;
  terms_summary: string | null;
  internal_note: string | null;
  created_by: string;
  activated_by: string | null;
  activated_at: string | null;
  ended_by: string | null;
  ended_at: string | null;
  ended_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type PlanChangeRequestLookupRow = {
  id: string;
  company_id: string;
  status: PlanChangeRequestStatus;
  current_plan: PlanKey;
  target_plan: "starter" | "professional" | "enterprise";
  request_kind: PlanChangeRequestKind;
};

function parseDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function canSaveEnterpriseAgreementTerms(
  input: EnterpriseAgreementActivationInput,
): EnterpriseAgreementGuardResult {
  const startsAt = parseDate(input.startsAt);
  if (!startsAt) return { ok: false, reason: "STARTS_AT_INVALID" };

  if (!input.isOpenEnded && !input.endsAt) {
    return { ok: false, reason: "ENDS_AT_REQUIRED" };
  }

  const endsAt = parseDate(input.endsAt);
  if (!input.isOpenEnded && (!endsAt || endsAt <= startsAt)) {
    return { ok: false, reason: "ENDS_AT_MUST_BE_AFTER_STARTS_AT" };
  }

  if (input.creditsLimit !== null && input.creditsLimit !== undefined) {
    if (!Number.isInteger(input.creditsLimit) || input.creditsLimit < 0) {
      return { ok: false, reason: "CREDITS_LIMIT_INVALID" };
    }
  }

  if (!input.termsSummary?.trim()) {
    return { ok: false, reason: "TERMS_SUMMARY_REQUIRED" };
  }

  return { ok: true };
}

export function canActivateEnterpriseAgreement(
  input: EnterpriseAgreementActivationInput,
): EnterpriseAgreementGuardResult {
  if (input.status !== "pending_payment") {
    return { ok: false, reason: "AGREEMENT_NOT_ACTIVATABLE" };
  }
  if (input.hasActiveAgreementForCompany && !input.replacesAgreementId) {
    return { ok: false, reason: "ACTIVE_AGREEMENT_EXISTS" };
  }

  return canSaveEnterpriseAgreementTerms(input);
}

export function canEndEnterpriseAgreement(input: EnterpriseAgreementEndInput): EnterpriseAgreementGuardResult {
  if (input.status !== "active") return { ok: false, reason: "AGREEMENT_NOT_ACTIVE" };
  if (!input.reason?.trim()) return { ok: false, reason: "END_REASON_REQUIRED" };
  if (input.targetPlan && input.targetPlan !== "starter" && input.targetPlan !== "professional") {
    return { ok: false, reason: "TARGET_PLAN_INVALID" };
  }
  return { ok: true };
}

export function canCancelEnterpriseAgreement(input: EnterpriseAgreementCancelInput): EnterpriseAgreementCancelGuardResult {
  if (input.status !== "draft") return { ok: false, reason: "AGREEMENT_NOT_CANCELABLE" };
  if (input.hasBlockingInvoice) return { ok: false, reason: "AGREEMENT_HAS_OPEN_INVOICE" };
  return { ok: true };
}

export function normalizeEnterpriseAgreementTerms(input: EnterpriseAgreementTermsInput) {
  return {
    starts_at: input.startsAt,
    ends_at: input.isOpenEnded ? null : input.endsAt ?? null,
    is_open_ended: input.isOpenEnded,
    credits_limit: input.creditsLimit ?? null,
    terms_summary: input.termsSummary,
    internal_note: input.internalNote?.trim() || null,
  };
}

export function toEnterpriseAgreementResponse(row: EnterpriseAgreementRow, companyName?: string | null) {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: companyName ?? null,
    sourceRequestId: row.source_request_id,
    replacesAgreementId: row.replaces_agreement_id,
    endedByRequestId: row.ended_by_request_id,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isOpenEnded: row.is_open_ended,
    creditsLimit: row.credits_limit,
    termsSummary: row.terms_summary,
    internalNote: row.internal_note,
    activatedAt: row.activated_at,
    endedAt: row.ended_at,
    endedReason: row.ended_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
