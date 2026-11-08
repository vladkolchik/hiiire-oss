"use client";

import { RotateCcw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InterviewStatusFilter } from "@/lib/interviews/list-query";

type InterviewsListFiltersBarProps = {
  search: string;
  status: InterviewStatusFilter;
  hasActiveFilters: boolean;
  onSearchChange: (next: string) => void;
  onStatusChange: (next: InterviewStatusFilter) => void;
  onReset: () => void;
};

const statusOptions: ReadonlyArray<{ value: InterviewStatusFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "scheduled", label: "Запланировано" },
  { value: "completed", label: "Завершено" },
  { value: "cancelled", label: "Отменено" },
];

export function InterviewsListFiltersBar({
  search,
  status,
  hasActiveFilters,
  onSearchChange,
  onStatusChange,
  onReset,
}: InterviewsListFiltersBarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="relative w-full sm:w-[320px]">
        <label className="sr-only" htmlFor="interviews-search">
          Поиск по собеседованиям
        </label>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="interviews-search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Поиск по собеседованиям"
          maxLength={120}
          className="h-10 pl-9"
        />
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Фильтр по статусу собеседования">
          {statusOptions.map((option) => {
            const active = status === option.value;
            return (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                aria-pressed={active}
                className="h-8"
                onClick={() => onStatusChange(option.value)}
              >
                {option.label}
              </Button>
            );
          })}
        </div>

        <Button type="button" size="sm" variant="ghost" className="h-8 gap-2" onClick={onReset} disabled={!hasActiveFilters}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Сбросить
        </Button>
      </div>
    </div>
  );
}
