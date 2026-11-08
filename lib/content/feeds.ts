import {
  filterPublicContent,
  getAllPublicContent,
  getBlogPosts,
} from "./queries.ts";
import { buildContentUrl, getCanonicalUrl } from "./seo.ts";
import type { BlogPost, ContentIndexEntry, ContentItem } from "./types.ts";

const DEFAULT_RSS_TITLE = "Блог hiiire";
const DEFAULT_RSS_DESCRIPTION =
  "Экспертные материалы hiiire об AI-рекрутинге, CRM и автоматизации подбора.";
const FALLBACK_RSS_DATE = new Date("2026-05-19T00:00:00.000Z");

type RssFeedOptions = {
  title?: string;
  description?: string;
};

export function buildRssFeed(
  items: ContentItem[] = getBlogPosts(),
  options: RssFeedOptions = {},
): string {
  const posts = filterPublicContent(items).filter(
    (item): item is BlogPost => item.contentType === "blog",
  );
  const lastBuildDate = getLatestRssDate(posts);
  const rssItems = posts.map(buildRssItem).join("\n");
  const title = options.title ?? DEFAULT_RSS_TITLE;
  const description = options.description ?? DEFAULT_RSS_DESCRIPTION;

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(getCanonicalUrl("/blog"))}</link>
    <description>${escapeXml(description)}</description>
    <language>ru</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
${rssItems}
  </channel>
</rss>`;
}

export function buildLlmsTxt(
  items: ContentItem[] = getAllPublicContent(),
): string {
  const index = buildPublicContentIndex(items);
  const blogEntries = index.filter((entry) => entry.type === "blog");
  const kbEntries = index.filter((entry) => entry.type === "knowledge-base");

  return [
    "# hiiire",
    "",
    "hiiire is a web product for recruiting teams that work with vacancies, candidates, CRM/ATS processes, and AI-assisted candidate evaluation.",
    "",
    "## Main pages",
    `- Home: ${getCanonicalUrl("/")}`,
    `- Blog: ${getCanonicalUrl("/blog")}`,
    `- Knowledge base: ${getCanonicalUrl("/knowledge-base")}`,
    "",
    "## Key topics",
    "- AI recruiting",
    "- Recruiting CRM and ATS workflows",
    "- Candidate ranking and resume analysis",
    "- HH.ru response handling",
    "- Recruiting analytics and assistant workflows",
    "",
    "## Recommended blog articles",
    ...blogEntries.map(
      (entry) => `- ${entry.title}: ${getCanonicalUrl(entry.url)}`,
    ),
    "",
    "## Recommended knowledge base articles",
    ...kbEntries.map((entry) => `- ${entry.title}: ${getCanonicalUrl(entry.url)}`),
    "",
  ].join("\n");
}

export function getIndexNowPublishedUrls(
  items: ContentItem[] = getAllPublicContent(),
): string[] {
  return filterPublicContent(items).map((item) => buildContentUrl(item));
}

function buildPublicContentIndex(items: ContentItem[]): ContentIndexEntry[] {
  return filterPublicContent(items).map((item) => ({
    type: item.contentType,
    slug: item.slug,
    title: item.title,
    excerpt: item.excerpt,
    category: item.category,
    tags: item.tags,
    url:
      item.contentType === "blog"
        ? `/blog/${item.slug}`
        : `/knowledge-base/${item.slug}`,
  }));
}

function buildRssItem(post: BlogPost): string {
  const url = buildContentUrl(post);

  return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid>${escapeXml(url)}</guid>
      <description>${escapeXml(post.excerpt)}</description>
      <pubDate>${formatRssDate(post.publishedAt)}</pubDate>
    </item>`;
}

function getLatestRssDate(items: ContentItem[]): string {
  const latest = items
    .map((item) => item.updatedAt)
    .sort((left, right) => right.localeCompare(left))[0];

  return latest ? formatRssDate(latest) : FALLBACK_RSS_DATE.toUTCString();
}

function formatRssDate(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toUTCString();
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
