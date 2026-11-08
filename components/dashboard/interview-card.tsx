"use client";

import { useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Clock, Link as LinkIcon, MapPin, Pencil, Phone, UserRound, Video, XCircle } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

import type { Interview, InterviewListItem } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatUserTimeZoneLabel } from "@/lib/time-zone";
import { cn } from "@/lib/utils";

const typeLabels: Record<Interview["type"], string> = {
  phone: "Телефон",
  video: "Видео",
  "in-person": "Офис",
  technical: "Техническое",
};

const statusLabels: Record<Interview["status"], string> = {
  scheduled: "Запланировано",
  completed: "Завершено",
  cancelled: "Отменено",
};

const statusClasses: Record<Interview["status"], string> = {
  scheduled: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  completed: "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300",
  cancelled: "border-muted bg-muted text-muted-foreground",
};

function initials(name: string): string {
  const value = name.trim() || "Собеседование";
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function typeIcon(type: Interview["type"]) {
  if (type === "video") return <Video className="h-4 w-4 shrink-0" aria-hidden="true" />;
  if (type === "phone") return <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />;
  if (type === "in-person") return <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />;
  return <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />;
}

export function InterviewCard({
  interview,
  className,
  onEdit,
  onCancel,
  onComplete,
}: {
  interview: InterviewListItem;
  className?: string;
  onEdit?: (interview: Extract<InterviewListItem, { accessLevel: "manage" }>) => void;
  onCancel?: (interview: Extract<InterviewListItem, { accessLevel: "manage" }>) => void;
  onComplete?: (interview: Extract<InterviewListItem, { accessLevel: "manage" }>) => void;
}) {
  const canManage = interview.accessLevel === "manage";
  const isLimited = interview.accessLevel === "interviewer_only";
  const title = interview.displayTitle;
  const subtitle = interview.displaySubtitle;
  const showActions = canManage && interview.status === "scheduled";
  const canViewMeetingContext = canManage || isLimited;
  const [timeZoneLabel, setTimeZoneLabel] = useState("");
  const finalStatusNote =
    canManage && interview.status === "completed" && interview.completionNote
      ? { label: "Итог собеседования", text: interview.completionNote }
      : canManage && interview.status === "cancelled" && interview.cancelNote
        ? { label: "Причина отмены", text: interview.cancelNote }
        : null;

  useEffect(() => {
    setTimeZoneLabel(formatUserTimeZoneLabel(interview.scheduledAt));
  }, [interview.scheduledAt]);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="p-4">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar className="h-11 w-11 shrink-0 border">
            {canManage ? <AvatarImage src={interview.candidate.avatar} alt={title} /> : null}
            <AvatarFallback>{isLimited ? <UserRound className="h-5 w-5" aria-hidden="true" /> : initials(title)}</AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold">{title}</h3>
                <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
              </div>
              <Badge variant="outline" className={cn("w-fit shrink-0", statusClasses[interview.status])}>
                {statusLabels[interview.status]}
              </Badge>
            </div>

            <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <div className="flex min-w-0 items-center gap-2">
                <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate">
                    {format(interview.scheduledAt, "d MMMM, HH:mm", { locale: ru })} · {interview.durationMinutes} мин
                  </span>
                  {timeZoneLabel ? <span className="block truncate text-xs">Ваш часовой пояс: {timeZoneLabel}</span> : null}
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-2">
                {typeIcon(interview.type)}
                <span className="truncate">{typeLabels[interview.type]}</span>
              </div>
            </div>

            <div className="min-w-0 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Интервьюеры: </span>
              <span className="break-words">
                {interview.interviewers.length > 0 ? interview.interviewers.map((person) => person.name).join(", ") : "не выбраны"}
              </span>
            </div>

            {canViewMeetingContext && (interview.meetingUrl || interview.location) ? (
              <div className="flex min-w-0 flex-col gap-2 text-sm sm:flex-row sm:flex-wrap">
                {interview.meetingUrl ? (
                  <a
                    href={interview.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-w-0 items-center gap-2 text-primary hover:underline"
                  >
                    <LinkIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">Ссылка на встречу</span>
                  </a>
                ) : null}
                {interview.location ? (
                  <span className="inline-flex min-w-0 items-center gap-2 text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="break-words">{interview.location}</span>
                  </span>
                ) : null}
              </div>
            ) : null}

            {canManage && interview.notes ? <p className="break-words text-sm leading-relaxed">{interview.notes}</p> : null}

            {finalStatusNote ? (
              <div className="min-w-0 rounded-md border bg-muted/40 p-3 text-sm">
                <p className="font-medium text-foreground">{finalStatusNote.label}</p>
                <p className="whitespace-pre-wrap break-words leading-relaxed text-muted-foreground">{finalStatusNote.text}</p>
              </div>
            ) : null}

            {showActions ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" size="sm" variant="outline" onClick={() => onEdit?.(interview)}>
                  <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                  Изменить
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => onCancel?.(interview)}>
                  <XCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                  Отменить
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => onComplete?.(interview)}>
                  <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Завершить
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
