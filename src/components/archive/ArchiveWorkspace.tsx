"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { formatDate } from "@/lib/utils";
import { restoreNoteAction } from "@/server/api/notes";

interface ArchivedNote {
  id: string;
  title: string;
  icon: string | null;
  folderId: string | null;
  updatedAt: Date;
}

interface ArchiveWorkspaceProps {
  notes: ArchivedNote[];
}

export function ArchiveWorkspace({ notes }: ArchiveWorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRestore(noteId: string) {
    startTransition(async () => {
      await restoreNoteAction(noteId);
      router.refresh();
    });
  }

  return (
    <div className="dashboard app-page">
      <section className="search-section">
        <div className="dashboard-section-head search-section-head">
          <span className="dashboard-section-kicker">Archived notes</span>
          <span className="search-section-count">{notes.length}</span>
        </div>

        {notes.length === 0 ? (
          <div className="dashboard-empty">
            <p className="dashboard-empty-text">
              No archived notes yet. Archived notes will appear here.
            </p>
          </div>
        ) : (
          <div className="archive-list">
            {notes.map((note) => (
              <div key={note.id} className="archive-row">
                <div className="archive-row-info">
                  {note.icon ? (
                    <span className="archive-row-icon">{note.icon}</span>
                  ) : (
                    <span
                      className="material-symbols-outlined archive-row-icon-default"
                      aria-hidden="true"
                    >
                      description
                    </span>
                  )}
                  <div className="archive-row-text">
                    <span className="archive-row-title">
                      {note.title || "Untitled"}
                    </span>
                    <span className="archive-row-meta">
                      Last updated {formatDate(note.updatedAt)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="archive-restore-btn"
                  onClick={() => handleRestore(note.id)}
                  disabled={isPending}
                  title="Restore"
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: "16px" }}
                    aria-hidden="true"
                  >
                    restore_from_trash
                  </span>
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
