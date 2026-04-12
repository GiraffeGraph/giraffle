"use client";

import {
  useCallback,
  useEffect,
  useOptimistic,
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
  assignTodoToQuadrantAction,
  getNoteTodosAction,
  toggleTodoAction,
} from "@/server/api/notes";
import type { EisenhowerQuadrant } from "@/domain/note/note.types";
import type { NoteWithTodoSummary } from "./TowerMatrix";

// ─── Types ───────────────────────────────────────────────────

type TodoBlock = {
  id: string;
  text: string;
  checked: boolean;
  quadrant: EisenhowerQuadrant | null;
  position: number;
};

type InnerQuadrantConfig = {
  key: EisenhowerQuadrant;
  label: string;
  sublabel: string;
  colorClass: string;
  icon: string;
};

// ─── Inner Quadrant Definitions ──────────────────────────────

const INNER_QUADRANTS: InnerQuadrantConfig[] = [
  {
    key: "DO",
    label: "Hemen Yap",
    sublabel: "Acil + Önemli",
    colorClass: "tm-inner--do",
    icon: "bolt",
  },
  {
    key: "SCHEDULE",
    label: "Planla",
    sublabel: "Önemli, Acil Değil",
    colorClass: "tm-inner--schedule",
    icon: "event",
  },
  {
    key: "DELEGATE",
    label: "Devret",
    sublabel: "Acil, Önemsiz",
    colorClass: "tm-inner--delegate",
    icon: "group",
  },
  {
    key: "ELIMINATE",
    label: "Vazgeç",
    sublabel: "Acil Değil, Önemsiz",
    colorClass: "tm-inner--eliminate",
    icon: "delete_sweep",
  },
];

// ─── Drag protocol ───────────────────────────────────────────

const TODO_DRAG_TYPE = "tm-todo" as const;

function makeTodoDragData(todoId: string) {
  return { type: TODO_DRAG_TYPE, todoId } as const;
}

function isTodoDragData(
  data: Record<string, unknown>
): data is { type: typeof TODO_DRAG_TYPE; todoId: string } {
  return data.type === TODO_DRAG_TYPE && typeof data.todoId === "string";
}

// ─── Todo Card ───────────────────────────────────────────────

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
        getInitialData: () => makeTodoDragData(todo.id),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      })
    );
  }, [todo.id]);

  return (
    <div
      ref={ref}
      className={`tm-todo-card${isDragging ? " tm-todo-card--dragging" : ""}${todo.checked ? " tm-todo-card--checked" : ""}`}
    >
      <button
        className="tm-todo-checkbox"
        onClick={() => onToggle(todo.id, !todo.checked)}
        type="button"
        aria-label={todo.checked ? "Tamamlandı olarak işaretle" : "Tamamlandı"}
      >
        {todo.checked ? (
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
            check_circle
          </span>
        ) : (
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
            radio_button_unchecked
          </span>
        )}
      </button>
      <span className="tm-todo-text">{todo.text || "Görev"}</span>
    </div>
  );
}

// ─── Inner Quadrant ──────────────────────────────────────────

function InnerQuadrant({
  config,
  todos,
  index,
  onDrop,
  onToggle,
}: {
  config: InnerQuadrantConfig;
  todos: TodoBlock[];
  index: number;
  onDrop: (todoId: string, quadrant: EisenhowerQuadrant) => void;
  onToggle: (todoId: string, checked: boolean) => void;
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
          isTodoDragData(source.data as Record<string, unknown>),
        onDragEnter: () => setIsOver(true),
        onDragLeave: () => setIsOver(false),
        onDrop: ({ source }) => {
          setIsOver(false);
          const data = source.data as Record<string, unknown>;
          if (isTodoDragData(data)) onDrop(data.todoId, config.key);
        },
      })
    );
  }, [config.key, onDrop]);

  return (
    <div
      ref={ref}
      className={`tm-inner-quadrant ${config.colorClass}${isOver ? " tm-inner-quadrant--over" : ""}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="tm-inner-header">
        <span className="material-symbols-outlined tm-inner-icon">
          {config.icon}
        </span>
        <div className="tm-inner-labels">
          <span className="tm-inner-label">{config.label}</span>
          <span className="tm-inner-sublabel">{config.sublabel}</span>
        </div>
        {todos.length > 0 && (
          <span className="tm-inner-count">{todos.length}</span>
        )}
      </div>
      <div className="tm-inner-body">
        {todos.map((todo) => (
          <TodoCard key={todo.id} todo={todo} onToggle={onToggle} />
        ))}
        {todos.length === 0 && (
          <p className="tm-inner-empty">Sürükle</p>
        )}
      </div>
    </div>
  );
}

// ─── Unassigned Todo Pool ────────────────────────────────────

function TodoPool({
  todos,
  onDrop,
  onToggle,
}: {
  todos: TodoBlock[];
  onDrop: (todoId: string, quadrant: null) => void;
  onToggle: (todoId: string, checked: boolean) => void;
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
          isTodoDragData(source.data as Record<string, unknown>),
        onDragEnter: () => setIsOver(true),
        onDragLeave: () => setIsOver(false),
        onDrop: ({ source }) => {
          setIsOver(false);
          const data = source.data as Record<string, unknown>;
          if (isTodoDragData(data)) onDrop(data.todoId, null);
        },
      })
    );
  }, [onDrop]);

  if (todos.length === 0) return null;

  return (
    <div
      ref={ref}
      className={`tm-todo-pool${isOver ? " tm-todo-pool--over" : ""}`}
    >
      <span className="tm-todo-pool-label">Atanmamış görevler</span>
      <div className="tm-todo-pool-body">
        {todos.map((todo) => (
          <TodoCard key={todo.id} todo={todo} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}

// ─── Panel Component ─────────────────────────────────────────

export function NoteDetailPanel({
  note,
  isVisible,
  onClose,
}: {
  note: NoteWithTodoSummary;
  isVisible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [rawTodos, setRawTodos] = useState<TodoBlock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getNoteTodosAction(note.id)
      .then(setRawTodos)
      .finally(() => setLoading(false));
  }, [note.id]);

  const [todos, updateOptimistic] = useOptimistic(
    rawTodos,
    (
      state: TodoBlock[],
      action:
        | { type: "quadrant"; todoId: string; quadrant: EisenhowerQuadrant | null }
        | { type: "toggle"; todoId: string; checked: boolean }
    ) => {
      if (action.type === "quadrant") {
        return state.map((t) =>
          t.id === action.todoId ? { ...t, quadrant: action.quadrant } : t
        );
      }
      return state.map((t) =>
        t.id === action.todoId ? { ...t, checked: action.checked } : t
      );
    }
  );

  const handleQuadrantDrop = useCallback(
    (todoId: string, quadrant: EisenhowerQuadrant | null) => {
      startTransition(async () => {
        updateOptimistic({ type: "quadrant", todoId, quadrant });
        await assignTodoToQuadrantAction(todoId, quadrant);
      });
    },
    [updateOptimistic]
  );

  const handleToggle = useCallback(
    (todoId: string, checked: boolean) => {
      startTransition(async () => {
        updateOptimistic({ type: "toggle", todoId, checked });
        await toggleTodoAction(todoId, checked);
      });
    },
    [updateOptimistic]
  );

  const unassigned = todos.filter((t) => t.quadrant === null);
  const completedCount = todos.filter((t) => t.checked).length;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`tm-panel-backdrop${isVisible ? " tm-panel-backdrop--visible" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={`tm-panel${isVisible ? " tm-panel--visible" : ""}`}
        role="dialog"
        aria-label={`${note.title} — Tower Matrix`}
      >
        {/* Panel Header */}
        <div className="tm-panel-header">
          <div className="tm-panel-note-info">
            {note.icon && (
              <span className="tm-panel-note-icon">{note.icon}</span>
            )}
            <span className="tm-panel-note-title">
              {note.title || "Adsız"}
            </span>
            {note.todoTotal > 0 && (
              <span className="tm-panel-note-progress">
                {completedCount}/{note.todoTotal}
              </span>
            )}
          </div>
          <div className="tm-panel-actions">
            <button
              className="tm-panel-open-btn"
              onClick={() => router.push(`/notes/${note.id}`)}
              title="Notu aç"
              type="button"
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16 }}
              >
                open_in_new
              </span>
            </button>
            <button
              className="tm-panel-close-btn"
              onClick={onClose}
              title="Kapat"
              type="button"
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16 }}
              >
                close
              </span>
            </button>
          </div>
        </div>

        {/* Panel Body */}
        <div className="tm-panel-body">
          {loading ? (
            <div className="tm-panel-loading">
              <div className="tm-panel-skeleton tm-panel-skeleton--grid">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="tm-panel-skeleton-quadrant" />
                ))}
              </div>
            </div>
          ) : todos.length === 0 ? (
            <div className="tm-panel-no-todos">
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 32, opacity: 0.3 }}
              >
                check_box_outline_blank
              </span>
              <p>Bu notta görev listesi yok</p>
              <button
                className="tm-panel-open-btn tm-panel-open-btn--text"
                onClick={() => router.push(`/notes/${note.id}`)}
                type="button"
              >
                Notu aç ve görev ekle
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 14 }}
                >
                  arrow_forward
                </span>
              </button>
            </div>
          ) : (
            <>
              <div className="tm-inner-grid">
                {INNER_QUADRANTS.map((config, i) => (
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
              <TodoPool
                todos={unassigned}
                onDrop={handleQuadrantDrop}
                onToggle={handleToggle}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
