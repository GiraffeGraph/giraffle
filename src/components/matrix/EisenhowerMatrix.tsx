"use client";

import { useCallback, useOptimistic, useRef, useState, useTransition } from "react";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { useRouter } from "next/navigation";
import { assignNoteToQuadrantAction } from "@/server/api/notes";
import type { EisenhowerQuadrant } from "@/domain/note/note.types";
import "@/styles/layouts/matrix.css";

// ─── Types ───────────────────────────────────────────────────

type Note = {
  id: string;
  title: string;
  icon: string | null;
  quadrant: EisenhowerQuadrant | null;
  updatedAt: Date;
};

type QuadrantConfig = {
  key: EisenhowerQuadrant;
  label: string;
  sublabel: string;
  action: string;
  colorClass: string;
};

// ─── Quadrant Definitions ────────────────────────────────────

const QUADRANTS: QuadrantConfig[] = [
  {
    key: "DO",
    label: "Acil + Önemli",
    sublabel: "Hemen Yap",
    action: "do",
    colorClass: "matrix-quadrant--do",
  },
  {
    key: "SCHEDULE",
    label: "Önemli + Acil Değil",
    sublabel: "Planla",
    action: "schedule",
    colorClass: "matrix-quadrant--schedule",
  },
  {
    key: "DELEGATE",
    label: "Acil + Önemsiz",
    sublabel: "Devret",
    action: "delegate",
    colorClass: "matrix-quadrant--delegate",
  },
  {
    key: "ELIMINATE",
    label: "Acil Değil + Önemsiz",
    sublabel: "Vazgeç",
    action: "eliminate",
    colorClass: "matrix-quadrant--eliminate",
  },
];

// ─── Drag Data Protocol ──────────────────────────────────────

const DRAG_TYPE = "matrix-note" as const;

function makeNoteData(noteId: string) {
  return { type: DRAG_TYPE, noteId } as const;
}

function isNoteData(data: Record<string, unknown>): data is { type: typeof DRAG_TYPE; noteId: string } {
  return data.type === DRAG_TYPE && typeof data.noteId === "string";
}

// ─── Note Card ───────────────────────────────────────────────

function MatrixNoteCard({
  note,
  onRemove,
}: {
  note: Note;
  onRemove: (noteId: string) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const router = useRouter();

  const attachRef = useCallback(
    (el: HTMLDivElement | null) => {
      (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      if (!el) return;

      return combine(
        draggable({
          element: el,
          getInitialData: () => makeNoteData(note.id),
          onDragStart: () => setIsDragging(true),
          onDrop: () => setIsDragging(false),
        })
      );
    },
    [note.id]
  );

  return (
    <div
      ref={attachRef}
      className={`matrix-card${isDragging ? " matrix-card--dragging" : ""}`}
      onClick={() => router.push(`/notes/${note.id}`)}
      title={note.title}
    >
      {note.icon && (
        <span className="matrix-card-icon">{note.icon}</span>
      )}
      <span className="matrix-card-title">{note.title || "Adsız"}</span>
      <button
        className="matrix-card-remove"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(note.id);
        }}
        title="Matristen çıkar"
        aria-label="Matristen çıkar"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
          close
        </span>
      </button>
    </div>
  );
}

// ─── Quadrant Panel ──────────────────────────────────────────

function MatrixQuadrant({
  config,
  notes,
  onDrop,
  onRemove,
}: {
  config: QuadrantConfig;
  notes: Note[];
  onDrop: (noteId: string, quadrant: EisenhowerQuadrant) => void;
  onRemove: (noteId: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isOver, setIsOver] = useState(false);

  const attachRef = useCallback(
    (el: HTMLDivElement | null) => {
      (panelRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      if (!el) return;

      return combine(
        dropTargetForElements({
          element: el,
          canDrop: ({ source }) => isNoteData(source.data as Record<string, unknown>),
          onDragEnter: () => setIsOver(true),
          onDragLeave: () => setIsOver(false),
          onDrop: ({ source }) => {
            setIsOver(false);
            const data = source.data as Record<string, unknown>;
            if (isNoteData(data)) {
              onDrop(data.noteId, config.key);
            }
          },
        })
      );
    },
    [config.key, onDrop]
  );

  return (
    <div
      ref={attachRef}
      className={`matrix-quadrant ${config.colorClass}${isOver ? " matrix-quadrant--over" : ""}`}
    >
      <div className="matrix-quadrant-header">
        <span className="matrix-quadrant-label">{config.label}</span>
        <span className="matrix-quadrant-action">{config.sublabel}</span>
      </div>
      <div className="matrix-quadrant-body">
        {notes.map((note) => (
          <MatrixNoteCard key={note.id} note={note} onRemove={onRemove} />
        ))}
        {notes.length === 0 && (
          <p className="matrix-quadrant-empty">Buraya not sürükle</p>
        )}
      </div>
    </div>
  );
}

// ─── Unassigned Pool ─────────────────────────────────────────

function UnassignedPool({
  notes,
  onDrop,
}: {
  notes: Note[];
  onDrop: (noteId: string, quadrant: null) => void;
}) {
  const poolRef = useRef<HTMLDivElement>(null);
  const [isOver, setIsOver] = useState(false);

  const attachRef = useCallback(
    (el: HTMLDivElement | null) => {
      (poolRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      if (!el) return;

      return combine(
        dropTargetForElements({
          element: el,
          canDrop: ({ source }) => isNoteData(source.data as Record<string, unknown>),
          onDragEnter: () => setIsOver(true),
          onDragLeave: () => setIsOver(false),
          onDrop: ({ source }) => {
            setIsOver(false);
            const data = source.data as Record<string, unknown>;
            if (isNoteData(data)) {
              onDrop(data.noteId, null);
            }
          },
        })
      );
    },
    [onDrop]
  );

  return (
    <div
      ref={attachRef}
      className={`matrix-pool${isOver ? " matrix-pool--over" : ""}`}
    >
      <div className="matrix-pool-header">
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
          inbox
        </span>
        <span>Atanmamış notlar</span>
        <span className="matrix-pool-count">{notes.length}</span>
      </div>
      <div className="matrix-pool-body">
        {notes.map((note) => (
          <div key={note.id} className="matrix-pool-item">
            <MatrixNoteCard note={note} onRemove={() => {}} />
          </div>
        ))}
        {notes.length === 0 && (
          <p className="matrix-pool-empty">Tüm notlar atandı</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export function EisenhowerMatrix({ notes }: { notes: Note[] }) {
  const [, startTransition] = useTransition();

  const [optimisticNotes, updateOptimistic] = useOptimistic(
    notes,
    (state: Note[], { noteId, quadrant }: { noteId: string; quadrant: EisenhowerQuadrant | null }) =>
      state.map((n) => (n.id === noteId ? { ...n, quadrant } : n))
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

  const unassigned = optimisticNotes.filter((n) => n.quadrant === null);

  return (
    <div className="matrix-page">
      <div className="matrix-grid">
        {QUADRANTS.map((config) => (
          <MatrixQuadrant
            key={config.key}
            config={config}
            notes={optimisticNotes.filter((n) => n.quadrant === config.key)}
            onDrop={handleDrop}
            onRemove={(noteId) => handleDrop(noteId, null)}
          />
        ))}
      </div>
      <UnassignedPool notes={unassigned} onDrop={handleDrop} />
    </div>
  );
}
