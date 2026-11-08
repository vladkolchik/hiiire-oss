"use client";

import { useId, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { CandidatesScoreFilter, CandidatesSort } from "@/services/data/candidates";
import type { Candidate, Vacancy } from "@/types";

type CandidatesStatusFilter = Candidate["status"] | "all";

type CandidatesFiltersBarProps = {
  filterVacancy: string;
  filterScore: CandidatesScoreFilter;
  filterStatus: CandidatesStatusFilter;
  statusLabels: Record<Candidate["status"], string>;
  nameQuery: string;
  sort: CandidatesSort;
  vacancies: Vacancy[];
  isMobile: boolean;
  hasActiveFilters: boolean;
  activeFiltersCount: number;
  onVacancyChange: (next: string) => void;
  onScoreChange: (next: CandidatesScoreFilter) => void;
  onStatusChange: (next: CandidatesStatusFilter) => void;
  onNameQueryChange: (next: string) => void;
  onSortChange: (next: CandidatesSort) => void;
  onReset: () => void;
};

const scoreOptions: ReadonlyArray<{ value: CandidatesScoreFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "unscored", label: "Не просчитаны" },
  { value: "high", label: "Высокое" },
  { value: "medium", label: "Среднее" },
  { value: "low", label: "Низкое" },
];

const statusOptions: ReadonlyArray<{ value: CandidatesStatusFilter; label: string }> = [
  { value: "all", label: "Все статусы" },
  { value: "new", label: "Новый" },
  { value: "reviewing", label: "Рассмотрение" },
  { value: "security-check", label: "Проверка СБ" },
  { value: "interview-scheduled", label: "Собеседование" },
  { value: "interviewed", label: "Опрошен" },
  { value: "offer", label: "Оффер" },
  { value: "hired", label: "Принят" },
  { value: "rejected", label: "Отклонён" },
];

const sortOptions: ReadonlyArray<{ value: CandidatesSort; label: string }> = [
  { value: "date_desc", label: "Дата добавления: новые сверху" },
  { value: "date_asc", label: "Дата добавления: старые сверху" },
  { value: "score_desc", label: "Оценка: высокая → низкая" },
  { value: "score_asc", label: "Оценка: низкая → высокая" },
];

const sortValues: ReadonlyArray<CandidatesSort> = sortOptions.map((x) => x.value);
const statusValues: ReadonlyArray<CandidatesStatusFilter> = statusOptions.map((x) => x.value);

function isSortValue(value: string): value is CandidatesSort {
  return sortValues.includes(value as CandidatesSort);
}

function isStatusValue(value: string): value is CandidatesStatusFilter {
  return statusValues.includes(value as CandidatesStatusFilter);
}

export function CandidatesFiltersBar({
  filterVacancy,
  filterScore,
  filterStatus,
  statusLabels,
  nameQuery,
  sort,
  vacancies,
  isMobile,
  hasActiveFilters,
  activeFiltersCount,
  onVacancyChange,
  onScoreChange,
  onStatusChange,
  onNameQueryChange,
  onSortChange,
  onReset,
}: CandidatesFiltersBarProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isVacancyOpen, setIsVacancyOpen] = useState(false);
  const panelId = useId();
  const nameSearchId = useId();

  const safeActiveCount = useMemo(() => {
    return Math.max(0, Math.trunc(activeFiltersCount));
  }, [activeFiltersCount]);

  const sortLabel = useMemo(() => {
    return sortOptions.find((x) => x.value === sort)?.label ?? sortOptions[0].label;
  }, [sort]);

  const selectedVacancy = useMemo(() => {
    return filterVacancy === "all" ? null : vacancies.find((vacancy) => vacancy.id === filterVacancy) ?? null;
  }, [filterVacancy, vacancies]);

  const vacancyLabel = selectedVacancy?.title ?? (filterVacancy === "all" ? "Все вакансии" : "Вакансия");
  const statusLabel = filterStatus === "all" ? "Все статусы" : statusLabels[filterStatus];

  const panelContent = (
    <div id={panelId} className="flex flex-col gap-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Сортировка</p>
        <Select
          value={sort}
          onValueChange={(value) => {
            const next = isSortValue(value) ? value : "date_desc";
            onSortChange(next);
          }}
        >
          <SelectTrigger className="w-full" aria-label="Сортировка кандидатов">
            <SelectValue placeholder="Сортировка" />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={() => {
          onReset();
          setIsPanelOpen(false);
        }}
        disabled={!hasActiveFilters}
      >
        Сбросить фильтры
      </Button>
    </div>
  );

  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-[260px]">
        <label className="sr-only" htmlFor={nameSearchId}>
          Поиск по ФИО
        </label>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id={nameSearchId}
          value={nameQuery}
          onChange={(e) => onNameQueryChange(e.target.value)}
          placeholder="Поиск по ФИО"
          maxLength={120}
          className="h-10 pl-9"
        />
      </div>

      <Popover open={isVacancyOpen} onOpenChange={setIsVacancyOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={isVacancyOpen}
            aria-label="Фильтр по вакансии"
            className="w-full justify-between px-3 font-normal sm:w-[220px]"
          >
            <span className="min-w-0 truncate">{vacancyLabel}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
          <Command>
            <CommandInput placeholder="Поиск по вакансии" />
            <CommandList className="max-h-[260px]">
              <CommandEmpty>Вакансии не найдены.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="Все вакансии all"
                  onSelect={() => {
                    onVacancyChange("all");
                    setIsVacancyOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">Все вакансии</span>
                  <Check className={cn("h-4 w-4 shrink-0", filterVacancy === "all" ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                </CommandItem>
                {vacancies.map((vacancy) => (
                  <CommandItem
                    key={vacancy.id}
                    value={[vacancy.title, vacancy.id].join(" ")}
                    onSelect={() => {
                      onVacancyChange(vacancy.id);
                      setIsVacancyOpen(false);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate" title={vacancy.title}>
                      {vacancy.title}
                    </span>
                    <Check className={cn("h-4 w-4 shrink-0", filterVacancy === vacancy.id ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Select
        value={filterStatus}
        onValueChange={(value) => {
          const next = isStatusValue(value) ? value : "all";
          onStatusChange(next);
        }}
      >
        <SelectTrigger className="w-full sm:w-[200px]" aria-label="Фильтр по статусу кандидата">
          <SelectValue placeholder="Статус кандидата">{statusLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {statusOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Фильтр по соответствию вакансии">
        {scoreOptions.map((option) => {
          const isActive = filterScore === option.value;
          return (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={isActive ? "default" : "outline"}
              aria-pressed={isActive}
              onClick={() => onScoreChange(option.value)}
              className="h-8"
            >
              {option.label}
            </Button>
          );
        })}
      </div>

      {isMobile ? (
        <Sheet open={isPanelOpen} onOpenChange={setIsPanelOpen}>
          <Button
            type="button"
            size="sm"
            variant={safeActiveCount > 0 ? "default" : "outline"}
            className="h-8 gap-2"
            aria-expanded={isPanelOpen}
            aria-controls={panelId}
            onClick={() => setIsPanelOpen(true)}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Фильтры
            {safeActiveCount > 0 ? <Badge variant="secondary">{safeActiveCount}</Badge> : null}
          </Button>
          <SheetContent side="bottom" className="max-h-[85dvh]">
            <SheetTitle>Фильтры</SheetTitle>
            <SheetDescription className="mt-1 text-xs">Текущая сортировка: {sortLabel}</SheetDescription>
            <div className="mt-4">{panelContent}</div>
          </SheetContent>
        </Sheet>
      ) : (
        <Popover open={isPanelOpen} onOpenChange={setIsPanelOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant={safeActiveCount > 0 ? "default" : "outline"}
              className="h-8 gap-2"
              aria-expanded={isPanelOpen}
              aria-controls={panelId}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Фильтры
              {safeActiveCount > 0 ? <Badge variant="secondary">{safeActiveCount}</Badge> : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80">
            {panelContent}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
