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
import { assignNoteToQuadrantAction } from "@/server/api/notes";
import type { EisenhowerQuadrant } from "@/domain/note/note.types";
import { NoteDetailPanel } from "./NoteDetailPanel";

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

type QuadrantConfig = {
  key: EisenhowerQuadrant;
  label: string;
  sublabel: string;
  colorClass: string;
  icon: string;
};

// ─── Quadrant Definitions ────────────────────────────────────

const QUADRANTS: QuadrantConfig[] = [
  {
    key: "DO",
    label: "Acil + Önemli",
    sublabel: "Hemen Yap",
    colorClass: "tm-quadrant--do",
    icon: "bolt",
  },
  {
    key: "SCHEDULE",
    label: "Önemli + Acil Değil",
    sublabel: "Planla",
    colorClass: "tm-quadrant--schedule",
    icon: "event",
  },
  {
    key: "DELEGATE",
    label: "Acil + Önemsiz",
    sublabel: "Devret",
    colorClass: "tm-quadrant--delegate",
    icon: "group",
  },
  {
    key: "ELIMINATE",
    label: "Acil Değil + Önemsiz",
    sublabel: "Vazgeç",
    colorClass: "tm-quadrant--eliminate",
    icon: "delete_sweep",
  },
];

// ─── Drag protocol ───────────────────────────────────────────

const DRAG_TYPE = "tm-note" as const;

function makeNoteDragData(noteId: string) {
  return { type: DRAG_TYPE, noteId } as const;
}

function isNoteDragData(
  data: Record<string, unknown>
): data is { type: typeof DRAG_TYPE; noteId: string } {
  return data.type === DRAG_TYPE && typeof data.noteId === "string";
}

// ─── Tooltip ─────────────────────────────────────────────────

function NoteTooltip({ note }: { note: NoteWithTodoSummary }) {
  if (note.todoTotal === 0) return null;

  const pct = Math.round((note.todoCompleted / note.todoTotal) * 100);

  return (
    <div className="tm-note-tooltip" role="tooltip">
      <div className="tm-tooltip-header">
        <span className="tm-tooltip-title">{note.title || "Adsız"}</span>
      </div>
      <div className="tm-tooltip-progress">
        <div className="tm-tooltip-progress-bar">
          <div
            className="tm-tooltip-progress-fill"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="tm-tooltip-pct">
          {note.todoCompleted}/{note.todoTotal} tamamlandı
        </span>
      </div>
      {QUADRANTS.map((q) => {
        const count = note.todoByQuadrant[q.key];
        if (count === 0) return null;
        return (
          <div key={q.key} className={`tm-tooltip-row tm-tooltip-row--${q.key.toLowerCase()}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 11 }}>
              {q.icon}
            </span>
            <span>{q.sublabel}</span>
            <span className="tm-tooltip-row-count">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Note Card ───────────────────────────────────────────────

function NoteCard({
  note,
  onSelect,
  onRemove,
}: {
  note: NoteWithTodoSummary;
  onSelect: (note: NoteWithTodoSummary) => void;
  onRemove: (noteId: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return combine(
      draggable({
        element: el,
        getInitialData: () => makeNoteDragData(note.id),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      })
    );
  }, [note.id]);

  return (
    <div
      ref={ref}
      className={`tm-note-card${isDragging ? " tm-note-card--dragging" : ""}${note.todoTotal > 0 ? " tm-note-card--has-todos" : ""}`}
    >
      <button
        className="tm-note-card-body"
        onClick={() => onSelect(note)}
        type="button"
      >
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
        onClick={(e) => {
          e.stopPropagation();
          onRemove(note.id);
        }}
        title="Matristen çıkar"
        aria-label="Matristen çıkar"
        type="button"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
          close
        </span>
      </button>
      <NoteTooltip note={note} />
    </div>
  );
}

// ─── Quadrant Panel ──────────────────────────────────────────

function MatrixQuadrant({
  config,
  notes,
  onDrop,
  onSelect,
  onRemove,
}: {
  config: QuadrantConfig;
  notes: NoteWithTodoSummary[];
  onDrop: (noteId: string, quadrant: EisenhowerQuadrant) => void;
  onSelect: (note: NoteWithTodoSummary) => void;
  onRemove: (noteId: string) => void;
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
          isNoteDragData(source.data as Record<string, unknown>),
        onDragEnter: () => setIsOver(true),
        onDragLeave: () => setIsOver(false),
        onDrop: ({ source }) => {
          setIsOver(false);
          const data = source.data as Record<string, unknown>;
          if (isNoteDragData(data)) onDrop(data.noteId, config.key);
        },
      })
    );
  }, [config.key, onDrop]);

  return (
    <div
      ref={ref}
      className={`tm-quadrant ${config.colorClass}${isOver ? " tm-quadrant--over" : ""}`}
    >
      <div className="tm-quadrant-header">
        <span className="material-symbols-outlined tm-quadrant-icon">
          {config.icon}
        </span>
        <div className="tm-quadrant-labels">
          <span className="tm-quadrant-label">{config.label}</span>
          <span className="tm-quadrant-sublabel">{config.sublabel}</span>
        </div>
        <span className="tm-quadrant-count">{notes.length}</span>
      </div>
      <div className="tm-quadrant-body">
        {notes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            onSelect={onSelect}
            onRemove={onRemove}
          />
        ))}
        {notes.length === 0 && (
          <p className="tm-quadrant-empty">Buraya not sürükle</p>
        )}
      </div>
    </div>
  );
}

// ─── Unassigned Pool ─────────────────────────────────────────

function UnassignedPool({
  notes,
  onDrop,
  onSelect,
}: {
  notes: NoteWithTodoSummary[];
  onDrop: (noteId: string, quadrant: null) => void;
  onSelect: (note: NoteWithTodoSummary) => void;
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
          isNoteDragData(source.data as Record<string, unknown>),
        onDragEnter: () => setIsOver(true),
        onDragLeave: () => setIsOver(false),
        onDrop: ({ source }) => {
          setIsOver(false);
          const data = source.data as Record<string, unknown>;
          if (isNoteDragData(data)) onDrop(data.noteId, null);
        },
      })
    );
  }, [onDrop]);

  const filtered = filter
    ? notes.filter((n) =>
        n.title.toLowerCase().includes(filter.toLowerCase())
      )
    : notes;

  return (
    <div
      ref={ref}
      className={`tm-pool${isOver ? " tm-pool--over" : ""}`}
    >
      <div className="tm-pool-header">
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
          inbox
        </span>
        <span>Notlar</span>
        <span className="tm-pool-count">{notes.length}</span>
        {notes.length > 6 && (
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
        {filtered.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            onSelect={onSelect}
            onRemove={() => {}}
          />
        ))}
        {filtered.length === 0 && notes.length > 0 && (
          <p className="tm-pool-empty">Eşleşen not yok</p>
        )}
        {notes.length === 0 && (
          <p className="tm-pool-empty">Tüm notlar matrise atandı</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export function TowerMatrix({ notes }: { notes: NoteWithTodoSummary[] }) {
  const [, startTransition] = useTransition();
  const [selectedNote, setSelectedNote] = useState<NoteWithTodoSummary | null>(null);
  const [isPanelVisible, setIsPanelVisible] = useState(false);

  const [optimisticNotes, updateOptimistic] = useOptimistic(
    notes,
    (
      state: NoteWithTodoSummary[],
      {
        noteId,
        quadrant,
      }: { noteId: string; quadrant: EisenhowerQuadrant | null }
    ) => state.map((n) => (n.id === noteId ? { ...n, quadrant } : n))
  );

  const handleDrop = useCallback(
    (noteId: string, quadrant: EisenhowerQuadrant | null) => {
      startTransition(async () => {
        updateOptimistic({ noteId, quadrant });
        await assignNoteToQuadrantAction(noteId, quadrant);
      });
    },
    [updateOptimistic]
  );

  const handleSelect = useCallback((note: NoteWithTodoSummary) => {
    setSelectedNote(note);
    setIsPanelVisible(true);
  }, []);

  const handleClosePanel = useCallback(() => {
    setIsPanelVisible(false);
    setTimeout(() => setSelectedNote(null), 350);
  }, []);

  const unassigned = optimisticNotes.filter((n) => n.quadrant === null);

  return (
    <div className="tm-page">
      <div className="tm-layout">
        <div className="tm-grid">
          {QUADRANTS.map((config) => (
            <MatrixQuadrant
              key={config.key}
              config={config}
              notes={optimisticNotes.filter((n) => n.quadrant === config.key)}
              onDrop={handleDrop}
              onSelect={handleSelect}
              onRemove={(noteId) => handleDrop(noteId, null)}
            />
          ))}
        </div>
        <UnassignedPool
          notes={unassigned}
          onDrop={handleDrop}
          onSelect={handleSelect}
        />
      </div>

      {selectedNote && (
        <NoteDetailPanel
          note={selectedNote}
          isVisible={isPanelVisible}
          onClose={handleClosePanel}
        />
      )}
    </div>
  );
}
