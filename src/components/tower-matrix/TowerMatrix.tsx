"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { useRouter } from "next/navigation";
import {
  addTodoToNoteAction,
  assignNoteToQuadrantAction,
  assignTodoToQuadrantAction,
  createNoteAction,
  getNoteTodosAction,
  toggleTodoAction,
} from "@/server/api/notes";
import type { EisenhowerQuadrant } from "@/domain/note/note.types";
import { isSidebarNoteDragData } from "@/components/sidebar/sidebar.types";

// ─── Types ───────────────────────────────────────────────────

export type NoteWithTodoSummary = {
  id: string;
  title: string;
  icon: string | null;
  quadrant: EisenhowerQuadrant | null;
  todoTotal: number;
  todoCompleted: number;
  todoByQuadrant: Record<EisenhowerQuadrant, number>;
};

type TodoBlock = {
  id: string;
  text: string;
  checked: boolean;
  quadrant: EisenhowerQuadrant | null;
  position: number;
};

type TodoSummary = Pick<
  NoteWithTodoSummary,
  "todoTotal" | "todoCompleted" | "todoByQuadrant"
>;

// ─── Quadrant configs ─────────────────────────────────────────

type QuadrantConfig = {
  key: EisenhowerQuadrant;
  label: string;
  sublabel: string;
  colorClass: string;
  icon: string;
};

const QUADRANTS: QuadrantConfig[] = [
  { key: "DO", label: "Urgent + Important", sublabel: "Do now", colorClass: "tm-q--do", icon: "bolt" },
  { key: "SCHEDULE", label: "Important + Not urgent", sublabel: "Schedule", colorClass: "tm-q--schedule", icon: "event" },
  { key: "DELEGATE", label: "Urgent + Not important", sublabel: "Delegate", colorClass: "tm-q--delegate", icon: "group" },
  { key: "ELIMINATE", label: "Not urgent + Not important", sublabel: "Eliminate", colorClass: "tm-q--eliminate", icon: "delete_sweep" },
];

function createEmptyTodoByQuadrant(): Record<EisenhowerQuadrant, number> {
  return {
    DO: 0,
    SCHEDULE: 0,
    DELEGATE: 0,
    ELIMINATE: 0,
  };
}

function summarizeTodos(todos: TodoBlock[]): TodoSummary {
  const todoByQuadrant = createEmptyTodoByQuadrant();

  for (const todo of todos) {
    if (todo.quadrant) {
      todoByQuadrant[todo.quadrant] += 1;
    }
  }

  return {
    todoTotal: todos.length,
    todoCompleted: todos.filter((todo) => todo.checked).length,
    todoByQuadrant,
  };
}

function areTodoSummariesEqual(left: TodoSummary, right: TodoSummary) {
  return (
    left.todoTotal === right.todoTotal &&
    left.todoCompleted === right.todoCompleted &&
    left.todoByQuadrant.DO === right.todoByQuadrant.DO &&
    left.todoByQuadrant.SCHEDULE === right.todoByQuadrant.SCHEDULE &&
    left.todoByQuadrant.DELEGATE === right.todoByQuadrant.DELEGATE &&
    left.todoByQuadrant.ELIMINATE === right.todoByQuadrant.ELIMINATE
  );
}

// ─── Drag protocols ───────────────────────────────────────────

const NOTE_DRAG = "tm:note" as const;
const TODO_DRAG = "tm:todo" as const;

function noteData(id: string) { return { type: NOTE_DRAG, id } as const; }
function todoData(id: string) { return { type: TODO_DRAG, id } as const; }
function isNote(d: Record<string, unknown>): d is { type: typeof NOTE_DRAG; id: string } {
  return d.type === NOTE_DRAG && typeof d.id === "string";
}
function isTodo(d: Record<string, unknown>): d is { type: typeof TODO_DRAG; id: string } {
  return d.type === TODO_DRAG && typeof d.id === "string";
}

// ─────────────────────────────────────────────────────────────
// OUTER MATRIX
// ─────────────────────────────────────────────────────────────

function NoteTooltip({ note }: { note: NoteWithTodoSummary }) {
  if (note.todoTotal === 0) return null;
  const pct = Math.round((note.todoCompleted / note.todoTotal) * 100);
  return (
    <div className="tm-tooltip" role="tooltip">
      <div className="tm-tooltip-title">{note.title || "Untitled"}</div>
      <div className="tm-tooltip-progress">
        <div className="tm-tooltip-bar">
          <div className="tm-tooltip-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <span>{note.todoCompleted}/{note.todoTotal}</span>
      </div>
      {QUADRANTS.map((q) => {
        const c = note.todoByQuadrant[q.key];
        if (!c) return null;
        return (
          <div key={q.key} className="tm-tooltip-row">
            <span className="material-symbols-outlined" style={{ fontSize: 11 }}>{q.icon}</span>
            <span>{q.sublabel}</span>
            <span className="tm-tooltip-row-n">{c}</span>
          </div>
        );
      })}
    </div>
  );
}

function NoteCard({
  note,
  isSelected,
  onSelect,
  onRemove,
}: {
  note: NoteWithTodoSummary;
  isSelected: boolean;
  onSelect: (note: NoteWithTodoSummary) => void;
  onRemove: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return combine(
      draggable({
        element: el,
        getInitialData: () => noteData(note.id),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      })
    );
  }, [note.id]);

  return (
    <div
      ref={ref}
      className={[
        "tm-note-card",
        isDragging ? "tm-note-card--dragging" : "",
        isSelected ? "tm-note-card--selected" : "",
      ].filter(Boolean).join(" ")}
    >
      <button className="tm-note-card-body" type="button" onClick={() => onSelect(note)}>
        {note.icon && <span className="tm-note-card-icon">{note.icon}</span>}
        <span className="tm-note-card-title">{note.title || "Untitled"}</span>
        {note.todoTotal > 0 && (
          <span className="tm-note-card-badge">
            {note.todoCompleted}/{note.todoTotal}
          </span>
        )}
      </button>
      <button
        className="tm-note-card-remove"
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(note.id); }}
        aria-label="Remove from matrix"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>
      </button>
      <NoteTooltip note={note} />
    </div>
  );
}

function QuickAddNote({
  quadrant,
  onCreated,
}: {
  quadrant: EisenhowerQuadrant | null;
  onCreated: (note: NoteWithTodoSummary) => void;
}) {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const submit = useCallback(async () => {
    const title = value.trim();
    if (!title || isAdding) return;

    setIsAdding(true);
    try {
      const noteId = await createNoteAction({ title });
      if (quadrant) {
        await assignNoteToQuadrantAction(noteId, quadrant);
      }
      onCreated({
        id: noteId,
        title,
        icon: null,
        quadrant,
        todoTotal: 0,
        todoCompleted: 0,
        todoByQuadrant: createEmptyTodoByQuadrant(),
      });
      setValue("");
    } finally {
      setIsAdding(false);
    }
  }, [isAdding, onCreated, quadrant, value]);

  return (
    <div className="tm-quick-add">
      <label className="tm-quick-add-label" htmlFor={inputId}>
        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
          note_add
        </span>
        Add note
      </label>
      <div className="tm-quick-add-row">
        <input
          id={inputId}
          className="tm-quick-add-input"
          placeholder="Write a note title..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); submit(); }
          }}
          disabled={isAdding}
        />
        <button
          className="tm-quick-add-btn"
          type="button"
          onClick={submit}
          disabled={!value.trim() || isAdding}
        >
          {isAdding ? (
            <span className="tm-quick-add-spinner" />
          ) : (
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              add
            </span>
          )}
        </button>
      </div>
      <p className="tm-quick-add-hint">
        Press Enter to create directly in this area
      </p>
    </div>
  );
}

function OuterQuadrant({
  config,
  notes,
  selectedNoteId,
  onDrop,
  onSelect,
  onRemove,
  onCreate,
}: {
  config: QuadrantConfig;
  notes: NoteWithTodoSummary[];
  selectedNoteId: string | null;
  onDrop: (id: string, q: EisenhowerQuadrant) => void;
  onSelect: (n: NoteWithTodoSummary) => void;
  onRemove: (id: string) => void;
  onCreate: (note: NoteWithTodoSummary) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return combine(
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) =>
          isNote(source.data as Record<string, unknown>) ||
          isSidebarNoteDragData(source.data),
        onDragEnter: () => setIsOver(true),
        onDragLeave: () => setIsOver(false),
        onDrop: ({ source }) => {
          setIsOver(false);
          const d = source.data as Record<string, unknown>;
          if (isNote(d)) onDrop(d.id, config.key);
          else if (isSidebarNoteDragData(source.data))
            onDrop(source.data.noteId, config.key);
        },
      })
    );
  }, [config.key, onDrop]);

  return (
    <div ref={ref} className={`tm-outer-q ${config.colorClass}${isOver ? " tm-outer-q--over" : ""}`}>
      <div className="tm-outer-q-header">
        <span className="material-symbols-outlined tm-outer-q-icon">{config.icon}</span>
        <div className="tm-outer-q-labels">
          <span className="tm-outer-q-label">{config.label}</span>
          <span className="tm-outer-q-sublabel">{config.sublabel}</span>
        </div>
        {notes.length > 0 && <span className="tm-outer-q-count">{notes.length}</span>}
      </div>
      <div className="tm-outer-q-body">
        <QuickAddNote quadrant={config.key} onCreated={onCreate} />
        {notes.map((n) => (
          <NoteCard key={n.id} note={n} isSelected={n.id === selectedNoteId} onSelect={onSelect} onRemove={onRemove} />
        ))}
        {notes.length === 0 && <p className="tm-empty-hint">Drag a note here</p>}
      </div>
    </div>
  );
}

function NotePool({
  notes,
  selectedNoteId,
  onDrop,
  onSelect,
  onCreate,
}: {
  notes: NoteWithTodoSummary[];
  selectedNoteId: string | null;
  onDrop: (id: string, q: null) => void;
  onSelect: (n: NoteWithTodoSummary) => void;
  onCreate: (note: NoteWithTodoSummary) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isOver, setIsOver] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return combine(
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) =>
          isNote(source.data as Record<string, unknown>) ||
          isSidebarNoteDragData(source.data),
        onDragEnter: () => setIsOver(true),
        onDragLeave: () => setIsOver(false),
        onDrop: ({ source }) => {
          setIsOver(false);
          const d = source.data as Record<string, unknown>;
          if (isNote(d)) onDrop(d.id, null);
          else if (isSidebarNoteDragData(source.data))
            onDrop(source.data.noteId, null);
        },
      })
    );
  }, [onDrop]);

  const filtered = filter
    ? notes.filter((n) => n.title.toLowerCase().includes(filter.toLowerCase()))
    : notes;

  return (
    <div ref={ref} className={`tm-pool${isOver ? " tm-pool--over" : ""}`}>
      <div className="tm-pool-header">
        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>inbox</span>
        <span>Notes</span>
        <span className="tm-pool-count">{notes.length}</span>
        {notes.length > 5 && (
          <input
            className="tm-pool-filter"
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
      <div className="tm-pool-body">
        <QuickAddNote quadrant={null} onCreated={onCreate} />
        {filtered.map((n) => (
          <NoteCard key={n.id} note={n} isSelected={n.id === selectedNoteId} onSelect={onSelect} onRemove={() => {}} />
        ))}
        {filtered.length === 0 && <p className="tm-empty-hint">{notes.length === 0 ? "All notes are assigned" : "No matches"}</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// INNER MATRIX (right panel — always mounted, content changes)
// ─────────────────────────────────────────────────────────────

function TodoCard({
  todo,
  onToggle,
}: {
  todo: TodoBlock;
  onToggle: (id: string, checked: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return combine(
      draggable({
        element: el,
        getInitialData: () => todoData(todo.id),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      })
    );
  }, [todo.id]);

  return (
    <div
      ref={ref}
      className={[
        "tm-todo",
        isDragging ? "tm-todo--dragging" : "",
        todo.checked ? "tm-todo--checked" : "",
      ].filter(Boolean).join(" ")}
    >
      <button
        className="tm-todo-check"
        type="button"
        onClick={() => onToggle(todo.id, !todo.checked)}
        aria-label={todo.checked ? "Mark as incomplete" : "Mark as complete"}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
          {todo.checked ? "check_circle" : "radio_button_unchecked"}
        </span>
      </button>
      <span className="tm-todo-text">{todo.text || "—"}</span>
    </div>
  );
}

function InnerQuadrant({
  config,
  todos,
  index,
  onDrop,
  onToggle,
}: {
  config: QuadrantConfig;
  todos: TodoBlock[];
  index: number;
  onDrop: (id: string, q: EisenhowerQuadrant) => void;
  onToggle: (id: string, checked: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return combine(
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) => isTodo(source.data as Record<string, unknown>),
        onDragEnter: () => setIsOver(true),
        onDragLeave: () => setIsOver(false),
        onDrop: ({ source }) => {
          setIsOver(false);
          const d = source.data as Record<string, unknown>;
          if (isTodo(d)) onDrop(d.id, config.key);
        },
      })
    );
  }, [config.key, onDrop]);

  return (
    <div
      ref={ref}
      className={`tm-inner-q ${config.colorClass}${isOver ? " tm-inner-q--over" : ""}`}
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <div className="tm-inner-q-header">
        <span className="material-symbols-outlined tm-inner-q-icon">{config.icon}</span>
        <div className="tm-inner-q-labels">
          <span className="tm-inner-q-label">{config.sublabel}</span>
          <span className="tm-inner-q-sublabel">{config.label}</span>
        </div>
        {todos.length > 0 && <span className="tm-inner-q-count">{todos.length}</span>}
      </div>
      <div className="tm-inner-q-body">
        {todos.map((t) => (
          <TodoCard key={t.id} todo={t} onToggle={onToggle} />
        ))}
        {todos.length === 0 && <p className="tm-empty-hint tm-empty-hint--sm">Drag here</p>}
      </div>
    </div>
  );
}

function QuickAddTodo({
  noteId,
  onAdded,
}: {
  noteId: string;
  onAdded: () => void;
}) {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = useCallback(async () => {
    const text = value.trim();
    if (!text || isAdding) return;
    setIsAdding(true);
    try {
      await addTodoToNoteAction(noteId, text);
      setValue("");
      onAdded();
    } finally {
      setIsAdding(false);
    }
  }, [value, isAdding, noteId, onAdded]);

  return (
    <div className="tm-quick-add">
      <label className="tm-quick-add-label" htmlFor={inputId}>
        <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
          add_task
        </span>
        Add task
      </label>
      <div className="tm-quick-add-row">
        <input
          id={inputId}
          ref={inputRef}
          className="tm-quick-add-input"
          placeholder="Write a task..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); submit(); }
          }}
          disabled={isAdding}
        />
        <button
          className="tm-quick-add-btn"
          type="button"
          onClick={submit}
          disabled={!value.trim() || isAdding}
        >
          {isAdding ? (
            <span className="tm-quick-add-spinner" />
          ) : (
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              add
            </span>
          )}
        </button>
      </div>
      <p className="tm-quick-add-hint">
        Press Enter to add · You can add multiple tasks
      </p>
    </div>
  );
}

function InnerPanel({
  note,
  onClear,
  onSummaryChange,
}: {
  note: NoteWithTodoSummary | null;
  onClear: () => void;
  onSummaryChange: (noteId: string, summary: TodoSummary) => void;
}) {
  const router = useRouter();
  const [todos, setTodos] = useState<TodoBlock[]>([]);
  const [loading, setLoading] = useState(false);

  const applyTodos = useCallback((nextTodos: TodoBlock[]) => {
    setTodos(nextTodos);
    if (note) {
      onSummaryChange(note.id, summarizeTodos(nextTodos));
    }
  }, [note, onSummaryChange]);

  const refreshTodos = useCallback(async () => {
    if (!note) return;
    const nextTodos = await getNoteTodosAction(note.id);
    applyTodos(nextTodos);
  }, [applyTodos, note]);

  useEffect(() => {
    if (!note) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTodos([]);
      return;
    }

    setLoading(true);
    setTodos([]);
    getNoteTodosAction(note.id)
      .then((nextTodos) => applyTodos(nextTodos))
      .finally(() => setLoading(false));
  }, [applyTodos, note]);

  const handleQuadrantDrop = useCallback(
    (todoId: string, quadrant: EisenhowerQuadrant | null) => {
      const nextTodos = todos.map((t) => (t.id === todoId ? { ...t, quadrant } : t));
      applyTodos(nextTodos);
      assignTodoToQuadrantAction(todoId, quadrant).catch(() => {
        refreshTodos();
      });
    },
    [applyTodos, refreshTodos, todos]
  );

  const handleToggle = useCallback(
    (todoId: string, checked: boolean) => {
      const nextTodos = todos.map((t) => (t.id === todoId ? { ...t, checked } : t));
      applyTodos(nextTodos);
      toggleTodoAction(todoId, checked).catch(() => {
        refreshTodos();
      });
    },
    [applyTodos, refreshTodos, todos]
  );

  const unassigned = todos.filter((t) => t.quadrant === null);

  if (!note) {
    return (
      <div className="tm-inner-panel tm-inner-panel--empty">
        <span className="material-symbols-outlined tm-inner-empty-icon">grid_4x4</span>
        <p className="tm-inner-empty-text">Select a note</p>
        <p className="tm-inner-empty-sub">Prioritize its tasks here</p>
      </div>
    );
  }

  const completedCount = todos.filter((t) => t.checked).length;

  return (
    <div className="tm-inner-panel">
      <div className="tm-inner-header-bar">
        <div className="tm-inner-note-info">
          {note.icon && <span className="tm-inner-note-icon">{note.icon}</span>}
          <span className="tm-inner-note-title">{note.title || "Untitled"}</span>
          {todos.length > 0 && (
            <span className="tm-inner-note-prog">{completedCount}/{todos.length}</span>
          )}
        </div>
        <div className="tm-inner-actions">
          <button
            className="tm-icon-btn"
            type="button"
            title="Open note"
            onClick={() => router.push(`/notes/${note.id}`)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
          </button>
          <button
            className="tm-icon-btn"
            type="button"
            title="Close"
            onClick={onClear}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>
      </div>

      <div className="tm-inner-body">
        {loading ? (
          <div className="tm-skeleton-grid">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="tm-skeleton-q" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        ) : (
          <>
            {todos.length === 0 && (
              <div className="tm-inner-no-todos">
                <div className="tm-inner-no-todos-top">
                  <span className="material-symbols-outlined" style={{ fontSize: 26, opacity: 0.25 }}>
                    check_box_outline_blank
                  </span>
                  <p>This note has no tasks yet</p>
                </div>
              </div>
            )}

            <div className="tm-inner-grid">
              {QUADRANTS.map((config, i) => (
                <InnerQuadrant
                  key={config.key}
                  config={config}
                  todos={todos.filter((t) => t.quadrant === config.key)}
                  index={i}
                  onDrop={handleQuadrantDrop}
                  onToggle={handleToggle}
                />
              ))}
            </div>

            {unassigned.length > 0 && (
              <UnassignedTodoPool
                todos={unassigned}
                onDrop={handleQuadrantDrop}
                onToggle={handleToggle}
              />
            )}

            <QuickAddTodo noteId={note.id} onAdded={refreshTodos} />
          </>
        )}
      </div>
    </div>
  );
}

function UnassignedTodoPool({
  todos,
  onDrop,
  onToggle,
}: {
  todos: TodoBlock[];
  onDrop: (id: string, q: null) => void;
  onToggle: (id: string, checked: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return combine(
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) => isTodo(source.data as Record<string, unknown>),
        onDragEnter: () => setIsOver(true),
        onDragLeave: () => setIsOver(false),
        onDrop: ({ source }) => {
          setIsOver(false);
          const d = source.data as Record<string, unknown>;
          if (isTodo(d)) onDrop(d.id, null);
        },
      })
    );
  }, [onDrop]);

  return (
    <div ref={ref} className={`tm-todo-pool${isOver ? " tm-todo-pool--over" : ""}`}>
      <span className="tm-todo-pool-label">Unassigned</span>
      <div className="tm-todo-pool-body">
        {todos.map((t) => (
          <TodoCard key={t.id} todo={t} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────

export function TowerMatrix({ notes }: { notes: NoteWithTodoSummary[] }) {
  const [, startTransition] = useTransition();
  const [noteItems, setNoteItems] = useState(notes);
  const [selectedNote, setSelectedNote] = useState<NoteWithTodoSummary | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNoteItems(notes);
    setSelectedNote((prev) => (prev ? notes.find((note) => note.id === prev.id) ?? prev : null));
  }, [notes]);

  const updateNoteItem = useCallback(
    (noteId: string, updater: (note: NoteWithTodoSummary) => NoteWithTodoSummary) => {
      setNoteItems((prev) => prev.map((note) => (note.id === noteId ? updater(note) : note)));
      setSelectedNote((prev) => (prev?.id === noteId ? updater(prev) : prev));
    },
    []
  );

  const handleNoteDrop = useCallback(
    (id: string, quadrant: EisenhowerQuadrant | null) => {
      updateNoteItem(id, (note) => ({ ...note, quadrant }));
      startTransition(async () => {
        try {
          await assignNoteToQuadrantAction(id, quadrant);
        } catch {
          // Server will stay source of truth on next refresh.
        }
      });
    },
    [startTransition, updateNoteItem]
  );

  const handleNoteSelect = useCallback((note: NoteWithTodoSummary) => {
    setSelectedNote((prev) => (prev?.id === note.id ? null : note));
  }, []);

  const handleNoteCreate = useCallback((note: NoteWithTodoSummary) => {
    setNoteItems((prev) => [note, ...prev]);
    setSelectedNote(note);
  }, []);

  const handleSummaryChange = useCallback((noteId: string, summary: TodoSummary) => {
    setNoteItems((prev) =>
      prev.map((note) => {
        if (note.id !== noteId) {
          return note;
        }

        const currentSummary: TodoSummary = {
          todoTotal: note.todoTotal,
          todoCompleted: note.todoCompleted,
          todoByQuadrant: note.todoByQuadrant,
        };

        return areTodoSummariesEqual(currentSummary, summary)
          ? note
          : { ...note, ...summary };
      })
    );

    setSelectedNote((prev) => {
      if (!prev || prev.id !== noteId) {
        return prev;
      }

      const currentSummary: TodoSummary = {
        todoTotal: prev.todoTotal,
        todoCompleted: prev.todoCompleted,
        todoByQuadrant: prev.todoByQuadrant,
      };

      return areTodoSummariesEqual(currentSummary, summary)
        ? prev
        : { ...prev, ...summary };
    });
  }, []);

  const unassigned = noteItems.filter((n) => n.quadrant === null);

  return (
    <div className="tm-page">
      <div className="tm-left">
        <div className="tm-outer-grid">
          {QUADRANTS.map((config) => (
            <OuterQuadrant
              key={config.key}
              config={config}
              notes={noteItems.filter((n) => n.quadrant === config.key)}
              selectedNoteId={selectedNote?.id ?? null}
              onDrop={handleNoteDrop}
              onSelect={handleNoteSelect}
              onRemove={(id) => handleNoteDrop(id, null)}
              onCreate={handleNoteCreate}
            />
          ))}
        </div>
        <NotePool
          notes={unassigned}
          selectedNoteId={selectedNote?.id ?? null}
          onDrop={handleNoteDrop}
          onSelect={handleNoteSelect}
          onCreate={handleNoteCreate}
        />
      </div>

      <div className="tm-right">
        <InnerPanel
          note={selectedNote}
          onClear={() => setSelectedNote(null)}
          onSummaryChange={handleSummaryChange}
        />
      </div>
    </div>
  );
}
