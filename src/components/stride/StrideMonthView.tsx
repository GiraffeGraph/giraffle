"use client";

import { useEffect, useMemo, useRef } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import type { CalendarTodo } from "./stride.types";
import { StrideTodoCard } from "./StrideTodoCard";

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

interface DayCellProps {
  date: Date;
  todos: CalendarTodo[];
  isCurrentMonth: boolean;
  isToday: boolean;
  onToggle: (id: string, checked: boolean) => void;
}

const MAX_VISIBLE = 3;

function DayCell({ date, todos, isCurrentMonth, isToday, onToggle }: DayCellProps) {
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

  const visible = todos.slice(0, MAX_VISIBLE);
  const overflow = todos.length - MAX_VISIBLE;

  return (
    <div
      ref={ref}
      className={[
        "stride-month-cell",
        isCurrentMonth ? "" : "stride-month-cell--other",
        isToday ? "stride-month-cell--today" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={`stride-month-cell-num${isToday ? " stride-month-cell-num--today" : ""}`}>
        {date.getDate()}
      </span>
      <div className="stride-month-cell-events">
        {visible.map((t) => (
          <StrideTodoCard
            key={t.id}
            todo={t}
            variant="calendar"
            onToggle={onToggle}
          />
        ))}
        {overflow > 0 && (
          <span className="stride-month-overflow">+{overflow} more</span>
        )}
      </div>
    </div>
  );
}

interface StrideMonthViewProps {
  anchor: Date;
  todos: CalendarTodo[];
  onToggle: (id: string, checked: boolean) => void;
}

export function StrideMonthView({ anchor, todos, onToggle }: StrideMonthViewProps) {
  const today = startOfDay(new Date());

  const { days, currentMonth } = useMemo(() => {
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);
    const gridStart = startOfWeek(monthStart);
    const daysNeeded = Math.ceil((monthEnd.getTime() - gridStart.getTime()) / 86400000 + 1);
    const weekCount = Math.ceil(daysNeeded / 7);
    const allDays = Array.from({ length: weekCount * 7 }, (_, i) =>
      addDays(gridStart, i)
    );
    return {
      days: allDays,
      currentMonth: anchor.getMonth(),
    };
  }, [anchor]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarTodo[]>();
    for (const t of todos) {
      if (!t.dueDate) continue;
      const key = startOfDay(new Date(t.dueDate)).toISOString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [todos]);

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div className="stride-month-view">
      {/* Day labels */}
      <div className="stride-month-dow-row">
        {DAY_LABELS.map((l) => (
          <div key={l} className="stride-month-dow">{l}</div>
        ))}
      </div>

      {/* Weeks */}
      <div className="stride-month-grid">
        {weeks.map((week) => (
          <div key={week[0].toISOString()} className="stride-month-week-row">
            {week.map((d) => (
              <DayCell
                key={d.toISOString()}
                date={d}
                todos={byDay.get(startOfDay(d).toISOString()) ?? []}
                isCurrentMonth={d.getMonth() === currentMonth}
                isToday={isSameDay(d, today)}
                onToggle={onToggle}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
