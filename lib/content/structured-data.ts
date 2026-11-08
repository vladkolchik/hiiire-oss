import { buildContentUrl, getCanonicalUrl } from "./seo.ts";
import type { BlogPost, ContentItem, KnowledgeBaseArticle } from "./types.ts";

type JsonLd = Record<string, unknown>;

const CONTEXT = "https://schema.org";
const SITE_NAME = "hiiire";

export function buildBlogPostingJsonLd(post: BlogPost): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "BlogPosting",
    headline: post.h1,
    description: post.excerpt,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: buildPerson(post.authorName, post.authorRole),
    publisher: buildOrganizationJsonLd(),
    mainEntityOfPage: buildContentUrl(post),
  };
}

export function buildKnowledgeBaseArticleJsonLd(
  article: KnowledgeBaseArticle,
): JsonLd {
  const schemaType = article.articleType === "how-to" ? "TechArticle" : "Article";

  return {
    "@context": CONTEXT,
    "@type": schemaType,
    headline: article.h1,
    description: article.excerpt,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    author: buildPerson(article.authorName, article.authorRole),
    publisher: buildOrganizationJsonLd(),
    mainEntityOfPage: buildContentUrl(article),
    ...(schemaType === "TechArticle" && article.difficulty
      ? { proficiencyLevel: article.difficulty }
      : {}),
  };
}

export function buildFaqPageJsonLd(item: ContentItem): JsonLd | null {
  if (!item.faq || item.faq.length === 0) {
    return null;
  }

  return {
    "@context": CONTEXT,
    "@type": "FAQPage",
    mainEntity: item.faq.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: entry.answer,
      },
    })),
  };
}

export function buildBreadcrumbListJsonLd(
  items: Array<{ name: string; url: string }>,
): JsonLd & {
  itemListElement: Array<{ item: string }>;
} {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: getCanonicalUrl(item.url),
    })),
  };
}

export function buildOrganizationJsonLd(): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "Organization",
    name: SITE_NAME,
    url: getCanonicalUrl("/"),
  };
}

export function buildSoftwareApplicationJsonLd(): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: getCanonicalUrl("/"),
    description:
      "hiiire помогает командам подбора работать с вакансиями, кандидатами и AI-подсказками в одном веб-приложении.",
  };
}

function buildPerson(name: string, role?: string): JsonLd {
  return {
    "@type": "Person",
    name,
    jobTitle: role,
  };
}
