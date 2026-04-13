"use client";

import { useState, useRef, useCallback, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  updateCanvasTitleAction,
  updateCoatCellAction,
  addCoatCellAction,
  removeCoatCellAction,
  deleteCoatCanvasAction,
} from "@/server/api/coat-canvas";
import { COAT_CELL_COLORS } from "@/domain/coat-canvas/coat-canvas.types";
import type { CoatCanvas, CoatCell, CoatCellColor } from "@/domain/coat-canvas/coat-canvas.types";
import { CellEditor } from "./CellEditor";

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

function CanvasCell({
  cell,
  isSelected,
  isDragging,
  isDropTarget,
  onSelect,
  onTitleChange,
  onContentSave,
  onResizeStart,
  onResizeStep,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  cell: CoatCell;
  isSelected: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onTitleChange: (id: string, title: string) => void;
  onContentSave: (id: string, json: string) => void;
  onResizeStart: (e: React.MouseEvent, cellId: string, dir: "col" | "row") => void;
  onResizeStep: (cellId: string, dir: "col" | "row", delta: number) => void;
  onDragStart: (cellId: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, cellId: string) => void;
  onDrop: (e: React.DragEvent, cellId: string) => void;
}) {
  const [title, setTitle] = useState(cell.title);
  const prevIdRef = useRef(cell.id);

  useEffect(() => {
    if (cell.id !== prevIdRef.current) {
      prevIdRef.current = cell.id;
      setTitle(cell.title);
    }
  }, [cell.id, cell.title]);

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

        <input
          className="cc-cell-title"
          value={title}
          placeholder="Title…"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => onTitleChange(cell.id, title)}
          onClick={(e) => e.stopPropagation()}
        />

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
        <CellEditor
          key={cell.id}
          cellId={cell.id}
          initialContent={cell.content}
          onSave={(json) => onContentSave(cell.id, json)}
        />
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

export function CoatCanvasEditor({ canvas }: { canvas: CoatCanvas }) {
  const router = useRouter();
  const [cells, setCells] = useState<CoatCell[]>(canvas.cells);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [showAddPopover, setShowAddPopover] = useState(false);
  const [isDeleting, startDelete] = useTransition();
  const [resizeCursor, setResizeCursor] = useState<"ew-resize" | "ns-resize" | null>(null);
  const [draggedCellId, setDraggedCellId] = useState<string | null>(null);
  const [dropTargetCellId, setDropTargetCellId] = useState<string | null>(null);
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

  const handleTitleChange = useCallback(
    (id: string, title: string) => {
      setCells((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
      updateCoatCellAction(canvas.id, id, { title });
    },
    [canvas.id]
  );

  const handleContentSave = useCallback(
    (id: string, json: string) => {
      setCells((prev) => prev.map((c) => (c.id === id ? { ...c, content: json } : c)));
      updateCoatCellAction(canvas.id, id, { content: json });
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

      if ((dir === "col" ? cell.colSpan : cell.rowSpan) === nextValue) {
        return;
      }

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

  const handleAddCell = useCallback(
    async (colSpan: number, rowSpan: number) => {
      setShowAddPopover(false);
      const cellId = await addCoatCellAction(canvas.id, { colSpan, rowSpan });
      const newCell: CoatCell = {
        id: cellId,
        canvasId: canvas.id,
        title: "New Box",
        content: "",
        colSpan,
        rowSpan,
        position: cells.length,
        color: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setCells((prev) => [...prev, newCell]);
      setSelectedCellId(cellId);
    },
    [canvas.id, cells.length]
  );

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

  const handleDragStart = useCallback((cellId: string) => {
    setDraggedCellId(cellId);
    setDropTargetCellId(null);
    setSelectedCellId(cellId);
    setShowAddPopover(false);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedCellId(null);
    setDropTargetCellId(null);
  }, []);

  const handleDragOver = useCallback(
    (event: React.DragEvent, cellId: string) => {
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
      if (!draggedCellId || draggedCellId === cellId) {
        handleDragEnd();
        return;
      }

      const nextCells = reorderCells(cells, draggedCellId, cellId);
      setCells(nextCells);
      setSelectedCellId(draggedCellId);
      handleDragEnd();
      await persistCellOrder(nextCells);
    },
    [cells, draggedCellId, handleDragEnd, persistCellOrder]
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
              <button className="cc-btn cc-btn--ghost cc-btn--sm" type="button" onClick={() => setShowAddPopover((v) => !v)}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span>
                Add box
              </button>
              <button className="cc-btn cc-btn--danger cc-btn--sm" type="button" onClick={handleRemoveSelected}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>delete</span>
                Delete
              </button>
            </>
          ) : (
            <>
              <button className="cc-btn cc-btn--ghost cc-btn--sm" type="button" onClick={() => setShowAddPopover((v) => !v)}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span>
                Add box
              </button>
              <button className="cc-btn cc-btn--danger cc-btn--sm" type="button" onClick={handleDeleteCanvas} disabled={isDeleting}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>delete_forever</span>
                {isDeleting ? "Deleting…" : "Delete canvas"}
              </button>
            </>
          )}
        </div>
      </div>

      {showAddPopover ? <AddCellPopover onAdd={handleAddCell} onClose={() => setShowAddPopover(false)} /> : null}

      <div className="cc-editor-scroll" onClick={() => setSelectedCellId(null)}>
        {cells.length === 0 ? (
          <div className="cc-editor-empty">
            <span className="material-symbols-outlined cc-editor-empty-icon">texture</span>
            <p className="cc-editor-empty-title">Canvas is empty</p>
            <p className="cc-editor-empty-sub">Click the "Add box" button to add your first box</p>
            <button
              className="cc-btn cc-btn--primary"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowAddPopover(true);
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
              Add box
            </button>
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
                onTitleChange={handleTitleChange}
                onContentSave={handleContentSave}
                onResizeStart={handleResizeStart}
                onResizeStep={handleResizeStep}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const SPAN_PRESETS = [
  { label: "Narrow (3 columns)", colSpan: 3, rowSpan: 1 },
  { label: "Medium (4 columns)", colSpan: 4, rowSpan: 1 },
  { label: "Wide (6 columns)", colSpan: 6, rowSpan: 1 },
  { label: "Full width", colSpan: 12, rowSpan: 1 },
  { label: "Tall (4×2)", colSpan: 4, rowSpan: 2 },
  { label: "Square (6×2)", colSpan: 6, rowSpan: 2 },
];

function AddCellPopover({
  onAdd,
  onClose,
}: {
  onAdd: (colSpan: number, rowSpan: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="cc-add-popover-backdrop" onClick={onClose}>
      <div className="cc-add-popover" onClick={(e) => e.stopPropagation()}>
        <p className="cc-add-popover-label">Choose size</p>
        {SPAN_PRESETS.map((preset) => (
          <button
            key={preset.label}
            className="cc-add-popover-item"
            type="button"
            onClick={() => onAdd(preset.colSpan, preset.rowSpan)}
          >
            <span
              className="cc-add-popover-preview"
              style={{ "--cols": preset.colSpan, "--rows": preset.rowSpan } as React.CSSProperties}
            />
            <span>{preset.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
