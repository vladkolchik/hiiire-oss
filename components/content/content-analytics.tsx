"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

import type { ContentItem } from "@/lib/content/types";

type ContentAnalyticsProps = {
  contentType: ContentItem["contentType"];
  slug: string;
  category: string;
  tags: string[];
  ctaType?: ContentItem["ctaType"];
};

export function ContentAnalytics({
  contentType,
  slug,
  category,
  tags,
  ctaType,
}: ContentAnalyticsProps) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || !posthog.__loaded) {
      return;
    }

    const baseProperties = {
      content_type: contentType,
      slug,
      category,
      tags,
      cta_type: ctaType,
    };

    posthog.capture(
      contentType === "blog" ? "blog_article_view" : "kb_article_view",
      baseProperties,
    );

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const analyticsTarget = target.closest<HTMLElement>(
        "[data-content-analytics]",
      );
      if (!analyticsTarget) {
        return;
      }

      const kind = analyticsTarget.dataset.contentAnalytics;
      if (kind === "cta") {
        posthog.capture(
          contentType === "blog" ? "blog_cta_click" : "kb_cta_click",
          baseProperties,
        );
      }

      if (kind === "related") {
        posthog.capture(
          contentType === "blog"
            ? "blog_related_post_click"
            : "kb_related_article_click",
          baseProperties,
        );
      }
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [category, contentType, ctaType, slug, tags]);

  return null;
}
