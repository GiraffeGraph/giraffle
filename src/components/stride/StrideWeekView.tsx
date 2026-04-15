"use client";

import { useEffect, useMemo, useRef } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import type { CalendarTodo } from "./stride.types";
import { StrideTodoCard } from "./StrideTodoCard";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  r.setDate(r.getDate() - r.getDay());
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

interface SlotProps {
  date: Date;
  hour: number;
  todos: CalendarTodo[];
  onToggle: (id: string, checked: boolean) => void;
}

function TimeSlot({ date, hour, todos, onToggle }: SlotProps) {
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
    <div ref={ref} className="stride-time-slot" data-hour={hour}>
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
  );
}

interface AllDaySlotProps {
  date: Date;
  todos: CalendarTodo[];
  onToggle: (id: string, checked: boolean) => void;
}

function AllDaySlot({ date, todos, onToggle }: AllDaySlotProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      getData: () => ({
        type: "stride:slot",
        date: date.toISOString(),
        hour: -1,
      }),
    });
  }, [date]);

  return (
    <div ref={ref} className="stride-allday-slot">
      {todos.map((t) => (
        <StrideTodoCard key={t.id} todo={t} variant="calendar" onToggle={onToggle} />
      ))}
    </div>
  );
}

interface StrideWeekViewProps {
  anchor: Date;
  todos: CalendarTodo[];
  onToggle: (id: string, checked: boolean) => void;
  customDays?: number;
}

export function StrideWeekView({
  anchor,
  todos,
  onToggle,
  customDays,
}: StrideWeekViewProps) {
  const days = useMemo(() => {
    const count = customDays ?? 7;
    const base = customDays ? startOfDay(anchor) : startOfWeek(anchor);
    return Array.from({ length: count }, (_, i) => addDays(base, i));
  }, [anchor, customDays]);

  const today = startOfDay(new Date());

  // Group todos by day+hour
  const byDayHour = useMemo(() => {
    const map = new Map<string, CalendarTodo[]>();
    for (const t of todos) {
      if (!t.dueDate) continue;
      const d = new Date(t.dueDate);
      const dayKey = startOfDay(d).toISOString();
      const hour = d.getHours();
      const key = `${dayKey}__${hour}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [todos]);

  // All-day todos (hour exactly 0 AND minute 0 AND second 0 treated as all-day placeholder — we use hour === 8 for dropped items but truly unspecified = 8 AM, so all-day = none by default)
  // We keep all-day row for future all-day events; for now show nothing there
  const allDayByDay = useMemo(() => {
    const map = new Map<string, CalendarTodo[]>();
    return map;
  }, []);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to 7 AM on mount
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const slotHeight = 56;
    el.scrollTop = slotHeight * 7;
  }, []);

  const colCount = days.length;

  return (
    <div className="stride-week-view" style={{ "--stride-col-count": colCount } as React.CSSProperties}>
      {/* Column headers */}
      <div className="stride-week-header-row">
        <div className="stride-time-gutter" />
        {days.map((d) => {
          const isToday = isSameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              className={`stride-day-header${isToday ? " stride-day-header--today" : ""}`}
            >
              <span className="stride-day-header-label">
                {DAY_LABELS[d.getDay()]}
              </span>
              <span className={`stride-day-header-num${isToday ? " stride-day-header-num--today" : ""}`}>
                {d.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* All-day row */}
      <div className="stride-allday-row">
        <div className="stride-time-gutter stride-time-gutter--allday">
          <span>All day</span>
        </div>
        {days.map((d) => (
          <AllDaySlot
            key={d.toISOString()}
            date={d}
            todos={allDayByDay.get(startOfDay(d).toISOString()) ?? []}
            onToggle={onToggle}
          />
        ))}
      </div>

      {/* Scrollable time grid */}
      <div className="stride-time-grid-scroll" ref={scrollContainerRef}>
        <div className="stride-time-grid">
          {HOURS.map((h) => (
            <div key={h} className="stride-hour-row">
              <div className="stride-time-gutter stride-time-gutter--hour">
                <span>{formatHour(h)}</span>
              </div>
              {days.map((d) => {
                const dayKey = startOfDay(d).toISOString();
                const slotTodos = byDayHour.get(`${dayKey}__${h}`) ?? [];
                return (
                  <TimeSlot
                    key={d.toISOString()}
                    date={d}
                    hour={h}
                    todos={slotTodos}
                    onToggle={onToggle}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
