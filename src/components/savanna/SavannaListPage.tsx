"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSavannaAction, deleteSavannaAction, renameSavannaAction } from "@/server/api/savanna";
import { confirmDialog } from "@/components/ui/ConfirmDialog";

type SavannaSummary = {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  elements: unknown;
};

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function relativeTime(date: Date): string {
  const diff = (date.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return "just now";
  if (abs < 3600) return RELATIVE.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return RELATIVE.format(Math.round(diff / 3600), "hour");
  return RELATIVE.format(Math.round(diff / 86400), "day");
}

function elementCount(elements: unknown): number {
  return Array.isArray(elements) ? elements.length : 0;
}

export function SavannaListPage({ savannas }: { savannas: SavannaSummary[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [isCreating, setIsCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleCreate = () => {
    if (isCreating) return;
    setIsCreating(true);
    startTransition(async () => {
      const id = await createSavannaAction();
      router.push(`/savanna/${id}`);
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      await deleteSavannaAction(id);
    });
  };

  const startRename = (savanna: SavannaSummary) => {
    setRenamingId(savanna.id);
    setRenameValue(savanna.title);
  };

  const commitRename = (id: string) => {
    if (!renameValue.trim()) return;
    startTransition(async () => {
      await renameSavannaAction(id, renameValue);
    });
    setRenamingId(null);
  };

  return (
    <div className="savanna-list-page">
      <div className="savanna-list-header">
        <p className="savanna-list-description">
          A free-form infinite canvas. Drop notes, draw connections, add labels — spatial thinking without constraints.
        </p>
        <button
          type="button"
          className="savanna-create-btn"
          onClick={handleCreate}
          disabled={isCreating}
        >
          <span className="material-symbols-outlined">add</span>
          New Savanna
        </button>
      </div>

      {savannas.length === 0 ? (
        <div className="savanna-empty-state">
          <span className="material-symbols-outlined savanna-empty-icon">landscape</span>
          <p className="savanna-empty-title">No savannas yet</p>
          <p className="savanna-empty-body">
            Create your first savanna to start mapping ideas spatially.
          </p>
          <button
            type="button"
            className="savanna-create-btn"
            onClick={handleCreate}
            disabled={isCreating}
          >
            <span className="material-symbols-outlined">add</span>
            New Savanna
          </button>
        </div>
      ) : (
        <div className="savanna-grid">
          {savannas.map((savanna) => (
            <div key={savanna.id} className="savanna-card">
              {renamingId === savanna.id ? (
                // While renaming, render a plain div instead of a <button>.
                // An <input> nested inside a <button> is invalid HTML and, in
                // WKWebView, Space bubbles up and activates the button (navigating away).
                <div className="savanna-card-body">
                  <span className="material-symbols-outlined savanna-card-icon">landscape</span>
                  <input
                    className="savanna-card-rename-input"
                    value={renameValue}
                    autoFocus
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(savanna.id)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") commitRename(savanna.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                  />
                  <span className="savanna-card-meta">
                    {elementCount(savanna.elements)} element{elementCount(savanna.elements) !== 1 ? "s" : ""} · updated {relativeTime(new Date(savanna.updatedAt))}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  className="savanna-card-body"
                  onClick={() => router.push(`/savanna/${savanna.id}`)}
                >
                  <span className="material-symbols-outlined savanna-card-icon">landscape</span>
                  <span className="savanna-card-title">{savanna.title}</span>
                  <span className="savanna-card-meta">
                    {elementCount(savanna.elements)} element{elementCount(savanna.elements) !== 1 ? "s" : ""} · updated {relativeTime(new Date(savanna.updatedAt))}
                  </span>
                </button>
              )}
              <div className="savanna-card-actions">
                <button
                  type="button"
                  className="savanna-card-action-btn"
                  title="Rename"
                  onClick={() => startRename(savanna)}
                >
                  <span className="material-symbols-outlined">edit</span>
                </button>
                <button
                  type="button"
                  className="savanna-card-action-btn savanna-card-action-btn--danger"
                  title="Delete"
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: "Delete savanna?",
                      message: `"${savanna.title}" will be permanently removed.`,
                      confirmLabel: "Delete",
                      destructive: true,
                    });
                    if (ok) handleDelete(savanna.id);
                  }}
                >
                  <span className="material-symbols-outlined">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
