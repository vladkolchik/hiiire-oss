type InterviewStatus = "scheduled" | "completed" | "cancelled";

export type ConflictCandidateInterview = {
  id: string;
  candidateId: string;
  scheduledAt: string;
  durationMinutes: number;
  status: InterviewStatus;
  interviewerIds: string[];
  interviewerNamesById?: Record<string, string>;
};

export type InterviewConflictWarning = {
  interviewId: string;
  kind: "interviewer" | "candidate";
  interviewerId?: string;
  interviewerName?: string;
  candidateId?: string;
  startsAt: string;
  endsAt: string;
  message: string;
};

export type FindInterviewConflictsInput = {
  scheduledAt: string;
  durationMinutes: number;
  candidateId: string;
  interviewerIds: string[];
  existing: ConflictCandidateInterview[];
  ignoreInterviewId?: string;
};

function addMinutes(value: string, minutes: number): Date {
  return new Date(new Date(value).getTime() + minutes * 60_000);
}

function intervalsOverlap(startA: Date, endA: Date, startB: Date, endB: Date): boolean {
  return startA < endB && startB < endA;
}

function formatPossessiveName(name: string): string {
  if (name.endsWith("а")) return `${name.slice(0, -1)}ы`;
  if (name.endsWith("я")) return `${name.slice(0, -1)}и`;
  return name;
}

export function findInterviewConflicts(input: FindInterviewConflictsInput): InterviewConflictWarning[] {
  const proposedStart = new Date(input.scheduledAt);
  const proposedEnd = addMinutes(input.scheduledAt, input.durationMinutes);
  const selectedInterviewers = new Set(input.interviewerIds);
  const conflicts: InterviewConflictWarning[] = [];

  for (const existing of input.existing) {
    if (existing.status !== "scheduled") continue;
    if (existing.id === input.ignoreInterviewId) continue;

    const existingStart = new Date(existing.scheduledAt);
    const existingEnd = addMinutes(existing.scheduledAt, existing.durationMinutes);
    if (!intervalsOverlap(proposedStart, proposedEnd, existingStart, existingEnd)) continue;

    if (existing.candidateId === input.candidateId) {
      conflicts.push({
        interviewId: existing.id,
        kind: "candidate",
        candidateId: existing.candidateId,
        startsAt: existingStart.toISOString(),
        endsAt: existingEnd.toISOString(),
        message: "У кандидата уже есть собеседование на это время. Можно сохранить, если это ожидаемо.",
      });
    }

    for (const interviewerId of existing.interviewerIds) {
      if (!selectedInterviewers.has(interviewerId)) continue;

      const interviewerName = existing.interviewerNamesById?.[interviewerId] ?? "интервьюера";
      const displayName = formatPossessiveName(interviewerName);
      const startsAt = existingStart.toISOString();
      conflicts.push({
        interviewId: existing.id,
        kind: "interviewer",
        interviewerId,
        interviewerName,
        startsAt,
        endsAt: existingEnd.toISOString(),
        message: `У ${displayName} уже есть встреча на это время. Можно сохранить, если это ожидаемо.`,
      });
    }
  }

  return conflicts;
}
