import { getAllContent } from "./queries.ts";
import type { ContentItem } from "./types.ts";

export type ContentQualityWarning = {
  slug: string;
  contentType: ContentItem["contentType"];
  field: string;
  message: string;
};

export function getContentQualityWarnings(
  items: ContentItem[] = getAllContent({ includeReview: true, includeNoindex: true }),
): ContentQualityWarning[] {
  return items.flatMap((item) => [
    ...warnLength(item, "metaTitle", item.metaTitle, 30, 65),
    ...warnLength(item, "metaDescription", item.metaDescription, 80, 160),
    ...warnLength(item, "excerpt", item.excerpt, 80, 240),
    ...warnBody(item),
    ...warnMissingBlocks(item),
    ...warnStaleDate(item),
    ...warnTodoText(item),
  ]);
}

function warnLength(
  item: ContentItem,
  field: string,
  value: string,
  min: number,
  max: number,
): ContentQualityWarning[] {
  if (value.length < min || value.length > max) {
    return [
      createWarning(
        item,
        field,
        `${field} should be ${min}-${max} characters for predictable snippets`,
      ),
    ];
  }

  return [];
}

function warnBody(item: ContentItem): ContentQualityWarning[] {
  const words = item.body.trim().split(/\s+/).filter(Boolean).length;
  const warnings: ContentQualityWarning[] = [];

  if (words < 120) {
    warnings.push(createWarning(item, "body", "body is very short"));
  }

  if (
    item.contentType === "knowledge-base" &&
    !/коротк(ий|о)\s+ответ/i.test(item.body)
  ) {
    warnings.push(
      createWarning(item, "body", "knowledge-base article should include a short answer section"),
    );
  }

  return warnings;
}

function warnMissingBlocks(item: ContentItem): ContentQualityWarning[] {
  const warnings: ContentQualityWarning[] = [];

  if (!item.faq?.length) {
    warnings.push(createWarning(item, "faq", "FAQ is missing"));
  }

  if (!item.sources?.length) {
    warnings.push(createWarning(item, "sources", "sources are missing"));
  }

  if (!item.relatedContent?.length) {
    warnings.push(createWarning(item, "relatedContent", "manual related links are missing"));
  }

  if (item.ctaType === undefined) {
    warnings.push(createWarning(item, "ctaType", "CTA type is not selected"));
  }

  return warnings;
}

function warnStaleDate(item: ContentItem): ContentQualityWarning[] {
  const publishedAt = new Date(`${item.publishedAt}T00:00:00.000Z`);
  const updatedAt = new Date(`${item.updatedAt}T00:00:00.000Z`);
  const days = (updatedAt.getTime() - publishedAt.getTime()) / 86_400_000;

  if (days > 365) {
    return [createWarning(item, "updatedAt", "material has not been refreshed for over a year")];
  }

  return [];
}

function warnTodoText(item: ContentItem): ContentQualityWarning[] {
  if (/\b(TODO|TBD|FIXME)\b|дописать|уточнить позже/i.test(item.body)) {
    return [createWarning(item, "body", "draft marker found in body")];
  }

  return [];
}

function createWarning(
  item: ContentItem,
  field: string,
  message: string,
): ContentQualityWarning {
  return {
    slug: item.slug,
    contentType: item.contentType,
    field,
    message,
  };
}
