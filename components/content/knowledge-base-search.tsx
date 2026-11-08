"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import posthog from "posthog-js";

import { getCategoryLabel } from "@/components/content/content-card";
import { Input } from "@/components/ui/input";
import type { ContentIndexEntry } from "@/lib/content/types";

type KnowledgeBaseSearchProps = {
  entries: ContentIndexEntry[];
};

export function KnowledgeBaseSearch({ entries }: KnowledgeBaseSearchProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = normalize(query);
  const results = useMemo(() => {
    if (!normalizedQuery) {
      return entries.slice(0, 4);
    }

    return entries.filter((entry) =>
      normalize(
        `${entry.title} ${entry.excerpt} ${entry.category} ${entry.tags.join(" ")}`,
      ).includes(normalizedQuery),
    );
  }, [entries, normalizedQuery]);

  return (
    <section className="min-w-0 rounded-lg border p-5" aria-labelledby="kb-search">
      <div className="min-w-0">
        <h2 id="kb-search" className="text-xl font-semibold">
          Поиск по базе знаний
        </h2>
        <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">
          Найдите инструкцию по функции, сценарию или этапу работы.
        </p>
      </div>
      <Input
        value={query}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          captureSearch(value);
        }}
        className="mt-4"
        placeholder="Например: AI-оценка или ассистент"
        aria-label="Поиск по базе знаний"
      />
      <div className="mt-4 grid min-w-0 gap-2">
        {results.length > 0 ? (
          results.map((entry) => (
            <Link
              key={entry.slug}
              href={entry.url}
              className="min-w-0 rounded-md border px-3 py-2 underline-offset-4 hover:bg-muted hover:underline"
            >
              <span className="block truncate text-sm font-medium">
                {entry.title}
              </span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">
                {getCategoryLabel(entry.type, entry.category)}
              </span>
            </Link>
          ))
        ) : (
          <p className="break-words text-sm text-muted-foreground">
            Ничего не нашли. Попробуйте другой запрос или откройте категории ниже.
          </p>
        )}
      </div>
    </section>
  );
}

function normalize(value: string): string {
  return value.toLocaleLowerCase("ru-RU").trim();
}

function captureSearch(query: string): void {
  if (!query.trim() || !process.env.NEXT_PUBLIC_POSTHOG_KEY || !posthog.__loaded) {
    return;
  }

  posthog.capture("kb_search", { query: query.trim() });
}
