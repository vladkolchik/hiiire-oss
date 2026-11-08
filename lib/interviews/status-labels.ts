import type { Interview } from "@/types";

export const INTERVIEW_STATUS_LABELS: Record<Interview["status"], string> = {
  scheduled: "Запланировано",
  completed: "Завершено",
  cancelled: "Отменено",
};

export function formatInterviewStatusLabel(status: string | null | undefined): string {
  if (!status) return "Неизвестный статус";
  return INTERVIEW_STATUS_LABELS[status as Interview["status"]] ?? "Неизвестный статус";
}
