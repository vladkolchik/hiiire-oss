import "server-only";

import { deepseek } from "@ai-sdk/deepseek";

export const HR_ASSISTANT_DEFAULT_MODEL = "deepseek-v4-flash";
export const HR_ASSISTANT_COMPLEX_MODEL = "deepseek-v4-pro";

export type HrAssistantModelMode = "default" | "complex";

export function getHrAssistantModelId(
  mode: HrAssistantModelMode = "default",
): string {
  if (mode === "complex") {
    return (
      process.env.HR_ASSISTANT_DEEPSEEK_PRO_MODEL ||
      HR_ASSISTANT_COMPLEX_MODEL
    );
  }

  return process.env.HR_ASSISTANT_DEEPSEEK_MODEL || HR_ASSISTANT_DEFAULT_MODEL;
}

export function getHrAssistantModel(mode: HrAssistantModelMode = "default") {
  return deepseek(getHrAssistantModelId(mode));
}
