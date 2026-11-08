type ResumeLinkCandidate = {
  source?: string | null;
  hhruResumeId?: string | null;
  resumeUrl?: string | null;
};

export function canOpenCandidateResume(candidate: ResumeLinkCandidate): boolean {
  return (candidate.source === "hh.ru" && Boolean(candidate.hhruResumeId)) || Boolean(candidate.resumeUrl);
}

export function getResumeDisabledTooltip(candidate: ResumeLinkCandidate): string {
  return candidate.source === "hh.ru" ? "Резюме HH недоступно" : "Файл резюме недоступен";
}

export function getCandidateResumeDownloadUrl(candidateId: string): string {
  return `/api/candidates/resume-download?candidateId=${encodeURIComponent(candidateId)}`;
}

export function getHhResumeUrl(hhruResumeId: string): string {
  return `https://hh.ru/resume/${encodeURIComponent(hhruResumeId)}`;
}
