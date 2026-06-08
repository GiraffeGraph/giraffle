"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { KanbanBoardSummary } from "@/domain/kanban/kanban.types";
import { Button } from "@/components/ui/Button";
import { createBoardAction, deleteBoardAction } from "@/server/api/kanban";

export function KanbanBoardsList({ boards }: { boards: KanbanBoardSummary[] }) {
  const router = useRouter();
  const [items, setItems] = useState(boards);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<KanbanBoardSummary | null>(null);

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const id = await createBoardAction({ title: "Untitled board" });
      router.push(`/kanban/${id}`);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (board: KanbanBoardSummary) => {
    setItems((prev) => prev.filter((b) => b.id !== board.id));
    setConfirmDelete(null);
    await deleteBoardAction(board.id).catch(() => router.refresh());
  };

  return (
    <div className="kb-list-page">
      <div className="kb-list-head">
        <div>
          <h1 className="kb-list-title">Trek boards</h1>
          <p className="kb-list-sub">Plan work across custom stages. Drag cards to flow.</p>
        </div>
        <Button leadingIcon="add" onClick={handleCreate} disabled={creating}>
          New board
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="kb-list-empty">
          <span className="material-symbols-outlined">view_kanban</span>
          <p>No boards yet</p>
          <Button variant="tonal" leadingIcon="add" onClick={handleCreate} disabled={creating}>
            Create your first board
          </Button>
        </div>
      ) : (
        <div className="kb-list-grid">
          {items.map((board) => {
            const pct =
              board.cardCount > 0 ? Math.round((board.completedCount / board.cardCount) * 100) : 0;
            return (
              <div key={board.id} className="kb-board-card">
                <button
                  type="button"
                  className="kb-board-card-body"
                  onClick={() => router.push(`/kanban/${board.id}`)}
                >
                  <div className="kb-board-card-top">
                    <span className="kb-board-card-icon material-symbols-outlined">
                      {board.icon || "view_kanban"}
                    </span>
                    <span className="kb-board-card-title">{board.title}</span>
                  </div>
                  {board.description && (
                    <p className="kb-board-card-desc">{board.description}</p>
                  )}
                  <div className="kb-board-card-stats">
                    <span>{board.columnCount} columns</span>
                    <span>·</span>
                    <span>{board.cardCount} cards</span>
                  </div>
                  <div className="kb-board-card-progress">
                    <div className="kb-board-card-bar">
                      <div className="kb-board-card-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span>{board.completedCount}/{board.cardCount}</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="kb-board-card-del"
                  onClick={() => setConfirmDelete(board)}
                  aria-label="Delete board"
                  title="Delete board"
                >
                  <span className="material-symbols-outlined">delete</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

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
                <Button onClick={() => handleDelete(confirmDelete)}>Delete</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
