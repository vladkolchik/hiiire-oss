import Link from "next/link";
import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ContentAnalytics } from "@/components/content/content-analytics";
import { getCategoryLabel } from "@/components/content/content-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getBlogPostBySlug,
  getKnowledgeBaseArticleBySlug,
} from "@/lib/content/queries";
import { buildContentPath, getReadingTimeMinutes } from "@/lib/content/seo";
import type {
  BlogPost,
  ContentIntent,
  ContentItem,
  KnowledgeBaseArticle,
  ProductArea,
  RelatedContentLink,
} from "@/lib/content/types";
import { cn } from "@/lib/utils";

type ContentArticleProps = {
  item: ContentItem;
};

const placementLabels: Record<RelatedContentLink["placement"], string> = {
  apply: "Как применить в hiiire",
  "learn-more": "Разобраться глубже",
  "next-step": "Следующий шаг",
  cta: "Полезная ссылка",
};

export function ContentArticle({ item }: ContentArticleProps) {
  const relatedLinks = item.relatedContent ?? [];
  const ctaLink = relatedLinks.find((link) => link.placement === "cta");
  const visibleRelatedLinks = relatedLinks.filter(
    (link) => link.placement !== "cta",
  );

  return (
    <article className="min-w-0">
      <ContentAnalytics
        contentType={item.contentType}
        slug={item.slug}
        category={item.category}
        tags={item.tags}
        ctaType={item.ctaType}
      />

      <header className="mb-10 min-w-0 space-y-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary" className="max-w-full truncate">
            {getCategoryLabel(item.contentType, item.category)}
          </Badge>
          {isBlogPost(item) ? (
            <Badge variant="outline" className="max-w-full truncate">
              {intentLabel(item.intent)}
            </Badge>
          ) : null}
          <span className="break-words">
            Обновлено {formatDate(item.updatedAt)}
          </span>
          <span className="break-words">
            {getReadingTimeMinutes(item)} мин чтения
          </span>
        </div>

        <div className="min-w-0 space-y-3">
          <h1 className="max-w-4xl break-words text-3xl font-semibold tracking-normal sm:text-4xl">
            {item.h1}
          </h1>
          <p className="max-w-3xl break-words text-lg leading-8 text-muted-foreground">
            {item.excerpt}
          </p>
        </div>

        <div className="min-w-0 text-sm leading-6 text-muted-foreground">
          <p className="break-words">
            {item.authorName}
            {item.authorRole ? `, ${item.authorRole}` : ""} · опубликовано{" "}
            {formatDate(item.publishedAt)}
          </p>
        </div>
      </header>

      {isKnowledgeBaseArticle(item) && item.prerequisites?.length ? (
        <section className="mb-8 min-w-0 rounded-lg border bg-muted/30 p-5">
          <h2 className="text-lg font-semibold">Перед началом</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
            {item.prerequisites.map((prerequisite) => (
              <li key={prerequisite} className="break-words">
                {prerequisite}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {isKnowledgeBaseArticle(item) ? (
        <KnowledgeBaseMeta article={item} />
      ) : null}

      <MarkdownBody body={item.body} />

      {item.faq?.length ? <FaqSection item={item} /> : null}
      {item.sources?.length ? <SourcesSection item={item} /> : null}
      {visibleRelatedLinks.length ? (
        <RelatedContentSection links={visibleRelatedLinks} />
      ) : null}
      <ArticleCta item={item} ctaLink={ctaLink} />
    </article>
  );
}

function KnowledgeBaseMeta({ article }: { article: KnowledgeBaseArticle }) {
  const facts = [
    article.difficulty ? difficultyLabel(article.difficulty) : null,
    article.estimatedSetupMinutes
      ? `${article.estimatedSetupMinutes} мин на настройку`
      : null,
    productAreaLabel(article.productArea),
  ].filter(Boolean);

  if (facts.length === 0) {
    return null;
  }

  return (
    <div className="mb-8 flex min-w-0 flex-wrap gap-2">
      {facts.map((fact) => (
        <Badge key={fact} variant="outline" className="max-w-full truncate">
          {fact}
        </Badge>
      ))}
    </div>
  );
}

function MarkdownBody({ body }: { body: string }) {
  return (
    <div className="min-w-0 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: MarkdownLink,
          blockquote: MarkdownBlockquote,
          h2: MarkdownHeading2,
          h3: MarkdownHeading3,
          h4: MarkdownHeading4,
          ol: MarkdownOrderedList,
          table: MarkdownTable,
          th: MarkdownTableHeadCell,
          td: MarkdownTableCell,
          p: MarkdownParagraph,
          li: MarkdownListItem,
          ul: MarkdownUnorderedList,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

function MarkdownLink({ className, ...props }: ComponentProps<"a">) {
  return (
    <a
      className={cn(
        "break-words font-medium text-primary underline underline-offset-4",
        className,
      )}
      {...props}
    />
  );
}

function MarkdownHeading2({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "mt-12 max-w-3xl break-words border-t pt-8 text-2xl font-semibold leading-tight tracking-normal first:mt-0 first:border-t-0 first:pt-0 sm:text-3xl",
        className,
      )}
      {...props}
    />
  );
}

function MarkdownHeading3({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      className={cn(
        "mt-8 max-w-3xl break-words text-xl font-semibold leading-snug tracking-normal sm:text-2xl",
        className,
      )}
      {...props}
    />
  );
}

function MarkdownHeading4({ className, ...props }: ComponentProps<"h4">) {
  return (
    <h4
      className={cn(
        "mt-7 max-w-3xl break-words text-lg font-semibold leading-snug tracking-normal",
        className,
      )}
      {...props}
    />
  );
}

function MarkdownTable({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="my-6 min-w-0 overflow-x-auto">
      <table
        className={cn(
          "w-full min-w-[36rem] border-collapse text-left text-sm",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function MarkdownTableCell({
  className,
  ...props
}: ComponentProps<"td">) {
  return (
    <td
      className={cn("border px-3 py-2 align-top break-words", className)}
      {...props}
    />
  );
}

function MarkdownTableHeadCell({
  className,
  ...props
}: ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "border px-3 py-2 text-left align-top font-semibold break-words",
        className,
      )}
      scope="col"
      {...props}
    />
  );
}

function MarkdownUnorderedList({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        "my-5 max-w-3xl list-disc space-y-2 pl-6 leading-7 text-muted-foreground marker:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function MarkdownOrderedList({ className, ...props }: ComponentProps<"ol">) {
  return (
    <ol
      className={cn(
        "my-5 max-w-3xl list-decimal space-y-2 pl-6 leading-7 text-muted-foreground marker:font-semibold marker:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function MarkdownParagraph({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "my-5 max-w-3xl break-words text-base leading-8 text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function MarkdownListItem({ className, ...props }: ComponentProps<"li">) {
  return <li className={cn("break-words pl-1", className)} {...props} />;
}

function MarkdownBlockquote({
  className,
  ...props
}: ComponentProps<"blockquote">) {
  return (
    <blockquote
      className={cn(
        "my-6 max-w-3xl border-l-2 pl-4 text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function FaqSection({ item }: { item: ContentItem }) {
  return (
    <section className="mt-12 min-w-0 border-t pt-8" id="faq">
      <h2 className="text-2xl font-semibold">FAQ</h2>
      <div className="mt-5 grid min-w-0 gap-4">
        {item.faq?.map((entry) => (
          <div key={entry.question} className="min-w-0 rounded-lg border p-5">
            <h3 className="break-words text-base font-semibold">
              {entry.question}
            </h3>
            <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">
              {entry.answer}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SourcesSection({ item }: { item: ContentItem }) {
  return (
    <section className="mt-12 min-w-0 border-t pt-8" id="sources">
      <h2 className="text-2xl font-semibold">Источники</h2>
      <ul className="mt-4 grid min-w-0 gap-2">
        {item.sources?.map((source) => (
          <li key={`${source.title}-${source.url}`} className="min-w-0">
            <a
              href={source.url}
              className="break-words text-sm font-medium text-primary underline-offset-4 hover:underline"
              rel="noreferrer"
              target="_blank"
            >
              {source.title}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RelatedContentSection({ links }: { links: RelatedContentLink[] }) {
  const grouped = groupByPlacement(links);

  return (
    <section className="mt-12 min-w-0 border-t pt-8" id="related-content">
      <h2 className="text-2xl font-semibold">Связанные материалы</h2>
      <div className="mt-5 grid min-w-0 gap-6 md:grid-cols-2">
        {Object.entries(grouped).map(([placement, placementLinks]) => (
          <div key={placement} className="min-w-0">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {placementLabels[placement as RelatedContentLink["placement"]]}
            </h3>
            <ul className="mt-3 grid min-w-0 gap-2">
              {placementLinks.map((link) => (
                <li key={`${link.type}-${link.slug ?? link.url}-${link.label}`}>
                  <Link
                    href={getRelatedHref(link)}
                    className="block min-w-0 truncate rounded-md border px-3 py-2 text-sm font-medium underline-offset-4 hover:bg-muted hover:underline"
                    data-content-analytics="related"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function ArticleCta({
  item,
  ctaLink,
}: {
  item: ContentItem;
  ctaLink?: RelatedContentLink;
}) {
  if (item.ctaType === "none") {
    return null;
  }

  const href = ctaLink ? getRelatedHref(ctaLink) : "/#demo";
  const label = ctaLink?.label ?? getCtaLabel(item);

  return (
    <section className="mt-12 min-w-0 rounded-lg border bg-muted/30 p-6" id="cta">
      <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <h2 className="break-words text-xl font-semibold">
            Хотите применить это в подборе?
          </h2>
          <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">
            Посмотрите hiiire на реальном сценарии вашей команды.
          </p>
        </div>
        <Button asChild className="min-w-0" data-content-analytics="cta">
          <Link href={href} className="truncate">
            {label}
          </Link>
        </Button>
      </div>
    </section>
  );
}

function groupByPlacement(links: RelatedContentLink[]) {
  return links.reduce<Record<string, RelatedContentLink[]>>((acc, link) => {
    acc[link.placement] = [...(acc[link.placement] ?? []), link];
    return acc;
  }, {});
}

function getRelatedHref(link: RelatedContentLink): string {
  if (link.type === "landing") {
    return link.url;
  }

  const related =
    link.type === "blog"
      ? getBlogPostBySlug(link.slug, { includeReview: true })
      : getKnowledgeBaseArticleBySlug(link.slug, { includeReview: true });

  return related ? buildContentPath(related) : "/";
}

function getCtaLabel(item: ContentItem): string {
  switch (item.ctaType) {
    case "registration":
      return "Зарегистрироваться";
    case "support":
      return "Задать вопрос";
    case "landing":
      return "Узнать о hiiire";
    case "demo":
    default:
      return "Посмотреть hiiire";
  }
}

function isKnowledgeBaseArticle(item: ContentItem): item is KnowledgeBaseArticle {
  return item.contentType === "knowledge-base";
}

function isBlogPost(item: ContentItem): item is BlogPost {
  return item.contentType === "blog";
}

function intentLabel(intent: ContentIntent): string {
  switch (intent) {
    case "commercial":
      return "Выбор решения";
    case "comparison":
      return "Сравнение";
    case "template":
      return "Шаблон";
    case "case":
      return "Практика";
    case "insight":
      return "Аналитика рынка";
    case "informational":
    default:
      return "Разбор";
  }
}

function productAreaLabel(productArea: ProductArea): string {
  switch (productArea) {
    case "start":
      return "Первые шаги";
    case "vacancies":
      return "Вакансии";
    case "candidates":
      return "Кандидаты";
    case "ai-assistant":
      return "AI-ассистент";
    case "ai-ranking":
      return "AI-оценка кандидатов";
    case "hh-integration":
      return "Интеграция с HH.ru";
    case "analytics":
      return "Аналитика";
    case "interviews-calendar":
      return "Календарь собеседований";
    case "roles-permissions":
      return "Роли и доступы";
    case "internal-responses":
      return "Внутренние отклики";
    case "security":
      return "Безопасность";
    case "billing":
      return "Оплата";
  }
}

function difficultyLabel(difficulty: KnowledgeBaseArticle["difficulty"]) {
  switch (difficulty) {
    case "beginner":
      return "Для начала";
    case "intermediate":
      return "Средний уровень";
    case "advanced":
      return "Для опытных пользователей";
    default:
      return difficulty;
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`));
}
