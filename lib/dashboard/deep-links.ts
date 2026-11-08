export function buildCandidateCardHref(candidateId: string) {
  return `/dashboard/candidates?candidate=${encodeURIComponent(candidateId)}`;
}

export function buildVacancyCardHref(vacancyId: string) {
  return `/dashboard/vacancies?vacancy=${encodeURIComponent(vacancyId)}`;
}
