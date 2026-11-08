import { extractPlainTextWithTika } from "./tika-client.ts";

export type ResumeFileKind = "pdf" | "doc" | "docx" | "txt";

export type ResumeExtractionErrorCode =
  | "RESUME_FILE_UNSUPPORTED_TYPE"
  | "RESUME_FILE_TOO_LARGE"
  | "RESUME_FILE_EMPTY"
  | "RESUME_FILE_PARSE_FAILED"
  | "RESUME_FILE_TIMEOUT"
  | "RESUME_EXTRACTION_TIKA_NOT_CONFIGURED"
  | "RESUME_EXTRACTION_TIKA_AUTH_FAILED"
  | "RESUME_EXTRACTION_TIKA_UNAVAILABLE"
  | "RESUME_TEXT_TOO_LONG";

export type ResumeExtractionResult =
  | { ok: true; kind: ResumeFileKind; text: string }
  | { ok: false; code: ResumeExtractionErrorCode };

export const MAX_RESUME_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_RESUME_TEXT_CHARS = 50_000;
export const MAX_RESUME_WORDS = 8_000;
export const MIN_RESUME_TEXT_CHARS = 20;

const MIME_TO_KIND: Record<string, ResumeFileKind> = {
  "application/msword": "doc",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
};

const EXTENSION_TO_KIND: Array<[string, ResumeFileKind]> = [
  [".docx", "docx"],
  [".doc", "doc"],
  [".pdf", "pdf"],
  [".txt", "txt"],
];

export function detectResumeFileKind(file: File): ResumeFileKind | null {
  const mime = String(file.type ?? "").trim().toLowerCase();
  const name = String(file.name ?? "").trim().toLowerCase();

  for (const [extension, kind] of EXTENSION_TO_KIND) {
    if (name.endsWith(extension)) {
      return kind;
    }
  }

  if (mime in MIME_TO_KIND) {
    return MIME_TO_KIND[mime];
  }

  return null;
}

export function defaultFileNameForKind(kind: ResumeFileKind): string {
  return `resume.${kind}`;
}

export function contentTypeForKind(kind: ResumeFileKind): string {
  switch (kind) {
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "pdf":
      return "application/pdf";
    case "txt":
      return "text/plain";
  }
}

export function normalizeResumeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function countResumeWords(text: string): number {
  const matches = normalizeResumeText(text).match(/\S+/g);
  return matches?.length ?? 0;
}

export async function extractTextFromResumeFile(
  file: File,
  requestId?: string,
): Promise<ResumeExtractionResult> {
  if (file.size > MAX_RESUME_FILE_SIZE_BYTES) {
    return { ok: false, code: "RESUME_FILE_TOO_LARGE" };
  }

  const fileKind = detectResumeFileKind(file);
  if (!fileKind) {
    return { ok: false, code: "RESUME_FILE_UNSUPPORTED_TYPE" };
  }

  const tikaResult = await extractPlainTextWithTika({
    file,
    requestId,
    fileKind,
  });

  if (!tikaResult.ok) {
    if (tikaResult.code === "TIKA_TIMEOUT") {
      return { ok: false, code: "RESUME_FILE_TIMEOUT" };
    }

    if (tikaResult.code === "TIKA_NOT_CONFIGURED") {
      return { ok: false, code: "RESUME_EXTRACTION_TIKA_NOT_CONFIGURED" };
    }

    if (tikaResult.code === "TIKA_AUTH_FAILED") {
      return { ok: false, code: "RESUME_EXTRACTION_TIKA_AUTH_FAILED" };
    }

    if (tikaResult.code === "TIKA_UNAVAILABLE") {
      return { ok: false, code: "RESUME_EXTRACTION_TIKA_UNAVAILABLE" };
    }

    return { ok: false, code: "RESUME_FILE_PARSE_FAILED" };
  }

  const text = normalizeResumeText(tikaResult.text);
  if (text.length < MIN_RESUME_TEXT_CHARS) {
    return { ok: false, code: "RESUME_FILE_EMPTY" };
  }

  if (text.length > MAX_RESUME_TEXT_CHARS || countResumeWords(text) > MAX_RESUME_WORDS) {
    return { ok: false, code: "RESUME_TEXT_TOO_LONG" };
  }

  return { ok: true, kind: fileKind, text };
}
