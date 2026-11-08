"use client";

import { useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import type { DateSelectArg, DatesSetArg, EventClickArg, EventContentArg, EventInput, EventMountArg } from "@fullcalendar/core";

import type { InterviewListItem } from "@/types";

export type CalendarSlotSelection = {
  start: Date;
  end: Date;
  allDay: boolean;
};

export type CalendarVisibleRange = {
  from: string;
  to: string;
};

const DRAFT_SELECTION_EVENT_ID = "hiiire-draft-selection";
const SLOT_DURATION_MINUTES = 30;

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function formatDraftSelectionEventId(selection: CalendarSlotSelection): string {
  return `${DRAFT_SELECTION_EVENT_ID}-${selection.start.getTime()}-${selection.end.getTime()}`;
}

function adjustDraftSelectionHeight(arg: EventMountArg) {
  if (!arg.event.id.startsWith(DRAFT_SELECTION_EVENT_ID) || !arg.event.start || !arg.event.end) return;

  const harness = arg.el.closest<HTMLElement>(".fc-timegrid-bg-harness");
  const timeGrid = arg.el.closest<HTMLElement>(".fc-timegrid");
  const slot = timeGrid?.querySelector<HTMLElement>(".fc-timegrid-slot[data-time]");
  if (!harness || !slot) return;

  const durationMs = arg.event.end.getTime() - arg.event.start.getTime();
  if (durationMs <= 0) return;

  const slotHeight = slot.getBoundingClientRect().height;
  if (!Number.isFinite(slotHeight) || slotHeight <= 0) return;

  const height = (durationMs / 60_000 / SLOT_DURATION_MINUTES) * slotHeight;
  harness.style.bottom = "auto";
  harness.style.height = `${Math.max(1, height)}px`;
}

function useCompactCalendarHeader(): boolean {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const media = window.matchMedia("(max-width: 640px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return compact;
}

export function FullCalendarInterviews({
  interviews,
  draftSelection,
  onDatesChange,
  onSelectSlot,
  onSelectInterview,
}: {
  interviews: InterviewListItem[];
  draftSelection?: CalendarSlotSelection | null;
  onDatesChange?: (range: CalendarVisibleRange) => void;
  onSelectSlot?: (slot: CalendarSlotSelection) => void;
  onSelectInterview?: (interview: InterviewListItem) => void;
}) {
  const compact = useCompactCalendarHeader();
  const interviewsById = useMemo(() => new Map(interviews.map((interview) => [interview.id, interview])), [interviews]);

  const events = useMemo<EventInput[]>(() => {
    const interviewEvents = interviews.map((interview) => ({
      id: interview.id,
      title: interview.displayTitle,
      start: interview.scheduledAt.toISOString(),
      end: addMinutes(interview.scheduledAt, interview.durationMinutes).toISOString(),
      classNames: [`hiiire-fc-event-${interview.status}`, interview.accessLevel === "interviewer_only" ? "hiiire-fc-event-limited" : ""],
      extendedProps: {
        subtitle: interview.displaySubtitle,
        status: interview.status,
        accessLevel: interview.accessLevel,
      },
    }));

    if (!draftSelection) return interviewEvents;

    return [
      ...interviewEvents,
      {
        id: formatDraftSelectionEventId(draftSelection),
        start: draftSelection.start.toISOString(),
        end: draftSelection.end.toISOString(),
        allDay: draftSelection.allDay,
        display: "background",
        classNames: ["hiiire-fc-draft-selection"],
      },
    ];
  }, [draftSelection, interviews]);

  function handleDatesSet(arg: DatesSetArg) {
    onDatesChange?.({ from: arg.start.toISOString(), to: arg.end.toISOString() });
  }

  function handleSelect(arg: DateSelectArg) {
    onSelectSlot?.({ start: arg.start, end: arg.end, allDay: arg.allDay });
    arg.view.calendar.unselect();
  }

  function handleEventClick(arg: EventClickArg) {
    const interview = interviewsById.get(arg.event.id);
    if (interview) onSelectInterview?.(interview);
  }

  function renderEventContent(arg: EventContentArg) {
    const subtitle = typeof arg.event.extendedProps.subtitle === "string" ? arg.event.extendedProps.subtitle : "";
    const label = [arg.timeText, arg.event.title, subtitle].filter(Boolean).join(" · ");

    if (arg.view.type.startsWith("timeGrid")) {
      return (
        <div className="hiiire-fc-event-content flex min-w-0 items-center" title={label} aria-label={label}>
          <span className="hiiire-fc-event-time">{arg.timeText}</span>
          <span className="hiiire-fc-event-main">
            <span className="hiiire-fc-event-title">{arg.event.title}</span>
            {subtitle ? (
              <span className="hiiire-fc-event-subtitle">{subtitle}</span>
            ) : null}
          </span>
        </div>
      );
    }

    return (
      <div className="hiiire-fc-event-content" title={label} aria-label={label}>
        <span className="hiiire-fc-event-time">{arg.timeText}</span>
        <span className="hiiire-fc-event-main">
          <span className="hiiire-fc-event-title">{arg.event.title}</span>
          {subtitle ? (
            <span className="hiiire-fc-event-subtitle">{subtitle}</span>
          ) : null}
        </span>
      </div>
    );
  }

  return (
    <div className="hiiire-full-calendar rounded-lg border bg-background p-2 sm:p-4">
      <FullCalendar
        key={compact ? "compact" : "wide"}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
        initialView={compact ? "listWeek" : "timeGridWeek"}
        headerToolbar={
          compact
            ? { left: "prev,next", center: "title", right: "today" }
            : { left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek" }
        }
        buttonText={{
          today: "Сегодня",
          month: "Месяц",
          week: "Неделя",
          day: "День",
          list: "Список",
        }}
        allDayText="Весь день"
        locale="ru"
        height="auto"
        expandRows
        nowIndicator
        selectable
        selectMirror={false}
        select={handleSelect}
        datesSet={handleDatesSet}
        eventClick={handleEventClick}
        eventContent={renderEventContent}
        eventDidMount={adjustDraftSelectionHeight}
        events={events}
        slotMinTime="00:00:00"
        slotMaxTime="24:00:00"
        slotDuration="00:30:00"
        snapDuration="00:30:00"
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        slotEventOverlap={false}
        eventMinHeight={48}
        eventShortHeight={48}
        firstDay={1}
        eventDisplay="block"
        dayMaxEvents={3}
        noEventsContent="Собеседований пока нет"
      />
    </div>
  );
}
