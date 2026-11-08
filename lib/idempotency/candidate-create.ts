type CandidateCreateMode = "enqueue" | "skip_ai_analysis" | "subscription_inactive";

type FileTaskInput = {
  kind: "file";
  name: string;
  size: number;
  lastModified: number;
  index: number;
};

type TextTaskInput = {
  kind: "text";
  text: string;
  index: number;
};

type CandidateCreateTaskInput = FileTaskInput | TextTaskInput;

export type CandidateCreateIdempotencyKeyInput = {
  draftKey: string;
  vacancyId: string;
  source: "manual" | "hh.ru" | "referral" | "other";
  saveResumeFile: boolean;
  skipAiAnalysis: boolean;
  task: CandidateCreateTaskInput;
};

export type CandidateCreateRequestHashInput = {
  vacancyId: string;
  source: "manual" | "hh.ru" | "referral" | "other";
  saveResumeFile: boolean;
  mode: CandidateCreateMode;
  resumeText: string;
};

function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`).join(",")}}`;
  }

  return JSON.stringify(String(value));
}

function hashString(input: string): string {
  let hash = 0x811c9dc5;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildCandidateCreateIdempotencyKey(input: CandidateCreateIdempotencyKeyInput): string {
  return `candidate-create:${hashString(
    stableStringify({
      draftKey: input.draftKey,
      vacancyId: input.vacancyId,
      source: input.source,
      saveResumeFile: input.saveResumeFile,
      skipAiAnalysis: input.skipAiAnalysis,
      task: input.task,
    })
  )}`;
}

export function buildCandidateCreateRequestHash(input: CandidateCreateRequestHashInput): string {
  return hashString(
    stableStringify({
      vacancyId: input.vacancyId,
      source: input.source,
      saveResumeFile: input.saveResumeFile,
      mode: input.mode,
      resumeText: input.resumeText,
    })
  );
}
