"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  isSidebarFolderDragData,
  isSidebarNoteDragData,
  type FolderDropTarget,
  type SidebarFolder,
  type SidebarNote,
} from "./sidebar.types";
import { SidebarNoteRow } from "./SidebarNoteRow";
import { renderStoredIcon } from "./sidebar-icon-utils";

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function FolderPlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

export function SidebarFolderItem({
  folder,
  pathname,
  onOpen,
  onQuickCreate,
  draggedFolderId,
  folderDropTarget,
  draggedNoteId,
  noteDropTarget,
  allNotes,
  currentNoteId,
  onNoteOpen,
  onNoteContextMenu,
  onNoteTriggerMenu,
  onCreateSubFolder,
}: {
  folder: SidebarFolder;
  pathname: string;
  onOpen: (folderId: string) => void;
  onQuickCreate: (folderId: string) => void | Promise<void>;
  draggedFolderId: string | null;
  folderDropTarget: FolderDropTarget | null;
  draggedNoteId: string | null;
  noteDropTarget: {
    folderId: string | null;
    noteId: string | null;
    mode: "inside" | "after" | "root";
  } | null;
  allNotes: SidebarNote[];
  currentNoteId?: string;
  onNoteOpen: (noteId: string) => void;
  onNoteContextMenu: (event: ReactMouseEvent<HTMLElement>, note: SidebarNote) => void;
  onNoteTriggerMenu: (event: ReactMouseEvent<HTMLButtonElement>, note: SidebarNote) => void;
  onCreateSubFolder: (parentId: string, name: string) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreatingSubFolder, setIsCreatingSubFolder] = useState(false);
  const subFolderHandledRef = useRef(false);
  const rowRef = useRef<HTMLDivElement | null>(null);

  const folderNotes = allNotes.filter((n) => n.folderId === folder.id);
  const hasChildren = (folder.children ?? []).length > 0;
  const hasContent = hasChildren || folderNotes.length > 0;

  const isActive = pathname === `/folders/${folder.id}`;
  const isInsideDropTarget =
    folderDropTarget?.folderId === folder.id && folderDropTarget.mode === "inside";
  const isAfterDropTarget =
    folderDropTarget?.folderId === folder.id && folderDropTarget.mode === "after";
  const isNoteInsideDropTarget =
    noteDropTarget?.folderId === folder.id && noteDropTarget.mode === "inside";

  useEffect(() => {
    if (!rowRef.current) {
      return;
    }

    return combine(
      draggable({
        element: rowRef.current,
        getInitialData: () => ({
          type: "sidebar-folder",
          folderId: folder.id,
        }),
      }),
      dropTargetForElements({
        element: rowRef.current,
        canDrop: ({ source }) => {
          if (isSidebarFolderDragData(source.data)) {
            return source.data.folderId !== folder.id;
          }

          if (isSidebarNoteDragData(source.data)) {
            return source.data.folderId !== folder.id;
          }

          return false;
        },
        getData: ({ source, input, element }) => {
          if (isSidebarNoteDragData(source.data)) {
            return {
              type: "sidebar-note-drop-target",
              folderId: folder.id,
              mode: "inside",
              afterNoteId: null,
              isPinned: source.data.isPinned,
            };
          }

          const rect = (element as HTMLElement).getBoundingClientRect();
          const relativeY = input.clientY - rect.top;
          const mode = relativeY > rect.height * 0.7 ? "after" : "inside";

          return {
            type: "sidebar-folder-drop-target",
            folderId: folder.id,
            mode,
            parentId: mode === "inside" ? folder.id : folder.parentId ?? null,
            afterFolderId: mode === "after" ? folder.id : null,
          };
        },
      }),
    );
  }, [folder.id, folder.parentId]);

  const folderIcon = folder.icon ? (
    renderStoredIcon(folder.icon, {
      emojiStyle: { fontSize: "14px", lineHeight: 1 },
    })
  ) : (
    <span className="material-symbols-outlined sm" aria-hidden="true">
      {hasContent && isOpen ? "folder_open" : "folder"}
    </span>
  );

  return (
    <div className="sidebar-folder-node">
      <div
        className={`sidebar-entity-row${isActive ? " folder-active" : ""}${
          isInsideDropTarget || isNoteInsideDropTarget ? " drag-target" : ""
        }${isAfterDropTarget ? " drag-target-after" : ""}`}
      >
        <div
          ref={rowRef}
          className={`sidebar-item sidebar-row-main sidebar-folder-main${isActive ? " active" : ""}`}
        >
          <button
            type="button"
            className="sidebar-folder-icon-btn"
            onClick={
              hasContent
                ? (event) => {
                    event.stopPropagation();
                    setIsOpen((value) => !value);
                  }
                : (event) => {
                    event.stopPropagation();
                    onOpen(folder.id);
                  }
            }
            aria-label={hasContent ? (isOpen ? "Collapse folder" : "Expand folder") : "Open folder"}
          >
            <span className="sidebar-folder-icon-stack" aria-hidden="true">
              {folderIcon}
            </span>
          </button>

          <button
            type="button"
            className={`sidebar-folder-name${isActive ? " active" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(folder.id);
            }}
          >
            {folder.name}
          </button>
        </div>

        <div className="sidebar-row-actions">
          <button
            type="button"
            className="context-trigger sidebar-row-action"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void onQuickCreate(folder.id);
            }}
            aria-label="Create note"
            title="Create note"
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            className="context-trigger sidebar-row-action"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsCreatingSubFolder(true);
              setIsOpen(true);
            }}
            aria-label="Create subfolder"
            title="Create subfolder"
          >
            <FolderPlusIcon />
          </button>
        </div>
      </div>

      {isOpen ? (
        <div className="sidebar-folder-contents">
          {isCreatingSubFolder && (
            <div className="sidebar-inline-creator">
              <span className="sidebar-folder-icon-btn sidebar-folder-icon-btn--static" aria-hidden="true">
                <span className="material-symbols-outlined sm">folder</span>
              </span>
              <input
                autoFocus
                type="text"
                className="sidebar-inline-creator-input"
                defaultValue="New Folder"
                placeholder="Folder name"
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    subFolderHandledRef.current = true;
                    const name = event.currentTarget.value;
                    setIsCreatingSubFolder(false);
                    void onCreateSubFolder(folder.id, name);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    subFolderHandledRef.current = true;
                    setIsCreatingSubFolder(false);
                  }
                }}
                onBlur={(event) => {
                  if (subFolderHandledRef.current) {
                    subFolderHandledRef.current = false;
                    return;
                  }
                  const name = event.currentTarget.value;
                  setIsCreatingSubFolder(false);
                  void onCreateSubFolder(folder.id, name);
                }}
              />
            </div>
          )}

          {folderNotes.map((note) => (
            <SidebarNoteRow
              key={note.id}
              note={note}
              active={note.id === currentNoteId}
              onOpen={onNoteOpen}
              onContextMenuOpen={onNoteContextMenu}
              onTriggerMenuOpen={onNoteTriggerMenu}
              draggedNoteId={draggedNoteId}
              noteDropTarget={noteDropTarget}
            />
          ))}

          {hasChildren
            ? (folder.children ?? []).map((childFolder) => (
                <SidebarFolderItem
                  key={childFolder.id}
                  folder={childFolder}
                  pathname={pathname}
                  onOpen={onOpen}
                  onQuickCreate={onQuickCreate}
                  draggedFolderId={draggedFolderId}
                  folderDropTarget={folderDropTarget}
                  draggedNoteId={draggedNoteId}
                  noteDropTarget={noteDropTarget}
                  allNotes={allNotes}
                  currentNoteId={currentNoteId}
                  onNoteOpen={onNoteOpen}
                  onNoteContextMenu={onNoteContextMenu}
                  onNoteTriggerMenu={onNoteTriggerMenu}
                  onCreateSubFolder={onCreateSubFolder}
                />
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}
