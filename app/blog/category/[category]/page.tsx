import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentCard } from "@/components/content/content-card";
import { ContentLayout } from "@/components/content/content-layout";
import { BLOG_CATEGORIES } from "@/lib/content/taxonomy";
import { getBlogPosts } from "@/lib/content/queries";
import { buildCategoryUrl } from "@/lib/content/seo";

type PageProps = {
  params: Promise<{ category: string }>;
};

export function generateStaticParams() {
  const categories = new Set(getBlogPosts().map((post) => post.category));
  return [...categories].map((category) => ({ category }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { category } = await params;
  const categoryMeta = BLOG_CATEGORIES.find((item) => item.slug === category);

  if (!categoryMeta) {
    return {};
  }

  return {
    title: `${categoryMeta.label} — блог hiiire`,
    description: `Материалы hiiire по теме: ${categoryMeta.label}.`,
    alternates: {
      canonical: buildCategoryUrl("blog", category),
    },
    openGraph: {
      title: `${categoryMeta.label} — блог hiiire`,
      description: `Материалы hiiire по теме: ${categoryMeta.label}.`,
      url: buildCategoryUrl("blog", category),
      siteName: "hiiire",
      type: "website",
    },
  };
}

export default async function BlogCategoryPage({ params }: PageProps) {
  const { category } = await params;
  const categoryMeta = BLOG_CATEGORIES.find((item) => item.slug === category);
  const posts = getBlogPosts().filter((post) => post.category === category);

  if (!categoryMeta || posts.length === 0) {
    notFound();
  }

  return (
    <ContentLayout
      breadcrumbs={[
        { label: "hiiire", href: "/" },
        { label: "Блог", href: "/blog" },
        { label: categoryMeta.label },
      ]}
      title={categoryMeta.label}
      description="Подборка материалов hiiire по выбранной теме: практичные разборы, сценарии и ответы для команды подбора."
      actions={
        <Link
          href="/blog"
          className="inline-flex min-w-0 items-center rounded-md border px-4 py-2 text-sm font-medium underline-offset-4 hover:bg-muted hover:underline"
        >
          Все статьи
        </Link>
      }
    >
      <section className="grid min-w-0 gap-4 md:grid-cols-2">
        {posts.map((post) => (
          <ContentCard
            key={post.slug}
            item={post}
            meta={`Обновлено ${post.updatedAt}`}
          />
        ))}
      </section>
    </ContentLayout>
  );
}
