import type { Interview } from "@/types";

export const INTERVIEW_TYPE_LABELS: Record<Interview["type"], string> = {
  phone: "Телефон",
  video: "Видео",
  "in-person": "Офис",
  technical: "Техническое",
};

export function formatInterviewTypeLabel(type: string | null | undefined): string {
  if (!type) return "Неизвестный тип";
  return INTERVIEW_TYPE_LABELS[type as Interview["type"]] ?? "Неизвестный тип";
}
