import { readUserFacingApiErrorMessage } from "../api/user-facing-errors.ts";

export function getHrAssistantUserFacingErrorMessage(payload: unknown, fallback: string): string {
  return readUserFacingApiErrorMessage(payload, fallback);
}
