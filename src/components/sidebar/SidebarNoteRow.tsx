"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useRef } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  isSidebarNoteDragData,
  type SidebarNote,
} from "./sidebar.types";
import { renderStoredIcon } from "./sidebar-icon-utils";

function MoreHorizontalIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
    </svg>
  );
}

export function SidebarNoteRow({
  note,
  active,
  onOpen,
  onContextMenuOpen,
  onTriggerMenuOpen,
  draggedNoteId,
  noteDropTarget,
}: {
  note: SidebarNote;
  active: boolean;
  onOpen: (noteId: string) => void;
  onContextMenuOpen: (event: ReactMouseEvent<HTMLElement>, note: SidebarNote) => void;
  onTriggerMenuOpen: (event: ReactMouseEvent<HTMLButtonElement>, note: SidebarNote) => void;
  draggedNoteId: string | null;
  noteDropTarget: {
    folderId: string | null;
    noteId: string | null;
    mode: "inside" | "after" | "root";
  } | null;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const afterDropzoneRef = useRef<HTMLDivElement | null>(null);
  const isAfterDropTarget =
    noteDropTarget?.noteId === note.id && noteDropTarget.mode === "after";

  useEffect(() => {
    if (!rowRef.current || !afterDropzoneRef.current) {
      return;
    }

    return combine(
      draggable({
        element: rowRef.current,
        getInitialData: () => ({
          type: "sidebar-note",
          noteId: note.id,
          folderId: note.folderId ?? null,
          isPinned: note.isPinned ?? false,
        }),
      }),
      dropTargetForElements({
        element: afterDropzoneRef.current,
        canDrop: ({ source }) =>
          isSidebarNoteDragData(source.data) &&
          source.data.noteId !== note.id &&
          source.data.isPinned === (note.isPinned ?? false),
        getData: () => ({
          type: "sidebar-note-drop-target",
          folderId: note.folderId ?? null,
          mode: "after",
          afterNoteId: note.id,
          isPinned: note.isPinned ?? false,
        }),
      })
    );
  }, [note.folderId, note.id, note.isPinned]);

  return (
    <>
      <div ref={rowRef} className={`sidebar-entity-row ${active ? "active" : ""}`}>
        <button
          type="button"
          className={`sidebar-item sidebar-row-main ${active ? "active" : ""}`}
          onClick={() => onOpen(note.id)}
          onContextMenu={(event) => onContextMenuOpen(event, note)}
        >
          <span className="sidebar-item-icon">
            {renderStoredIcon(note.icon, {
              fallback: <span className="material-symbols-outlined sm" aria-hidden="true">description</span>,
            })}
          </span>
          <span className="sidebar-item-label">{note.title || "Adsız"}</span>
          {note.isPinned ? (
            <span className="sidebar-pin-indicator" aria-label="Sabitlenmiş" title="Sabitlenmiş">
              <PinIcon />
            </span>
          ) : null}
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
      <div
        ref={afterDropzoneRef}
        className={`sidebar-folder-dropzone note-dropzone${isAfterDropTarget ? " active" : ""}${
          draggedNoteId && draggedNoteId !== note.id ? " visible" : ""
        }`}
      />
    </>
  );
}
