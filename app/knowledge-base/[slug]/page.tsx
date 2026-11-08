import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentArticle } from "@/components/content/content-article";
import {
  getKnowledgeBaseArticleBySlug,
  getKnowledgeBaseArticles,
} from "@/lib/content/queries";
import { serializeJsonLd } from "@/lib/content/json-ld";
import { buildContentMetadata, buildContentPath } from "@/lib/content/seo";
import {
  buildBreadcrumbListJsonLd,
  buildFaqPageJsonLd,
  buildKnowledgeBaseArticleJsonLd,
} from "@/lib/content/structured-data";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getKnowledgeBaseArticles({ includeNoindex: true }).map((article) => ({
    slug: article.slug,
  }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = getVisibleArticle(slug);

  if (!article) {
    return {};
  }

  return buildContentMetadata(article);
}

export default async function KnowledgeBaseArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = getVisibleArticle(slug);

  if (!article) {
    notFound();
  }

  const jsonLd = [
    buildKnowledgeBaseArticleJsonLd(article),
    buildBreadcrumbListJsonLd([
      { name: "hiiire", url: "/" },
      { name: "База знаний", url: "/knowledge-base" },
      { name: article.h1, url: buildContentPath(article) },
    ]),
    buildFaqPageJsonLd(article),
  ].filter(Boolean);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <nav aria-label="Навигация по разделу" className="text-sm">
          <Link href="/" className="underline-offset-4 hover:underline">
            hiiire
          </Link>
          <span className="mx-2 text-muted-foreground">/</span>
          <Link
            href="/knowledge-base"
            className="underline-offset-4 hover:underline"
          >
            База знаний
          </Link>
        </nav>
        <ContentArticle item={article} />
      </div>
    </main>
  );
}

function getVisibleArticle(slug: string) {
  return getKnowledgeBaseArticleBySlug(slug, {
    includeReview: process.env.NODE_ENV !== "production",
    includeNoindex: true,
  });
}
