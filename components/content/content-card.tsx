import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BLOG_CATEGORIES, KNOWLEDGE_BASE_CATEGORIES } from "@/lib/content/taxonomy";
import type { ContentIndexEntry, ContentItem } from "@/lib/content/types";
import { cn } from "@/lib/utils";

type ContentCardProps = {
  item: ContentItem | ContentIndexEntry;
  href?: string;
  meta?: string;
  className?: string;
};

export function ContentCard({
  item,
  href = getItemUrl(item),
  meta,
  className,
}: ContentCardProps) {
  const contentType = "type" in item ? item.type : item.contentType;
  const categoryLabel = getCategoryLabel(contentType, item.category);
  const title = "h1" in item ? item.h1 : item.title;

  return (
    <Card className={cn("min-w-0 gap-4 rounded-lg py-5 shadow-none", className)}>
      <CardHeader className="min-w-0 gap-3 px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="secondary" className="max-w-full truncate">
            {categoryLabel}
          </Badge>
          {meta ? (
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {meta}
            </span>
          ) : null}
        </div>
        <CardTitle className="min-w-0 text-xl leading-7">
          <Link
            href={href}
            className="break-words underline-offset-4 hover:underline"
          >
            {title}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0 px-5">
        <p className="break-words text-sm leading-6 text-muted-foreground">
          {item.excerpt}
        </p>
      </CardContent>
    </Card>
  );
}

export function getCategoryLabel(contentType: string, category: string): string {
  const collection =
    contentType === "blog" ? BLOG_CATEGORIES : KNOWLEDGE_BASE_CATEGORIES;

  return (
    collection.find((item) => item.slug === category)?.label ?? category
  );
}

function getItemUrl(item: ContentItem | ContentIndexEntry): string {
  if ("url" in item) {
    return item.url;
  }

  return item.contentType === "blog"
    ? `/blog/${item.slug}`
    : `/knowledge-base/${item.slug}`;
}
