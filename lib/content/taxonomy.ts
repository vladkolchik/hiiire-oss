export const CONTENT_STATUSES = ["draft", "review", "published"] as const;

export const CONTENT_TYPES = ["blog", "knowledge-base"] as const;

export const CONTENT_INTENTS = [
  "informational",
  "commercial",
  "comparison",
  "template",
  "case",
  "insight",
] as const;

export const ARTICLE_TYPES = [
  "guide",
  "how-to",
  "faq",
  "feature",
  "troubleshooting",
] as const;

export const PRODUCT_AREAS = [
  "start",
  "vacancies",
  "candidates",
  "ai-assistant",
  "ai-ranking",
  "hh-integration",
  "analytics",
  "interviews-calendar",
  "roles-permissions",
  "internal-responses",
  "security",
  "billing",
] as const;

export const DIFFICULTIES = [
  "beginner",
  "intermediate",
  "advanced",
] as const;

export const RELATED_CONTENT_TYPES = [
  "blog",
  "knowledge-base",
  "landing",
] as const;

export const RELATED_CONTENT_PLACEMENTS = [
  "apply",
  "learn-more",
  "next-step",
  "cta",
] as const;

export const CTA_TYPES = [
  "demo",
  "registration",
  "landing",
  "support",
  "none",
] as const;

export const BLOG_CATEGORY_SLUGS = [
  "ai-rekruting",
  "crm-i-ats",
  "analytics",
  "hh-integration",
] as const;

export const KNOWLEDGE_BASE_CATEGORY_SLUGS = [
  "start",
  "vacancies",
  "candidates",
  "ai-assistant",
  "ai-ranking",
  "analytics",
  "hh-integration",
  "billing",
] as const;

export const BLOG_CATEGORIES = [
  { slug: "ai-rekruting", label: "AI-рекрутинг" },
  { slug: "crm-i-ats", label: "CRM и ATS" },
  { slug: "analytics", label: "Аналитика подбора" },
  { slug: "hh-integration", label: "Отклики HH.ru" },
] as const satisfies ReadonlyArray<{
  slug: (typeof BLOG_CATEGORY_SLUGS)[number];
  label: string;
}>;

export const KNOWLEDGE_BASE_CATEGORIES = [
  { slug: "start", label: "Первые шаги" },
  { slug: "vacancies", label: "Вакансии" },
  { slug: "candidates", label: "Кандидаты" },
  { slug: "ai-assistant", label: "AI-ассистент" },
  { slug: "ai-ranking", label: "AI-оценка кандидатов" },
  { slug: "analytics", label: "Аналитика" },
  { slug: "hh-integration", label: "Интеграция HH.ru" },
  { slug: "billing", label: "Оплата и тарифы" },
] as const satisfies ReadonlyArray<{
  slug: (typeof KNOWLEDGE_BASE_CATEGORY_SLUGS)[number];
  label: string;
}>;

export const ALLOWED_LANDING_URLS = [
  "/",
  "/#demo",
  "/#pricing",
  "/#features",
  "/pdf-tools",
  "/registration",
  "https://hiiire.com/",
] as const;
