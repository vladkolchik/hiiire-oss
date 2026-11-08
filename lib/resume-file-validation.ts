export type ResumeFileValidationResult = { valid: boolean; error?: string };

/**
 * Validate resume file (PDF/DOC/DOCX/TXT).
 */
export function validateResumeFile(file: File): ResumeFileValidationResult {
  const nameLower = String(file.name ?? "").toLowerCase();
  const mime = String(file.type ?? "").toLowerCase();

  const isPdf = nameLower.endsWith(".pdf") || mime.includes("pdf");
  const isDoc = nameLower.endsWith(".doc") || mime === "application/msword";
  const isDocx =
    nameLower.endsWith(".docx") ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime.includes("officedocument.wordprocessingml.document");
  const isTxt = nameLower.endsWith(".txt") || mime.startsWith("text/plain");

  if (!isPdf && !isDoc && !isDocx && !isTxt) {
    return { valid: false, error: "Поддерживаются только PDF/DOC/DOCX/TXT" };
  }

  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    return { valid: false, error: "Файл больше 5 МБ. Загрузите файл до 5 МБ." };
  }

  return { valid: true };
}
