"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { renderStoredIcon } from "@/components/sidebar/sidebar-icon-utils";
import { formatDate } from "@/lib/utils";
import { restoreNoteAction } from "@/server/api/notes";

interface ArchivedNote {
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
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
    <div className="app-page notes-index-page">
      <header className="workspace-heading notes-index-heading">
        <div className="workspace-heading-copy">
          <h1>Archive</h1>
          <p>
            {notes.length === 1 ? "1 archived page" : `${notes.length} archived pages`}
          </p>
        </div>
      </header>

      <section className="search-section">

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
                  <span className="archive-row-icon" aria-hidden="true">
                    {renderStoredIcon(note.icon, {
                      fallback: (
                        <span className="material-symbols-outlined">
                          description
                        </span>
                      ),
                      materialClassName: "material-symbols-outlined",
                    })}
                  </span>
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
