"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronsUpDown } from "lucide-react";

import type { Candidate, Interview, Vacancy } from "@/types";
import type { InterviewConflict, InterviewerOption } from "@/services/data/interviews";
import { listCandidatesPage } from "@/services/data/candidates";
import type { CalendarSlotSelection } from "@/components/dashboard/full-calendar-interviews";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { resolveInterviewCandidatesForVacancy } from "@/lib/interviews/candidate-options";
import { formatUserTimeZoneLabel } from "@/lib/time-zone";
import { cn } from "@/lib/utils";

export type InterviewFormSubmitInput = {
  candidateId: string;
  vacancyId: string;
  scheduledAt: string;
  durationMinutes: number;
  type: Interview["type"];
  interviewerIds: string[];
  meetingUrl?: string;
  location?: string;
  notes?: string;
  allowConflicts?: boolean;
};

const interviewTypeLabels: Record<Interview["type"], string> = {
  phone: "Телефон",
  video: "Видео",
  "in-person": "Офис",
  technical: "Техническое",
};

const DEFAULT_INTERVIEW_DURATION_MINUTES = 30;

const conflictTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function toLocalDateTimeInput(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatConflictTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return conflictTimeFormatter.format(date);
}

function resolveDraftSlot(scheduledAt: string, durationMinutes: string): CalendarSlotSelection | null {
  const start = new Date(scheduledAt);
  const duration = Number(durationMinutes);
  if (
    !scheduledAt ||
    Number.isNaN(start.getTime()) ||
    !Number.isFinite(duration) ||
    !Number.isInteger(duration) ||
    duration < 5 ||
    duration > 480
  ) return null;

  return {
    start,
    end: new Date(start.getTime() + duration * 60_000),
    allDay: false,
  };
}

function formatPossessiveName(name: string): string {
  if (name.endsWith("а")) return `${name.slice(0, -1)}ы`;
  if (name.endsWith("я")) return `${name.slice(0, -1)}и`;
  return name;
}

function formatInterviewConflictMessage(conflict: InterviewConflict): string {
  const time = formatConflictTime(conflict.startsAt);
  const timeText = time ? ` в ${time}` : "";
  if (conflict.kind === "candidate") {
    return `У кандидата уже есть собеседование${timeText}. Можно сохранить, если это ожидаемо.`;
  }

  const interviewerName = conflict.interviewerName ? formatPossessiveName(conflict.interviewerName) : "интервьюера";
  return `У ${interviewerName} уже есть встреча${timeText}. Можно сохранить, если это ожидаемо.`;
}

function trimOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function isValidHttpUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

type PickerOption = {
  id: string;
  label: string;
  description?: string;
  keywords?: string;
};

function mergePickerOptions(...groups: Array<Array<PickerOption | null | undefined>>): PickerOption[] {
  const seen = new Set<string>();
  const result: PickerOption[] = [];

  for (const group of groups) {
    for (const option of group) {
      if (!option || seen.has(option.id)) continue;
      seen.add(option.id);
      result.push(option);
    }
  }

  return result;
}

function optionSearchValue(option: PickerOption): string {
  return [option.id, option.label, option.description, option.keywords].filter(Boolean).join(" ");
}

function SearchableSinglePicker({
  id,
  value,
  options,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  disabled = false,
  loading = false,
  onSearchChange,
  onChange,
}: {
  id: string;
  value: string;
  options: PickerOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  disabled?: boolean;
  loading?: boolean;
  onSearchChange?: (value: string) => void;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between px-3 font-normal"
        >
          <span className={cn("min-w-0 truncate", !selectedOption && "text-muted-foreground")}>
            {selectedOption?.label ?? placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={!onSearchChange}>
          <CommandInput placeholder={searchPlaceholder} onValueChange={onSearchChange} />
          <CommandList className="max-h-[260px]">
            <CommandEmpty>{loading ? "Ищем..." : emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={optionSearchValue(option)}
                  onSelect={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{option.label}</span>
                    {option.description ? <span className="truncate text-xs text-muted-foreground">{option.description}</span> : null}
                  </div>
                  <Check className={cn("h-4 w-4 shrink-0", value === option.id ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SearchableInterviewerPicker({
  interviewers,
  selectedIds,
  onToggle,
}: {
  interviewers: InterviewerOption[];
  selectedIds: string[];
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <div className="rounded-md border">
      <Command>
        <CommandInput placeholder="Поиск по интервьюеру" />
        <CommandList className="max-h-[260px]">
          <CommandEmpty>Интервьюеры не найдены.</CommandEmpty>
          <CommandGroup>
            {interviewers.map((person) => {
              const selected = selectedIds.includes(person.id);

              return (
                <CommandItem
                  key={person.id}
                  value={[person.name, person.email, person.role].filter(Boolean).join(" ")}
                  onSelect={() => onToggle(person.id, !selected)}
                >
                  <Check className={cn("h-4 w-4 shrink-0", selected ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{person.name}</span>
                    {person.email ? <span className="block truncate text-xs text-muted-foreground">{person.email}</span> : null}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}

export function InterviewFormDialog({
  open,
  onOpenChange,
  mode,
  interview,
  initialSlot,
  initialCandidate,
  initialVacancy,
  lockCandidateAndVacancy = false,
  vacancies,
  candidates,
  interviewers,
  conflicts,
  onClearConflicts,
  staleAlert,
  isStale = false,
  onRefreshStale,
  submitting,
  onDraftSlotChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  interview?: Extract<Interview, { status: Interview["status"] }> | (Interview & { accessLevel?: "manage" });
  initialSlot?: CalendarSlotSelection;
  initialCandidate?: Candidate;
  initialVacancy?: Vacancy;
  lockCandidateAndVacancy?: boolean;
  vacancies: Vacancy[];
  candidates: Candidate[];
  interviewers: InterviewerOption[];
  conflicts: InterviewConflict[];
  onClearConflicts?: () => void;
  staleAlert?: React.ReactNode;
  isStale?: boolean;
  onRefreshStale?: () => void;
  submitting?: boolean;
  onDraftSlotChange?: (slot: CalendarSlotSelection | null) => void;
  onSubmit: (input: InterviewFormSubmitInput) => Promise<void> | void;
}) {
  const [candidateId, setCandidateId] = useState("");
  const [vacancyId, setVacancyId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(String(DEFAULT_INTERVIEW_DURATION_MINUTES));
  const [type, setType] = useState<Interview["type"]>("video");
  const [interviewerIds, setInterviewerIds] = useState<string[]>([]);
  const [meetingUrl, setMeetingUrl] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [searchedCandidates, setSearchedCandidates] = useState<Candidate[]>([]);
  const [candidateSearchLoading, setCandidateSearchLoading] = useState(false);
  const [vacancyCandidates, setVacancyCandidates] = useState<Candidate[]>([]);
  const [vacancyCandidatesFor, setVacancyCandidatesFor] = useState("");
  const [vacancyCandidatesTotal, setVacancyCandidatesTotal] = useState<number | null>(null);
  const [vacancyCandidatesLoading, setVacancyCandidatesLoading] = useState(false);
  const [vacancyCandidatesLoadError, setVacancyCandidatesLoadError] = useState<string | null>(null);
  const [vacancyCandidatesReloadKey, setVacancyCandidatesReloadKey] = useState(0);
  const [timeZoneLabel, setTimeZoneLabel] = useState("");

  useEffect(() => {
    if (!open) return;

    const slotMinutes = initialSlot
      ? Math.max(5, Math.round((initialSlot.end.getTime() - initialSlot.start.getTime()) / 60_000))
      : DEFAULT_INTERVIEW_DURATION_MINUTES;

    setCandidateId(initialCandidate?.id ?? (interview && "candidateId" in interview ? interview.candidateId : ""));
    setVacancyId(initialVacancy?.id ?? (interview && "vacancyId" in interview ? interview.vacancyId : ""));
    setScheduledAt(toLocalDateTimeInput(interview?.scheduledAt ?? initialSlot?.start ?? new Date(Date.now() + 60 * 60_000)));
    setDurationMinutes(String(interview?.durationMinutes ?? slotMinutes));
    setType(interview?.type ?? "video");
    setInterviewerIds(interview?.interviewerIds ?? []);
    setMeetingUrl(interview?.meetingUrl ?? "");
    setLocation(interview?.location ?? "");
    setNotes(interview?.notes ?? "");
    setError(null);
    setCandidateSearch("");
    setSearchedCandidates([]);
    setVacancyCandidates([]);
    setVacancyCandidatesFor("");
    setVacancyCandidatesTotal(null);
    setVacancyCandidatesLoading(false);
    setVacancyCandidatesLoadError(null);
    setVacancyCandidatesReloadKey(0);
  }, [open, interview, initialSlot, initialCandidate, initialVacancy]);

  useEffect(() => {
    const date = scheduledAt && !Number.isNaN(new Date(scheduledAt).getTime()) ? new Date(scheduledAt) : new Date();
    setTimeZoneLabel(formatUserTimeZoneLabel(date));
  }, [scheduledAt]);

  useEffect(() => {
    if (isStale && conflicts.length > 0) onClearConflicts?.();
  }, [conflicts.length, isStale, onClearConflicts]);

  useEffect(() => {
    if (!open || lockCandidateAndVacancy || !vacancyId) {
      setVacancyCandidates([]);
      setVacancyCandidatesFor("");
      setVacancyCandidatesTotal(null);
      setVacancyCandidatesLoading(false);
      setVacancyCandidatesLoadError(null);
      return;
    }

    let cancelled = false;
    setVacancyCandidates([]);
    setVacancyCandidatesFor(vacancyId);
    setVacancyCandidatesTotal(null);
    setVacancyCandidatesLoading(true);
    setVacancyCandidatesLoadError(null);

    void listCandidatesPage({
      page: 1,
      pageSize: 50,
      vacancyId,
      scoreFilter: "all",
      sort: "date_desc",
    })
      .then((result) => {
        if (cancelled) return;
        setVacancyCandidates(result.items);
        setVacancyCandidatesTotal(result.total);
        setVacancyCandidatesFor(vacancyId);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to load interview candidates for vacancy:", error);
        setVacancyCandidates([]);
        setVacancyCandidatesFor("");
        setVacancyCandidatesTotal(null);
        setVacancyCandidatesLoadError("Не удалось загрузить кандидатов. Попробуйте ещё раз.");
      })
      .finally(() => {
        if (!cancelled) setVacancyCandidatesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lockCandidateAndVacancy, open, vacancyCandidatesReloadKey, vacancyId]);

  useEffect(() => {
    if (!open || lockCandidateAndVacancy || !vacancyId) {
      setCandidateSearch("");
      setSearchedCandidates([]);
      setCandidateSearchLoading(false);
      return;
    }

    const normalizedSearch = candidateSearch.trim();
    if (!normalizedSearch) {
      setSearchedCandidates([]);
      setCandidateSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setCandidateSearchLoading(true);
      void listCandidatesPage({
        page: 1,
        pageSize: 50,
        vacancyId,
        scoreFilter: "all",
        sort: "date_desc",
        nameQuery: normalizedSearch,
      })
        .then((result) => {
          if (!cancelled) setSearchedCandidates(result.items);
        })
        .catch((error) => {
          if (cancelled) return;
          console.error("Failed to search interview candidates:", error);
          setSearchedCandidates([]);
        })
        .finally(() => {
          if (!cancelled) setCandidateSearchLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [candidateSearch, lockCandidateAndVacancy, open, vacancyId]);

  const baseCandidateOptions = useMemo(() => {
    return resolveInterviewCandidatesForVacancy({
      candidates,
      vacancyCandidates,
      vacancyId,
      vacancyCandidatesFor,
      vacancyCandidatesTotal,
      initialCandidateId: initialCandidate?.id,
    });
  }, [candidates, vacancyCandidates, vacancyCandidatesFor, vacancyCandidatesTotal, vacancyId, initialCandidate?.id]);
  const selectedVacancyHasNoCandidates =
    Boolean(vacancyId) && vacancyCandidatesFor === vacancyId && vacancyCandidatesTotal === 0;

  const selectedCandidateSummary = useMemo<PickerOption | null>(() => {
    if (selectedVacancyHasNoCandidates) return null;
    if (initialCandidate && candidateId === initialCandidate.id) {
      return { id: initialCandidate.id, label: initialCandidate.name, description: initialCandidate.position };
    }
    const interviewCandidate = (interview as { candidate?: Pick<Candidate, "id" | "name"> } | undefined)?.candidate;
    if (interviewCandidate && candidateId === interviewCandidate.id) return { id: interviewCandidate.id, label: interviewCandidate.name };
    const candidate = [...baseCandidateOptions, ...searchedCandidates].find((item) => item.id === candidateId);
    return candidate ? { id: candidate.id, label: candidate.name, description: candidate.position } : null;
  }, [baseCandidateOptions, candidateId, initialCandidate, interview, searchedCandidates, selectedVacancyHasNoCandidates]);

  const vacancyPickerOptions = useMemo<PickerOption[]>(
    () =>
      mergePickerOptions(
        initialVacancy ? [{ id: initialVacancy.id, label: initialVacancy.title }] : [],
        vacancies.map((vacancy) => ({
          id: vacancy.id,
          label: vacancy.title,
          description: vacancy.status === "active" ? "Активна" : "Неактивна",
          keywords: vacancy.location,
        }))
      ),
    [initialVacancy, vacancies]
  );

  const candidatePickerOptions = useMemo<PickerOption[]>(
    () =>
      mergePickerOptions(
        selectedCandidateSummary ? [selectedCandidateSummary] : [],
        (candidateSearch.trim() ? searchedCandidates : baseCandidateOptions).map((candidate) => ({
          id: candidate.id,
          label: candidate.name,
          description: candidate.position,
          keywords: candidate.vacancyId,
        }))
      ),
    [baseCandidateOptions, candidateSearch, searchedCandidates, selectedCandidateSummary]
  );

  function clearConflictsIfNeeded() {
    if (conflicts.length > 0) onClearConflicts?.();
  }

  function notifyDraftSlotChange(nextScheduledAt: string, nextDurationMinutes: string) {
    if (mode !== "create") return;
    onDraftSlotChange?.(resolveDraftSlot(nextScheduledAt, nextDurationMinutes));
  }

  function handleVacancyChange(value: string) {
    clearConflictsIfNeeded();
    setVacancyId(value);
    setCandidateSearch("");
    setSearchedCandidates([]);
    setVacancyCandidatesLoadError(null);
    if (!lockCandidateAndVacancy) setCandidateId("");
  }

  function toggleInterviewer(id: string, checked: boolean) {
    clearConflictsIfNeeded();
    setInterviewerIds((prev) => {
      if (checked) return Array.from(new Set([...prev, id]));
      return prev.filter((item) => item !== id);
    });
  }

  function validate(): string | null {
    if (!vacancyId) return "Выберите вакансию";
    if (selectedVacancyHasNoCandidates) return "В этой вакансии пока нет кандидатов. Добавьте кандидата в вакансию, чтобы назначить собеседование.";
    if (!candidateId) return "Выберите кандидата";
    if (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime())) return "Укажите дату и время собеседования";
    if (new Date(scheduledAt).getTime() <= Date.now()) return "Выберите будущее время собеседования";
    const duration = Number(durationMinutes);
    if (!Number.isInteger(duration) || duration < 5 || duration > 480) return "Длительность должна быть от 5 до 480 минут";
    if (!type) return "Выберите тип собеседования";
    if (interviewerIds.length === 0) return "Добавьте хотя бы одного интервьюера";
    if (!isValidHttpUrl(meetingUrl)) return "Введите корректную ссылку";
    if (meetingUrl.trim().length > 500) return "Ссылка не должна быть длиннее 500 символов";
    if (location.trim().length > 250) return "Адрес не должен быть длиннее 250 символов";
    if (notes.trim().length > 2000) return "Заметка не должна быть длиннее 2000 символов";
    return null;
  }

  async function handleSubmit() {
    if (isStale) {
      setError("Обновите календарь, чтобы продолжить.");
      return;
    }

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    await onSubmit({
      candidateId,
      vacancyId,
      scheduledAt: new Date(scheduledAt).toISOString(),
      durationMinutes: Number(durationMinutes),
      type,
      interviewerIds,
      meetingUrl: trimOptional(meetingUrl),
      location: trimOptional(location),
      notes: trimOptional(notes),
      allowConflicts: conflicts.length > 0,
    });
  }

  const primaryLabel = conflicts.length > 0 ? "Сохранить всё равно" : mode === "edit" ? "Сохранить" : "Назначить";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-visible sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Изменить собеседование" : "Новое собеседование"}</DialogTitle>
          <DialogDescription>
            {lockCandidateAndVacancy ? "Кандидат и вакансия уже выбраны из карточки кандидата." : "Заполните основные поля встречи."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65dvh] pr-3">
          <div className="space-y-4">
            {error ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>Проверьте форму</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {staleAlert ? <div className="space-y-2">{staleAlert}</div> : null}

            {conflicts.length > 0 ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>Есть пересечение по времени</AlertTitle>
                <AlertDescription>
                  <ul className="mt-2 space-y-1">
                    {conflicts.map((conflict) => (
                      <li
                        key={`${conflict.interviewId}-${conflict.kind ?? "interviewer"}-${conflict.interviewerId ?? conflict.candidateId ?? "conflict"}`}
                        className="break-words"
                      >
                        {formatInterviewConflictMessage(conflict)}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="interview-vacancy">
                  Вакансия
                </label>
                <SearchableSinglePicker
                  id="interview-vacancy"
                  value={vacancyId}
                  options={vacancyPickerOptions}
                  placeholder="Выберите вакансию"
                  searchPlaceholder="Поиск по вакансии"
                  emptyMessage="Вакансии не найдены."
                  disabled={lockCandidateAndVacancy}
                  onChange={handleVacancyChange}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="interview-candidate">
                  Кандидат
                </label>
                <SearchableSinglePicker
                  id="interview-candidate"
                  value={candidateId}
                  options={candidatePickerOptions}
                  placeholder={vacancyId ? "Выберите кандидата" : "Сначала выберите вакансию"}
                  searchPlaceholder="Поиск по кандидату"
                  emptyMessage={
                    vacancyCandidatesLoadError ?? (selectedVacancyHasNoCandidates ? "В этой вакансии пока нет кандидатов." : "Кандидаты не найдены.")
                  }
                  disabled={lockCandidateAndVacancy || !vacancyId}
                  loading={candidateSearchLoading || vacancyCandidatesLoading}
                  onSearchChange={setCandidateSearch}
                  onChange={(value) => {
                    clearConflictsIfNeeded();
                    setCandidateId(value);
                  }}
                />
                {vacancyCandidatesLoadError ? (
                  <div className="flex items-center justify-between gap-3 text-sm text-destructive">
                    <p className="min-w-0 break-words">{vacancyCandidatesLoadError}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setVacancyCandidatesReloadKey((current) => current + 1)}
                      disabled={vacancyCandidatesLoading}
                    >
                      Повторить
                    </Button>
                  </div>
                ) : null}
                {selectedVacancyHasNoCandidates ? (
                  <p className="text-sm text-muted-foreground">
                    В этой вакансии пока нет кандидатов. Добавьте кандидата в вакансию, чтобы назначить собеседование.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-medium" htmlFor="interview-time">
                  Дата и время
                </label>
                <Input
                  id="interview-time"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(event) => {
                    clearConflictsIfNeeded();
                    setScheduledAt(event.target.value);
                    notifyDraftSlotChange(event.target.value, durationMinutes);
                  }}
                />
                {timeZoneLabel ? (
                  <p className="text-xs text-muted-foreground">
                    Время указано в вашем часовом поясе: {timeZoneLabel}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="interview-duration">
                  Длительность
                </label>
                <Input
                  id="interview-duration"
                  type="number"
                  inputMode="numeric"
                  min={5}
                  max={480}
                  step={5}
                  value={durationMinutes}
                  onChange={(event) => {
                    clearConflictsIfNeeded();
                    setDurationMinutes(event.target.value);
                    notifyDraftSlotChange(scheduledAt, event.target.value);
                  }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="interview-type">
                Тип
              </label>
              <Select
                value={type}
                onValueChange={(value) => {
                  clearConflictsIfNeeded();
                  setType(value as Interview["type"]);
                }}
              >
                <SelectTrigger id="interview-type">
                  <SelectValue placeholder="Выберите тип собеседования" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(interviewTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Интервьюеры</p>
                <span className="shrink-0 text-xs text-muted-foreground">Выбрано: {interviewerIds.length}</span>
              </div>
              {interviewers.length > 0 ? (
                <SearchableInterviewerPicker interviewers={interviewers} selectedIds={interviewerIds} onToggle={toggleInterviewer} />
              ) : (
                <div className="rounded-md border p-3 text-sm text-muted-foreground">Интервьюеры пока недоступны</div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="interview-url">
                  Ссылка
                </label>
                <Input
                  id="interview-url"
                  type="url"
                  value={meetingUrl}
                  onChange={(event) => {
                    clearConflictsIfNeeded();
                    setMeetingUrl(event.target.value);
                  }}
                  placeholder="https://..."
                  maxLength={500}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="interview-location">
                  Адрес
                </label>
                <Input
                  id="interview-location"
                  value={location}
                  onChange={(event) => {
                    clearConflictsIfNeeded();
                    setLocation(event.target.value);
                  }}
                  maxLength={250}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium" htmlFor="interview-notes">
                  Заметка
                </label>
                <span className="shrink-0 text-xs text-muted-foreground">{notes.length} / 2000</span>
              </div>
              <Textarea
                id="interview-notes"
                value={notes}
                onChange={(event) => {
                  clearConflictsIfNeeded();
                  setNotes(event.target.value);
                }}
                className="min-h-[96px] resize-none"
                maxLength={2000}
              />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Отмена
          </Button>
          {isStale && onRefreshStale ? (
            <Button type="button" variant="outline" onClick={() => void onRefreshStale()} disabled={submitting}>
              Обновить
            </Button>
          ) : null}
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitting || isStale || selectedVacancyHasNoCandidates}>
            {submitting ? "Сохраняем..." : primaryLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
