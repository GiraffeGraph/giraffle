"use client";

import { useEffect, useMemo, useRef } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import type { CalendarTodo } from "./stride.types";
import { StrideWeekView } from "./StrideWeekView";

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

interface StrideDayViewProps {
  anchor: Date;
  todos: CalendarTodo[];
  onToggle: (id: string, checked: boolean) => void;
  onDurationChange?: (id: string, minutes: number) => void;
  onCreateTodo?: (text: string, dueDate: Date, durationMinutes: number) => void;
  onUpdateText?: (id: string, text: string) => void;
  onDelete?: (id: string) => void;
}

export function StrideDayView({
  anchor,
  todos,
  onToggle,
  onDurationChange,
  onCreateTodo,
  onUpdateText,
  onDelete,
}: StrideDayViewProps) {
  return (
    <StrideWeekView
      anchor={anchor}
      todos={todos}
      onToggle={onToggle}
      onDurationChange={onDurationChange}
      onCreateTodo={onCreateTodo}
      onUpdateText={onUpdateText}
      onDelete={onDelete}
      customDays={1}
    />
  );
}
