"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PaginationItem = number | "ellipsis-left" | "ellipsis-right";

export type PaginationControlsProps = {
  page: number;
  totalPages: number;
  pageSize: number;
  hasExactTotal?: boolean;
  hasNextPage?: boolean;
  inexactHint?: string;
  isLoading?: boolean;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextPageSize: number) => void;
  pageSizeOptions?: number[];
};

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, Math.trunc(v)));
}

function buildPaginationItems(page: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, idx) => idx + 1);
  }

  if (page <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis-right", totalPages];
  }

  if (page >= totalPages - 3) {
    return [1, "ellipsis-left", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, "ellipsis-left", page - 1, page, page + 1, "ellipsis-right", totalPages];
}

export function PaginationControls({
  page,
  totalPages,
  pageSize,
  hasExactTotal = true,
  hasNextPage,
  inexactHint,
  isLoading = false,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
}: PaginationControlsProps) {
  const safeTotalPages = Math.max(1, Number.isFinite(totalPages) ? Math.trunc(totalPages) : 1);
  const safePage = hasExactTotal
    ? clampInt(page, 1, safeTotalPages)
    : Math.max(1, Number.isFinite(page) ? Math.trunc(page) : 1);
  const safePageSize = Math.max(1, Number.isFinite(pageSize) ? Math.trunc(pageSize) : 25);
  const canGoNext = hasExactTotal ? safePage < safeTotalPages : Boolean(hasNextPage);

  const desktopItems = useMemo(
    () => buildPaginationItems(safePage, safeTotalPages),
    [safePage, safeTotalPages]
  );

  const normalizedPageSizeOptions = useMemo(() => {
    const unique = Array.from(new Set(pageSizeOptions.filter((x) => Number.isFinite(x) && x > 0).map((x) => Math.trunc(x))));
    if (!unique.includes(safePageSize)) unique.push(safePageSize);
    return unique.sort((a, b) => a - b);
  }, [pageSizeOptions, safePageSize]);

  const pageItemsForMobileSelect = useMemo(
    () => Array.from({ length: safeTotalPages }, (_, idx) => idx + 1),
    [safeTotalPages]
  );

  if (!hasExactTotal) {
    return (
      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1 text-sm text-muted-foreground">
          <div>
            Страница <span className="font-medium text-foreground">{safePage}</span>
          </div>
          {inexactHint ? <div className="max-w-xl break-words">{inexactHint}</div> : null}
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Select
            value={String(safePageSize)}
            onValueChange={(v) => {
              const next = Math.max(1, Number.parseInt(v, 10) || safePageSize);
              onPageSizeChange(next);
            }}
          >
            <SelectTrigger className="w-full sm:w-[180px]" aria-label="Размер страницы">
              <SelectValue placeholder="Показывать по" />
            </SelectTrigger>
            <SelectContent>
              {normalizedPageSizeOptions.map((opt) => (
                <SelectItem key={opt} value={String(opt)}>
                  Показывать по {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              type="button"
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => onPageChange(safePage - 1)}
              disabled={safePage <= 1 || isLoading}
              aria-label="Предыдущая страница"
            >
              Назад
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => onPageChange(safePage + 1)}
              disabled={!canGoNext || isLoading}
              aria-label="Следующая страница"
            >
              Вперёд
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between pt-2">
      <div className="text-sm text-muted-foreground">
        Страница <span className="font-medium text-foreground">{safePage}</span> из{" "}
        <span className="font-medium text-foreground">{safeTotalPages}</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
        <Select
          value={String(safePageSize)}
          onValueChange={(v) => {
            const next = Math.max(1, Number.parseInt(v, 10) || safePageSize);
            onPageSizeChange(next);
          }}
        >
          <SelectTrigger className="w-full sm:w-[180px]" aria-label="Размер страницы">
            <SelectValue placeholder="Показывать по" />
          </SelectTrigger>
          <SelectContent>
            {normalizedPageSizeOptions.map((opt) => (
              <SelectItem key={opt} value={String(opt)}>
                Показывать по {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="hidden sm:flex gap-2 w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage <= 1 || isLoading}
            aria-label="Предыдущая страница"
          >
            Назад
          </Button>

          {desktopItems.map((item) => {
            if (item === "ellipsis-left" || item === "ellipsis-right") {
              return (
                <span key={item} className="inline-flex min-w-9 items-center justify-center px-2 text-muted-foreground">
                  …
                </span>
              );
            }

            const isCurrent = item === safePage;
            return (
              <Button
                key={item}
                type="button"
                variant={isCurrent ? "default" : "outline"}
                className="min-w-9"
                onClick={() => onPageChange(item)}
                disabled={isLoading}
                aria-label={`Страница ${item}`}
                aria-current={isCurrent ? "page" : undefined}
              >
                {item}
              </Button>
            );
          })}

          <Button
            type="button"
            variant="outline"
            onClick={() => onPageChange(safePage + 1)}
            disabled={!canGoNext || isLoading}
            aria-label="Следующая страница"
          >
            Вперёд
          </Button>
        </div>

        <div className="flex sm:hidden gap-2 w-full">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage <= 1 || isLoading}
            aria-label="Предыдущая страница"
          >
            Назад
          </Button>

          <Select
            value={String(safePage)}
            onValueChange={(v) => onPageChange(clampInt(Number.parseInt(v, 10), 1, safeTotalPages))}
            disabled={isLoading}
          >
            <SelectTrigger className="flex-1 min-w-[140px]" aria-label="Выбор страницы">
              <SelectValue>{`Стр. ${safePage} / ${safeTotalPages}`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {pageItemsForMobileSelect.map((p) => (
                <SelectItem key={p} value={String(p)}>
                  Страница {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => onPageChange(safePage + 1)}
            disabled={!canGoNext || isLoading}
            aria-label="Следующая страница"
          >
            Вперёд
          </Button>
        </div>
      </div>
    </div>
  );
}
