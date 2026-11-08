import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentCard } from "@/components/content/content-card";
import { ContentLayout } from "@/components/content/content-layout";
import { getKnowledgeBaseArticles } from "@/lib/content/queries";
import { buildCategoryUrl } from "@/lib/content/seo";
import { KNOWLEDGE_BASE_CATEGORIES } from "@/lib/content/taxonomy";

type PageProps = {
  params: Promise<{ category: string }>;
};

export function generateStaticParams() {
  const categories = new Set(
    getKnowledgeBaseArticles().map((article) => article.category),
  );
  return [...categories].map((category) => ({ category }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { category } = await params;
  const categoryMeta = KNOWLEDGE_BASE_CATEGORIES.find(
    (item) => item.slug === category,
  );

  if (!categoryMeta) {
    return {};
  }

  return {
    title: `${categoryMeta.label} — база знаний hiiire`,
    description: `Инструкции hiiire по теме: ${categoryMeta.label}.`,
    alternates: {
      canonical: buildCategoryUrl("knowledge-base", category),
    },
    openGraph: {
      title: `${categoryMeta.label} — база знаний hiiire`,
      description: `Инструкции hiiire по теме: ${categoryMeta.label}.`,
      url: buildCategoryUrl("knowledge-base", category),
      siteName: "hiiire",
      type: "website",
    },
  };
}

export default async function KnowledgeBaseCategoryPage({ params }: PageProps) {
  const { category } = await params;
  const categoryMeta = KNOWLEDGE_BASE_CATEGORIES.find(
    (item) => item.slug === category,
  );
  const articles = getKnowledgeBaseArticles().filter(
    (article) => article.category === category,
  );

  if (!categoryMeta || articles.length === 0) {
    notFound();
  }

  return (
    <ContentLayout
      breadcrumbs={[
        { label: "hiiire", href: "/" },
        { label: "База знаний", href: "/knowledge-base" },
        { label: categoryMeta.label },
      ]}
      title={categoryMeta.label}
      description="Инструкции по выбранному разделу базы знаний: быстрые шаги, подсказки и сценарии для ежедневной работы."
      actions={
        <Link
          href="/knowledge-base"
          className="inline-flex min-w-0 items-center rounded-md border px-4 py-2 text-sm font-medium underline-offset-4 hover:bg-muted hover:underline"
        >
          Все инструкции
        </Link>
      }
    >
      <section className="grid min-w-0 gap-4 md:grid-cols-2">
        {articles.map((article) => (
          <ContentCard
            key={article.slug}
            item={article}
            meta={`Обновлено ${article.updatedAt}`}
          />
        ))}
      </section>
    </ContentLayout>
  );
}
