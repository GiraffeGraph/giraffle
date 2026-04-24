"use client";

import { useState, useRef, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateCanvasTitleAction,
  updateCoatCellAction,
  addNoteToCanvasAction,
  removeCoatCellAction,
  deleteCoatCanvasAction,
} from "@/server/api/coat-canvas";
import { COAT_CELL_COLORS } from "@/domain/coat-canvas/coat-canvas.types";
import type {
  CoatCanvas,
  CoatCell,
  CoatCellColor,
  NoteForCanvas,
  NotePreview,
} from "@/domain/coat-canvas/coat-canvas.types";

const COLOR_HEX: Record<CoatCellColor, string> = {
  amber: "#e8b84b",
  rust: "#c46a44",
  forest: "#3d7a5a",
  slate: "#5a6e7a",
  lavender: "#8870a8",
  cream: "#d4c4a0",
};

const GRID_COLS = 12;
const GRID_GAP = 12;
const ROW_SNAP = 160;
const MAX_ROW_SPAN = 6;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function reorderCells(cells: CoatCell[], draggedId: string, targetId: string) {
  const next = [...cells];
  const fromIndex = next.findIndex((cell) => cell.id === draggedId);
  const toIndex = next.findIndex((cell) => cell.id === targetId);

  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return cells;
  }

  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);

  return next.map((cell, index) => ({ ...cell, position: index }));
}

function CanvasTitle({ canvasId, initialTitle }: { canvasId: string; initialTitle: string }) {
  const [title, setTitle] = useState(initialTitle);
  const [editing, setEditing] = useState(false);

  const commit = () => {
    setEditing(false);
    const trimmed = title.trim();
    if (trimmed && trimmed !== initialTitle) {
      updateCanvasTitleAction(canvasId, trimmed);
    }
  };

  if (editing) {
    return (
      <input
        className="cc-editor-title-input"
        value={title}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setTitle(initialTitle);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button className="cc-editor-title" type="button" onClick={() => setEditing(true)}>
      {title}
      <span className="material-symbols-outlined cc-editor-title-edit-icon">edit</span>
    </button>
  );
}

function TopbarColorPicker({
  value,
  onChange,
}: {
  value: CoatCellColor | null;
  onChange: (c: CoatCellColor | null) => void;
}) {
  return (
    <div className="cc-topbar-colors">
      <button
        className={`cc-color-dot cc-color-dot--none${value === null ? " cc-color-dot--active" : ""}`}
        type="button"
        title="No color"
        onClick={() => onChange(null)}
      />
      {COAT_CELL_COLORS.map((c) => (
        <button
          key={c}
          className={`cc-color-dot${value === c ? " cc-color-dot--active" : ""}`}
          type="button"
          title={c}
          style={{ background: COLOR_HEX[c] }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

function NoteContentPreview({ note }: { note: NotePreview | null }) {
  if (!note) {
    return (
      <div className="cc-cell-note-unlinked">
        <span className="material-symbols-outlined">link_off</span>
        <span>No note linked</span>
      </div>
    );
  }

  const lines = note.previewText
    ? note.previewText.split("\n").filter(Boolean).slice(0, 10)
    : [];

  if (lines.length === 0) {
    return <p className="cc-cell-preview-empty">Empty note</p>;
  }

  return (
    <div className="cc-cell-preview">
      {lines.map((line, i) => (
        <p key={i} className="cc-cell-preview-line">{line}</p>
      ))}
    </div>
  );
}

function CanvasCell({
  cell,
  isSelected,
  isDragging,
  isDropTarget,
  onSelect,
  onResizeStart,
  onResizeStep,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onOpenNote,
}: {
  cell: CoatCell;
  isSelected: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onResizeStart: (e: React.MouseEvent, cellId: string, dir: "col" | "row") => void;
  onResizeStep: (cellId: string, dir: "col" | "row", delta: number) => void;
  onDragStart: (cellId: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, cellId: string) => void;
  onDrop: (e: React.DragEvent, cellId: string) => void;
  onOpenNote: (noteId: string) => void;
}) {
  const note = cell.note;
  const displayTitle = note ? note.title || "Untitled" : cell.title || "Untitled";
  const displayIcon = note?.icon ?? null;

  return (
    <div
      className={`cc-cell${cell.color ? ` cc-cell--${cell.color}` : ""}${isSelected ? " cc-cell--selected" : ""}${isDragging ? " cc-cell--dragging" : ""}${isDropTarget ? " cc-cell--drop-target" : ""}`}
      style={{ gridColumn: `span ${cell.colSpan}`, gridRow: `span ${cell.rowSpan}` }}
      onClick={onSelect}
      onDragOver={(e) => onDragOver(e, cell.id)}
      onDrop={(e) => onDrop(e, cell.id)}
    >
      <div className="cc-cell-header">
        <button
          className="cc-cell-drag-handle"
          type="button"
          title="Drag box"
          aria-label="Drag box"
          draggable
          onClick={(e) => e.stopPropagation()}
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", cell.id);
            onDragStart(cell.id);
          }}
          onDragEnd={onDragEnd}
        >
          <span className="material-symbols-outlined">drag_indicator</span>
        </button>

        {displayIcon && (
          <span className="cc-cell-note-icon">{displayIcon}</span>
        )}

        <span className="cc-cell-note-title">{displayTitle}</span>

        {note && (
          <button
            className="cc-cell-open-note"
            type="button"
            title="Open note"
            onClick={(e) => {
              e.stopPropagation();
              onOpenNote(note.id);
            }}
          >
            <span className="material-symbols-outlined">open_in_new</span>
          </button>
        )}

        {isSelected ? (
          <div className="cc-cell-controls" onClick={(e) => e.stopPropagation()}>
            <button
              className="cc-cell-control"
              type="button"
              title="Make narrower"
              onClick={() => onResizeStep(cell.id, "col", -1)}
            >
              <span className="material-symbols-outlined">remove</span>
            </button>
            <button
              className="cc-cell-control"
              type="button"
              title="Make wider"
              onClick={() => onResizeStep(cell.id, "col", 1)}
            >
              <span className="material-symbols-outlined">add</span>
            </button>
            <button
              className="cc-cell-control"
              type="button"
              title="Make shorter"
              onClick={() => onResizeStep(cell.id, "row", -1)}
            >
              <span className="material-symbols-outlined">vertical_align_top</span>
            </button>
            <button
              className="cc-cell-control"
              type="button"
              title="Make taller"
              onClick={() => onResizeStep(cell.id, "row", 1)}
            >
              <span className="material-symbols-outlined">vertical_align_bottom</span>
            </button>
          </div>
        ) : null}
      </div>

      <div className="cc-cell-content-area" onClick={(e) => e.stopPropagation()}>
        <NoteContentPreview note={note} />
      </div>

      {isSelected ? (
        <>
          <div
            className="cc-resize-handle cc-resize-handle--right"
            onMouseDown={(e) => {
              e.stopPropagation();
              onResizeStart(e, cell.id, "col");
            }}
          />
          <div
            className="cc-resize-handle cc-resize-handle--bottom"
            onMouseDown={(e) => {
              e.stopPropagation();
              onResizeStart(e, cell.id, "row");
            }}
          />
          <div
            className="cc-resize-handle cc-resize-handle--corner"
            onMouseDown={(e) => {
              e.stopPropagation();
              onResizeStart(e, cell.id, "col");
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function NotesPanel({
  notes,
  onNoteDragStart,
  onNoteDragEnd,
}: {
  notes: NoteForCanvas[];
  onNoteDragStart: (noteId: string) => void;
  onNoteDragEnd: () => void;
}) {
  const [filter, setFilter] = useState("");

  const filtered = filter
    ? notes.filter((n) =>
        (n.title || "Untitled").toLowerCase().includes(filter.toLowerCase())
      )
    : notes;

  return (
    <div className="cc-notes-panel">
      <div className="cc-notes-panel-header">
        <span className="material-symbols-outlined cc-notes-panel-icon">sticky_note_2</span>
        <span className="cc-notes-panel-title">Notes</span>
      </div>

      <div className="cc-notes-panel-search">
        <span className="material-symbols-outlined cc-notes-search-icon">search</span>
        <input
          className="cc-notes-panel-input"
          placeholder="Filter notes…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {filter && (
          <button
            className="cc-notes-search-clear"
            type="button"
            onClick={() => setFilter("")}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        )}
      </div>

      <div className="cc-notes-panel-hint">
        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>drag_indicator</span>
        Drag notes onto the canvas
      </div>

      <div className="cc-notes-panel-list">
        {filtered.length === 0 ? (
          <p className="cc-notes-panel-empty">
            {filter ? "No notes match" : "No notes yet"}
          </p>
        ) : (
          filtered.map((note) => (
            <div
              key={note.id}
              className="cc-note-item"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "copy";
                e.dataTransfer.setData("application/coat-note", note.id);
                e.dataTransfer.setData("text/plain", `note:${note.id}`);
                onNoteDragStart(note.id);
              }}
              onDragEnd={onNoteDragEnd}
              title={`Drag "${note.title || "Untitled"}" to canvas`}
            >
              <span className="cc-note-item-icon">
                {note.icon ?? (
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                    description
                  </span>
                )}
              </span>
              <span className="cc-note-item-title">{note.title || "Untitled"}</span>
              <span className="cc-note-item-drag">
                <span className="material-symbols-outlined">drag_indicator</span>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function CoatCanvasEditor({
  canvas,
  notes,
}: {
  canvas: CoatCanvas;
  notes: NoteForCanvas[];
}) {
  const router = useRouter();
  const [cells, setCells] = useState<CoatCell[]>(canvas.cells);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [showNotesPanel, setShowNotesPanel] = useState(true);
  const [isDeleting, startDelete] = useTransition();
  const [resizeCursor, setResizeCursor] = useState<"ew-resize" | "ns-resize" | null>(null);
  const [draggedCellId, setDraggedCellId] = useState<string | null>(null);
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dropTargetCellId, setDropTargetCellId] = useState<string | null>(null);
  const [isCanvasDropTarget, setIsCanvasDropTarget] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{
    cellId: string;
    dir: "col" | "row";
    startPos: number;
    startSpan: number;
  } | null>(null);

  const selectedCell = cells.find((c) => c.id === selectedCellId) ?? null;

  const persistCellOrder = useCallback(
    async (nextCells: CoatCell[]) => {
      await Promise.all(
        nextCells.map((cell, index) =>
          updateCoatCellAction(canvas.id, cell.id, { position: index })
        )
      );
    },
    [canvas.id]
  );

  const handleColorChange = useCallback(
    (color: CoatCellColor | null) => {
      if (!selectedCellId) return;
      setCells((prev) => prev.map((c) => (c.id === selectedCellId ? { ...c, color } : c)));
      updateCoatCellAction(canvas.id, selectedCellId, { color });
    },
    [canvas.id, selectedCellId]
  );

  const handleResizeStep = useCallback(
    (cellId: string, dir: "col" | "row", delta: number) => {
      const cell = cells.find((item) => item.id === cellId);
      if (!cell) return;

      const key = dir === "col" ? "colSpan" : "rowSpan";
      const nextValue = clamp(
        (dir === "col" ? cell.colSpan : cell.rowSpan) + delta,
        1,
        dir === "col" ? GRID_COLS : MAX_ROW_SPAN
      );

      if ((dir === "col" ? cell.colSpan : cell.rowSpan) === nextValue) return;

      setCells((prev) =>
        prev.map((item) =>
          item.id === cellId ? { ...item, [key]: nextValue } : item
        )
      );
      updateCoatCellAction(canvas.id, cellId, { [key]: nextValue });
    },
    [canvas.id, cells]
  );

  const handleRemoveSelected = useCallback(() => {
    if (!selectedCellId) return;
    setCells((prev) => prev.filter((c) => c.id !== selectedCellId));
    removeCoatCellAction(canvas.id, selectedCellId);
    setSelectedCellId(null);
  }, [canvas.id, selectedCellId]);

  const handleDeleteCanvas = () => {
    startDelete(async () => {
      await deleteCoatCanvasAction(canvas.id);
    });
  };

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, cellId: string, dir: "col" | "row") => {
      e.preventDefault();
      const cell = cells.find((c) => c.id === cellId);
      if (!cell) return;

      resizeRef.current = {
        cellId,
        dir,
        startPos: dir === "col" ? e.clientX : e.clientY,
        startSpan: dir === "col" ? cell.colSpan : cell.rowSpan,
      };
      setResizeCursor(dir === "col" ? "ew-resize" : "ns-resize");

      const onMove = (ev: MouseEvent) => {
        const state = resizeRef.current;
        if (!state) return;

        const currentPos = state.dir === "col" ? ev.clientX : ev.clientY;
        const delta = currentPos - state.startPos;
        const snapUnit =
          state.dir === "col"
            ? Math.max(1, ((gridRef.current?.clientWidth ?? 960) - (GRID_COLS - 1) * GRID_GAP) / GRID_COLS)
            : ROW_SNAP;
        const maxSpan = state.dir === "col" ? GRID_COLS : MAX_ROW_SPAN;
        const newSpan = clamp(Math.round(state.startSpan + delta / snapUnit), 1, maxSpan);

        setCells((prev) =>
          prev.map((c) =>
            c.id === state.cellId
              ? { ...c, [state.dir === "col" ? "colSpan" : "rowSpan"]: newSpan }
              : c
          )
        );
      };

      const onUp = (ev: MouseEvent) => {
        const state = resizeRef.current;
        if (state) {
          const currentPos = state.dir === "col" ? ev.clientX : ev.clientY;
          const delta = currentPos - state.startPos;
          const snapUnit =
            state.dir === "col"
              ? Math.max(1, ((gridRef.current?.clientWidth ?? 960) - (GRID_COLS - 1) * GRID_GAP) / GRID_COLS)
              : ROW_SNAP;
          const maxSpan = state.dir === "col" ? GRID_COLS : MAX_ROW_SPAN;
          const finalSpan = clamp(Math.round(state.startSpan + delta / snapUnit), 1, maxSpan);
          const key = state.dir === "col" ? "colSpan" : "rowSpan";
          updateCoatCellAction(canvas.id, state.cellId, { [key]: finalSpan });
          resizeRef.current = null;
        }

        setResizeCursor(null);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [canvas.id, cells]
  );

  const handleCellDragStart = useCallback((cellId: string) => {
    setDraggedCellId(cellId);
    setDraggedNoteId(null);
    setDropTargetCellId(null);
    setSelectedCellId(cellId);
  }, []);

  const handleCellDragEnd = useCallback(() => {
    setDraggedCellId(null);
    setDropTargetCellId(null);
  }, []);

  const handleNoteDragStart = useCallback((noteId: string) => {
    setDraggedNoteId(noteId);
    setDraggedCellId(null);
    setDropTargetCellId(null);
    setSelectedCellId(null);
  }, []);

  const handleNoteDragEnd = useCallback(() => {
    setDraggedNoteId(null);
    setIsCanvasDropTarget(false);
    setDropTargetCellId(null);
  }, []);

  const handleAddNoteToCanvas = useCallback(
    async (noteId: string, beforeCellId?: string) => {
      const note = notes.find((n) => n.id === noteId);
      if (!note) return;

      const cellId = await addNoteToCanvasAction(canvas.id, noteId, {
        colSpan: 4,
        rowSpan: 1,
      });

      const newCell: CoatCell = {
        id: cellId,
        canvasId: canvas.id,
        noteId: noteId,
        note: {
          id: note.id,
          title: note.title,
          icon: note.icon,
          previewText: "",
        },
        title: note.title,
        content: "",
        colSpan: 4,
        rowSpan: 1,
        position: cells.length,
        color: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (beforeCellId) {
        const targetIndex = cells.findIndex((c) => c.id === beforeCellId);
        const nextCells = [...cells];
        nextCells.splice(targetIndex, 0, { ...newCell, position: targetIndex });
        const reindexed = nextCells.map((c, i) => ({ ...c, position: i }));
        setCells(reindexed);
        await persistCellOrder(reindexed);
      } else {
        setCells((prev) => [...prev, newCell]);
      }
    },
    [canvas.id, cells, notes, persistCellOrder]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent, cellId: string) => {
      const noteId = event.dataTransfer.types.includes("application/coat-note");
      if (noteId) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDropTargetCellId(cellId);
        return;
      }
      if (!draggedCellId || draggedCellId === cellId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDropTargetCellId(cellId);
    },
    [draggedCellId]
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent, cellId: string) => {
      event.preventDefault();
      event.stopPropagation();

      const noteId = event.dataTransfer.getData("application/coat-note");
      if (noteId) {
        setDraggedNoteId(null);
        setDropTargetCellId(null);
        setIsCanvasDropTarget(false);
        await handleAddNoteToCanvas(noteId, cellId);
        return;
      }

      if (!draggedCellId || draggedCellId === cellId) {
        handleCellDragEnd();
        return;
      }

      const nextCells = reorderCells(cells, draggedCellId, cellId);
      setCells(nextCells);
      setSelectedCellId(draggedCellId);
      handleCellDragEnd();
      await persistCellOrder(nextCells);
    },
    [cells, draggedCellId, handleCellDragEnd, persistCellOrder, handleAddNoteToCanvas]
  );

  const handleCanvasDragOver = useCallback(
    (event: React.DragEvent) => {
      if (draggedNoteId || event.dataTransfer.types.includes("application/coat-note")) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setIsCanvasDropTarget(true);
      }
    },
    [draggedNoteId]
  );

  const handleCanvasDrop = useCallback(
    async (event: React.DragEvent) => {
      const noteId = event.dataTransfer.getData("application/coat-note");
      if (!noteId) return;
      event.preventDefault();
      setDraggedNoteId(null);
      setIsCanvasDropTarget(false);
      await handleAddNoteToCanvas(noteId);
    },
    [handleAddNoteToCanvas]
  );

  const handleOpenNote = useCallback(
    (noteId: string) => {
      router.push(`/notes/${noteId}`);
    },
    [router]
  );

  return (
    <div className="cc-editor" style={resizeCursor ? { cursor: resizeCursor } : undefined}>
      {resizeCursor ? <div className="cc-resize-overlay" style={{ cursor: resizeCursor }} /> : null}

      <div className="cc-editor-topbar">
        <button className="cc-editor-back" type="button" onClick={() => router.push("/coat-canvas")}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
          Coat Canvas
        </button>

        <CanvasTitle canvasId={canvas.id} initialTitle={canvas.title} />

        <div className="cc-editor-topbar-actions">
          {selectedCell ? (
            <>
              <TopbarColorPicker value={selectedCell.color} onChange={handleColorChange} />
              <div className="cc-topbar-sep" />
              <button className="cc-btn cc-btn--ghost cc-btn--sm" type="button" onClick={() => handleResizeStep(selectedCell.id, "col", -1)}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>remove</span>
                Narrower
              </button>
              <button className="cc-btn cc-btn--ghost cc-btn--sm" type="button" onClick={() => handleResizeStep(selectedCell.id, "col", 1)}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span>
                Wider
              </button>
              <button className="cc-btn cc-btn--ghost cc-btn--sm" type="button" onClick={() => handleResizeStep(selectedCell.id, "row", -1)}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>vertical_align_top</span>
                Shorter
              </button>
              <button className="cc-btn cc-btn--ghost cc-btn--sm" type="button" onClick={() => handleResizeStep(selectedCell.id, "row", 1)}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>vertical_align_bottom</span>
                Taller
              </button>
              <button className="cc-btn cc-btn--danger cc-btn--sm" type="button" onClick={handleRemoveSelected}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>delete</span>
                Remove
              </button>
            </>
          ) : (
            <button className="cc-btn cc-btn--danger cc-btn--sm" type="button" onClick={handleDeleteCanvas} disabled={isDeleting}>
              <span className="material-symbols-outlined" style={{ fontSize: 15 }}>delete_forever</span>
              {isDeleting ? "Deleting…" : "Delete canvas"}
            </button>
          )}

          <button
            className={`cc-btn cc-btn--ghost cc-btn--sm${showNotesPanel ? " cc-btn--active" : ""}`}
            type="button"
            onClick={() => setShowNotesPanel((v) => !v)}
            title="Toggle notes panel"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>sticky_note_2</span>
            Notes
          </button>
        </div>
      </div>

      <div className="cc-editor-body">
        {showNotesPanel && (
          <NotesPanel
            notes={notes}
            onNoteDragStart={handleNoteDragStart}
            onNoteDragEnd={handleNoteDragEnd}
          />
        )}

        <div
          className={`cc-editor-scroll${isCanvasDropTarget ? " cc-editor-scroll--drop-target" : ""}`}
          onClick={() => setSelectedCellId(null)}
          onDragOver={handleCanvasDragOver}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setIsCanvasDropTarget(false);
            }
          }}
          onDrop={handleCanvasDrop}
        >
          {cells.length === 0 ? (
            <div className="cc-editor-empty">
              <span className="material-symbols-outlined cc-editor-empty-icon">texture</span>
              <p className="cc-editor-empty-title">Canvas is empty</p>
              <p className="cc-editor-empty-sub">
                {showNotesPanel
                  ? "Drag a note from the panel on the left to add it to the canvas"
                  : "Open the Notes panel and drag notes onto the canvas"}
              </p>
              {!showNotesPanel && (
                <button
                  className="cc-btn cc-btn--primary"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowNotesPanel(true);
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>sticky_note_2</span>
                  Open Notes panel
                </button>
              )}
            </div>
          ) : (
            <div className="cc-grid" ref={gridRef}>
              {cells.map((cell) => (
                <CanvasCell
                  key={cell.id}
                  cell={cell}
                  isSelected={cell.id === selectedCellId}
                  isDragging={cell.id === draggedCellId}
                  isDropTarget={cell.id === dropTargetCellId}
                  onSelect={(e) => {
                    e.stopPropagation();
                    setSelectedCellId(cell.id);
                  }}
                  onResizeStart={handleResizeStart}
                  onResizeStep={handleResizeStep}
                  onDragStart={handleCellDragStart}
                  onDragEnd={handleCellDragEnd}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onOpenNote={handleOpenNote}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
