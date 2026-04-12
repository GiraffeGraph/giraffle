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

// ─── Constants ────────────────────────────────────────────────

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
const ROW_SNAP = 160; // px per rowSpan unit

// ─── Canvas title ─────────────────────────────────────────────

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
          if (e.key === "Escape") { setTitle(initialTitle); setEditing(false); }
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

// ─── Topbar color picker ──────────────────────────────────────

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
        title="Renksiz"
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

// ─── Individual cell ──────────────────────────────────────────

function CanvasCell({
  cell,
  isSelected,
  onSelect,
  onTitleChange,
  onContentSave,
  onResizeStart,
}: {
  cell: CoatCell;
  isSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onTitleChange: (id: string, title: string) => void;
  onContentSave: (id: string, json: string) => void;
  onResizeStart: (e: React.MouseEvent, cellId: string, dir: "col" | "row") => void;
}) {
  const [title, setTitle] = useState(cell.title);

  // Sync title if cell changes externally
  const prevIdRef = useRef(cell.id);
  useEffect(() => {
    if (cell.id !== prevIdRef.current) {
      prevIdRef.current = cell.id;
      setTitle(cell.title);
    }
  }, [cell.id, cell.title]);

  return (
    <div
      className={`cc-cell${cell.color ? ` cc-cell--${cell.color}` : ""}${isSelected ? " cc-cell--selected" : ""}`}
      style={{ gridColumn: `span ${cell.colSpan}`, gridRow: `span ${cell.rowSpan}` }}
      onClick={onSelect}
    >
      {/* Title */}
      <input
        className="cc-cell-title"
        value={title}
        placeholder="Başlık…"
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => onTitleChange(cell.id, title)}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Content — Tiptap editor */}
      <div
        className="cc-cell-content-area"
        onClick={(e) => e.stopPropagation()}
      >
        <CellEditor
          key={cell.id}
          cellId={cell.id}
          initialContent={cell.content}
          onSave={(json) => onContentSave(cell.id, json)}
        />
      </div>

      {/* Resize handles (visible when selected) */}
      {isSelected && (
        <>
          <div
            className="cc-resize-handle cc-resize-handle--right"
            onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, cell.id, "col"); }}
          />
          <div
            className="cc-resize-handle cc-resize-handle--bottom"
            onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, cell.id, "row"); }}
          />
          <div
            className="cc-resize-handle cc-resize-handle--corner"
            onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, cell.id, "col"); }}
          />
        </>
      )}
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────

export function CoatCanvasEditor({ canvas }: { canvas: CoatCanvas }) {
  const router = useRouter();
  const [cells, setCells] = useState<CoatCell[]>(canvas.cells);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [showAddPopover, setShowAddPopover] = useState(false);
  const [isDeleting, startDelete] = useTransition();
  const [resizeCursor, setResizeCursor] = useState<"ew-resize" | "ns-resize" | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{
    cellId: string;
    dir: "col" | "row";
    startPos: number;
    startSpan: number;
  } | null>(null);

  const selectedCell = cells.find((c) => c.id === selectedCellId) ?? null;

  // ── Cell update helpers ──────────────────────────────────────

  const handleTitleChange = useCallback((id: string, title: string) => {
    setCells((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    updateCoatCellAction(canvas.id, id, { title });
  }, [canvas.id]);

  const handleContentSave = useCallback((id: string, json: string) => {
    setCells((prev) => prev.map((c) => (c.id === id ? { ...c, content: json } : c)));
    updateCoatCellAction(canvas.id, id, { content: json });
  }, [canvas.id]);

  const handleColorChange = useCallback((color: CoatCellColor | null) => {
    if (!selectedCellId) return;
    setCells((prev) => prev.map((c) => (c.id === selectedCellId ? { ...c, color } : c)));
    updateCoatCellAction(canvas.id, selectedCellId, { color });
  }, [canvas.id, selectedCellId]);

  const handleRemoveSelected = useCallback(() => {
    if (!selectedCellId) return;
    setCells((prev) => prev.filter((c) => c.id !== selectedCellId));
    removeCoatCellAction(canvas.id, selectedCellId);
    setSelectedCellId(null);
  }, [canvas.id, selectedCellId]);

  const handleAddCell = useCallback(async (colSpan: number, rowSpan: number) => {
    setShowAddPopover(false);
    const cellId = await addCoatCellAction(canvas.id, { colSpan, rowSpan });
    const newCell: CoatCell = {
      id: cellId,
      canvasId: canvas.id,
      title: "Yeni Kutu",
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
  }, [canvas.id, cells.length]);

  const handleDeleteCanvas = () => {
    startDelete(async () => {
      await deleteCoatCanvasAction(canvas.id);
    });
  };

  // ── Resize logic ─────────────────────────────────────────────

  const handleResizeStart = useCallback((
    e: React.MouseEvent,
    cellId: string,
    dir: "col" | "row"
  ) => {
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
      let snapUnit: number;
      if (state.dir === "col") {
        const gw = gridRef.current?.clientWidth ?? 960;
        snapUnit = Math.max(1, (gw - (GRID_COLS - 1) * GRID_GAP) / GRID_COLS);
      } else {
        snapUnit = ROW_SNAP;
      }
      const maxSpan = state.dir === "col" ? 12 : 6;
      const newSpan = Math.max(1, Math.min(maxSpan, Math.round(state.startSpan + delta / snapUnit)));
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
        let snapUnit: number;
        if (state.dir === "col") {
          const gw = gridRef.current?.clientWidth ?? 960;
          snapUnit = Math.max(1, (gw - (GRID_COLS - 1) * GRID_GAP) / GRID_COLS);
        } else {
          snapUnit = ROW_SNAP;
        }
        const maxSpan = state.dir === "col" ? 12 : 6;
        const finalSpan = Math.max(1, Math.min(maxSpan, Math.round(state.startSpan + delta / snapUnit)));
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
  }, [canvas.id, cells]);

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="cc-editor" style={resizeCursor ? { cursor: resizeCursor } : undefined}>
      {/* Global resize overlay (captures events, prevents selection) */}
      {resizeCursor && (
        <div className="cc-resize-overlay" style={{ cursor: resizeCursor }} />
      )}

      {/* Topbar */}
      <div className="cc-editor-topbar">
        <button
          className="cc-editor-back"
          type="button"
          onClick={() => router.push("/coat-canvas")}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
          Coat Canvas
        </button>

        <CanvasTitle canvasId={canvas.id} initialTitle={canvas.title} />

        <div className="cc-editor-topbar-actions">
          {selectedCell ? (
            <>
              <TopbarColorPicker value={selectedCell.color} onChange={handleColorChange} />
              <div className="cc-topbar-sep" />
              <button
                className="cc-btn cc-btn--ghost cc-btn--sm"
                type="button"
                onClick={() => setShowAddPopover((v) => !v)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span>
                Kutu ekle
              </button>
              <button
                className="cc-btn cc-btn--danger cc-btn--sm"
                type="button"
                onClick={handleRemoveSelected}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>delete</span>
                Sil
              </button>
            </>
          ) : (
            <>
              <button
                className="cc-btn cc-btn--ghost cc-btn--sm"
                type="button"
                onClick={() => setShowAddPopover((v) => !v)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span>
                Kutu ekle
              </button>
              <button
                className="cc-btn cc-btn--danger cc-btn--sm"
                type="button"
                onClick={handleDeleteCanvas}
                disabled={isDeleting}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>delete_forever</span>
                {isDeleting ? "Siliniyor…" : "Canvas sil"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Add cell popover */}
      {showAddPopover && (
        <AddCellPopover
          onAdd={handleAddCell}
          onClose={() => setShowAddPopover(false)}
        />
      )}

      {/* Canvas grid */}
      <div
        className="cc-editor-scroll"
        onClick={() => setSelectedCellId(null)}
      >
        {cells.length === 0 ? (
          <div className="cc-editor-empty">
            <span className="material-symbols-outlined cc-editor-empty-icon">texture</span>
            <p className="cc-editor-empty-title">Canvas boş</p>
            <p className="cc-editor-empty-sub">İlk kutunu eklemek için "Kutu ekle" butonuna tıkla</p>
            <button
              className="cc-btn cc-btn--primary"
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowAddPopover(true); }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
              Kutu ekle
            </button>
          </div>
        ) : (
          <div className="cc-grid" ref={gridRef}>
            {cells.map((cell) => (
              <CanvasCell
                key={cell.id}
                cell={cell}
                isSelected={cell.id === selectedCellId}
                onSelect={(e) => { e.stopPropagation(); setSelectedCellId(cell.id); }}
                onTitleChange={handleTitleChange}
                onContentSave={handleContentSave}
                onResizeStart={handleResizeStart}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add cell popover ─────────────────────────────────────────

const SPAN_PRESETS = [
  { label: "Dar (3 kolon)", colSpan: 3, rowSpan: 1 },
  { label: "Orta (4 kolon)", colSpan: 4, rowSpan: 1 },
  { label: "Geniş (6 kolon)", colSpan: 6, rowSpan: 1 },
  { label: "Tam genişlik", colSpan: 12, rowSpan: 1 },
  { label: "Uzun (4×2)", colSpan: 4, rowSpan: 2 },
  { label: "Kare (6×2)", colSpan: 6, rowSpan: 2 },
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
        <p className="cc-add-popover-label">Boyut seç</p>
        {SPAN_PRESETS.map((p) => (
          <button
            key={p.label}
            className="cc-add-popover-item"
            type="button"
            onClick={() => onAdd(p.colSpan, p.rowSpan)}
          >
            <span
              className="cc-add-popover-preview"
              style={{ "--cols": p.colSpan, "--rows": p.rowSpan } as React.CSSProperties}
            />
            <span>{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
