import type { Metadata, MetadataRoute } from "next";

import {
  BLOG_CATEGORIES,
  KNOWLEDGE_BASE_CATEGORIES,
} from "./taxonomy.ts";
import { filterPublicContent, getAllPublicContent } from "./queries.ts";
import type { ContentItem, ContentType } from "./types.ts";

const DEFAULT_APP_ORIGIN = "https://hiiire.com";
const FALLBACK_LAST_MODIFIED = new Date("2026-05-19T00:00:00.000Z");
const WORDS_PER_MINUTE = 180;

export function getAppOrigin(): string {
  const configuredOrigin = process.env.APP_ORIGIN?.trim();
  if (!configuredOrigin) {
    return DEFAULT_APP_ORIGIN;
  }

  let url: URL;
  try {
    url = new URL(configuredOrigin);
  } catch {
    throw new Error("APP_ORIGIN must be a valid http or https origin");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("APP_ORIGIN must use http or https");
  }

  if (url.username || url.password) {
    throw new Error("APP_ORIGIN must not include username or password");
  }

  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("APP_ORIGIN must not include a path, query, or hash");
  }

  return url.origin;
}

export function getCanonicalUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    const url = new URL(pathOrUrl);
    if (url.origin !== getAppOrigin()) {
      throw new Error("canonicalUrl must use the same origin as APP_ORIGIN");
    }

    return `${url.origin}${url.pathname}${url.search}${url.hash}`;
  }

  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${getAppOrigin()}${path}`;
}

export function buildContentPath(item: ContentItem): string {
  return item.contentType === "blog"
    ? `/blog/${item.slug}`
    : `/knowledge-base/${item.slug}`;
}

export function buildContentUrl(item: ContentItem): string {
  return getCanonicalUrl(item.canonicalUrl ?? buildContentPath(item));
}

export function buildCategoryUrl(
  contentType: ContentType,
  category: string,
): string {
  const hubPath = contentType === "blog" ? "/blog" : "/knowledge-base";
  return getCanonicalUrl(`${hubPath}/category/${category}`);
}

export function getReadingTimeMinutes(item: ContentItem): number {
  if (item.readingTimeMinutes) {
    return item.readingTimeMinutes;
  }

  const wordCount = item.body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
}

export function buildContentMetadata(item: ContentItem): Metadata {
  const url = buildContentUrl(item);
  const images = item.ogImage ? [getCanonicalUrl(item.ogImage)] : undefined;

  return {
    title: item.metaTitle,
    description: item.metaDescription,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: item.metaTitle,
      description: item.metaDescription,
      url,
      siteName: "hiiire",
      type: "article",
      images,
    },
    robots: item.noindex === true ? { index: false, follow: false } : undefined,
  };
}

export function buildSitemapEntries(
  items: ContentItem[] = getAllPublicContent(),
): MetadataRoute.Sitemap {
  const publicContent = filterPublicContent(items);
  const blogContent = publicContent.filter((item) => item.contentType === "blog");
  const knowledgeBaseContent = publicContent.filter(
    (item) => item.contentType === "knowledge-base",
  );
  const lastModified = getLatestUpdatedDate(publicContent);

  const entries: MetadataRoute.Sitemap = [
    createSitemapEntry("/", lastModified),
    createSitemapEntry("/blog", getLatestUpdatedDate(blogContent)),
    createSitemapEntry(
      "/knowledge-base",
      getLatestUpdatedDate(knowledgeBaseContent),
    ),
    createSitemapEntry("/pdf-tools", lastModified),
  ];

  for (const item of publicContent) {
    entries.push({
      url: buildContentUrl(item),
      lastModified: dateFromIso(item.updatedAt),
      changeFrequency: "weekly",
      priority: item.contentType === "blog" ? 0.7 : 0.65,
    });
  }

  for (const category of getIndexableCategories(publicContent, "blog")) {
    entries.push(createSitemapEntry(`/blog/category/${category}`, lastModified));
  }

  for (const category of getIndexableCategories(
    publicContent,
    "knowledge-base",
  )) {
    entries.push(
      createSitemapEntry(`/knowledge-base/category/${category}`, lastModified),
    );
  }

  return entries;
}

function getIndexableCategories(
  items: ContentItem[],
  contentType: ContentType,
): string[] {
  const allowedCategories: ReadonlySet<string> =
    contentType === "blog"
      ? new Set(BLOG_CATEGORIES.map((category) => category.slug))
      : new Set(KNOWLEDGE_BASE_CATEGORIES.map((category) => category.slug));
  const categories = new Set<string>();

  for (const item of items) {
    if (item.contentType === contentType && allowedCategories.has(item.category)) {
      categories.add(item.category);
    }
  }

  return [...categories].sort();
}

function createSitemapEntry(
  path: string,
  lastModified: Date,
): MetadataRoute.Sitemap[number] {
  return {
    url: getCanonicalUrl(path),
    lastModified,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.8,
  };
}

function getLatestUpdatedDate(items: ContentItem[]): Date {
  const latest = items
    .map((item) => item.updatedAt)
    .sort((left, right) => right.localeCompare(left))[0];

  return latest ? dateFromIso(latest) : FALLBACK_LAST_MODIFIED;
}

function dateFromIso(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
