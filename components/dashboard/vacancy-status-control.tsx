"use client";

import * as React from "react";
import { Check } from "lucide-react";

import type { Vacancy } from "@/types";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const statusLabels: Record<Vacancy["status"], string> = {
  draft: "Черновик",
  active: "Активна",
  paused: "На паузе",
  closed: "Закрыта",
};

const statusClasses: Record<Vacancy["status"], string> = {
  draft: "bg-gray-500 text-white border-gray-500",
  active: "bg-green-600 text-white border-green-600",
  paused: "bg-yellow-500 text-white border-yellow-500",
  closed: "bg-red-600 text-white border-red-600",
};

const statusOptions: Vacancy["status"][] = ["draft", "active", "paused", "closed"];

export function VacancyStatusControl({
  status,
  disabled,
  onChange,
  className,
  align = "end",
}: {
  status: Vacancy["status"];
  disabled?: boolean;
  onChange: (nextStatus: Vacancy["status"]) => void | Promise<void>;
  className?: string;
  align?: "start" | "center" | "end";
}) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [pendingStatus, setPendingStatus] = React.useState<Vacancy["status"] | null>(null);

  function runStatusChange(nextStatus: Vacancy["status"]) {
    if (disabled || nextStatus === status) return;
    if (nextStatus === "closed" && status !== "closed") {
      setPendingStatus(nextStatus);
      setConfirmOpen(true);
      return;
    }
    void onChange(nextStatus);
  }

  function confirmClosed() {
    if (disabled) return;
    if (pendingStatus !== "closed") return;
    setConfirmOpen(false);
    setPendingStatus(null);
    void onChange("closed");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex min-w-0 max-w-full shrink-0 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Статус вакансии: ${statusLabels[status]}. Нажмите, чтобы изменить`}
            disabled={disabled}
            data-prevent-details="true"
          >
            <Badge
              variant="outline"
              className={`max-w-full whitespace-nowrap shadow-none ${statusClasses[status]} ${disabled ? "opacity-70" : ""} ${className ?? ""}`.trim()}
            >
              {statusLabels[status]}
            </Badge>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-56" data-prevent-details="true">
          <div className="px-2 py-1.5 text-xs text-muted-foreground">Изменить статус вакансии</div>
          <DropdownMenuSeparator />
          {statusOptions.map((option) => (
            <DropdownMenuItem
              key={option}
              onSelect={() => runStatusChange(option)}
              disabled={disabled || status === option}
              className="flex items-center justify-between"
            >
              <span>{statusLabels[option]}</span>
              {status === option ? <Check className="h-4 w-4 text-muted-foreground" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(nextOpen) => {
          setConfirmOpen(nextOpen);
          if (!nextOpen) setPendingStatus(null);
        }}
      >
        <AlertDialogContent data-prevent-details="true">
          <AlertDialogHeader>
            <AlertDialogTitle>Закрыть вакансию?</AlertDialogTitle>
            <AlertDialogDescription>
              После закрытия вакансия останется в истории. При необходимости статус можно изменить позже.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPendingStatus(null);
              }}
            >
              Отмена
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmClosed}>Закрыть вакансию</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
