import type { MouseEvent as ReactMouseEvent } from "react";
import type { SidebarNote } from "./sidebar.types";

function MoreHorizontalIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}

export function SidebarNoteRow({
  note,
  active,
  onOpen,
  onContextMenuOpen,
  onTriggerMenuOpen,
}: {
  note: SidebarNote;
  active: boolean;
  onOpen: (noteId: string) => void;
  onContextMenuOpen: (event: ReactMouseEvent<HTMLElement>, note: SidebarNote) => void;
  onTriggerMenuOpen: (event: ReactMouseEvent<HTMLButtonElement>, note: SidebarNote) => void;
}) {
  return (
    <div className={`sidebar-entity-row ${active ? "active" : ""}`}>
      <button
        type="button"
        className={`sidebar-item sidebar-row-main ${active ? "active" : ""}`}
        onClick={() => onOpen(note.id)}
        onContextMenu={(event) => onContextMenuOpen(event, note)}
      >
        <span className="sidebar-item-icon">
          {note.icon ? (
            note.icon
          ) : (
            <span className="material-symbols-outlined sm" aria-hidden="true">description</span>
          )}
        </span>
        <span className="sidebar-item-label">
          {note.title}
          {note.isPinned ? " *" : ""}
        </span>
      </button>
      <div className="sidebar-row-actions">
        <button
          type="button"
          className="context-trigger sidebar-row-action"
          onClick={(event) => onTriggerMenuOpen(event, note)}
          aria-label={`${note.title} menüsünü aç`}
          title="Seçenekler"
        >
          <MoreHorizontalIcon />
        </button>
      </div>
    </div>
  );
}
