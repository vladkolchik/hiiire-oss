import assert from "node:assert/strict";
import test from "node:test";

import { getContentQualityWarnings } from "../lib/content/quality.ts";
import type { BlogPost } from "../lib/content/types.ts";

test("content quality warnings surface SEO and editorial risks without blocking by default", () => {
  const warnings = getContentQualityWarnings([
    createBlogFixture({
      metaTitle: "Short",
      metaDescription: "Short",
      excerpt: "Short",
      body: "TODO",
      faq: undefined,
      sources: undefined,
      relatedContent: undefined,
      ctaType: undefined,
    }),
  ]);

  assert.ok(warnings.some((warning) => warning.field === "metaTitle"));
  assert.ok(warnings.some((warning) => warning.field === "metaDescription"));
  assert.ok(warnings.some((warning) => warning.field === "excerpt"));
  assert.ok(warnings.some((warning) => warning.field === "body"));
  assert.ok(warnings.some((warning) => warning.field === "faq"));
  assert.ok(warnings.some((warning) => warning.field === "sources"));
  assert.ok(warnings.some((warning) => warning.field === "relatedContent"));
  assert.ok(warnings.some((warning) => warning.field === "ctaType"));
});

function createBlogFixture(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    contentType: "blog",
    title: "Fixture",
    slug: "fixture",
    h1: "Fixture",
    excerpt:
      "Fixture excerpt long enough to look like a useful article preview for readers.",
    metaTitle: "Fixture title for hiiire content quality checks",
    metaDescription:
      "Fixture description long enough to behave like a normal search snippet for a hiiire content page.",
    category: "ai-rekruting",
    tags: ["ai-rekruting"],
    intent: "informational",
    authorName: "Редакция hiiire",
    publishedAt: "2026-05-19",
    updatedAt: "2026-05-19",
    status: "published",
    faq: [{ question: "Question?", answer: "Answer." }],
    sources: [{ title: "Source", url: "https://hiiire.com/" }],
    relatedContent: [
      {
        type: "landing",
        url: "/#demo",
        label: "Demo",
        placement: "cta",
      },
    ],
    ctaType: "demo",
    body:
      "Body ".repeat(140),
    ...overrides,
  };
}
