export type CreateCandidateErrorMeta = {
  maxPages?: number;
  maxChars?: number;
  maxWords?: number;
};

export type CreateCandidateInvalidBodyIssue = {
  path?: unknown;
  message?: unknown;
};

export function mapCreateCandidateInvalidBodyError(_issues?: readonly CreateCandidateInvalidBodyIssue[]): string {
  return "Проверьте данные кандидата и попробуйте еще раз.";
}

export function mapCreateCandidateError(code: string, meta?: CreateCandidateErrorMeta): string {
  switch (code) {
    case "UNAUTHORIZED":
      return "Нет доступа. Пожалуйста, войдите заново.";
    case "FORBIDDEN":
      return "Нет доступа к выбранной вакансии.";
    case "VACANCY_NOT_FOUND":
      return "Вакансия не найдена. Обновите страницу и попробуйте снова.";
    case "RESUME_FILE_MISSING":
      return "Прикрепите файл резюме и попробуйте снова.";
    case "RESUME_FILE_TOO_LARGE":
      return "Файл слишком большой. Максимальный размер - 5MB.";
    case "SUBSCRIPTION_INACTIVE":
      return "Подписка неактивна. AI-анализ временно недоступен.";
    case "RESUME_FILE_UNSUPPORTED_TYPE":
    case "RESUME_FILE_NOT_PDF":
      return "Неподдерживаемый формат. Загрузите PDF, DOC, DOCX или TXT.";
    case "RESUME_FILE_EMPTY":
      return "В файле почти нет текста. Загрузите другой файл или вставьте текст вручную.";
    case "RESUME_FILE_TIMEOUT":
      return "Файл обрабатывался слишком долго. Попробуйте другой файл или вставьте текст вручную.";
    case "RESUME_EXTRACTION_TIKA_NOT_CONFIGURED":
    case "RESUME_EXTRACTION_TIKA_AUTH_FAILED":
    case "RESUME_EXTRACTION_TIKA_UNAVAILABLE":
      return "Файл временно не удалось обработать. Попробуйте позже или вставьте текст вручную.";
    case "RESUME_FILE_PARSE_FAILED":
      return "Не удалось прочитать файл. Попробуйте другой файл или вставьте текст вручную.";
    case "PDF_INVALID_HEADER":
      return "Файл не похож на PDF. Проверьте файл и попробуйте снова.";
    case "PDF_ENCRYPTED":
      return "PDF защищен паролем. Снимите пароль и загрузите файл снова.";
    case "PDF_TOO_MANY_PAGES":
      return `PDF слишком большой. Максимум - ${meta?.maxPages ?? 5} стр.`;
    case "PDF_EMPTY_TEXT":
    case "RESUME_TEXT_TOO_SHORT":
      return "В файле почти нет текста. Загрузите другой файл или вставьте текст вручную.";
    case "RESUME_TEXT_TOO_LONG":
      return `Текст резюме слишком длинный. Максимум - ${meta?.maxChars ?? 50_000} символов / ${meta?.maxWords ?? 8_000} слов.`;
    case "PDF_INVALID":
      return "PDF поврежден или имеет неверный формат. Пересохраните файл и попробуйте снова.";
    case "PDF_PARSE_TIMEOUT":
      return "PDF обрабатывался слишком долго. Попробуйте другой файл или вставьте текст вручную.";
    case "PDF_PARSE_FAILED":
      return "Не удалось прочитать PDF. Попробуйте другой файл или вставьте текст вручную.";
    case "DOCX_INVALID_HEADER":
    case "DOCX_INVALID":
      return "Файл не похож на корректный DOCX. Проверьте файл и попробуйте снова.";
    case "DOCX_EMPTY_TEXT":
      return "В DOCX почти нет текста. Попробуйте другой файл или вставьте текст вручную.";
    case "DOCX_PARSE_TIMEOUT":
      return "DOCX обрабатывался слишком долго. Попробуйте другой файл или вставьте текст вручную.";
    case "DOCX_PARSE_FAILED":
      return "Не удалось прочитать DOCX. Попробуйте другой файл или вставьте текст вручную.";
    case "TXT_EMPTY_TEXT":
      return "В TXT почти нет текста. Проверьте файл или вставьте текст вручную.";
    case "TXT_INVALID_ENCODING":
      return "TXT не удалось прочитать. Сохраните файл как UTF-8 и попробуйте снова.";
    case "TXT_PARSE_TIMEOUT":
      return "TXT обрабатывался слишком долго. Попробуйте другой файл или вставьте текст вручную.";
    case "TXT_PARSE_FAILED":
      return "Не удалось прочитать TXT. Попробуйте другой файл или вставьте текст вручную.";
    case "CANDIDATE_RESUME_UPLOAD_FAILED":
      return "Не удалось сохранить файл резюме. Попробуйте загрузить файл еще раз.";
    case "IDEMPOTENCY_REQUEST_IN_PROGRESS":
      return "Добавление уже запущено. Подождите пару секунд.";
    case "IDEMPOTENCY_KEY_REUSED":
      return "Эта попытка уже была обработана. Откройте форму заново и попробуйте еще раз.";
    case "INTERNAL_ERROR":
    case "CANDIDATE_CREATE_FAILED":
    default:
      return "Не удалось добавить кандидата. Попробуйте еще раз.";
  }
}
