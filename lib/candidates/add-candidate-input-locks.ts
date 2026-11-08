export type CandidateInputMethod = "pdf" | "text";

type CandidateDescriptionDraft = {
  value?: string | null;
};

type CandidateInputLockParams = {
  method: CandidateInputMethod;
  selectedFilesCount: number;
  textDescriptions?: CandidateDescriptionDraft[] | null;
  isBusy: boolean;
};

type CandidateInputLocks = {
  hasResumeFiles: boolean;
  hasCandidateDescriptions: boolean;
  isPdfLockedByCandidateDescriptions: boolean;
  isTextLockedByResumeFiles: boolean;
  isPdfTabDisabled: boolean;
  isTextTabDisabled: boolean;
};

export function getCandidateInputLocks({
  method,
  selectedFilesCount,
  textDescriptions,
  isBusy,
}: CandidateInputLockParams): CandidateInputLocks {
  const hasResumeFiles = selectedFilesCount > 0;
  const hasCandidateDescriptions = (textDescriptions ?? []).some((item) => String(item?.value ?? "").trim().length > 0);
  const isPdfLockedByCandidateDescriptions = method !== "pdf" && hasCandidateDescriptions;
  const isTextLockedByResumeFiles = method !== "text" && hasResumeFiles;

  return {
    hasResumeFiles,
    hasCandidateDescriptions,
    isPdfLockedByCandidateDescriptions,
    isTextLockedByResumeFiles,
    isPdfTabDisabled: isBusy || isPdfLockedByCandidateDescriptions,
    isTextTabDisabled: isBusy || isTextLockedByResumeFiles,
  };
}
