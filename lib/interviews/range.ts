export const MAX_INTERVIEW_DURATION_MINUTES = 480;

type RangeInput = {
  scheduledAt: string;
  durationMinutes: number;
  from: string;
  to: string;
};

type QueryWindowInput = {
  from: string;
  to: string;
};

export function interviewOverlapsRange(input: RangeInput): boolean {
  const start = new Date(input.scheduledAt);
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  const rangeStart = new Date(input.from);
  const rangeEnd = new Date(input.to);

  return start < rangeEnd && rangeStart < end;
}

export function getInterviewRangeQueryWindow(input: QueryWindowInput): { queryFrom: string; queryTo: string } {
  const from = new Date(input.from);
  return {
    queryFrom: new Date(from.getTime() - MAX_INTERVIEW_DURATION_MINUTES * 60_000).toISOString(),
    queryTo: new Date(input.to).toISOString(),
  };
}
