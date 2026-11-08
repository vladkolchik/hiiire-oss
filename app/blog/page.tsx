import type { Metadata } from "next";
import Link from "next/link";

import { ContentCard } from "@/components/content/content-card";
import { ContentLayout } from "@/components/content/content-layout";
import { Button } from "@/components/ui/button";
import { BLOG_CATEGORIES } from "@/lib/content/taxonomy";
import { getBlogPosts } from "@/lib/content/queries";
import { getCanonicalUrl } from "@/lib/content/seo";

export const metadata: Metadata = {
  title: "Блог hiiire об AI-рекрутинге и автоматизации подбора",
  description:
    "Практичные материалы hiiire о рекрутинге, AI-оценке кандидатов, CRM для подбора и автоматизации работы с откликами.",
  alternates: {
    canonical: getCanonicalUrl("/blog"),
  },
  openGraph: {
    title: "Блог hiiire об AI-рекрутинге и автоматизации подбора",
    description:
      "Практичные материалы hiiire о рекрутинге, AI-оценке кандидатов, CRM для подбора и автоматизации работы с откликами.",
    url: getCanonicalUrl("/blog"),
    siteName: "hiiire",
    type: "website",
  },
};

export default function BlogPage() {
  const posts = getBlogPosts();
  const latestPosts = posts.slice(0, 6);
  const popularPosts = posts.slice(0, 3);
  const visibleCategorySlugs = new Set(posts.map((post) => post.category));
  const visibleCategories = BLOG_CATEGORIES.filter((category) =>
    visibleCategorySlugs.has(category.slug),
  );

  return (
    <ContentLayout
      breadcrumbs={[{ label: "hiiire", href: "/" }, { label: "Блог" }]}
      title="Блог hiiire об AI-рекрутинге и автоматизации подбора"
      description="Практичные материалы о том, как команды подбора используют AI, CRM и аналитику без потери человеческого контроля. Здесь собраны разборы процессов, сравнения подходов, короткие гайды и объяснения, которые помогают быстрее принимать решения по кандидатам, вакансиям и входящим откликам. Мы пишем о применимых сценариях: что стоит автоматизировать, где нужна проверка рекрутера и как связать инструменты с ежедневной работой команды."
      actions={
        <Button asChild>
          <Link href="/#demo">Посмотреть hiiire</Link>
        </Button>
      }
    >
      <section className="grid min-w-0 gap-3">
        <h2 className="text-xl font-semibold">Категории</h2>
        <div className="flex min-w-0 flex-wrap gap-2">
          {visibleCategories.map((category) => (
            <Link
              key={category.slug}
              href={`/blog/category/${category.slug}`}
              className="max-w-full truncate rounded-md border px-3 py-2 text-sm underline-offset-4 hover:bg-muted hover:underline"
            >
              {category.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="grid min-w-0 gap-4">
        <h2 className="text-2xl font-semibold">Последние статьи</h2>
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          {latestPosts.map((post) => (
            <ContentCard
              key={post.slug}
              item={post}
              meta={`Обновлено ${post.updatedAt}`}
            />
          ))}
        </div>
      </section>

      <section className="grid min-w-0 gap-4 border-t pt-8">
        <h2 className="text-2xl font-semibold">Популярные материалы</h2>
        <div className="grid min-w-0 gap-3">
          {popularPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="min-w-0 truncate rounded-md border px-4 py-3 text-sm font-medium underline-offset-4 hover:bg-muted hover:underline"
            >
              {post.h1}
            </Link>
          ))}
        </div>
      </section>

      <section className="grid min-w-0 gap-4 rounded-lg border bg-muted/30 p-6">
        <h2 className="break-words text-2xl font-semibold">
          Нужна прикладная инструкция?
        </h2>
        <p className="max-w-3xl break-words text-sm leading-6 text-muted-foreground">
          В базе знаний собраны короткие руководства по функциям hiiire и
          безопасному применению AI в рабочих сценариях.
        </p>
        <div>
          <Button asChild variant="outline">
            <Link href="/knowledge-base">Открыть базу знаний</Link>
          </Button>
        </div>
      </section>
    </ContentLayout>
  );
}
