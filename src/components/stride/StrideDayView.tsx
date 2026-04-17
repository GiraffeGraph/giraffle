"use client";


import type { CalendarTodo } from "./stride.types";
import { StrideWeekView } from "./StrideWeekView";

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
