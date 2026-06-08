"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { deleteBoardAction, updateBoardAction } from "@/server/api/kanban";

export function KanbanBoardMenu({
  boardId,
  title,
}: {
  boardId: string;
  title: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);
  const [draft, setDraft] = useState(title);
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (!busy) setDialog(null);
  };

  const handleRename = async () => {
    setBusy(true);
    try {
      await updateBoardAction(boardId, { title: draft.trim() || "Untitled board" });
      setDialog(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await deleteBoardAction(boardId);
      router.push("/kanban");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="text"
        icon
        onClick={() => router.push(`/notes/${boardId}`)}
        aria-label="Open as note"
        title="Open as note — a board is a note; its cards are tasks"
      >
        <span className="material-symbols-outlined">description</span>
      </Button>
      <Button
        variant="text"
        icon
        onClick={() => {
          setDraft(title);
          setDialog("rename");
        }}
        aria-label="Rename board"
        title="Rename board"
      >
        <span className="material-symbols-outlined">edit</span>
      </Button>
      <Button
        variant="text"
        icon
        onClick={() => setDialog("delete")}
        aria-label="Delete board"
        title="Delete board"
      >
        <span className="material-symbols-outlined">delete</span>
      </Button>

      {dialog && (
        <div className="kb-modal-backdrop" role="presentation" onClick={close}>
          <div
            className="kb-modal kb-modal--sm"
            role="dialog"
            aria-modal="true"
            aria-label={dialog === "rename" ? "Rename board" : "Delete board"}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="kb-modal-header">
              <h2 className="kb-modal-title">
                {dialog === "rename" ? "Rename board" : "Delete board"}
              </h2>
            </div>
            <div className="kb-modal-body">
              {dialog === "rename" ? (
                <label className="kb-field">
                  <span className="kb-field-label">Board title</span>
                  <input
                    className="kb-input"
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename();
                    }}
                  />
                </label>
              ) : (
                <p className="kb-modal-copy">
                  &quot;{title}&quot; and all its columns and cards will be permanently deleted.
                </p>
              )}
            </div>
            <div className="kb-modal-footer">
              <div className="kb-modal-footer-right">
                <Button variant="text" onClick={close} disabled={busy}>
                  Cancel
                </Button>
                <Button onClick={dialog === "rename" ? handleRename : handleDelete} disabled={busy}>
                  {dialog === "rename" ? "Save" : "Delete"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
