import type { Vacancy } from "@/types";

export const VACANCY_STATUS_LABELS: Record<Vacancy["status"], string> = {
  draft: "Черновик",
  active: "Активна",
  paused: "На паузе",
  closed: "Закрыта",
};

export function formatVacancyStatusLabel(status: string | null | undefined): string {
  if (!status) return "Неизвестный статус";
  return VACANCY_STATUS_LABELS[status as Vacancy["status"]] ?? "Неизвестный статус";
}
