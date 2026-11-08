import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentArticle } from "@/components/content/content-article";
import {
  getBlogPostBySlug,
  getBlogPosts,
} from "@/lib/content/queries";
import { serializeJsonLd } from "@/lib/content/json-ld";
import { buildContentMetadata, buildContentPath } from "@/lib/content/seo";
import {
  buildBlogPostingJsonLd,
  buildBreadcrumbListJsonLd,
  buildFaqPageJsonLd,
} from "@/lib/content/structured-data";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getBlogPosts({ includeNoindex: true }).map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getVisiblePost(slug);

  if (!post) {
    return {};
  }

  return buildContentMetadata(post);
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getVisiblePost(slug);

  if (!post) {
    notFound();
  }

  const jsonLd = [
    buildBlogPostingJsonLd(post),
    buildBreadcrumbListJsonLd([
      { name: "hiiire", url: "/" },
      { name: "Блог", url: "/blog" },
      { name: post.h1, url: buildContentPath(post) },
    ]),
    buildFaqPageJsonLd(post),
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
          <Link href="/blog" className="underline-offset-4 hover:underline">
            Блог
          </Link>
        </nav>
        <ContentArticle item={post} />
      </div>
    </main>
  );
}

function getVisiblePost(slug: string) {
  return getBlogPostBySlug(slug, {
    includeReview: process.env.NODE_ENV !== "production",
    includeNoindex: true,
  });
}
