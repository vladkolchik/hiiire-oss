import assert from "node:assert/strict";
import test from "node:test";

import {
  filterContentForQuery,
  filterPublicContent,
  getAllContent,
  getAllPublicContent,
  getBlogPostBySlug,
  getKnowledgeBaseArticleBySlug,
  getPublicContentIndex,
} from "../lib/content/queries.ts";
import {
  parseContentItem,
  validateContentCollection,
} from "../lib/content/validation.ts";
import type { ContentItem } from "../lib/content/types.ts";

test("content collection loads typed blog and knowledge base entries", () => {
  const all = getAllContent({ includeReview: true });
  assert.ok(
    all.some(
      (item) =>
        item.contentType === "blog" && item.slug === "crm-dlya-rekrutinga",
    ),
  );
  assert.ok(
    all.some(
      (item) =>
        item.contentType === "knowledge-base" &&
        item.slug === "kak-polzovatsya-ai-assistentom",
    ),
  );
});

test("published public content excludes draft and review from production index", () => {
  const publicContent = getAllPublicContent();
  assert.ok(publicContent.every((item) => item.status === "published"));
  assert.ok(publicContent.every((item) => item.noindex !== true));
});

test("local review lookup can include review materials without indexing them", () => {
  const all = getAllContent({ includeReview: true });
  const publicContent = getAllPublicContent();
  assert.ok(all.length >= publicContent.length);
});

test("query filters include review content only when explicitly requested", () => {
  const collection = [
    createBlogFixture({ slug: "published-post", status: "published" }),
    createBlogFixture({ slug: "review-post", status: "review" }),
    createBlogFixture({ slug: "draft-post", status: "draft" }),
  ];

  assert.deepEqual(
    filterContentForQuery(collection).map((item) => item.slug),
    ["published-post"],
  );
  assert.deepEqual(
    filterContentForQuery(collection, { includeReview: true }).map(
      (item) => item.slug,
    ),
    ["published-post", "review-post"],
  );
  assert.deepEqual(
    filterPublicContent(collection).map((item) => item.slug),
    ["published-post"],
  );
});

test("query filters use deterministic ordering for equal updated dates", () => {
  const collection = [
    createBlogFixture({
      slug: "zeta",
      contentType: "blog",
      status: "published",
      updatedAt: "2026-05-19",
    }),
    createBlogFixture({
      slug: "alpha",
      contentType: "knowledge-base",
      category: "ai-assistant",
      articleType: "guide",
      productArea: "ai-assistant",
      status: "published",
      updatedAt: "2026-05-19",
    }),
    createBlogFixture({
      slug: "alpha",
      contentType: "blog",
      status: "published",
      updatedAt: "2026-05-19",
    }),
  ];

  assert.deepEqual(
    filterContentForQuery(collection).map(
      (item) => `${item.contentType}/${item.slug}`,
    ),
    ["blog/alpha", "blog/zeta", "knowledge-base/alpha"],
  );
});

test("content lookup returns specific typed entries by slug", () => {
  const blog = getBlogPostBySlug("crm-dlya-rekrutinga", {
    includeReview: true,
  });
  assert.equal(blog?.contentType, "blog");

  const kb = getKnowledgeBaseArticleBySlug("kak-polzovatsya-ai-assistentom", {
    includeReview: true,
  });
  assert.equal(kb?.contentType, "knowledge-base");
});

test("content index exposes only safe fields for agents and search", () => {
  const index = getPublicContentIndex();
  const first = index[0];
  assert.ok(first);
  for (const entry of index) {
    assert.deepEqual(Object.keys(entry).sort(), [
      "category",
      "excerpt",
      "slug",
      "tags",
      "title",
      "type",
      "url",
    ]);
    assert.equal("body" in entry, false);
  }
});

test("published content body excludes editorial FAQ placeholder copy", () => {
  const publicContent = getAllPublicContent();

  for (const item of publicContent) {
    assert.doesNotMatch(
      item.body,
      /FAQ\s+(должен|должна|помогает)|должен быть видимым/i,
      `${item.contentType}/${item.slug} should not expose editorial FAQ guidance in article body`,
    );

    if (item.faq?.length) {
      assert.doesNotMatch(
        item.body,
        /^##\s+FAQ\s*$/im,
        `${item.contentType}/${item.slug} should render FAQ from frontmatter, not duplicate it in body`,
      );
    }
  }
});

test("collection validation catches broken related links", () => {
  const result = validateContentCollection([
    {
      contentType: "blog",
      title: "Broken",
      slug: "broken",
      h1: "Broken",
      excerpt: "Broken excerpt",
      metaTitle: "Broken title",
      metaDescription: "Broken description",
      category: "ai-rekruting",
      tags: ["ai-rekruting"],
      intent: "informational",
      authorName: "Редакция hiiire",
      publishedAt: "2026-05-19",
      updatedAt: "2026-05-19",
      status: "published",
      relatedContent: [
        {
          type: "blog",
          slug: "missing",
          label: "Missing",
          placement: "learn-more",
        },
      ],
      body: "Body",
    },
  ]);

  assert.equal(result.ok, false);
  assert.match(result.issues.join("\n"), /missing/);
});

test("collection validation rejects impossible calendar dates", () => {
  const result = validateContentCollection([
    createBlogFixture({
      publishedAt: "2026-02-31",
      updatedAt: "2026-03-04",
    }),
  ]);

  assert.equal(result.ok, false);
  assert.match(result.issues.join("\n"), /publishedAt/);
});

test("collection validation rejects invalid related link shapes", () => {
  const result = validateContentCollection([
    createBlogFixture({
      slug: "source",
      relatedContent: [
        {
          type: "blog",
          slug: "target",
          url: "/",
          label: "Target",
          placement: "learn-more",
        },
        {
          type: "landing",
          slug: "target",
          url: "/",
          label: "Landing",
          placement: "cta",
        },
      ],
    }),
    createBlogFixture({ slug: "target" }),
  ]);

  assert.equal(result.ok, false);
  assert.match(result.issues.join("\n"), /blog\/target.*url/);
  assert.match(result.issues.join("\n"), /landing.*slug/);
});

test("collection validation rejects unsafe source URL schemes", () => {
  const result = validateContentCollection([
    createBlogFixture({
      sources: [
        {
          title: "Unsafe source",
          url: "javascript:alert(1)",
        },
      ],
    }),
  ]);

  assert.equal(result.ok, false);
  assert.match(result.issues.join("\n"), /URL источника|https|http/);
});

test("collection validation trims required user-facing strings", () => {
  const result = validateContentCollection([
    createBlogFixture({
      title: "   ",
      faq: [{ question: "   ", answer: "   " }],
      sources: [{ title: "   ", url: " https://hiiire.com/ " }],
    }),
  ]);

  assert.equal(result.ok, false);
  assert.match(result.issues.join("\n"), /title/);
  assert.match(result.issues.join("\n"), /faq/);
  assert.match(result.issues.join("\n"), /sources/);
});

test("content parsing errors include source path context when provided", () => {
  assert.throws(
    () =>
      parseContentItem(
        {
          ...createBlogFixture({ title: "   " }),
        },
        {
          expectedContentType: "blog",
          expectedSlug: "foo",
          sourcePath: "content/blog/foo.md",
        },
      ),
    /content\/blog\/foo\.md: title:/,
  );
});

function createBlogFixture(overrides: Partial<ContentItem> = {}): ContentItem {
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
  } as ContentItem;
}
