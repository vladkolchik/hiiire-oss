import type { Candidate, Vacancy } from "@/types";
import { format } from "date-fns";

export type PeriodType = "month" | "quarter";

export function getCurrentStatus(vacancies: Vacancy[], candidates: Candidate[]) {
  const vacancyByStatus = vacancies.reduce<Record<Vacancy["status"], number>>(
    (acc, v) => {
      acc[v.status] = (acc[v.status] || 0) + 1;
      return acc;
    },
    { draft: 0, active: 0, paused: 0, closed: 0 }
  );

  const candidateByStatus = candidates.reduce<Record<Candidate["status"], number>>(
    (acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    },
    {
      new: 0,
      reviewing: 0,
      "security-check": 0,
      "interview-scheduled": 0,
      interviewed: 0,
      offer: 0,
      hired: 0,
      rejected: 0,
    }
  );

  const scores = candidates.map((c) => c.matchPercentage).filter((v): v is number => typeof v === "number");
  const avgMatch =
    scores.length === 0
      ? 0
      : Math.round(((scores.reduce((sum, v) => sum + v, 0) / scores.length) * 10)) / 10;

  return { vacancyByStatus, candidateByStatus, avgMatch };
}

export function getMatchHistogram(candidates: Candidate[], buckets: number[] = [60, 70, 80, 90, 100]) {
  const result = buckets.slice(0, -1).map((b, i) => {
    const from = b;
    const to = buckets[i + 1];
    const count = candidates.filter((c) => (c.matchPercentage ?? -1) >= from && (c.matchPercentage ?? -1) < to).length;
    return { range: `${from}-${to - 1}`, count };
  });
  return result;
}

export function getSourceBreakdown(candidates: Candidate[]) {
  return candidates.reduce<Record<Candidate["source"], number>>(
    (acc, c) => {
      acc[c.source] = (acc[c.source] || 0) + 1;
      return acc;
    },
    { "hh.ru": 0, manual: 0, referral: 0, other: 0 }
  );
}

export function getPipelineMetrics(candidates: Candidate[]) {
  const { candidateByStatus } = getCurrentStatus([], candidates);
  const stages = [
    { key: "new", label: "Новые" },
    { key: "reviewing", label: "На рассмотрении" },
    { key: "security-check", label: "Проверка СБ" },
    { key: "interview-scheduled", label: "Назначены" },
    { key: "interviewed", label: "Опрошены" },
    { key: "offer", label: "Оффер" },
    { key: "hired", label: "Приняты" },
  ] as const;
  return stages.map((s) => ({ stage: s.label, count: candidateByStatus[s.key] || 0 }));
}

export function getTimeToFillApprox(vacancies: Vacancy[], candidates: Candidate[]) {
  const byVacancy = vacancies.map((v) => {
    const vacancyCandidates = candidates.filter((c) => c.vacancyId === v.id);
    const hired = vacancyCandidates.find((c) => c.status === "hired");
    if (!vacancyCandidates.length) return { id: v.id, title: v.title, days: 0 };
    const firstApplied = vacancyCandidates.reduce(
      (min, c) => (c.appliedAt < min ? c.appliedAt : min),
      vacancyCandidates[0].appliedAt
    );
    const end = hired?.updatedAt || new Date();
    const days = Math.max(0, Math.round((end.getTime() - firstApplied.getTime()) / (1000 * 60 * 60 * 24)));
    return { id: v.id, title: v.title, days };
  });
  const avgDays = Math.round(byVacancy.reduce((sum, v) => sum + v.days, 0) / Math.max(1, byVacancy.length));
  return { avgDays, series: byVacancy.map((v) => ({ name: v.title, value: v.days })) };
}

// Hiring targets (MVP in localStorage)
export type HiringTargets = {
  periodType: PeriodType;
  periodKey: string; // e.g. 2025-10 for month, 2025-Q4 for quarter
  target: number; // vacancies to close
};

const STORAGE_KEY = "hiiire-hiring-targets";

export function getHiringTargets(): HiringTargets | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HiringTargets) : null;
  } catch {
    return null;
  }
}

export function setHiringTargets(targets: HiringTargets) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(targets));
}

export function getDefaultPeriod(periodType: PeriodType): string {
  const now = new Date();
  if (periodType === "month") return format(now, "yyyy-MM");
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}-Q${q}`;
}

export function getPeriodBounds(periodType: PeriodType, periodKey: string): { start: Date; end: Date } {
  if (periodType === "month") {
    // periodKey: yyyy-MM
    const [y, m] = periodKey.split("-").map((x) => parseInt(x, 10));
    const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const end = new Date(y, m, 0, 23, 59, 59, 999);
    return { start, end };
  }
  // quarter: yyyy-Qn
  const [yearStr, qStr] = periodKey.split("-");
  const y = parseInt(yearStr, 10);
  const q = parseInt(qStr?.replace("Q", "") || "1", 10);
  const firstMonth = (q - 1) * 3; // 0-indexed
  const start = new Date(y, firstMonth, 1, 0, 0, 0, 0);
  const end = new Date(y, firstMonth + 3, 0, 23, 59, 59, 999);
  return { start, end };
}

