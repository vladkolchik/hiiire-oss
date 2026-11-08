import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type Breadcrumb = {
  label: string;
  href?: string;
};

type ContentLayoutProps = {
  breadcrumbs?: Breadcrumb[];
  kicker?: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function ContentLayout({
  breadcrumbs = [],
  kicker,
  title,
  description,
  children,
  actions,
  className,
}: ContentLayoutProps) {
  return (
    <main className={cn("min-h-screen bg-background text-foreground", className)}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
        {breadcrumbs.length > 0 ? <Breadcrumbs items={breadcrumbs} /> : null}

        <header className="flex min-w-0 flex-col gap-5 border-b pb-8">
          {kicker ? (
            <div className="min-w-0 text-sm font-medium text-muted-foreground">
              {kicker}
            </div>
          ) : null}
          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="min-w-0 space-y-4">
              <h1 className="max-w-4xl break-words text-3xl font-semibold tracking-normal sm:text-4xl">
                {title}
              </h1>
              {description ? (
                <p className="max-w-3xl break-words text-base leading-7 text-muted-foreground sm:text-lg">
                  {description}
                </p>
              ) : null}
            </div>
            {actions ? <div className="min-w-0">{actions}</div> : null}
          </div>
        </header>

        {children}
      </div>
    </main>
  );
}

function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
  return (
    <nav aria-label="Навигация по разделу" className="min-w-0 text-sm">
      <ol className="flex min-w-0 flex-wrap items-center gap-2 text-muted-foreground">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="min-w-0">
            {index > 0 ? <span className="mr-2 text-border">/</span> : null}
            {item.href ? (
              <Link
                href={item.href}
                className="break-words underline-offset-4 hover:text-foreground hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span className="break-words text-foreground">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
