"use client";

import * as React from "react";
import { Check } from "lucide-react";

import type { Candidate } from "@/types";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const statusLabels: Record<Candidate["status"], string> = {
  new: "Новый",
  reviewing: "Рассмотрение",
  "security-check": "Проверка СБ",
  "interview-scheduled": "Собеседование",
  interviewed: "Опрошен",
  offer: "Оффер",
  hired: "Принят",
  rejected: "Отклонён",
};

const statusColors: Record<Candidate["status"], string> = {
  new: "bg-blue-600 text-white border-blue-600 dark:bg-blue-500 dark:border-blue-500",
  reviewing:
    "bg-yellow-200 text-yellow-950 border-yellow-300",
  "security-check":
    "bg-amber-200 text-amber-950 border-amber-300",
  "interview-scheduled": "bg-purple-600 text-white border-purple-600 dark:bg-purple-500 dark:border-purple-500",
  interviewed: "bg-indigo-600 text-white border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500",
  offer: "bg-green-600 text-white border-green-600 dark:bg-green-500 dark:border-green-500",
  hired: "bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:border-emerald-500",
  rejected: "bg-red-600 text-white border-red-600 dark:bg-red-500 dark:border-red-500",
};

const statusChangeOptions: Array<{ value: Candidate["status"]; label: string }> = [
  { value: "reviewing", label: statusLabels.reviewing },
  { value: "security-check", label: statusLabels["security-check"] },
  { value: "interview-scheduled", label: statusLabels["interview-scheduled"] },
  { value: "interviewed", label: statusLabels.interviewed },
  { value: "offer", label: statusLabels.offer },
  { value: "hired", label: statusLabels.hired },
  { value: "rejected", label: statusLabels.rejected },
];

export function CandidateStatusControl({
  candidateId,
  status,
  disabled,
  onChange,
  align = "end",
  compact = false,
  className,
}: {
  candidateId: string;
  status: Candidate["status"];
  disabled?: boolean;
  onChange: (candidateId: string, nextStatus: Candidate["status"]) => void | Promise<void>;
  align?: "start" | "center" | "end";
  compact?: boolean;
  className?: string;
}) {
  const triggerClassName = compact
    ? "inline-flex min-w-0 max-w-full rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    : "inline-flex min-w-0 max-w-full shrink-0 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  const badgeClassName = compact
    ? "max-w-full whitespace-normal break-words py-1 leading-tight text-left shadow-none"
    : "max-w-full whitespace-nowrap shadow-none";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={triggerClassName}
          aria-label={`Статус кандидата: ${statusLabels[status]}. Нажмите, чтобы изменить`}
          disabled={disabled}
          data-prevent-details="true"
        >
          <Badge
            variant="outline"
            className={`${badgeClassName} ${statusColors[status]} ${disabled ? "opacity-70" : ""} ${className ?? ""}`.trim()}
          >
            {statusLabels[status]}
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56" data-prevent-details="true">
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          Изменить статус (нельзя вернуть в «Новый»)
        </div>
        <DropdownMenuSeparator />
        {statusChangeOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => void onChange(candidateId, option.value)}
            disabled={disabled || status === option.value}
            className="flex items-center justify-between"
          >
            <span>{option.label}</span>
            {status === option.value ? <Check className="h-4 w-4 text-muted-foreground" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
