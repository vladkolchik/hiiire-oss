import type { Vacancy } from "@/types";

export type VacancyExperienceLevel = Vacancy["experienceLevel"];

export function mapHhExperienceIdToVacancyLevel(hhExperienceId: string | undefined): VacancyExperienceLevel {
  const normalized = (hhExperienceId ?? "").toLowerCase().replace(/[_-]/g, "");
  switch (normalized) {
    case "noexperience":
      return "trainee";
    case "between1and3":
      return "junior";
    case "between3and6":
      return "middle";
    case "morethan6":
      return "senior";
    default:
      return "middle";
  }
}
