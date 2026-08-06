"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import type {
  KanbanBoardData,
  KanbanCardData,
  KanbanColumnColor,
  KanbanColumnData,
  UpdateCardInput,
} from "@giraffle/domain";
import {
  createCardAction,
  createColumnAction,
  deleteCardAction,
  deleteColumnAction,
  moveCardAction,
  moveColumnAction,
  toggleCardAction,
  updateCardAction,
  updateColumnAction,
} from "@/server/api/kanban";
import {
  COLUMN_COLOR_META,
  COLUMN_COLOR_ORDER,
  PRIORITY_META,
  dueState,
  formatDueDate,
} from "./kanban-meta";
import {
  isKbCardDragData,
  isKbColumnDragData,
  kbCardDragData,
  kbColumnDragData,
} from "./dnd";
import { KanbanCardEditor } from "./KanbanCardEditor";

// ─── Local reorder helpers (pure) ─────────────────────────────

function moveCardLocal(
  columns: KanbanColumnData[],
  cardId: string,
  toColumnId: string,
  beforeCardId: string | null,
): { columns: KanbanColumnData[]; index: number } {
  let moved: KanbanCardData | undefined;
  const stripped = columns.map((col) => ({
    ...col,
    cards: col.cards.filter((c) => {
      if (c.id === cardId) {
        moved = c;
        return false;
      }
      return true;
    }),
  }));
  if (!moved) return { columns, index: -1 };

  let index = -1;
  const next = stripped.map((col) => {
    if (col.id !== toColumnId) return col;
    const cards = [...col.cards];
    let idx = beforeCardId ? cards.findIndex((c) => c.id === beforeCardId) : cards.length;
    if (idx < 0) idx = cards.length;
    index = idx;
    cards.splice(idx, 0, { ...(moved as KanbanCardData), columnId: toColumnId });
    return { ...col, cards };
  });
  return { columns: next, index };
}

function moveColumnLocal(
  columns: KanbanColumnData[],
  columnId: string,
  beforeColumnId: string | null,
): { columns: KanbanColumnData[]; index: number } {
  const moved = columns.find((c) => c.id === columnId);
  if (!moved) return { columns, index: -1 };
  const rest = columns.filter((c) => c.id !== columnId);
  let idx = beforeColumnId ? rest.findIndex((c) => c.id === beforeColumnId) : rest.length;
  if (idx < 0) idx = rest.length;
  rest.splice(idx, 0, moved);
  return { columns: rest, index: idx };
}

// ─── Card ─────────────────────────────────────────────────────

function CardChip({ card }: { card: KanbanCardData }) {
  const prio = card.priority ? PRIORITY_META[card.priority] : null;
  if (!prio && !card.dueDate) return null;
  return (
    <div className="kb-card-meta">
      {prio && (
        <span className={`kb-prio-badge ${prio.className}`} title={prio.label}>
          <span className="material-symbols-outlined">{prio.icon}</span>
        </span>
      )}
      {card.dueDate && (
        <span className={`kb-due kb-due--${dueState(card.dueDate)}`}>
          <span className="material-symbols-outlined">schedule</span>
          {formatDueDate(card.dueDate)}
        </span>
      )}
      {card.durationMinutes != null && card.durationMinutes > 0 && (
        <span className="kb-duration">{card.durationMinutes}m</span>
      )}
    </div>
  );
}

function Card({
  card,
  onToggle,
  onOpen,
  onDropCard,
}: {
  card: KanbanCardData;
  onToggle: (id: string, completed: boolean) => void;
  onOpen: (card: KanbanCardData) => void;
  onDropCard: (cardId: string, toColumnId: string, beforeCardId: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return combine(
      draggable({
        element: el,
        getInitialData: () => kbCardDragData(card.id, card.columnId),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) =>
          isKbCardDragData(source.data) && source.data.cardId !== card.id,
        onDragEnter: () => setIsOver(true),
        onDragLeave: () => setIsOver(false),
        onDrop: ({ source }) => {
          setIsOver(false);
          if (isKbCardDragData(source.data)) {
            onDropCard(source.data.cardId, card.columnId, card.id);
          }
        },
      }),
    );
  }, [card.id, card.columnId, onDropCard]);

  return (
    <div
      ref={ref}
      className={[
        "kb-card",
        isDragging ? "kb-card--dragging" : "",
        isOver ? "kb-card--drop-before" : "",
        card.completed ? "kb-card--done" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onOpen(card)}
    >
      <button
        type="button"
        className="kb-card-check"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(card.id, !card.completed);
        }}
        aria-label={card.completed ? "Mark incomplete" : "Mark complete"}
      >
        <span className="material-symbols-outlined">
          {card.completed ? "check_circle" : "radio_button_unchecked"}
        </span>
      </button>
      <div className="kb-card-main">
        <span className="kb-card-title">{card.title || "Untitled"}</span>
        <CardChip card={card} />
      </div>
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────

function Column({
  column,
  onAddCard,
  onToggleCard,
  onOpenCard,
  onDropCard,
  onDropColumn,
  onRename,
  onRecolor,
  onDelete,
}: {
  column: KanbanColumnData;
  onAddCard: (columnId: string, title: string) => void;
  onToggleCard: (id: string, completed: boolean) => void;
  onOpenCard: (card: KanbanCardData) => void;
  onDropCard: (cardId: string, toColumnId: string, beforeCardId: string | null) => void;
  onDropColumn: (columnId: string, beforeColumnId: string | null) => void;
  onRename: (columnId: string, title: string) => void;
  onRecolor: (columnId: string, color: KanbanColumnColor) => void;
  onDelete: (columnId: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [isColumnDragging, setIsColumnDragging] = useState(false);
  const [isColumnOver, setIsColumnOver] = useState(false);
  const [isBodyOver, setIsBodyOver] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);

  const colorClass = column.color ? COLUMN_COLOR_META[column.color].className : "kb-col--neutral";

  // Column reorder: header is the drag handle, root is the column drop zone.
  useEffect(() => {
    const root = rootRef.current;
    const header = headerRef.current;
    if (!root || !header) return;
    return combine(
      draggable({
        element: header,
        getInitialData: () => kbColumnDragData(column.id),
        onDragStart: () => setIsColumnDragging(true),
        onDrop: () => setIsColumnDragging(false),
      }),
      dropTargetForElements({
        element: root,
        canDrop: ({ source }) =>
          isKbColumnDragData(source.data) && source.data.columnId !== column.id,
        onDragEnter: () => setIsColumnOver(true),
        onDragLeave: () => setIsColumnOver(false),
        onDrop: ({ source }) => {
          setIsColumnOver(false);
          if (isKbColumnDragData(source.data)) {
            onDropColumn(source.data.columnId, column.id);
          }
        },
      }),
    );
  }, [column.id, onDropColumn]);

  // Card append target = empty space in the column body.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => isKbCardDragData(source.data),
      onDragEnter: () => setIsBodyOver(true),
      onDragLeave: () => setIsBodyOver(false),
      onDrop: ({ source, location }) => {
        setIsBodyOver(false);
        // If a nested card target already handled it, skip.
        if (location.current.dropTargets[0]?.element !== el) return;
        if (isKbCardDragData(source.data)) {
          onDropCard(source.data.cardId, column.id, null);
        }
      },
    });
  }, [column.id, onDropCard]);

  const submitAdd = () => {
    const title = draftTitle.trim();
    if (title) onAddCard(column.id, title);
    setDraftTitle("");
    setIsAdding(false);
  };

  const completed = column.cards.filter((c) => c.completed).length;

  return (
    <div
      ref={rootRef}
      className={[
        "kb-column",
        colorClass,
        isColumnDragging ? "kb-column--dragging" : "",
        isColumnOver ? "kb-column--drop" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div ref={headerRef} className="kb-column-header">
        <span className="kb-column-dot" aria-hidden="true" />
        {editingTitle ? (
          <input
            className="kb-column-title-input"
            autoFocus
            defaultValue={column.title}
            onBlur={(e) => {
              onRename(column.id, e.target.value);
              setEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onRename(column.id, e.currentTarget.value);
                setEditingTitle(false);
              } else if (e.key === "Escape") {
                setEditingTitle(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="kb-column-title"
            onClick={() => setEditingTitle(true)}
            title="Rename column"
          >
            {column.title}
          </button>
        )}
        <span className="kb-column-count">
          {completed > 0 ? `${completed}/${column.cards.length}` : column.cards.length}
        </span>
        <div className="kb-column-actions">
          <button
            type="button"
            className="kb-icon-btn"
            onClick={() => setColorMenuOpen((v) => !v)}
            aria-label="Column color"
            title="Color"
          >
            <span className="material-symbols-outlined">palette</span>
          </button>
          <button
            type="button"
            className="kb-icon-btn"
            onClick={() => setIsAdding(true)}
            aria-label="Add card"
            title="Add card"
          >
            <span className="material-symbols-outlined">add</span>
          </button>
          <button
            type="button"
            className="kb-icon-btn kb-icon-btn--danger"
            onClick={() => onDelete(column.id)}
            aria-label="Delete column"
            title="Delete column"
          >
            <span className="material-symbols-outlined">delete</span>
          </button>
        </div>
        {colorMenuOpen && (
          <div className="kb-color-menu" role="menu">
            {COLUMN_COLOR_ORDER.map((color) => (
              <button
                key={color}
                type="button"
                className={`kb-color-swatch ${COLUMN_COLOR_META[color].className}${
                  column.color === color ? " kb-color-swatch--active" : ""
                }`}
                title={COLUMN_COLOR_META[color].label}
                onClick={() => {
                  onRecolor(column.id, color);
                  setColorMenuOpen(false);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div
        ref={bodyRef}
        className={`kb-column-body${isBodyOver ? " kb-column-body--over" : ""}`}
      >
        {column.cards.map((card) => (
          <Card
            key={card.id}
            card={card}
            onToggle={onToggleCard}
            onOpen={onOpenCard}
            onDropCard={onDropCard}
          />
        ))}
        {column.cards.length === 0 && !isAdding && (
          <p className="kb-column-empty">Drop cards here</p>
        )}
        {isAdding && (
          <div className="kb-add-card">
            <textarea
              className="kb-add-card-input"
              autoFocus
              rows={2}
              value={draftTitle}
              placeholder="Card title…"
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={submitAdd}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitAdd();
                } else if (e.key === "Escape") {
                  setDraftTitle("");
                  setIsAdding(false);
                }
              }}
            />
          </div>
        )}
      </div>

      <button type="button" className="kb-column-add-btn" onClick={() => setIsAdding(true)}>
        <span className="material-symbols-outlined">add</span>
        Add card
      </button>
    </div>
  );
}

// ─── Board root ───────────────────────────────────────────────

export function KanbanBoardView({ board }: { board: KanbanBoardData }) {
  const router = useRouter();
  const [columns, setColumns] = useState<KanbanColumnData[]>(board.columns);
  const [editingCard, setEditingCard] = useState<KanbanCardData | null>(null);
  const tempSeq = useRef(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColumns(board.columns);
  }, [board.columns]);

  const fail = useCallback(() => router.refresh(), [router]);

  const handleAddCard = useCallback(
    (columnId: string, title: string) => {
      const tempId = `temp-${tempSeq.current++}`;
      const optimistic: KanbanCardData = {
        id: tempId,
        columnId,
        title,
        description: null,
        priority: null,
        dueDate: null,
        durationMinutes: null,
        completed: false,
        position: 0,
      };
      setColumns((prev) =>
        prev.map((col) =>
          col.id === columnId ? { ...col, cards: [...col.cards, optimistic] } : col,
        ),
      );
      createCardAction(board.id, columnId, { title })
        .then((real) => {
          setColumns((prev) =>
            prev.map((col) =>
              col.id === columnId
                ? { ...col, cards: col.cards.map((c) => (c.id === tempId ? real : c)) }
                : col,
            ),
          );
        })
        .catch(fail);
    },
    [board.id, fail],
  );

  const handleToggleCard = useCallback(
    (cardId: string, completed: boolean) => {
      setColumns((prev) =>
        prev.map((col) => ({
          ...col,
          cards: col.cards.map((c) => (c.id === cardId ? { ...c, completed } : c)),
        })),
      );
      toggleCardAction(cardId, completed).catch(fail);
    },
    [fail],
  );

  const handleSaveCard = useCallback(
    (cardId: string, patch: UpdateCardInput) => {
      setColumns((prev) =>
        prev.map((col) => ({
          ...col,
          cards: col.cards.map((c) => (c.id === cardId ? { ...c, ...patch } : c)),
        })),
      );
      updateCardAction(cardId, patch).catch(fail);
    },
    [fail],
  );

  const handleDeleteCard = useCallback(
    (cardId: string) => {
      setColumns((prev) =>
        prev.map((col) => ({ ...col, cards: col.cards.filter((c) => c.id !== cardId) })),
      );
      deleteCardAction(cardId).catch(fail);
    },
    [fail],
  );

  const handleDropCard = useCallback(
    (cardId: string, toColumnId: string, beforeCardId: string | null) => {
      let serverIndex = -1;
      setColumns((prev) => {
        const result = moveCardLocal(prev, cardId, toColumnId, beforeCardId);
        serverIndex = result.index;
        return result.columns;
      });
      if (serverIndex >= 0) {
        moveCardAction(cardId, toColumnId, serverIndex).catch(fail);
      }
    },
    [fail],
  );

  const handleDropColumn = useCallback(
    (columnId: string, beforeColumnId: string | null) => {
      let serverIndex = -1;
      setColumns((prev) => {
        const result = moveColumnLocal(prev, columnId, beforeColumnId);
        serverIndex = result.index;
        return result.columns;
      });
      if (serverIndex >= 0) {
        moveColumnAction(board.id, columnId, serverIndex).catch(fail);
      }
    },
    [board.id, fail],
  );

  const handleRenameColumn = useCallback(
    (columnId: string, title: string) => {
      const trimmed = title.trim() || "New column";
      setColumns((prev) =>
        prev.map((col) => (col.id === columnId ? { ...col, title: trimmed } : col)),
      );
      updateColumnAction(board.id, columnId, { title: trimmed }).catch(fail);
    },
    [board.id, fail],
  );

  const handleRecolorColumn = useCallback(
    (columnId: string, color: KanbanColumnColor) => {
      setColumns((prev) =>
        prev.map((col) => (col.id === columnId ? { ...col, color } : col)),
      );
      updateColumnAction(board.id, columnId, { color }).catch(fail);
    },
    [board.id, fail],
  );

  const handleDeleteColumn = useCallback(
    (columnId: string) => {
      setColumns((prev) => prev.filter((col) => col.id !== columnId));
      deleteColumnAction(board.id, columnId).catch(fail);
    },
    [board.id, fail],
  );

  const handleAddColumn = useCallback(() => {
    const tempId = `temp-col-${tempSeq.current++}`;
    setColumns((prev) => [
      ...prev,
      { id: tempId, boardId: board.id, title: "New column", color: "neutral", position: prev.length, cards: [] },
    ]);
    createColumnAction(board.id, { title: "New column", color: "neutral" })
      .then((realId) => {
        setColumns((prev) =>
          prev.map((col) => (col.id === tempId ? { ...col, id: realId } : col)),
        );
      })
      .catch(fail);
  }, [board.id, fail]);

  return (
    <div className="kb-board">
      <div className="kb-board-scroll">
        {columns.map((column) => (
          <Column
            key={column.id}
            column={column}
            onAddCard={handleAddCard}
            onToggleCard={handleToggleCard}
            onOpenCard={setEditingCard}
            onDropCard={handleDropCard}
            onDropColumn={handleDropColumn}
            onRename={handleRenameColumn}
            onRecolor={handleRecolorColumn}
            onDelete={handleDeleteColumn}
          />
        ))}
        <button type="button" className="kb-add-column" onClick={handleAddColumn}>
          <span className="material-symbols-outlined">add</span>
          Add column
        </button>
      </div>

      {editingCard && (
        <KanbanCardEditor
          card={editingCard}
          onSave={(patch) => handleSaveCard(editingCard.id, patch)}
          onDelete={() => {
            handleDeleteCard(editingCard.id);
            setEditingCard(null);
          }}
          onClose={() => setEditingCard(null)}
        />
      )}
    </div>
  );
}
