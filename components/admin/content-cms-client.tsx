"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    CMS_MANUAL_INIT?: boolean;
    CMS?: {
      init: (options: { config: CmsConfig }) => Promise<void>;
      registerPreviewStyle?: (path: string) => void;
      registerPreviewTemplate?: (collection: string, template: (props: PreviewTemplateProps) => ReactNode) => void;
    };
  }
}

type PreviewTemplateProps = {
  entry?: {
    getIn?: (path: string[]) => unknown;
  };
};

type CmsField = {
  name: string;
  label: string;
  widget: string;
  type?: string;
  format?: string;
  required?: boolean;
  default?: unknown;
  options?: Array<string | { label: string; value: string }>;
  fields?: CmsField[];
  hint?: string;
};

type CmsConfig = {
  load_config_file: false;
  local_backend: boolean;
  output: {
    omit_empty_optional_fields: true;
  };
  backend: {
    name: "github";
    repo: string;
    branch: string;
  };
  media_folder: string;
  public_folder: string;
  collections: Array<{
    name: string;
    label: string;
    folder: string;
    create: boolean;
    extension: "md";
    format: "frontmatter";
    slug: string;
    summary: string;
    fields: CmsField[];
  }>;
};

const scriptSrc = "https://unpkg.com/@sveltia/cms@0.158.0/dist/sveltia-cms.js";
const scriptIntegrity =
  "sha512-zsPprk61cwbRbwlWl3TeOrZh8v/mR97EQ2FhfM9+xju+u7x2Y2lMZV6G2WHaFTueQ5Z1Oe2utrioPQPwy0o/9A==";
let sveltiaScriptLoadPromise: Promise<void> | null = null;

const statusOptions = [
  { label: "Черновик", value: "draft" },
  { label: "На проверке", value: "review" },
  { label: "Опубликовано", value: "published" },
];

const blogCategoryOptions = [
  { label: "AI-рекрутинг", value: "ai-rekruting" },
  { label: "CRM и ATS", value: "crm-i-ats" },
  { label: "Аналитика подбора", value: "analytics" },
  { label: "Отклики HH.ru", value: "hh-integration" },
];

const knowledgeBaseCategoryOptions = [
  { label: "Первые шаги", value: "start" },
  { label: "Вакансии", value: "vacancies" },
  { label: "Кандидаты", value: "candidates" },
  { label: "AI-ассистент", value: "ai-assistant" },
  { label: "AI-оценка кандидатов", value: "ai-ranking" },
  { label: "Аналитика", value: "analytics" },
  { label: "Интеграция HH.ru", value: "hh-integration" },
  { label: "Оплата и тарифы", value: "billing" },
];

const landingUrlOptions = [
  { label: "Главная", value: "/" },
  { label: "Демо", value: "/#demo" },
  { label: "Тарифы", value: "/#pricing" },
  { label: "Возможности", value: "/#features" },
  { label: "Регистрация", value: "/registration" },
  { label: "Главная hiiire", value: "https://hiiire.com/" },
];

const sharedFields: CmsField[] = [
  { name: "title", label: "Название", widget: "string" },
  { name: "slug", label: "URL-slug", widget: "string" },
  { name: "h1", label: "H1", widget: "string" },
  { name: "excerpt", label: "Короткое описание", widget: "text" },
  { name: "metaTitle", label: "SEO title", widget: "string" },
  { name: "metaDescription", label: "SEO description", widget: "text" },
  { name: "tags", label: "Теги", widget: "list", required: false },
  { name: "authorName", label: "Автор", widget: "string", default: "Редакция hiiire" },
  { name: "authorRole", label: "Роль автора", widget: "string", required: false },
  { name: "publishedAt", label: "Дата публикации", widget: "datetime", type: "date", format: "YYYY-MM-DD" },
  { name: "updatedAt", label: "Дата обновления", widget: "datetime", type: "date", format: "YYYY-MM-DD" },
  { name: "status", label: "Статус", widget: "select", options: statusOptions, default: "draft" },
  { name: "readingTimeMinutes", label: "Время чтения, минут", widget: "number", required: false },
  { name: "noindex", label: "Скрыть от индексации", widget: "boolean", required: false, default: false },
  {
    name: "faq",
    label: "FAQ",
    widget: "list",
    required: false,
    fields: [
      { name: "question", label: "Вопрос", widget: "string" },
      { name: "answer", label: "Ответ", widget: "text" },
    ],
  },
  {
    name: "sources",
    label: "Источники",
    widget: "list",
    required: false,
    fields: [
      { name: "title", label: "Название", widget: "string" },
      { name: "url", label: "Ссылка", widget: "string" },
    ],
  },
  {
    name: "relatedContent",
    label: "Связанные материалы",
    widget: "list",
    required: false,
    fields: [
      {
        name: "type",
        label: "Тип",
        widget: "select",
        options: [
          { label: "Блог", value: "blog" },
          { label: "База знаний", value: "knowledge-base" },
          { label: "Лендинг", value: "landing" },
        ],
      },
      { name: "slug", label: "Slug материала", widget: "string", required: false },
      { name: "url", label: "Ссылка лендинга", widget: "select", options: landingUrlOptions, required: false },
      { name: "label", label: "Текст ссылки", widget: "string" },
      {
        name: "placement",
        label: "Место показа",
        widget: "select",
        options: [
          { label: "Применить", value: "apply" },
          { label: "Изучить дальше", value: "learn-more" },
          { label: "Следующий шаг", value: "next-step" },
          { label: "CTA", value: "cta" },
        ],
      },
    ],
  },
  { name: "body", label: "Текст", widget: "markdown" },
];

const cmsConfig: CmsConfig = {
  load_config_file: false,
  local_backend: true,
  output: {
    omit_empty_optional_fields: true,
  },
  backend: {
    name: "github",
    repo: "hiiire/local-content",
    branch: "feat/seo-geo-content-platform",
  },
  media_folder: "public/content-media",
  public_folder: "/content-media",
  collections: [
    {
      name: "blog",
      label: "Блог",
      folder: "content/blog",
      create: true,
      extension: "md",
      format: "frontmatter",
      slug: "{{fields.slug}}",
      summary: "{{title}}",
      fields: [
        { name: "contentType", label: "Тип", widget: "hidden", default: "blog" },
        { name: "category", label: "Категория", widget: "select", options: blogCategoryOptions },
        {
          name: "intent",
          label: "Намерение читателя",
          widget: "select",
          options: [
            { label: "Информационное", value: "informational" },
            { label: "Коммерческое", value: "commercial" },
            { label: "Сравнение", value: "comparison" },
            { label: "Шаблон", value: "template" },
            { label: "Кейс", value: "case" },
            { label: "Инсайт", value: "insight" },
          ],
        },
        ...sharedFields,
      ],
    },
    {
      name: "knowledge-base",
      label: "База знаний",
      folder: "content/knowledge-base",
      create: true,
      extension: "md",
      format: "frontmatter",
      slug: "{{fields.slug}}",
      summary: "{{title}}",
      fields: [
        { name: "contentType", label: "Тип", widget: "hidden", default: "knowledge-base" },
        { name: "category", label: "Категория", widget: "select", options: knowledgeBaseCategoryOptions },
        {
          name: "articleType",
          label: "Тип статьи",
          widget: "select",
          options: [
            { label: "Гайд", value: "guide" },
            { label: "Инструкция", value: "how-to" },
            { label: "FAQ", value: "faq" },
            { label: "Функция", value: "feature" },
            { label: "Решение проблемы", value: "troubleshooting" },
          ],
        },
        {
          name: "productArea",
          label: "Раздел продукта",
          widget: "select",
          options: [
            { label: "Первые шаги", value: "start" },
            { label: "Вакансии", value: "vacancies" },
            { label: "Кандидаты", value: "candidates" },
            { label: "AI-ассистент", value: "ai-assistant" },
            { label: "AI-оценка", value: "ai-ranking" },
            { label: "Интеграция HH.ru", value: "hh-integration" },
            { label: "Аналитика", value: "analytics" },
            { label: "Календарь собеседований", value: "interviews-calendar" },
            { label: "Роли и доступы", value: "roles-permissions" },
            { label: "Внутренние отклики", value: "internal-responses" },
            { label: "Безопасность", value: "security" },
            { label: "Оплата", value: "billing" },
          ],
        },
        {
          name: "difficulty",
          label: "Сложность",
          widget: "select",
          required: false,
          options: [
            { label: "Начальный уровень", value: "beginner" },
            { label: "Средний уровень", value: "intermediate" },
            { label: "Сложный сценарий", value: "advanced" },
          ],
        },
        { name: "estimatedSetupMinutes", label: "Время настройки, минут", widget: "number", required: false },
        { name: "prerequisites", label: "Что нужно заранее", widget: "list", required: false },
        ...sharedFields,
      ],
    },
  ],
};

function isLocalAuthoring() {
  return (
    process.env.NODE_ENV !== "production" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

function loadSveltiaScript() {
  if (window.CMS) {
    return Promise.resolve();
  }

  if (sveltiaScriptLoadPromise) {
    return sveltiaScriptLoadPromise;
  }

  const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${scriptSrc}"]`);

  if (existingScript) {
    sveltiaScriptLoadPromise = new Promise<void>((resolve, reject) => {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("Не удалось открыть редактор. Обновите страницу и попробуйте снова.")),
        { once: true },
      );
    });
    return sveltiaScriptLoadPromise;
  }

  sveltiaScriptLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = scriptSrc;
    script.integrity = scriptIntegrity;
    script.crossOrigin = "anonymous";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Не удалось открыть редактор. Обновите страницу и попробуйте снова."));
    document.body.appendChild(script);
  });

  return sveltiaScriptLoadPromise;
}

function ContentPreviewTemplate({ entry }: PreviewTemplateProps) {
  const h1 = entry?.getIn?.(["data", "h1"]);
  const title = entry?.getIn?.(["data", "title"]);
  const excerpt = entry?.getIn?.(["data", "excerpt"]);
  const body = entry?.getIn?.(["data", "body"]);
  const faq = toList(entry?.getIn?.(["data", "faq"]));
  const sources = toList(entry?.getIn?.(["data", "sources"]));
  const relatedContent = toList(entry?.getIn?.(["data", "relatedContent"]));

  return (
    <article style={{ fontFamily: "system-ui, sans-serif", lineHeight: 1.6, padding: "24px" }}>
      <p style={{ color: "#64748b", margin: "0 0 8px" }}>
        {typeof title === "string" && title ? title : "Материал hiiire"}
      </p>
      <h1>{typeof h1 === "string" && h1 ? h1 : "Заголовок материала"}</h1>
      {typeof excerpt === "string" && excerpt ? <p>{excerpt}</p> : null}
      {typeof body === "string" && body ? (
        <div style={{ borderTop: "1px solid #e2e8f0", marginTop: "24px", paddingTop: "16px", whiteSpace: "pre-wrap" }}>
          {body}
        </div>
      ) : null}
      <PreviewList title="FAQ" items={faq} primaryKey="question" secondaryKey="answer" />
      <PreviewList title="Источники" items={sources} primaryKey="title" secondaryKey="url" />
      <PreviewRelatedContent items={relatedContent} />
    </article>
  );
}

function PreviewList({
  title,
  items,
  primaryKey,
  secondaryKey,
}: {
  title: string;
  items: Array<Record<string, unknown>>;
  primaryKey: string;
  secondaryKey: string;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section style={{ borderTop: "1px solid #e2e8f0", marginTop: "24px", paddingTop: "16px" }}>
      <h2>{title}</h2>
      <ul>
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>
            <strong>{readPreviewValue(item[primaryKey])}</strong>
            {item[secondaryKey] ? <p>{readPreviewValue(item[secondaryKey])}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function toList(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  if (value && typeof value === "object" && "toJS" in value && typeof value.toJS === "function") {
    const candidate = value.toJS();
    return Array.isArray(candidate) ? candidate.filter(isRecord) : [];
  }

  return [];
}

function PreviewRelatedContent({ items }: { items: Array<Record<string, unknown>> }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section style={{ borderTop: "1px solid #e2e8f0", marginTop: "24px", paddingTop: "16px" }}>
      <h2>Связанные материалы</h2>
      <ul>
        {items.map((item, index) => (
          <li key={`related-${index}`}>
            <strong>{readPreviewValue(item.label)}</strong>
            <p>{readPreviewValue(item.slug ?? item.url)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readPreviewValue(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "Не заполнено";
}

export function ContentCmsClient() {
  const initialized = useRef(false);
  const [message, setMessage] = useState("Готовим редактор...");

  useEffect(() => {
    if (!isLocalAuthoring()) {
      setMessage("Редактор доступен в локальной ветке. Для публикации подготовьте PR после проверки.");
      return;
    }

    window.CMS_MANUAL_INIT = true;

    loadSveltiaScript()
      .then(async () => {
        if (initialized.current) return;
        initialized.current = true;
        if (!window.CMS) {
          throw new Error("Редактор не открылся. Обновите страницу и попробуйте снова.");
        }
        window.CMS?.registerPreviewTemplate?.("blog", ContentPreviewTemplate);
        window.CMS?.registerPreviewTemplate?.("knowledge-base", ContentPreviewTemplate);
        await window.CMS.init({ config: cmsConfig });
        setMessage("Редактор открыт. Изменения сохраняются локально, затем проходят через PR.");
      })
      .catch((error: Error) => {
        setMessage(error.message);
      });
  }, []);

  return (
    <section className="min-h-[560px] overflow-hidden rounded-lg border bg-background">
      <div className="border-b px-4 py-3 text-sm text-muted-foreground">{message}</div>
      <div id="nc-root" className="min-h-[520px]" />
    </section>
  );
}
