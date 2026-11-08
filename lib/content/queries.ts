import { readContentCollection } from "./source.ts";
import type {
  BlogPost,
  ContentIndexEntry,
  ContentItem,
  KnowledgeBaseArticle,
} from "./types.ts";

type ContentQueryOptions = {
  includeReview?: boolean;
  includeNoindex?: boolean;
};

export function getAllContent(
  options: ContentQueryOptions = {},
): ContentItem[] {
  return filterContentForQuery(readContentCollection(), options);
}

export function getAllPublicContent(): ContentItem[] {
  return filterPublicContent(readContentCollection());
}

export function getBlogPosts(
  options: ContentQueryOptions = {},
): BlogPost[] {
  return getAllContent(options).filter(
    (item): item is BlogPost => item.contentType === "blog",
  );
}

export function getKnowledgeBaseArticles(
  options: ContentQueryOptions = {},
): KnowledgeBaseArticle[] {
  return getAllContent(options).filter(
    (item): item is KnowledgeBaseArticle =>
      item.contentType === "knowledge-base",
  );
}

export function getBlogPostBySlug(
  slug: string,
  options: ContentQueryOptions = {},
): BlogPost | null {
  return getBlogPosts(options).find((post) => post.slug === slug) ?? null;
}

export function getKnowledgeBaseArticleBySlug(
  slug: string,
  options: ContentQueryOptions = {},
): KnowledgeBaseArticle | null {
  return (
    getKnowledgeBaseArticles(options).find((article) => article.slug === slug) ??
    null
  );
}

export function getPublicContentIndex(): ContentIndexEntry[] {
  return getAllPublicContent().map((item) => ({
    type: item.contentType,
    slug: item.slug,
    title: item.title,
    excerpt: item.excerpt,
    category: item.category,
    tags: item.tags,
    url: getContentUrl(item),
  }));
}

export function filterContentForQuery(
  items: ContentItem[],
  options: ContentQueryOptions = {},
): ContentItem[] {
  return items
    .filter((item) => isVisibleToContentHelpers(item, options))
    .sort(sortByUpdatedAtDesc);
}

export function filterPublicContent(items: ContentItem[]): ContentItem[] {
  return items.filter(isPublicContent).sort(sortByUpdatedAtDesc);
}

function isVisibleToContentHelpers(
  item: ContentItem,
  options: ContentQueryOptions,
): boolean {
  if (item.noindex === true && options.includeNoindex !== true) {
    return false;
  }

  return (
    item.status === "published" ||
    (options.includeReview === true && item.status === "review")
  );
}

function isPublicContent(item: ContentItem): boolean {
  return item.status === "published" && item.noindex !== true;
}

function getContentUrl(item: ContentItem): string {
  return item.contentType === "blog"
    ? `/blog/${item.slug}`
    : `/knowledge-base/${item.slug}`;
}

function sortByUpdatedAtDesc(left: ContentItem, right: ContentItem): number {
  const byUpdatedAt = right.updatedAt.localeCompare(left.updatedAt);
  if (byUpdatedAt !== 0) {
    return byUpdatedAt;
  }

  const byContentType = left.contentType.localeCompare(right.contentType);
  if (byContentType !== 0) {
    return byContentType;
  }

  return left.slug.localeCompare(right.slug);
}
