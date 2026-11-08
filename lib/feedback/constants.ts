export const FEEDBACK_MESSAGE_MAX_LENGTH = 10000;
export const FEEDBACK_ADMIN_NOTE_MAX_LENGTH = 5000;
export const FEEDBACK_EXTERNAL_URL_MAX_LENGTH = 2048;
export const FEEDBACK_SOURCE_URL_MAX_LENGTH = 2048;
export const FEEDBACK_USER_AGENT_MAX_LENGTH = 1000;
export const FEEDBACK_AUTHOR_NAME_MAX_LENGTH = 200;
export const FEEDBACK_AUTHOR_EMAIL_MAX_LENGTH = 320;

export const FEEDBACK_TYPE_OPTIONS = [
  { value: "idea", label: "Идея" },
  { value: "missing_feature", label: "Не хватает функции" },
  { value: "usability", label: "Неудобно пользоваться" },
  { value: "question", label: "Вопрос" },
  { value: "other", label: "Другое" },
] as const;

export const FEEDBACK_SECTION_OPTIONS = [
  { value: "dashboard", label: "Главная" },
  { value: "vacancies", label: "Вакансии" },
  { value: "candidates", label: "Кандидаты" },
  { value: "calendar", label: "Календарь" },
  { value: "stats", label: "Статистика" },
  { value: "settings", label: "Настройки" },
  { value: "hr_assistant", label: "HR-ассистент" },
  { value: "ai_analysis", label: "ИИ-анализ" },
  { value: "billing", label: "Оплата/тарифы" },
  { value: "other", label: "Другое" },
] as const;

export const FEEDBACK_STATUS_OPTIONS = [
  { value: "new", label: "Новый" },
  { value: "reviewed", label: "Разобран" },
  { value: "in_progress", label: "В работе" },
  { value: "closed", label: "Закрыт" },
  { value: "deferred", label: "Отложен" },
] as const;

export const FEEDBACK_ADMIN_CLASS_OPTIONS = [
  { value: "bug", label: "Ошибка" },
  { value: "feature", label: "Функция" },
  { value: "ux", label: "Удобство" },
  { value: "question", label: "Вопрос" },
  { value: "billing", label: "Оплата" },
  { value: "data", label: "Данные" },
  { value: "integration", label: "Интеграция" },
  { value: "other", label: "Другое" },
] as const;

export type FeedbackType = (typeof FEEDBACK_TYPE_OPTIONS)[number]["value"];
export type FeedbackSection = (typeof FEEDBACK_SECTION_OPTIONS)[number]["value"];
export type FeedbackStatus = (typeof FEEDBACK_STATUS_OPTIONS)[number]["value"];
export type FeedbackAdminClass = (typeof FEEDBACK_ADMIN_CLASS_OPTIONS)[number]["value"];

export const FEEDBACK_TYPE_VALUES = FEEDBACK_TYPE_OPTIONS.map((option) => option.value) as [FeedbackType, ...FeedbackType[]];
export const FEEDBACK_SECTION_VALUES = FEEDBACK_SECTION_OPTIONS.map((option) => option.value) as [FeedbackSection, ...FeedbackSection[]];
export const FEEDBACK_STATUS_VALUES = FEEDBACK_STATUS_OPTIONS.map((option) => option.value) as [FeedbackStatus, ...FeedbackStatus[]];
export const FEEDBACK_ADMIN_CLASS_VALUES = FEEDBACK_ADMIN_CLASS_OPTIONS.map((option) => option.value) as [
  FeedbackAdminClass,
  ...FeedbackAdminClass[],
];
