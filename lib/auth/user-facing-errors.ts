type AuthProviderError = {
  error?: string | null;
  message?: string | null;
  code?: string | null;
};

const PASSWORD_TOO_LONG_MESSAGE = "Пароль не должен быть длиннее 72 символов";
const SAME_PASSWORD_MESSAGE = "Новый пароль должен отличаться от текущего";
const SIGNUP_FAILED_MESSAGE = "Не удалось зарегистрироваться. Попробуйте ещё раз.";
const PASSWORD_UPDATE_FAILED_MESSAGE = "Не удалось обновить пароль. Попробуйте ещё раз.";
export const PASSWORD_RESET_INVALID_EMAIL_MESSAGE = "Введите корректный email.";
export const PASSWORD_RESET_RATE_LIMIT_MESSAGE = "Слишком много запросов. Попробуйте позже.";
export const PASSWORD_RESET_REQUEST_FAILED_MESSAGE = "Не удалось отправить письмо. Попробуйте ещё раз.";

function normalizeErrorText(error: AuthProviderError) {
  return `${error.message ?? ""} ${error.code ?? ""}`.trim().toLowerCase();
}

function isPasswordTooLongError(text: string) {
  return text.includes("password") && text.includes("72") && (text.includes("long") || text.includes("characters"));
}

function isSamePasswordError(text: string) {
  if (!text.includes("password")) return false;
  return (
    (text.includes("same") && (text.includes("old") || text.includes("current"))) ||
    (text.includes("different") && (text.includes("old") || text.includes("current")))
  );
}

function cleanMessage(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function isTechnicalMessage(message: string) {
  const lower = message.toLowerCase();
  const upper = message.toUpperCase();
  return (
    /^[A-Z][A-Za-z0-9]*Error:/.test(message) ||
    /^[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(upper) ||
    lower.startsWith("error:") ||
    lower.includes(" at ") ||
    lower.includes(".js:") ||
    lower.includes("provider") ||
    lower.includes("internal") ||
    lower.includes("too big") ||
    lower.includes("too small") ||
    lower.includes("expected string") ||
    lower.includes("invalid input")
  );
}

export function getSignupErrorMessage(error: AuthProviderError) {
  const text = normalizeErrorText(error);
  if (isPasswordTooLongError(text)) return PASSWORD_TOO_LONG_MESSAGE;
  return SIGNUP_FAILED_MESSAGE;
}

export function getPasswordUpdateErrorMessage(error: AuthProviderError) {
  const text = normalizeErrorText(error);
  if (isPasswordTooLongError(text)) return PASSWORD_TOO_LONG_MESSAGE;
  if (isSamePasswordError(text)) return SAME_PASSWORD_MESSAGE;
  return PASSWORD_UPDATE_FAILED_MESSAGE;
}

export function getPasswordResetRequestErrorMessage(error: AuthProviderError) {
  const message = cleanMessage(error.message);
  if (message && !isTechnicalMessage(message)) return message;

  switch (error.error ?? error.code ?? "") {
    case "INVALID_BODY":
      return PASSWORD_RESET_INVALID_EMAIL_MESSAGE;
    case "SUPABASE_RATE_LIMIT":
    case "RATE_LIMIT":
      return PASSWORD_RESET_RATE_LIMIT_MESSAGE;
    case "REQUEST_FAILED":
    default:
      return PASSWORD_RESET_REQUEST_FAILED_MESSAGE;
  }
}
