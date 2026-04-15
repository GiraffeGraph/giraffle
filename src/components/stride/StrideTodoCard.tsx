"use client";

import { useEffect, useRef } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import type { CalendarTodo } from "./stride.types";

const QUADRANT_COLORS: Record<string, string> = {
  DO: "var(--md-sys-color-error)",
  SCHEDULE: "var(--md-sys-color-success)",
  DELEGATE: "var(--md-sys-color-warning)",
  ELIMINATE: "var(--md-sys-color-outline)",
};

interface StrideTodoCardProps {
  todo: CalendarTodo;
  variant?: "calendar" | "unscheduled";
  onToggle?: (id: string, checked: boolean) => void;
  showTime?: boolean;
}

export function StrideTodoCard({
  todo,
  variant = "calendar",
  onToggle,
  showTime = false,
}: StrideTodoCardProps) {
  const dragRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = dragRef.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({
        type: variant === "calendar" ? "stride:todo" : "stride:unscheduled",
        todoId: todo.id,
      }),
    });
  }, [todo.id, variant]);

  const accentColor = todo.quadrant
    ? QUADRANT_COLORS[todo.quadrant]
    : "var(--md-sys-color-primary)";

  const timeStr =
    showTime && todo.dueDate
      ? new Date(todo.dueDate).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        })
      : null;

  return (
    <div
      ref={dragRef}
      className={`stride-todo-card${todo.checked ? " stride-todo-card--checked" : ""}${variant === "unscheduled" ? " stride-todo-card--unscheduled" : ""}`}
      style={{ "--stride-todo-accent": accentColor } as React.CSSProperties}
      draggable
    >
      <button
        type="button"
        className="stride-todo-check"
        aria-label={todo.checked ? "Mark incomplete" : "Mark complete"}
        onClick={(e) => {
          e.stopPropagation();
          onToggle?.(todo.id, !todo.checked);
        }}
      >
        {todo.checked ? (
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            check_circle
          </span>
        ) : (
          <span className="stride-todo-check-ring" />
        )}
      </button>

      <div className="stride-todo-body">
        {timeStr && (
          <span className="stride-todo-time">{timeStr}</span>
        )}
        <span className="stride-todo-text">
          {todo.text || "Untitled task"}
        </span>
        <span className="stride-todo-note">
          {todo.note.icon ? `${todo.note.icon} ` : ""}
          {todo.note.title}
        </span>
      </div>

      {todo.quadrant && (
        <span
          className="stride-todo-quadrant-dot"
          title={todo.quadrant}
          style={{ background: accentColor }}
        />
      )}
    </div>
  );
}
