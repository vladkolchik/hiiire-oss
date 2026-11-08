export type HrAssistantRole = "user" | "assistant" | "tool";

export type HrAssistantThreadScope =
  | "company"
  | "vacancy"
  | "candidate"
  | "interview"
  | "support"
  | "client_account";

export type HrAssistantThreadMode =
  | "general"
  | "screening"
  | "outreach"
  | "interview"
  | "pipeline"
  | "support";

export type HrAssistantApprovalMode = "manual" | "auto";

export type HrAssistantPolicyDecision =
  | "auto_approved"
  | "manual_approval_required"
  | "blocked"
  | "not_supported_yet"
  | "failed_access_check"
  | "failed_credit_check";

export type HrAssistantActionCardKind =
  | "tool_run"
  | "draft"
  | "approval_request"
  | "blocked"
  | "result"
  | "failed";
