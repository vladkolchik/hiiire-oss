import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const PROJECT_ROOT = new URL("../", import.meta.url);

test("public blog and knowledge base route files exist", () => {
  for (const routePath of [
    "app/blog/page.tsx",
    "app/blog/[slug]/page.tsx",
    "app/blog/category/[category]/page.tsx",
    "app/knowledge-base/page.tsx",
    "app/knowledge-base/[slug]/page.tsx",
    "app/knowledge-base/category/[category]/page.tsx",
  ]) {
    assert.equal(existsSync(fileUrl(routePath)), true, `${routePath} exists`);
  }
});

test("root layout renders global organization and software JSON-LD", () => {
  const source = readSource("app/layout.tsx");

  assert.match(source, /buildOrganizationJsonLd/);
  assert.match(source, /buildSoftwareApplicationJsonLd/);
  assert.match(source, /serializeJsonLd\(globalJsonLd\)/);
  assert.match(source, /type=["']application\/ld\+json["']/);
});

test("slug pages expose static params, metadata, JSON-LD, and missing-content guards", () => {
  for (const routePath of [
    "app/blog/[slug]/page.tsx",
    "app/knowledge-base/[slug]/page.tsx",
  ]) {
    const source = readSource(routePath);

    assert.match(source, /export\s+(async\s+)?function\s+generateStaticParams/);
    assert.match(source, /export\s+(async\s+)?function\s+generateMetadata/);
    assert.match(source, /type=["']application\/ld\+json["']/);
    assert.match(source, /serializeJsonLd\(jsonLd\)/);
    assert.match(source, /notFound\(\)/);
    assert.match(source, /includeNoindex:\s*true/);
  }
});

test("JSON-LD serialization is safe for script tags", async () => {
  const { serializeJsonLd } = await import("../lib/content/json-ld.ts");

  const serialized = serializeJsonLd({
    headline: "</script><script>alert(1)</script>",
    description: "A & B \u2028 \u2029",
  });

  assert.doesNotMatch(serialized, /<\/script/i);
  assert.doesNotMatch(serialized, /<script/i);
  assert.match(serialized, /\\u003c\/script\\u003e/);
  assert.match(serialized, /\\u0026/);
  assert.match(serialized, /\\u2028/);
  assert.match(serialized, /\\u2029/);
});

test("hubs use required Russian H1 copy, canonical metadata, and knowledge base search", () => {
  const blogHub = readSource("app/blog/page.tsx");
  const kbHub = readSource("app/knowledge-base/page.tsx");

  assert.match(
    blogHub,
    /Блог hiiire об AI-рекрутинге и автоматизации подбора/,
  );
  assert.match(kbHub, /База знаний hiiire/);
  assert.match(kbHub, /KnowledgeBaseSearch/);
  assert.match(blogHub, /alternates:\s*{/);
  assert.match(blogHub, /canonical:\s*getCanonicalUrl\(["']\/blog["']\)/);
  assert.match(blogHub, /openGraph:\s*{/);
  assert.match(kbHub, /alternates:\s*{/);
  assert.match(
    kbHub,
    /canonical:\s*getCanonicalUrl\(["']\/knowledge-base["']\)/,
  );
  assert.match(kbHub, /openGraph:\s*{/);
  assert.match(blogHub, /visibleCategories\.map/);
  assert.match(blogHub, /visibleCategorySlugs\.has\(category\.slug\)/);
  assert.match(kbHub, /visibleCategories\.map/);
  assert.match(kbHub, /visibleCategorySlugs\.has\(category\.slug\)/);
});

test("article renderer uses markdown, visible blocks, CTA, and text-safety classes", () => {
  const source = readSource("components/content/content-article.tsx");

  assert.match(source, /ReactMarkdown/);
  assert.match(source, /remarkGfm/);
  assert.match(source, /faq/i);
  assert.match(source, /sources/i);
  assert.match(source, /relatedContent/);
  assert.match(source, /cta/i);
  assert.match(source, /overflow-x-auto/);
  assert.match(source, /break-words|min-w-0|truncate/);
  assert.match(source, /h2:\s*MarkdownHeading2/);
  assert.match(source, /h3:\s*MarkdownHeading3/);
  assert.match(source, /ul:\s*MarkdownUnorderedList/);
  assert.match(source, /ol:\s*MarkdownOrderedList/);
  assert.match(source, /th:\s*MarkdownTableHeadCell/);
  assert.match(source, /<th[\s\S]*?scope=["']col["']/);
  assert.match(source, /intentLabel\(item\.intent\)/);
  assert.match(source, /productAreaLabel\(article\.productArea\)/);
});

test("category pages use normal Next Link elements and canonical metadata", () => {
  for (const routePath of [
    "app/blog/category/[category]/page.tsx",
    "app/knowledge-base/category/[category]/page.tsx",
  ]) {
    const source = readSource(routePath);

    assert.match(source, /import\s+Link\s+from\s+["']next\/link["']/);
    assert.match(source, /<Link[\s\S]*?href=/);
    assert.match(source, /alternates:\s*{/);
    assert.match(source, /canonical:\s*buildCategoryUrl/);
    assert.match(source, /openGraph:\s*{/);
    assert.doesNotMatch(source, /JavaScript|обычными ссылками/);
  }
});

function readSource(path: string): string {
  return readFileSync(fileUrl(path), "utf8");
}

function fileUrl(path: string): URL {
  return new URL(path, PROJECT_ROOT);
}
