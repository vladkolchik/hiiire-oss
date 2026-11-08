import { NextResponse } from "next/server";

export const INTERVIEW_CHANGED_MESSAGE = "Собеседование уже изменилось. Обновите календарь и попробуйте ещё раз.";

export function assertFreshInterviewPrecondition(currentUpdatedAt: string, expectedUpdatedAt: string) {
  if (currentUpdatedAt === expectedUpdatedAt) return null;

  return NextResponse.json({ error: "INTERVIEW_CHANGED", message: INTERVIEW_CHANGED_MESSAGE }, { status: 409 });
}
