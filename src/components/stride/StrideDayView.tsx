"use client";

import { useEffect, useMemo, useRef } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import type { CalendarTodo } from "./stride.types";
import { StrideTodoCard } from "./StrideTodoCard";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

interface HourRowProps {
  date: Date;
  hour: number;
  todos: CalendarTodo[];
  onToggle: (id: string, checked: boolean) => void;
}

function HourRow({ date, hour, todos, onToggle }: HourRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      getData: () => ({
        type: "stride:slot",
        date: date.toISOString(),
        hour,
      }),
    });
  }, [date, hour]);

  return (
    <div ref={ref} className="stride-day-hour-row" data-hour={hour}>
      <div className="stride-day-time-label">{formatHour(hour)}</div>
      <div className="stride-day-hour-content">
        {todos.map((t) => (
          <StrideTodoCard
            key={t.id}
            todo={t}
            variant="calendar"
            onToggle={onToggle}
            showTime
          />
        ))}
      </div>
    </div>
  );
}

interface StrideDayViewProps {
  anchor: Date;
  todos: CalendarTodo[];
  onToggle: (id: string, checked: boolean) => void;
}

export function StrideDayView({ anchor, todos, onToggle }: StrideDayViewProps) {
  const today = startOfDay(new Date());
  const isToday = isSameDay(anchor, today);

  const dayTodos = useMemo(
    () =>
      todos.filter(
        (t) => t.dueDate && isSameDay(new Date(t.dueDate), anchor)
      ),
    [todos, anchor]
  );

  const byHour = useMemo(() => {
    const map = new Map<number, CalendarTodo[]>();
    for (const t of dayTodos) {
      const h = new Date(t.dueDate!).getHours();
      if (!map.has(h)) map.set(h, []);
      map.get(h)!.push(t);
    }
    return map;
  }, [dayTodos]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 56 * 7;
  }, []);

  const dateStr = anchor.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="stride-day-view">
      <div className={`stride-day-view-header${isToday ? " stride-day-view-header--today" : ""}`}>
        <span>{dateStr}</span>
        {isToday && <span className="stride-today-badge">Today</span>}
      </div>
      <div className="stride-day-grid-scroll" ref={scrollRef}>
        {HOURS.map((h) => (
          <HourRow
            key={h}
            date={startOfDay(anchor)}
            hour={h}
            todos={byHour.get(h) ?? []}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}
