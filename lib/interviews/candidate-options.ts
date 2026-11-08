export type InterviewCandidateOption = {
  id: string;
  vacancyId: string;
};

export function filterInterviewCandidatesForVacancy<T extends InterviewCandidateOption>(
  candidates: T[],
  vacancyId: string,
  initialCandidateId?: string | null
): T[] {
  if (!vacancyId) return candidates;
  return candidates.filter((candidate) => candidate.vacancyId === vacancyId || candidate.id === initialCandidateId);
}

export function mergeInterviewCandidates<T extends InterviewCandidateOption>(...groups: Array<readonly T[]>): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const group of groups) {
    for (const candidate of group) {
      if (seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      result.push(candidate);
    }
  }

  return result;
}

export function resolveInterviewCandidatesForVacancy<T extends InterviewCandidateOption>({
  candidates,
  vacancyCandidates,
  vacancyId,
  vacancyCandidatesFor,
  vacancyCandidatesTotal,
  initialCandidateId,
}: {
  candidates: T[];
  vacancyCandidates: T[];
  vacancyId: string;
  vacancyCandidatesFor: string;
  vacancyCandidatesTotal: number | null;
  initialCandidateId?: string | null;
}): T[] {
  if (!vacancyId) return candidates;
  if (vacancyCandidatesFor === vacancyId && vacancyCandidatesTotal === 0) return [];

  const cachedCandidates = filterInterviewCandidatesForVacancy(candidates, vacancyId, initialCandidateId);
  const loadedCandidates =
    vacancyCandidatesFor === vacancyId ? filterInterviewCandidatesForVacancy(vacancyCandidates, vacancyId, initialCandidateId) : [];

  return mergeInterviewCandidates(cachedCandidates, loadedCandidates);
}
