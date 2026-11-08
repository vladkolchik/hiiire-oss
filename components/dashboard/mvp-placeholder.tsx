"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MvpPlaceholder({
  title,
  description,
  icon,
  statusLabel = "В разработке",
  children,
  className,
}: {
  title: string;
  description: React.ReactNode;
  icon?: React.ReactNode;
  statusLabel?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        // Match product style: soft glass on muted dashboard background
        "relative overflow-hidden shadow-sm",
        "border-border/60 bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60",
        className
      )}
    >
      {/* subtle accents to keep it “native” to the UI */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
      />

      <CardHeader className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {icon ? (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              {icon}
            </div>
          ) : null}
          <div className="space-y-1">
            <CardTitle className="text-xl sm:text-2xl">{title}</CardTitle>
            <div className="text-sm text-muted-foreground">Этот раздел появится в следующих версиях.</div>
          </div>
        </div>

        <Badge variant="secondary" className="w-fit">
          {statusLabel}
        </Badge>
      </CardHeader>

      <CardContent className="relative space-y-6">
        <div className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {description}
        </div>

        {children ? <div className="space-y-3">{children}</div> : null}
      </CardContent>
    </Card>
  );
}

