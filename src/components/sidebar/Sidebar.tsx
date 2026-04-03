"use client";

import { useRouter } from "next/navigation";
import { createNoteAction } from "@/server/api/notes";

interface SidebarNote {
  id: string;
  title: string;
  icon: string | null;
  updatedAt: Date;
}

interface SidebarProps {
  notes: SidebarNote[];
  activeNoteId?: string;
}

export function Sidebar({ notes, activeNoteId }: SidebarProps) {
  const router = useRouter();

  const handleCreateNote = async () => {
    const noteId = await createNoteAction();
    router.push(`/notes/${noteId}`);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <span className="sidebar-logo-icon">🦒</span>
          <span className="sidebar-logo-text">Graffle</span>
        </div>
      </div>

      <div className="sidebar-actions">
        <button className="sidebar-new-note" onClick={handleCreateNote}>
          <span className="sidebar-new-icon">+</span>
          <span>New Note</span>
        </button>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title">Recent Notes</div>
        <nav className="sidebar-nav">
          {notes.length === 0 ? (
            <div className="sidebar-empty">
              No notes yet. Create your first note!
            </div>
          ) : (
            notes.map((note) => (
              <button
                key={note.id}
                className={`sidebar-note-item ${
                  note.id === activeNoteId ? "active" : ""
                }`}
                onClick={() => router.push(`/notes/${note.id}`)}
              >
                <span className="sidebar-note-icon">
                  {note.icon ?? "📄"}
                </span>
                <span className="sidebar-note-title">{note.title}</span>
              </button>
            ))
          )}
        </nav>
      </div>
    </aside>
  );
}
