"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import type { CalendarTodo } from "./stride.types";
import { StrideDurationPicker } from "./StrideDurationPicker";
import { setTodoDurationAction } from "@/server/api/notes";

// 1 px = 1 minute — so each hour row is 60px tall
export const MIN_PX = 1; // 1 minute = 1px
export const HOUR_PX = 60; // 60px per hour
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GUTTER_WIDTH = 52;
const MIN_DURATION = 15; // px / minutes

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

const QUADRANT_COLORS: Record<string, string> = {
  DO: "var(--md-sys-color-error)",
  SCHEDULE: "var(--md-sys-color-success)",
  DELEGATE: "var(--md-sys-color-warning)",
  ELIMINATE: "var(--md-sys-color-outline)",
};

// ─── Positioned todo event block ─────────────────────────────

interface EventBlockProps {
  todo: CalendarTodo;
  onToggle: (id: string, checked: boolean) => void;
  onDurationChange: (id: string, minutes: number) => void;
}

function EventBlock({ todo, onToggle, onDurationChange }: EventBlockProps) {
  const dragRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);
  const [showDurationPicker, setShowDurationPicker] = useState(false);

  const top = useMemo(() => {
    const d = new Date(todo.dueDate!);
    return d.getHours() * HOUR_PX + d.getMinutes() * MIN_PX;
  }, [todo.dueDate]);

  const height = Math.max(todo.durationMinutes * MIN_PX, MIN_DURATION);
  const accentColor = todo.quadrant
    ? QUADRANT_COLORS[todo.quadrant]
    : "var(--md-sys-color-primary)";

  const timeStr = useMemo(() => {
    const d = new Date(todo.dueDate!);
    const start = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const endD = new Date(d.getTime() + todo.durationMinutes * 60000);
    const end = endD.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${start} – ${end}`;
  }, [todo.dueDate, todo.durationMinutes]);

  // Make the block draggable
  useEffect(() => {
    const el = dragRef.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({ type: "stride:todo", todoId: todo.id }),
    });
  }, [todo.id]);

  // Resize handle (drag to change duration)
  useEffect(() => {
    const handle = resizeRef.current;
    if (!handle) return;

    let startY = 0;
    let startDuration = todo.durationMinutes;

    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientY - startY; // px = minutes
      const newDuration = Math.max(
        MIN_DURATION,
        Math.round((startDuration + delta) / 15) * 15
      );
      onDurationChange(todo.id, newDuration);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startY = e.clientY;
      startDuration = todo.durationMinutes;
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    handle.addEventListener("mousedown", onMouseDown);
    return () => {
      handle.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [todo.id, todo.durationMinutes, onDurationChange]);

  const compact = height < 40;

  return (
    <div
      ref={dragRef}
      className={`stride-event-block${todo.checked ? " stride-event-block--checked" : ""}${compact ? " stride-event-block--compact" : ""}`}
      style={{
        top,
        height,
        "--stride-event-accent": accentColor,
      } as React.CSSProperties}
      draggable
    >
      {/* Check button */}
      <button
        type="button"
        className="stride-event-check"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(todo.id, !todo.checked);
        }}
      >
        {todo.checked ? (
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
            check_circle
          </span>
        ) : (
          <span className="stride-event-check-ring" />
        )}
      </button>

      <div className="stride-event-body">
        <span className="stride-event-title">
          {todo.text || "Untitled task"}
        </span>
        {!compact && (
          <span className="stride-event-time">{timeStr}</span>
        )}
        {!compact && (
          <span className="stride-event-note">
            {todo.note.icon ? `${todo.note.icon} ` : ""}
            {todo.note.title}
          </span>
        )}
      </div>

      {/* Duration badge — click to open picker */}
      {!compact && (
        <div className="stride-event-duration-wrap">
          <button
            type="button"
            className="stride-event-duration-btn"
            onClick={(e) => {
              e.stopPropagation();
              setShowDurationPicker((v) => !v);
            }}
            title="Change duration"
          >
            {todo.durationMinutes >= 60
              ? `${todo.durationMinutes / 60}h`
              : `${todo.durationMinutes}m`}
          </button>
          {showDurationPicker && (
            <StrideDurationPicker
              value={todo.durationMinutes}
              onChange={(m) => {
                onDurationChange(todo.id, m);
                setShowDurationPicker(false);
              }}
              onClose={() => setShowDurationPicker(false)}
            />
          )}
        </div>
      )}

      {/* Resize handle */}
      <div ref={resizeRef} className="stride-event-resize-handle" />
    </div>
  );
}

// ─── Day column (drop zone + positioned events) ───────────────

interface DayColumnProps {
  date: Date;
  todos: CalendarTodo[];
  onToggle: (id: string, checked: boolean) => void;
  onDurationChange: (id: string, minutes: number) => void;
}

function DayColumn({ date, todos, onToggle, onDurationChange }: DayColumnProps) {
  const columnRef = useRef<HTMLDivElement>(null);

  // Make the whole column a drop target — we derive the hour from pointer position
  useEffect(() => {
    const el = columnRef.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      getData: ({ input }) => {
        // Calculate hour + minute from y position inside the column
        const rect = el.getBoundingClientRect();
        const relY = Math.max(0, input.clientY - rect.top);
        const totalMinutes = Math.floor(relY); // 1px = 1 min
        const hour = Math.min(23, Math.floor(totalMinutes / 60));
        const minute = Math.round((totalMinutes % 60) / 15) * 15;
        return {
          type: "stride:slot",
          date: date.toISOString(),
          hour,
          minute: minute >= 60 ? 45 : minute,
        };
      },
    });
  }, [date]);

  return (
    <div
      ref={columnRef}
      className="stride-day-column"
      style={{ height: HOUR_PX * 24 }}
    >
      {todos.map((t) => (
        <EventBlock
          key={t.id}
          todo={t}
          onToggle={onToggle}
          onDurationChange={onDurationChange}
        />
      ))}
    </div>
  );
}

// ─── All-day row ──────────────────────────────────────────────

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
        hour: 8,
        minute: 0,
      }),
    });
  }, [date]);

  return (
    <div ref={ref} className="stride-allday-slot">
      {todos.map((t) => (
        <div key={t.id} className="stride-allday-chip">
          {t.text || "Untitled task"}
        </div>
      ))}
    </div>
  );
}

// ─── Week view root ───────────────────────────────────────────

interface StrideWeekViewProps {
  anchor: Date;
  todos: CalendarTodo[];
  onToggle: (id: string, checked: boolean) => void;
  onDurationChange?: (id: string, minutes: number) => void;
  customDays?: number;
}

export function StrideWeekView({
  anchor,
  todos,
  onToggle,
  onDurationChange,
  customDays,
}: StrideWeekViewProps) {
  const days = useMemo(() => {
    const count = customDays ?? 7;
    const base = customDays ? startOfDay(anchor) : startOfWeek(anchor);
    return Array.from({ length: count }, (_, i) => addDays(base, i));
  }, [anchor, customDays]);

  const today = startOfDay(new Date());

  // Group todos by day
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

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to 7 AM on mount
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTop = HOUR_PX * 7;
  }, []);

  const handleDuration = onDurationChange ?? (() => {});
  const colCount = days.length;

  return (
    <div
      className="stride-week-view"
      style={{ "--stride-col-count": colCount } as React.CSSProperties}
    >
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
              <span
                className={`stride-day-header-num${isToday ? " stride-day-header-num--today" : ""}`}
              >
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
            todos={[]}
            onToggle={onToggle}
          />
        ))}
      </div>

      {/* Scrollable time grid */}
      <div className="stride-time-grid-scroll" ref={scrollContainerRef}>
        <div className="stride-time-grid" style={{ height: HOUR_PX * 24 }}>
          {/* Time gutter */}
          <div className="stride-gutter-col">
            {HOURS.map((h) => (
              <div
                key={h}
                className="stride-gutter-hour"
                style={{ top: h * HOUR_PX, height: HOUR_PX }}
              >
                <span>{formatHour(h)}</span>
              </div>
            ))}
          </div>

          {/* Hour grid lines (full width) */}
          <div className="stride-grid-lines">
            {HOURS.map((h) => (
              <div
                key={h}
                className="stride-grid-line"
                style={{ top: h * HOUR_PX }}
              />
            ))}
            {/* Half-hour lines */}
            {HOURS.map((h) => (
              <div
                key={`${h}h`}
                className="stride-grid-line stride-grid-line--half"
                style={{ top: h * HOUR_PX + 30 }}
              />
            ))}
          </div>

          {/* Day columns */}
          <div className="stride-day-columns">
            {days.map((d) => (
              <DayColumn
                key={d.toISOString()}
                date={d}
                todos={byDay.get(startOfDay(d).toISOString()) ?? []}
                onToggle={onToggle}
                onDurationChange={handleDuration}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
