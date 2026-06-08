"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import type {
  KanbanBoardStatusColumnData,
  KanbanBoardSummary,
  KanbanBoardsOverview,
  KanbanColumnColor,
} from "@/domain/kanban/kanban.types";
import { Button } from "@/components/ui/Button";
import {
  createBoardAction,
  createBoardStatusColumnAction,
  deleteBoardAction,
  deleteBoardStatusColumnAction,
  moveBoardStatusColumnAction,
  moveBoardToStatusAction,
  updateBoardStatusColumnAction,
} from "@/server/api/kanban";
import { COLUMN_COLOR_META, COLUMN_COLOR_ORDER } from "./kanban-meta";
import {
  isKbBoardDragData,
  isKbStatusDragData,
  kbBoardDragData,
  kbStatusDragData,
} from "./dnd";

type StatusColumn = KanbanBoardStatusColumnData;

// ─── Pure reorder helpers ─────────────────────────────────────

function moveBoardLocal(
  columns: StatusColumn[],
  boardId: string,
  toStatusId: string,
  beforeBoardId: string | null,
): { columns: StatusColumn[]; index: number } {
  let moved: KanbanBoardSummary | undefined;
  const stripped = columns.map((col) => ({
    ...col,
    boards: col.boards.filter((b) => {
      if (b.id === boardId) {
        moved = b;
        return false;
      }
      return true;
    }),
  }));
  if (!moved) return { columns, index: -1 };
  let index = -1;
  const next = stripped.map((col) => {
    if (col.id !== toStatusId) return col;
    const boards = [...col.boards];
    let idx = beforeBoardId ? boards.findIndex((b) => b.id === beforeBoardId) : boards.length;
    if (idx < 0) idx = boards.length;
    index = idx;
    boards.splice(idx, 0, { ...(moved as KanbanBoardSummary), status: toStatusId });
    return { ...col, boards };
  });
  return { columns: next, index };
}

function moveStatusLocal(
  columns: StatusColumn[],
  statusId: string,
  beforeStatusId: string | null,
): { columns: StatusColumn[]; index: number } {
  const moving = columns.find((c) => c.id === statusId);
  if (!moving) return { columns, index: -1 };
  const rest = columns.filter((c) => c.id !== statusId);
  let idx = beforeStatusId ? rest.findIndex((c) => c.id === beforeStatusId) : rest.length;
  if (idx < 0) idx = rest.length;
  rest.splice(idx, 0, moving);
  return { columns: rest, index: idx };
}

// ─── Board card ───────────────────────────────────────────────

function BoardCard({
  board,
  onOpen,
  onDelete,
  onDropBoard,
}: {
  board: KanbanBoardSummary;
  onOpen: (id: string) => void;
  onDelete: (board: KanbanBoardSummary) => void;
  onDropBoard: (boardId: string, toStatusId: string, beforeBoardId: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isOver, setIsOver] = useState(false);
  const pct = board.cardCount > 0 ? Math.round((board.completedCount / board.cardCount) * 100) : 0;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return combine(
      draggable({
        element: el,
        getInitialData: () => kbBoardDragData(board.id, board.status ?? ""),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) => isKbBoardDragData(source.data) && source.data.boardId !== board.id,
        onDragEnter: () => setIsOver(true),
        onDragLeave: () => setIsOver(false),
        onDrop: ({ source }) => {
          setIsOver(false);
          if (isKbBoardDragData(source.data)) {
            onDropBoard(source.data.boardId, board.status ?? "", board.id);
          }
        },
      }),
    );
  }, [board.id, board.status, onDropBoard]);

  return (
    <div
      ref={ref}
      className={[
        "kb-bcard",
        isDragging ? "kb-card--dragging" : "",
        isOver ? "kb-card--drop-before" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onOpen(board.id)}
    >
      <div className="kb-bcard-head">
        <span className="kb-bcard-icon material-symbols-outlined">{board.icon || "view_kanban"}</span>
        <span className="kb-bcard-title">{board.title}</span>
        <button
          type="button"
          className="kb-bcard-del"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(board);
          }}
          aria-label="Delete board"
          title="Delete board"
        >
          <span className="material-symbols-outlined">delete</span>
        </button>
      </div>
      <div className="kb-bcard-stats">
        <span>{board.columnCount} lists</span>
        <span>·</span>
        <span>{board.cardCount} cards</span>
      </div>
      <div className="kb-bcard-progress">
        <div className="kb-bcard-bar">
          <div className="kb-bcard-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <span>
          {board.completedCount}/{board.cardCount}
        </span>
      </div>
    </div>
  );
}

// ─── Status column ────────────────────────────────────────────

function StatusColumn({
  column,
  onOpenBoard,
  onDeleteBoard,
  onAddBoard,
  onDropBoard,
  onDropStatus,
  onRename,
  onRecolor,
  onDelete,
  canDelete,
}: {
  column: StatusColumn;
  onOpenBoard: (id: string) => void;
  onDeleteBoard: (board: KanbanBoardSummary) => void;
  onAddBoard: (statusId: string) => void;
  onDropBoard: (boardId: string, toStatusId: string, beforeBoardId: string | null) => void;
  onDropStatus: (statusId: string, beforeStatusId: string | null) => void;
  onRename: (statusId: string, title: string) => void;
  onRecolor: (statusId: string, color: KanbanColumnColor) => void;
  onDelete: (statusId: string) => void;
  canDelete: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [isStatusOver, setIsStatusOver] = useState(false);
  const [isBodyOver, setIsBodyOver] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);

  const colorClass = column.color ? COLUMN_COLOR_META[column.color].className : "kb-col--neutral";

  useEffect(() => {
    const root = rootRef.current;
    const header = headerRef.current;
    if (!root || !header) return;
    return combine(
      draggable({
        element: header,
        getInitialData: () => kbStatusDragData(column.id),
      }),
      dropTargetForElements({
        element: root,
        canDrop: ({ source }) =>
          isKbStatusDragData(source.data) && source.data.statusId !== column.id,
        onDragEnter: () => setIsStatusOver(true),
        onDragLeave: () => setIsStatusOver(false),
        onDrop: ({ source }) => {
          setIsStatusOver(false);
          if (isKbStatusDragData(source.data)) onDropStatus(source.data.statusId, column.id);
        },
      }),
    );
  }, [column.id, onDropStatus]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => isKbBoardDragData(source.data),
      onDragEnter: () => setIsBodyOver(true),
      onDragLeave: () => setIsBodyOver(false),
      onDrop: ({ source, location }) => {
        setIsBodyOver(false);
        if (location.current.dropTargets[0]?.element !== el) return;
        if (isKbBoardDragData(source.data)) onDropBoard(source.data.boardId, column.id, null);
      },
    });
  }, [column.id, onDropBoard]);

  return (
    <div
      ref={rootRef}
      className={["kb-column", colorClass, isStatusOver ? "kb-column--drop" : ""]
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
            title="Rename status"
          >
            {column.title}
          </button>
        )}
        <span className="kb-column-count">{column.boards.length}</span>
        <div className="kb-column-actions">
          <button
            type="button"
            className="kb-icon-btn"
            onClick={() => setColorMenuOpen((v) => !v)}
            aria-label="Status color"
            title="Color"
          >
            <span className="material-symbols-outlined">palette</span>
          </button>
          <button
            type="button"
            className="kb-icon-btn"
            onClick={() => onAddBoard(column.id)}
            aria-label="Add board"
            title="Add board"
          >
            <span className="material-symbols-outlined">add</span>
          </button>
          {canDelete && (
            <button
              type="button"
              className="kb-icon-btn kb-icon-btn--danger"
              onClick={() => onDelete(column.id)}
              aria-label="Delete status"
              title="Delete status"
            >
              <span className="material-symbols-outlined">delete</span>
            </button>
          )}
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

      <div ref={bodyRef} className={`kb-column-body${isBodyOver ? " kb-column-body--over" : ""}`}>
        {column.boards.map((board) => (
          <BoardCard
            key={board.id}
            board={board}
            onOpen={onOpenBoard}
            onDelete={onDeleteBoard}
            onDropBoard={onDropBoard}
          />
        ))}
        {column.boards.length === 0 && <p className="kb-column-empty">Drop boards here</p>}
      </div>

      <button type="button" className="kb-column-add-btn" onClick={() => onAddBoard(column.id)}>
        <span className="material-symbols-outlined">add</span>
        Add board
      </button>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────

export function KanbanBoardsBoard({ overview }: { overview: KanbanBoardsOverview }) {
  const router = useRouter();
  const [columns, setColumns] = useState<StatusColumn[]>(overview.columns);
  const [confirmDelete, setConfirmDelete] = useState<KanbanBoardSummary | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setColumns(overview.columns);
  }, [overview.columns]);

  const fail = useCallback(() => router.refresh(), [router]);

  const handleOpenBoard = useCallback((id: string) => router.push(`/kanban/${id}`), [router]);

  const handleAddBoard = useCallback(
    async (statusId: string) => {
      if (creating) return;
      setCreating(true);
      try {
        const id = await createBoardAction({ title: "Untitled board", status: statusId });
        router.push(`/kanban/${id}`);
      } finally {
        setCreating(false);
      }
    },
    [creating, router],
  );

  const handleConfirmDelete = useCallback(
    async (board: KanbanBoardSummary) => {
      setColumns((prev) =>
        prev.map((col) => ({ ...col, boards: col.boards.filter((b) => b.id !== board.id) })),
      );
      setConfirmDelete(null);
      await deleteBoardAction(board.id).catch(fail);
    },
    [fail],
  );

  const handleDropBoard = useCallback(
    (boardId: string, toStatusId: string, beforeBoardId: string | null) => {
      let serverIndex = -1;
      setColumns((prev) => {
        const result = moveBoardLocal(prev, boardId, toStatusId, beforeBoardId);
        serverIndex = result.index;
        return result.columns;
      });
      if (serverIndex >= 0) moveBoardToStatusAction(boardId, toStatusId, serverIndex).catch(fail);
    },
    [fail],
  );

  const handleDropStatus = useCallback(
    (statusId: string, beforeStatusId: string | null) => {
      let serverIndex = -1;
      setColumns((prev) => {
        const result = moveStatusLocal(prev, statusId, beforeStatusId);
        serverIndex = result.index;
        return result.columns;
      });
      if (serverIndex >= 0) moveBoardStatusColumnAction(statusId, serverIndex).catch(fail);
    },
    [fail],
  );

  const handleRename = useCallback(
    (statusId: string, title: string) => {
      const trimmed = title.trim() || "New status";
      setColumns((prev) => prev.map((c) => (c.id === statusId ? { ...c, title: trimmed } : c)));
      updateBoardStatusColumnAction(statusId, { title: trimmed }).catch(fail);
    },
    [fail],
  );

  const handleRecolor = useCallback(
    (statusId: string, color: KanbanColumnColor) => {
      setColumns((prev) => prev.map((c) => (c.id === statusId ? { ...c, color } : c)));
      updateBoardStatusColumnAction(statusId, { color }).catch(fail);
    },
    [fail],
  );

  const handleDeleteStatus = useCallback(
    (statusId: string) => {
      setColumns((prev) => {
        if (prev.length <= 1) return prev;
        const removed = prev.find((c) => c.id === statusId);
        const fallback = prev.find((c) => c.id !== statusId);
        if (!removed || !fallback) return prev;
        return prev
          .filter((c) => c.id !== statusId)
          .map((c) =>
            c.id === fallback.id ? { ...c, boards: [...c.boards, ...removed.boards] } : c,
          );
      });
      deleteBoardStatusColumnAction(statusId).catch(fail);
    },
    [fail],
  );

  const handleAddStatus = useCallback(() => {
    const tempId = `temp-status-${Math.max(0, columns.length)}-${columns.length}`;
    setColumns((prev) => [
      ...prev,
      { id: tempId, title: "New status", color: "neutral", position: prev.length, boards: [] },
    ]);
    createBoardStatusColumnAction({ title: "New status", color: "neutral" })
      .then((realId) => {
        setColumns((prev) => prev.map((c) => (c.id === tempId ? { ...c, id: realId } : c)));
      })
      .catch(fail);
  }, [columns.length, fail]);

  return (
    <div className="kb-board kb-board--overview">
      <div className="kb-overview-head">
        <div>
          <h1 className="kb-list-title">Trek boards</h1>
          <p className="kb-list-sub">
            Two levels: organise boards by status, and tasks within each board. Drag to flow.
          </p>
        </div>
        <Button leadingIcon="add" onClick={() => handleAddBoard(columns[0]?.id ?? "")} disabled={creating}>
          New board
        </Button>
      </div>

      <div className="kb-board-scroll">
        {columns.map((column) => (
          <StatusColumn
            key={column.id}
            column={column}
            onOpenBoard={handleOpenBoard}
            onDeleteBoard={setConfirmDelete}
            onAddBoard={handleAddBoard}
            onDropBoard={handleDropBoard}
            onDropStatus={handleDropStatus}
            onRename={handleRename}
            onRecolor={handleRecolor}
            onDelete={handleDeleteStatus}
            canDelete={columns.length > 1}
          />
        ))}
        <button type="button" className="kb-add-column" onClick={handleAddStatus}>
          <span className="material-symbols-outlined">add</span>
          Add status
        </button>
      </div>

      {confirmDelete && (
        <div className="kb-modal-backdrop" role="presentation" onClick={() => setConfirmDelete(null)}>
          <div
            className="kb-modal kb-modal--sm"
            role="dialog"
            aria-modal="true"
            aria-label="Delete board"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="kb-modal-header">
              <h2 className="kb-modal-title">Delete board</h2>
            </div>
            <div className="kb-modal-body">
              <p className="kb-modal-copy">
                &quot;{confirmDelete.title}&quot; and all its columns and cards will be permanently
                deleted.
              </p>
            </div>
            <div className="kb-modal-footer">
              <div className="kb-modal-footer-right">
                <Button variant="text" onClick={() => setConfirmDelete(null)}>
                  Cancel
                </Button>
                <Button onClick={() => handleConfirmDelete(confirmDelete)}>Delete</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
