import assert from "node:assert/strict";
import test from "node:test";

import sitemap from "../app/sitemap.ts";
import robots from "../app/robots.ts";
import { GET as getIndexNowKey } from "../app/indexnow-key.txt/route.ts";
import { GET as getLlmsTxt } from "../app/llms.txt/route.ts";
import { GET as getBlogRss } from "../app/blog/rss.xml/route.ts";
import {
  buildCategoryUrl,
  buildContentMetadata,
  buildContentUrl,
  buildSitemapEntries,
  getAppOrigin,
  getCanonicalUrl,
  getReadingTimeMinutes,
} from "../lib/content/seo.ts";
import {
  buildBlogPostingJsonLd,
  buildBreadcrumbListJsonLd,
  buildFaqPageJsonLd,
  buildKnowledgeBaseArticleJsonLd,
  buildOrganizationJsonLd,
  buildSoftwareApplicationJsonLd,
} from "../lib/content/structured-data.ts";
import {
  buildLlmsTxt,
  buildRssFeed,
  getIndexNowPublishedUrls,
} from "../lib/content/feeds.ts";
import {
  buildIndexNowPayload,
  submitIndexNowUrls,
} from "../lib/content/indexnow.ts";
import {
  filterPublicContent,
  getAllPublicContent,
  getBlogPostBySlug,
  getKnowledgeBaseArticleBySlug,
} from "../lib/content/queries.ts";
import type {
  BlogPost,
  KnowledgeBaseArticle,
} from "../lib/content/types.ts";

type JsonRecord = Record<string, unknown>;

const ORIGINAL_APP_ORIGIN = process.env.APP_ORIGIN;
const ORIGINAL_INDEXNOW_KEY = process.env.INDEXNOW_KEY;

test.afterEach(() => {
  restoreEnv("APP_ORIGIN", ORIGINAL_APP_ORIGIN);
  restoreEnv("INDEXNOW_KEY", ORIGINAL_INDEXNOW_KEY);
});

test("canonical and metadata helpers use APP_ORIGIN with a hiiire.com fallback", () => {
  delete process.env.APP_ORIGIN;
  assert.equal(getAppOrigin(), "https://hiiire.com");
  assert.equal(
    getCanonicalUrl("/blog/crm-dlya-rekrutinga"),
    "https://hiiire.com/blog/crm-dlya-rekrutinga",
  );

  process.env.APP_ORIGIN = "https://preview.hiiire.test/";
  const post = getBlogPostBySlug("crm-dlya-rekrutinga");
  assert.ok(post);

  assert.equal(
    buildContentUrl(post),
    "https://preview.hiiire.test/blog/crm-dlya-rekrutinga",
  );
  assert.equal(
    buildCategoryUrl("blog", post.category),
    "https://preview.hiiire.test/blog/category/crm-i-ats",
  );
  assert.equal(getReadingTimeMinutes(post), 4);

  const metadata = buildContentMetadata(post);
  assert.equal(metadata.title, post.metaTitle);
  assert.equal(metadata.description, post.metaDescription);
  assert.equal(
    metadata.alternates?.canonical,
    "https://preview.hiiire.test/blog/crm-dlya-rekrutinga",
  );
  assert.equal(metadata.openGraph?.title, post.metaTitle);
  assert.equal(metadata.robots, undefined);
});

test("APP_ORIGIN accepts only bare http or https origins", () => {
  delete process.env.APP_ORIGIN;
  assert.equal(getAppOrigin(), "https://hiiire.com");

  process.env.APP_ORIGIN = "https://preview.hiiire.test/";
  assert.equal(getAppOrigin(), "https://preview.hiiire.test");

  process.env.APP_ORIGIN = "http://localhost:3000";
  assert.equal(getAppOrigin(), "http://localhost:3000");

  for (const invalidOrigin of [
    "hiiire.com",
    "https://host/path",
    "https://host?from=test",
    "https://host#section",
    "https://user:pass@example.com",
    "ftp://host",
  ]) {
    process.env.APP_ORIGIN = invalidOrigin;
    assert.throws(() => getAppOrigin(), /APP_ORIGIN/);
  }
});

test("canonical helpers keep same-origin URLs and reject off-origin canonical URLs", () => {
  process.env.APP_ORIGIN = "https://hiiire.com";

  assert.equal(
    getCanonicalUrl("https://hiiire.com/blog/crm-dlya-rekrutinga"),
    "https://hiiire.com/blog/crm-dlya-rekrutinga",
  );
  assert.equal(
    buildContentUrl(createBlogFixture({ canonicalUrl: "/blog/custom-canonical" })),
    "https://hiiire.com/blog/custom-canonical",
  );
  assert.equal(
    buildContentUrl(
      createBlogFixture({
        canonicalUrl: "https://hiiire.com/blog/custom-canonical",
      }),
    ),
    "https://hiiire.com/blog/custom-canonical",
  );
  assert.throws(
    () =>
      buildContentUrl(
        createBlogFixture({
          canonicalUrl: "https://other-site.example/page",
        }),
    ),
    /canonicalUrl.*same origin/i,
  );
  assert.throws(
    () =>
      buildContentUrl(
        createBlogFixture({
          canonicalUrl: "HTTPS://other-site.example/page",
        }),
      ),
    /canonicalUrl.*same origin/i,
  );
});

test("sitemap includes hubs, published content, indexable categories, and updatedAt as lastModified", () => {
  process.env.APP_ORIGIN = "https://seo.hiiire.test";

  const entries = buildSitemapEntries();
  const urls = entries.map((entry) => entry.url);

  assert.ok(urls.includes("https://seo.hiiire.test/"));
  assert.ok(urls.includes("https://seo.hiiire.test/blog"));
  assert.ok(urls.includes("https://seo.hiiire.test/knowledge-base"));
  assert.ok(urls.includes("https://seo.hiiire.test/pdf-tools"));
  assert.ok(urls.includes("https://seo.hiiire.test/blog/crm-dlya-rekrutinga"));
  assert.ok(
    urls.includes(
      "https://seo.hiiire.test/knowledge-base/kak-polzovatsya-ai-assistentom",
    ),
  );
  assert.ok(urls.includes("https://seo.hiiire.test/blog/category/crm-i-ats"));
  assert.ok(
    urls.includes("https://seo.hiiire.test/knowledge-base/category/ai-assistant"),
  );
  assert.ok(urls.every((url) => !url.includes("draft")));
  assert.ok(urls.every((url) => !url.includes("review")));

  const postEntry = entries.find((entry) =>
    entry.url.endsWith("/blog/crm-dlya-rekrutinga"),
  );
  assert.ok(postEntry?.lastModified instanceof Date);
  assert.equal(
    postEntry.lastModified.toISOString(),
    "2026-05-19T00:00:00.000Z",
  );

  assert.deepEqual(sitemap(), entries);
});

test("empty sitemap dates are deterministic and do not depend on wall-clock time", () => {
  process.env.APP_ORIGIN = "https://seo.hiiire.test";

  const entries = buildSitemapEntries([]);
  assert.deepEqual(
    entries.map((entry) => entry.url),
    [
      "https://seo.hiiire.test/",
      "https://seo.hiiire.test/blog",
      "https://seo.hiiire.test/knowledge-base",
      "https://seo.hiiire.test/pdf-tools",
    ],
  );
  assert.deepEqual(
    entries.map((entry) => entry.lastModified?.toISOString()),
    [
      "2026-05-19T00:00:00.000Z",
      "2026-05-19T00:00:00.000Z",
      "2026-05-19T00:00:00.000Z",
      "2026-05-19T00:00:00.000Z",
    ],
  );
});

test("sitemap filters private content from mixed direct input", () => {
  process.env.APP_ORIGIN = "https://seo.hiiire.test";

  const entries = buildSitemapEntries([
    createBlogFixture({ slug: "published-post", status: "published" }),
    createBlogFixture({ slug: "draft-post", status: "draft" }),
    createBlogFixture({ slug: "review-post", status: "review" }),
    createBlogFixture({
      slug: "noindex-post",
      status: "published",
      noindex: true,
    }),
  ]);
  const urls = entries.map((entry) => entry.url);

  assert.ok(urls.includes("https://seo.hiiire.test/blog/published-post"));
  assert.ok(urls.every((url) => !url.includes("draft-post")));
  assert.ok(urls.every((url) => !url.includes("review-post")));
  assert.ok(urls.every((url) => !url.includes("noindex-post")));
});

test("robots metadata mentions sitemap and explicitly allows target AI crawlers", () => {
  process.env.APP_ORIGIN = "https://seo.hiiire.test";

  const policy = robots();
  assert.equal(policy.sitemap, "https://seo.hiiire.test/sitemap.xml");
  assert.ok(Array.isArray(policy.rules));

  const rulesText = policy.rules
    .map((rule) => `${String(rule.userAgent)} ${String(rule.allow)}`)
    .join("\n");
  assert.match(rulesText, /\*.*\//);
  assert.match(rulesText, /OAI-SearchBot.*\//);
  assert.match(rulesText, /PerplexityBot.*\//);
  assert.match(rulesText, /GPTBot.*\//);
});

test("structured data builders create only schema supported by visible content fields", () => {
  process.env.APP_ORIGIN = "https://seo.hiiire.test";

  const post = getBlogPostBySlug("crm-dlya-rekrutinga");
  const kb = getKnowledgeBaseArticleBySlug("kak-polzovatsya-ai-assistentom");
  assert.ok(post);
  assert.ok(kb);

  const blogSchema = buildBlogPostingJsonLd(post);
  assert.equal(readString(blogSchema, "@type"), "BlogPosting");
  assert.equal(readString(blogSchema, "headline"), post.h1);
  assert.equal(readString(blogSchema, "description"), post.excerpt);
  assert.equal(readString(blogSchema, "dateModified"), post.updatedAt);
  assert.equal(
    readString(readRecord(blogSchema, "author"), "name"),
    post.authorName,
  );
  assert.equal("aggregateRating" in blogSchema, false);

  const kbSchema = buildKnowledgeBaseArticleJsonLd(kb);
  assert.ok(["TechArticle", "Article"].includes(readString(kbSchema, "@type")));
  assert.equal(readString(kbSchema, "headline"), kb.h1);
  assert.equal(readString(kbSchema, "description"), kb.excerpt);
  assert.equal(readString(readRecord(kbSchema, "author"), "name"), kb.authorName);
  assert.equal("award" in kbSchema, false);

  const faqSchema = buildFaqPageJsonLd(post);
  assert.ok(faqSchema);
  assert.equal(readString(faqSchema, "@type"), "FAQPage");
  const firstQuestion = readRecord(readArray(faqSchema, "mainEntity")[0], "");
  assert.equal(readString(firstQuestion, "name"), post.faq?.[0]?.question);
  assert.equal(
    readString(readRecord(firstQuestion, "acceptedAnswer"), "text"),
    post.faq?.[0]?.answer,
  );

  const breadcrumbs = buildBreadcrumbListJsonLd([
    { name: "hiiire", url: "/" },
    { name: "Блог", url: "/blog" },
    { name: post.h1, url: `/blog/${post.slug}` },
  ]);
  assert.equal(readString(breadcrumbs, "@type"), "BreadcrumbList");
  const breadcrumbItems = readArray(breadcrumbs, "itemListElement");
  assert.equal(readString(readRecord(breadcrumbItems[2], ""), "item"), buildContentUrl(post));

  assert.equal(readString(buildOrganizationJsonLd(), "@type"), "Organization");
  assert.equal(
    readString(buildSoftwareApplicationJsonLd(), "@type"),
    "SoftwareApplication",
  );
});

test("Article JSON-LD does not include TechArticle-only proficiency fields", () => {
  const guideArticle = createKnowledgeBaseFixture({
    articleType: "guide",
    difficulty: "beginner",
  });

  const schema = buildKnowledgeBaseArticleJsonLd(guideArticle);

  assert.equal(readString(schema, "@type"), "Article");
  assert.equal("proficiencyLevel" in schema, false);
});

test("RSS contains published blog URLs and excludes knowledge base URLs", async () => {
  process.env.APP_ORIGIN = "https://seo.hiiire.test";

  const rss = buildRssFeed();
  assert.match(rss, /<rss version="2\.0"/);
  assert.match(rss, /https:\/\/seo\.hiiire\.test\/blog\/crm-dlya-rekrutinga/);
  assert.doesNotMatch(rss, /knowledge-base\/kak-polzovatsya-ai-assistentom/);
  assert.doesNotMatch(rss, /draft|review/);

  const response = await getBlogRss();
  assert.equal(response.headers.get("content-type"), "application/rss+xml; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "public, max-age=300, s-maxage=3600");
  assert.equal(await response.text(), rss);
});

test("RSS escapes channel fields and uses deterministic empty feed dates", () => {
  const rss = buildRssFeed([], {
    title: "hiiire & Friends",
    description: "Use <AI> & CRM safely",
  });

  assert.match(rss, /<title>hiiire &amp; Friends<\/title>/);
  assert.match(rss, /<description>Use &lt;AI&gt; &amp; CRM safely<\/description>/);
  assert.match(rss, /<lastBuildDate>Tue, 19 May 2026 00:00:00 GMT<\/lastBuildDate>/);
  assert.doesNotMatch(rss, /<item>/);
});

test("RSS filters private blog posts from mixed direct input", () => {
  process.env.APP_ORIGIN = "https://seo.hiiire.test";

  const rss = buildRssFeed([
    createBlogFixture({ slug: "published-post", status: "published" }),
    createBlogFixture({ slug: "draft-post", status: "draft" }),
    createBlogFixture({ slug: "review-post", status: "review" }),
    createBlogFixture({
      slug: "noindex-post",
      status: "published",
      noindex: true,
    }),
    createKnowledgeBaseFixture({
      slug: "published-kb",
      status: "published",
    }),
  ]);

  assert.match(rss, /\/blog\/published-post/);
  assert.doesNotMatch(rss, /draft-post|review-post|noindex-post|published-kb/);
});

test("llms.txt lists hubs plus recommended public blog and knowledge base URLs", async () => {
  process.env.APP_ORIGIN = "https://seo.hiiire.test";

  const llms = buildLlmsTxt();
  assert.match(llms, /\/blog/);
  assert.match(llms, /\/knowledge-base/);
  assert.match(llms, /https:\/\/seo\.hiiire\.test\/blog\/crm-dlya-rekrutinga/);
  assert.match(
    llms,
    /https:\/\/seo\.hiiire\.test\/knowledge-base\/kak-polzovatsya-ai-assistentom/,
  );
  assert.doesNotMatch(llms, /draft|review|noindex/);

  const response = await getLlmsTxt();
  assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "public, max-age=300, s-maxage=3600");
  assert.equal(await response.text(), llms);
});

test("llms and IndexNow helpers filter private content from mixed direct input", () => {
  process.env.APP_ORIGIN = "https://seo.hiiire.test";
  const mixedContent = [
    createBlogFixture({ slug: "published-blog", status: "published" }),
    createKnowledgeBaseFixture({ slug: "published-kb", status: "published" }),
    createBlogFixture({ slug: "draft-blog", status: "draft" }),
    createBlogFixture({ slug: "review-blog", status: "review" }),
    createKnowledgeBaseFixture({
      slug: "noindex-kb",
      status: "published",
      noindex: true,
    }),
  ];

  const llms = buildLlmsTxt(mixedContent);
  assert.match(llms, /\/blog\/published-blog/);
  assert.match(llms, /\/knowledge-base\/published-kb/);
  assert.doesNotMatch(llms, /draft-blog|review-blog|noindex-kb/);

  assert.deepEqual(getIndexNowPublishedUrls(mixedContent), [
    "https://seo.hiiire.test/blog/published-blog",
    "https://seo.hiiire.test/knowledge-base/published-kb",
  ]);
});

test("public filtering excludes synthetic draft, review, and noindex content", () => {
  const collection = [
    createBlogFixture({ slug: "published-post", status: "published" }),
    createBlogFixture({ slug: "draft-post", status: "draft" }),
    createBlogFixture({ slug: "review-post", status: "review" }),
    createBlogFixture({
      slug: "noindex-post",
      status: "published",
      noindex: true,
    }),
  ];

  assert.deepEqual(
    filterPublicContent(collection).map((item) => item.slug),
    ["published-post"],
  );
});

test("IndexNow route returns the configured key only and published URL helpers exclude private content", async () => {
  delete process.env.INDEXNOW_KEY;
  const missingResponse = await getIndexNowKey();
  assert.equal(missingResponse.status, 404);
  assert.equal(missingResponse.headers.get("cache-control"), "no-store");

  process.env.INDEXNOW_KEY = "bad key with spaces";
  const invalidResponse = await getIndexNowKey();
  assert.equal(invalidResponse.status, 400);
  assert.equal(invalidResponse.headers.get("cache-control"), "no-store");

  process.env.INDEXNOW_KEY = "indexnow-test-key";
  const configuredResponse = await getIndexNowKey();
  assert.equal(configuredResponse.status, 200);
  assert.equal(configuredResponse.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(configuredResponse.headers.get("cache-control"), "no-store");
  assert.equal(await configuredResponse.text(), "indexnow-test-key");

  process.env.APP_ORIGIN = "https://seo.hiiire.test";
  const urls = getIndexNowPublishedUrls();
  const publicUrls = new Set(getAllPublicContent().map((item) => buildContentUrl(item)));

  assert.ok(urls.length > 0);
  assert.ok(urls.every((url) => publicUrls.has(url)));
  assert.ok(urls.every((url) => !url.includes("draft")));
  assert.ok(urls.every((url) => !url.includes("review")));
});

test("IndexNow payload and submitter use same-origin public URLs and log results", async () => {
  process.env.APP_ORIGIN = "https://seo.hiiire.test";
  process.env.INDEXNOW_KEY = "indexnow-test-key";

  const payload = buildIndexNowPayload([
    "https://seo.hiiire.test/blog/published",
    "https://seo.hiiire.test/blog/published",
    "https://other.example/blog/off-origin",
    "not-a-url",
  ]);

  assert.deepEqual(payload, {
    host: "seo.hiiire.test",
    key: "indexnow-test-key",
    keyLocation: "https://seo.hiiire.test/indexnow-key.txt",
    urlList: ["https://seo.hiiire.test/blog/published"],
  });

  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const result = await submitIndexNowUrls(payload.urlList, {
    endpoint: "https://indexnow.example/submit",
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response("accepted", { status: 202 });
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 202);
  assert.equal(result.endpoint, "https://indexnow.example/submit");
  assert.deepEqual(result.submittedUrls, payload.urlList);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.init?.method, "POST");
  assert.match(String(requests[0]?.init?.body), /indexnow-test-key/);
});

function readString(record: JsonRecord, key: string): string {
  const value = record[key];
  assert.equal(typeof value, "string", `${key} should be a string`);
  return value;
}

function readRecord(value: unknown, key: string): JsonRecord {
  const candidate = key ? (value as JsonRecord)[key] : value;
  assert.ok(candidate !== null && typeof candidate === "object" && !Array.isArray(candidate));
  return candidate as JsonRecord;
}

function readArray(record: JsonRecord, key: string): unknown[] {
  const value = record[key];
  assert.ok(Array.isArray(value), `${key} should be an array`);
  return value;
}

function createBlogFixture(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    contentType: "blog",
    title: "Fixture",
    slug: "fixture",
    h1: "Fixture",
    excerpt: "Fixture excerpt",
    metaTitle: "Fixture title",
    metaDescription: "Fixture description",
    category: "ai-rekruting",
    tags: ["ai-rekruting"],
    intent: "informational",
    authorName: "Редакция hiiire",
    publishedAt: "2026-05-19",
    updatedAt: "2026-05-19",
    status: "published",
    body: "Body",
    ...overrides,
  };
}

function createKnowledgeBaseFixture(
  overrides: Partial<KnowledgeBaseArticle> = {},
): KnowledgeBaseArticle {
  return {
    contentType: "knowledge-base",
    title: "Fixture",
    slug: "fixture",
    h1: "Fixture",
    excerpt: "Fixture excerpt",
    metaTitle: "Fixture title",
    metaDescription: "Fixture description",
    category: "ai-ranking",
    tags: ["ai-ranking"],
    articleType: "guide",
    productArea: "ai-ranking",
    authorName: "Редакция hiiire",
    publishedAt: "2026-05-19",
    updatedAt: "2026-05-19",
    status: "published",
    body: "Body",
    ...overrides,
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
