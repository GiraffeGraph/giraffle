"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  useOptimistic,
  useId,
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
  getNoteTodosAction,
  toggleTodoAction,
} from "@/server/api/notes";
import type { EisenhowerQuadrant } from "@/domain/note/note.types";

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

// ─── Quadrant configs ─────────────────────────────────────────

type QuadrantConfig = {
  key: EisenhowerQuadrant;
  label: string;
  sublabel: string;
  colorClass: string;
  icon: string;
};

const QUADRANTS: QuadrantConfig[] = [
  { key: "DO",       label: "Acil + Önemli",        sublabel: "Hemen Yap", colorClass: "tm-q--do",       icon: "bolt" },
  { key: "SCHEDULE", label: "Önemli + Acil Değil",   sublabel: "Planla",    colorClass: "tm-q--schedule", icon: "event" },
  { key: "DELEGATE", label: "Acil + Önemsiz",        sublabel: "Devret",    colorClass: "tm-q--delegate", icon: "group" },
  { key: "ELIMINATE",label: "Acil Değil + Önemsiz",  sublabel: "Vazgeç",    colorClass: "tm-q--eliminate",icon: "delete_sweep" },
];

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
      <div className="tm-tooltip-title">{note.title || "Adsız"}</div>
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
        <span className="tm-note-card-title">{note.title || "Adsız"}</span>
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
        aria-label="Matristen çıkar"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>
      </button>
      <NoteTooltip note={note} />
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
}: {
  config: QuadrantConfig;
  notes: NoteWithTodoSummary[];
  selectedNoteId: string | null;
  onDrop: (id: string, q: EisenhowerQuadrant) => void;
  onSelect: (n: NoteWithTodoSummary) => void;
  onRemove: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return combine(
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) => isNote(source.data as Record<string, unknown>),
        onDragEnter: () => setIsOver(true),
        onDragLeave: () => setIsOver(false),
        onDrop: ({ source }) => {
          setIsOver(false);
          const d = source.data as Record<string, unknown>;
          if (isNote(d)) onDrop(d.id, config.key);
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
        {notes.map((n) => (
          <NoteCard key={n.id} note={n} isSelected={n.id === selectedNoteId} onSelect={onSelect} onRemove={onRemove} />
        ))}
        {notes.length === 0 && <p className="tm-empty-hint">Buraya not sürükle</p>}
      </div>
    </div>
  );
}

function NotePool({
  notes,
  selectedNoteId,
  onDrop,
  onSelect,
}: {
  notes: NoteWithTodoSummary[];
  selectedNoteId: string | null;
  onDrop: (id: string, q: null) => void;
  onSelect: (n: NoteWithTodoSummary) => void;
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
        canDrop: ({ source }) => isNote(source.data as Record<string, unknown>),
        onDragEnter: () => setIsOver(true),
        onDragLeave: () => setIsOver(false),
        onDrop: ({ source }) => {
          setIsOver(false);
          const d = source.data as Record<string, unknown>;
          if (isNote(d)) onDrop(d.id, null);
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
        <span>Notlar</span>
        <span className="tm-pool-count">{notes.length}</span>
        {notes.length > 5 && (
          <input
            className="tm-pool-filter"
            placeholder="Filtrele..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
      <div className="tm-pool-body">
        {filtered.map((n) => (
          <NoteCard key={n.id} note={n} isSelected={n.id === selectedNoteId} onSelect={onSelect} onRemove={() => {}} />
        ))}
        {filtered.length === 0 && <p className="tm-empty-hint">{notes.length === 0 ? "Tüm notlar atandı" : "Eşleşen yok"}</p>}
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
        aria-label={todo.checked ? "Tamamlanmadı olarak işaretle" : "Tamamlandı"}
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
        {todos.length === 0 && <p className="tm-empty-hint tm-empty-hint--sm">Sürükle</p>}
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
    // Focus the input when it mounts
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
        Görev ekle
      </label>
      <div className="tm-quick-add-row">
        <input
          id={inputId}
          ref={inputRef}
          className="tm-quick-add-input"
          placeholder="Görev yaz..."
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
        Enter ile ekle · Birden fazla görev ekleyebilirsin
      </p>
    </div>
  );
}

function InnerPanel({
  note,
  onClear,
}: {
  note: NoteWithTodoSummary | null;
  onClear: () => void;
}) {
  const router = useRouter();
  const [todos, setTodos] = useState<TodoBlock[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!note) { setTodos([]); return; }
    setLoading(true);
    setTodos([]);
    getNoteTodosAction(note.id)
      .then(setTodos)
      .finally(() => setLoading(false));
  }, [note?.id]);

  const handleQuadrantDrop = useCallback(
    (todoId: string, quadrant: EisenhowerQuadrant | null) => {
      setTodos((prev) =>
        prev.map((t) => (t.id === todoId ? { ...t, quadrant } : t))
      );
      assignTodoToQuadrantAction(todoId, quadrant).catch(() => {
        // revert on error
        if (note) getNoteTodosAction(note.id).then(setTodos);
      });
    },
    [note]
  );

  const handleToggle = useCallback(
    (todoId: string, checked: boolean) => {
      setTodos((prev) =>
        prev.map((t) => (t.id === todoId ? { ...t, checked } : t))
      );
      toggleTodoAction(todoId, checked).catch(() => {
        if (note) getNoteTodosAction(note.id).then(setTodos);
      });
    },
    [note]
  );

  const unassigned = todos.filter((t) => t.quadrant === null);

  // ── Empty state ─────────────────────────────
  if (!note) {
    return (
      <div className="tm-inner-panel tm-inner-panel--empty">
        <span className="material-symbols-outlined tm-inner-empty-icon">grid_4x4</span>
        <p className="tm-inner-empty-text">Bir nota tıkla</p>
        <p className="tm-inner-empty-sub">İçindeki görevleri burada önceliklendir</p>
      </div>
    );
  }

  const completedCount = todos.filter((t) => t.checked).length;

  return (
    <div className="tm-inner-panel">
      {/* Header */}
      <div className="tm-inner-header-bar">
        <div className="tm-inner-note-info">
          {note.icon && <span className="tm-inner-note-icon">{note.icon}</span>}
          <span className="tm-inner-note-title">{note.title || "Adsız"}</span>
          {todos.length > 0 && (
            <span className="tm-inner-note-prog">{completedCount}/{todos.length}</span>
          )}
        </div>
        <div className="tm-inner-actions">
          <button
            className="tm-icon-btn"
            type="button"
            title="Notu aç"
            onClick={() => router.push(`/notes/${note.id}`)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
          </button>
          <button
            className="tm-icon-btn"
            type="button"
            title="Kapat"
            onClick={onClear}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="tm-inner-body">
        {loading ? (
          <div className="tm-skeleton-grid">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="tm-skeleton-q" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        ) : todos.length === 0 ? (
          <div className="tm-inner-no-todos">
            <div className="tm-inner-no-todos-top">
              <span className="material-symbols-outlined" style={{ fontSize: 26, opacity: 0.25 }}>
                check_box_outline_blank
              </span>
              <p>Bu notta henüz görev yok</p>
            </div>
            <QuickAddTodo
              noteId={note.id}
              onAdded={() => {
                getNoteTodosAction(note.id).then(setTodos);
              }}
            />
          </div>
        ) : (
          <>
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

            {/* Unassigned pool */}
            {unassigned.length > 0 && (
              <UnassignedTodoPool
                todos={unassigned}
                onDrop={handleQuadrantDrop}
                onToggle={handleToggle}
              />
            )}
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
      <span className="tm-todo-pool-label">Atanmamış</span>
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
  const [selectedNote, setSelectedNote] = useState<NoteWithTodoSummary | null>(null);

  const [optimisticNotes, updateOptimistic] = useOptimistic(
    notes,
    (state: NoteWithTodoSummary[], { id, quadrant }: { id: string; quadrant: EisenhowerQuadrant | null }) =>
      state.map((n) => (n.id === id ? { ...n, quadrant } : n))
  );

  const handleNoteDrop = useCallback(
    (id: string, quadrant: EisenhowerQuadrant | null) => {
      startTransition(async () => {
        updateOptimistic({ id, quadrant });
        await assignNoteToQuadrantAction(id, quadrant);
      });
    },
    [updateOptimistic]
  );

  const handleNoteSelect = useCallback((note: NoteWithTodoSummary) => {
    setSelectedNote((prev) => (prev?.id === note.id ? null : note));
  }, []);

  const unassigned = optimisticNotes.filter((n) => n.quadrant === null);

  return (
    <div className="tm-page">
      {/* Left: outer matrix — 2/3 */}
      <div className="tm-left">
        <div className="tm-outer-grid">
          {QUADRANTS.map((config) => (
            <OuterQuadrant
              key={config.key}
              config={config}
              notes={optimisticNotes.filter((n) => n.quadrant === config.key)}
              selectedNoteId={selectedNote?.id ?? null}
              onDrop={handleNoteDrop}
              onSelect={handleNoteSelect}
              onRemove={(id) => handleNoteDrop(id, null)}
            />
          ))}
        </div>
        <NotePool
          notes={unassigned}
          selectedNoteId={selectedNote?.id ?? null}
          onDrop={handleNoteDrop}
          onSelect={handleNoteSelect}
        />
      </div>

      {/* Right: inner matrix — 1/3 */}
      <div className="tm-right">
        <InnerPanel
          note={selectedNote}
          onClear={() => setSelectedNote(null)}
        />
      </div>
    </div>
  );
}
