import type { Candidate } from "@/types";

export const CANDIDATE_STATUS_LABELS: Record<Candidate["status"], string> = {
  new: "Новый",
  reviewing: "Рассмотрение",
  "security-check": "Проверка СБ",
  "interview-scheduled": "Собеседование",
  interviewed: "Опрошен",
  offer: "Оффер",
  hired: "Принят",
  rejected: "Отклонён",
};

export function formatCandidateStatusLabel(status: string | null | undefined): string {
  if (!status) return "Неизвестный статус";
  return CANDIDATE_STATUS_LABELS[status as Candidate["status"]] ?? "Неизвестный статус";
}
