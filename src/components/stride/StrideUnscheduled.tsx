"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import type { CalendarTodo } from "./stride.types";
import { StrideTodoCard } from "./StrideTodoCard";

interface StrideUnscheduledProps {
  todos: CalendarTodo[];
  onToggle: (id: string, checked: boolean) => void;
}

function UnscheduledDropZone({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => {
        const d = source.data as Record<string, unknown>;
        return d.type === "stride:todo";
      },
      getData: () => ({ type: "stride:unscheduled-drop" }),
      onDragEnter: () => setIsOver(true),
      onDragLeave: () => setIsOver(false),
      onDrop: () => setIsOver(false),
    });
  }, []);

  return (
    <div
      ref={ref}
      className={`stride-unscheduled-dropzone${isOver ? " stride-unscheduled-dropzone--over" : ""}`}
    >
      {children}
    </div>
  );
}

export function StrideUnscheduled({ todos, onToggle }: StrideUnscheduledProps) {
  const [filter, setFilter] = useState<"all" | "active" | "done">("active");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = todos;
    if (filter === "active") list = list.filter((t) => !t.checked);
    if (filter === "done") list = list.filter((t) => t.checked);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) => t.text.toLowerCase().includes(q));
    }
    return list;
  }, [todos, filter, search]);

  // Group by note
  const grouped = useMemo(() => {
    const map = new Map<string, { note: CalendarTodo["note"]; todos: CalendarTodo[] }>();
    for (const t of filtered) {
      if (!map.has(t.note.id)) map.set(t.note.id, { note: t.note, todos: [] });
      map.get(t.note.id)!.todos.push(t);
    }
    return [...map.values()];
  }, [filtered]);

  return (
    <aside className="stride-unscheduled-panel">
      <div className="stride-unscheduled-header">
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
          checklist
        </span>
        <span className="stride-unscheduled-title">Backlog</span>
        <span className="stride-unscheduled-count">{todos.filter(t => !t.checked).length}</span>
      </div>

      <div className="stride-unscheduled-search">
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
          search
        </span>
        <input
          type="text"
          placeholder="Filter tasks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="stride-unscheduled-search-input"
        />
      </div>

      <div className="stride-unscheduled-filters">
        {(["active", "all", "done"] as const).map((f) => (
          <button
            key={f}
            className={`stride-filter-btn${filter === f ? " active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "active" ? "Active" : f === "all" ? "All" : "Done"}
          </button>
        ))}
      </div>

      <UnscheduledDropZone>
        <div className="stride-unscheduled-list">
          {grouped.length === 0 ? (
            <div className="stride-unscheduled-empty">
              <span className="material-symbols-outlined" style={{ fontSize: 32, opacity: 0.3 }}>
                task_alt
              </span>
              <span>No tasks here</span>
            </div>
          ) : (
            grouped.map(({ note, todos: noteTodos }) => (
              <div key={note.id} className="stride-unscheduled-group">
                <div className="stride-unscheduled-group-header">
                  {note.icon && (
                    <span style={{ fontSize: 12 }}>{note.icon}</span>
                  )}
                  <span className="stride-unscheduled-group-title">{note.title}</span>
                </div>
                {noteTodos.map((t) => (
                  <StrideTodoCard
                    key={t.id}
                    todo={t}
                    variant="unscheduled"
                    onToggle={onToggle}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </UnscheduledDropZone>

      <div className="stride-unscheduled-hint">
        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
          drag_indicator
        </span>
        Drag tasks to the calendar
      </div>
    </aside>
  );
}
