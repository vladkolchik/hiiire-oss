import type { Metadata } from "next";
import Link from "next/link";

import { ContentCard } from "@/components/content/content-card";
import { ContentLayout } from "@/components/content/content-layout";
import { KnowledgeBaseSearch } from "@/components/content/knowledge-base-search";
import { Button } from "@/components/ui/button";
import {
  getKnowledgeBaseArticles,
  getPublicContentIndex,
} from "@/lib/content/queries";
import { getCanonicalUrl } from "@/lib/content/seo";
import { KNOWLEDGE_BASE_CATEGORIES } from "@/lib/content/taxonomy";

export const metadata: Metadata = {
  title: "База знаний hiiire",
  description:
    "Инструкции hiiire по AI-ассистенту, AI-оценке кандидатов, вакансиям, аналитике и рабочим сценариям команды подбора.",
  alternates: {
    canonical: getCanonicalUrl("/knowledge-base"),
  },
  openGraph: {
    title: "База знаний hiiire",
    description:
      "Инструкции hiiire по AI-ассистенту, AI-оценке кандидатов, вакансиям, аналитике и рабочим сценариям команды подбора.",
    url: getCanonicalUrl("/knowledge-base"),
    siteName: "hiiire",
    type: "website",
  },
};

export default function KnowledgeBasePage() {
  const articles = getKnowledgeBaseArticles();
  const index = getPublicContentIndex().filter(
    (entry) => entry.type === "knowledge-base",
  );
  const newestArticles = articles.slice(0, 4);
  const popularArticles = articles.slice(0, 4);
  const visibleCategorySlugs = new Set(
    articles.map((article) => article.category),
  );
  const visibleCategories = KNOWLEDGE_BASE_CATEGORIES.filter((category) =>
    visibleCategorySlugs.has(category.slug),
  );

  return (
    <ContentLayout
      breadcrumbs={[
        { label: "hiiire", href: "/" },
        { label: "База знаний" },
      ]}
      title="База знаний hiiire"
      description="Короткие инструкции и полезные страницы, описывающие работу с сервисом hiiire: от первых шагов до выгрузки отчета по воронке найма и использованию ИИ-ассистента. Статьи базы знаний помогут разобраться, в интерфейсе и особенностях работы нашей агентной ATS."
      actions={
        <Button asChild>
          <Link href="/#demo">Посмотреть hiiire</Link>
        </Button>
      }
    >
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="grid min-w-0 gap-4">
          <h2 className="text-2xl font-semibold">Популярные инструкции</h2>
          <div className="grid min-w-0 gap-4">
            {popularArticles.map((article) => (
              <ContentCard
                key={article.slug}
                item={article}
                meta={`Обновлено ${article.updatedAt}`}
              />
            ))}
          </div>
        </section>
        <KnowledgeBaseSearch entries={index} />
      </div>

      <section className="grid min-w-0 gap-3 border-t pt-8">
        <h2 className="text-xl font-semibold">Категории</h2>
        <div className="flex min-w-0 flex-wrap gap-2">
          {visibleCategories.map((category) => (
            <Link
              key={category.slug}
              href={`/knowledge-base/category/${category.slug}`}
              className="max-w-full truncate rounded-md border px-3 py-2 text-sm underline-offset-4 hover:bg-muted hover:underline"
            >
              {category.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="grid min-w-0 gap-4">
        <h2 className="text-2xl font-semibold">Новые материалы</h2>
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          {newestArticles.map((article) => (
            <Link
              key={article.slug}
              href={`/knowledge-base/${article.slug}`}
              className="min-w-0 truncate rounded-md border px-4 py-3 text-sm font-medium underline-offset-4 hover:bg-muted hover:underline"
            >
              {article.h1}
            </Link>
          ))}
        </div>
      </section>

      <section className="grid min-w-0 gap-4 rounded-lg border bg-muted/30 p-6">
        <h2 className="break-words text-2xl font-semibold">
          Не нашли ответ?
        </h2>
        <p className="max-w-3xl break-words text-sm leading-6 text-muted-foreground">
          Посмотрите статьи блога, если нужен контекст по AI-рекрутингу,
          автоматизации подбора и работе с потоком кандидатов.
        </p>
        <div>
          <Button asChild variant="outline">
            <Link href="/blog">Перейти в блог</Link>
          </Button>
        </div>
      </section>
    </ContentLayout>
  );
}
