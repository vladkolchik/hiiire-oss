export const FIRST_AI_ONBOARDING_REFRESH_EVENT = "hiiire:first-ai-onboarding-refresh";

export type FirstAiOnboardingClientEventDetail = {
  completed?: boolean;
  dismissed?: boolean;
};

export function notifyFirstAiOnboardingChanged(detail?: FirstAiOnboardingClientEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FIRST_AI_ONBOARDING_REFRESH_EVENT, { detail }));
}
