"use client";

import { useState, useRef, useCallback, useTransition } from "react";
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

// ─── Color chip ───────────────────────────────────────────────

const COLOR_LABELS: Record<CoatCellColor, string> = {
  amber: "#e8b84b",
  rust: "#c46a44",
  forest: "#3d7a5a",
  slate: "#5a6e7a",
  lavender: "#8870a8",
  cream: "#d4c4a0",
};

function ColorPicker({
  value,
  onChange,
}: {
  value: CoatCellColor | null;
  onChange: (c: CoatCellColor | null) => void;
}) {
  return (
    <div className="cc-color-picker">
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
          style={{ background: COLOR_LABELS[c] }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

// ─── Span picker ──────────────────────────────────────────────

function SpanPicker({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="cc-span-picker">
      <span className="cc-span-label">{label}</span>
      <button
        className="cc-span-btn"
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
      >−</button>
      <span className="cc-span-value">{value}</span>
      <button
        className="cc-span-btn"
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
      >+</button>
    </div>
  );
}

// ─── Auto-resizing textarea ───────────────────────────────────

function AutoTextarea({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    // auto-resize
    const el = e.target;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };

  const handleFocus = () => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  };

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      onChange={handleChange}
      onBlur={onBlur}
      onFocus={handleFocus}
      placeholder={placeholder}
      rows={1}
    />
  );
}

// ─── Individual cell ──────────────────────────────────────────

function CanvasCell({
  cell,
  onUpdate,
  onRemove,
}: {
  cell: CoatCell;
  onUpdate: (id: string, patch: Partial<{ title: string; content: string; colSpan: number; rowSpan: number; color: CoatCellColor | null }>) => void;
  onRemove: (id: string) => void;
}) {
  const [title, setTitle] = useState(cell.title);
  const [content, setContent] = useState(cell.content);
  const [colSpan, setColSpan] = useState(cell.colSpan);
  const [rowSpan, setRowSpan] = useState(cell.rowSpan);
  const [color, setColor] = useState<CoatCellColor | null>(cell.color);
  const [showControls, setShowControls] = useState(false);

  const colorVar = color ? COLOR_LABELS[color] : null;

  const flush = useCallback((patch: Parameters<typeof onUpdate>[1]) => {
    onUpdate(cell.id, patch);
  }, [cell.id, onUpdate]);

  const handleColSpanChange = (v: number) => {
    setColSpan(v);
    flush({ colSpan: v });
  };

  const handleRowSpanChange = (v: number) => {
    setRowSpan(v);
    flush({ rowSpan: v });
  };

  const handleColorChange = (c: CoatCellColor | null) => {
    setColor(c);
    flush({ color: c });
  };

  return (
    <div
      className={`cc-cell${showControls ? " cc-cell--focused" : ""}`}
      style={{
        gridColumn: `span ${colSpan}`,
        gridRow: `span ${rowSpan}`,
        ...(colorVar ? { "--cc-cell-accent": colorVar } as React.CSSProperties : {}),
      }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* Cell accent bar */}
      {color && <div className="cc-cell-accent-bar" />}

      {/* Controls toolbar */}
      <div className={`cc-cell-toolbar${showControls ? " cc-cell-toolbar--visible" : ""}`}>
        <ColorPicker value={color} onChange={handleColorChange} />
        <div className="cc-cell-toolbar-divider" />
        <SpanPicker label="G" value={colSpan} min={1} max={12} onChange={handleColSpanChange} />
        <SpanPicker label="S" value={rowSpan} min={1} max={6} onChange={handleRowSpanChange} />
        <div className="cc-cell-toolbar-divider" />
        <button
          className="cc-cell-delete"
          type="button"
          title="Kutuyu sil"
          onClick={() => onRemove(cell.id)}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>delete</span>
        </button>
      </div>

      {/* Title */}
      <input
        className="cc-cell-title"
        value={title}
        placeholder="Başlık…"
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => { if (title !== cell.title) flush({ title }); }}
      />

      {/* Content */}
      <AutoTextarea
        className="cc-cell-content"
        value={content}
        placeholder="İçerik ekle…"
        onChange={setContent}
        onBlur={() => { if (content !== cell.content) flush({ content }); }}
      />
    </div>
  );
}

// ─── Add cell popover ─────────────────────────────────────────

const SPAN_PRESETS = [
  { label: "Dar (3)", colSpan: 3, rowSpan: 1 },
  { label: "Orta (4)", colSpan: 4, rowSpan: 1 },
  { label: "Geniş (6)", colSpan: 6, rowSpan: 1 },
  { label: "Tam (12)", colSpan: 12, rowSpan: 1 },
  { label: "Tall (4×2)", colSpan: 4, rowSpan: 2 },
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
            onClick={() => { onAdd(p.colSpan, p.rowSpan); onClose(); }}
          >
            <span className="cc-add-popover-preview" style={{ "--cols": p.colSpan, "--rows": p.rowSpan } as React.CSSProperties} />
            <span>{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Canvas title ─────────────────────────────────────────────

function CanvasTitle({ canvasId, initialTitle }: { canvasId: string; initialTitle: string }) {
  const [title, setTitle] = useState(initialTitle);
  const [editing, setEditing] = useState(false);

  const commit = () => {
    setEditing(false);
    if (title.trim() && title !== initialTitle) {
      updateCanvasTitleAction(canvasId, title.trim());
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
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setTitle(initialTitle); setEditing(false); } }}
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

// ─── Main editor ──────────────────────────────────────────────

export function CoatCanvasEditor({ canvas }: { canvas: CoatCanvas }) {
  const router = useRouter();
  const [cells, setCells] = useState<CoatCell[]>(canvas.cells);
  const [showAddPopover, setShowAddPopover] = useState(false);
  const [isDeleting, startDelete] = useTransition();

  const handleUpdate = useCallback(
    (
      id: string,
      patch: Partial<{ title: string; content: string; colSpan: number; rowSpan: number; color: CoatCellColor | null }>
    ) => {
      setCells((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
      );
      updateCoatCellAction(canvas.id, id, patch);
    },
    [canvas.id]
  );

  const handleRemove = useCallback(
    (id: string) => {
      setCells((prev) => prev.filter((c) => c.id !== id));
      removeCoatCellAction(canvas.id, id);
    },
    [canvas.id]
  );

  const handleAdd = useCallback(
    async (colSpan: number, rowSpan: number) => {
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
    },
    [canvas.id, cells.length]
  );

  const handleDelete = () => {
    startDelete(async () => {
      await deleteCoatCanvasAction(canvas.id);
    });
  };

  return (
    <div className="cc-editor">
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
          <button
            className="cc-btn cc-btn--ghost cc-btn--sm"
            type="button"
            onClick={() => setShowAddPopover(true)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>add</span>
            Kutu ekle
          </button>
          <button
            className="cc-btn cc-btn--danger cc-btn--sm"
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>delete</span>
            {isDeleting ? "Siliniyor…" : "Sil"}
          </button>
        </div>
      </div>

      {/* Grid canvas */}
      <div className="cc-editor-scroll">
        {cells.length === 0 ? (
          <div className="cc-editor-empty">
            <span className="material-symbols-outlined cc-editor-empty-icon">texture</span>
            <p className="cc-editor-empty-title">Canvas boş</p>
            <p className="cc-editor-empty-sub">İlk kutunu eklemek için "Kutu ekle" butonuna tıkla</p>
            <button
              className="cc-btn cc-btn--primary"
              type="button"
              onClick={() => setShowAddPopover(true)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
              Kutu ekle
            </button>
          </div>
        ) : (
          <div className="cc-grid">
            {cells.map((cell) => (
              <CanvasCell
                key={cell.id}
                cell={cell}
                onUpdate={handleUpdate}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
      </div>

      {showAddPopover && (
        <AddCellPopover onAdd={handleAdd} onClose={() => setShowAddPopover(false)} />
      )}
    </div>
  );
}
