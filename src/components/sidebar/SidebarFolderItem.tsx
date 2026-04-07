"use client";

import { useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { FolderDropTarget, SidebarFolder, SidebarNote } from "./sidebar.types";
import { SidebarNoteRow } from "./SidebarNoteRow";

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

function MoreHorizontalIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  );
}

export function SidebarFolderItem({
  folder,
  pathname,
  onOpen,
  onMoveFolder,
  onRelocateFolder,
  onQuickCreate,
  onContextMenuOpen,
  onTriggerMenuOpen,
  draggedFolderId,
  folderDropTarget,
  onDragFolderChange,
  onDropTargetChange,
  allNotes,
  currentNoteId,
  onNoteOpen,
  onNoteContextMenu,
  onNoteTriggerMenu,
  onCreateSubFolder,
  depth = 0,
}: {
  folder: SidebarFolder;
  pathname: string;
  onOpen: (folderId: string) => void;
  onMoveFolder: (folderId: string, direction: "up" | "down") => void | Promise<void>;
  onRelocateFolder: (
    folderId: string,
    placement: { parentId?: string | null; afterFolderId?: string | null }
  ) => void | Promise<void>;
  onQuickCreate: (folderId: string) => void | Promise<void>;
  onContextMenuOpen: (event: ReactMouseEvent<HTMLElement>, folder: SidebarFolder) => void;
  onTriggerMenuOpen: (event: ReactMouseEvent<HTMLButtonElement>, folder: SidebarFolder) => void;
  draggedFolderId: string | null;
  folderDropTarget: FolderDropTarget | null;
  onDragFolderChange: (folderId: string | null) => void;
  onDropTargetChange: (target: FolderDropTarget | null) => void;
  allNotes: SidebarNote[];
  currentNoteId?: string;
  onNoteOpen: (noteId: string) => void;
  onNoteContextMenu: (event: ReactMouseEvent<HTMLElement>, note: SidebarNote) => void;
  onNoteTriggerMenu: (event: ReactMouseEvent<HTMLButtonElement>, note: SidebarNote) => void;
  onCreateSubFolder: (parentId: string, name: string) => Promise<void>;
  depth?: number;
}) {
  void onMoveFolder;

  const [isOpen, setIsOpen] = useState(true);
  const [isCreatingSubFolder, setIsCreatingSubFolder] = useState(false);
  const subFolderHandledRef = useRef(false);

  const folderNotes = allNotes.filter((n) => n.folderId === folder.id);
  const hasChildren = (folder.children ?? []).length > 0;
  const hasContent = hasChildren || folderNotes.length > 0;

  const isActive = pathname === `/folders/${folder.id}`;
  const isInsideDropTarget =
    folderDropTarget?.folderId === folder.id && folderDropTarget.mode === "inside";
  const isAfterDropTarget =
    folderDropTarget?.folderId === folder.id && folderDropTarget.mode === "after";

  // Özel ikon varsa onu göster, yoksa material folder/folder_open
  const folderIcon = folder.icon ? (
    <span style={{ fontSize: "14px", lineHeight: 1 }}>{folder.icon}</span>
  ) : (
    <span className="material-symbols-outlined sm" aria-hidden="true">
      {hasContent && isOpen ? "folder_open" : "folder"}
    </span>
  );

  return (
    <div className="sidebar-folder-node">
      <div
        className={`sidebar-entity-row${isActive ? " folder-active" : ""}${
          isInsideDropTarget ? " drag-target" : ""
        }`}
      >
        {/* Klasör ikonu — içerik varsa aç/kapat, yoksa navigate */}
        <button
          type="button"
          className="sidebar-folder-icon-btn"
          onClick={
            hasContent
              ? (e) => { e.stopPropagation(); setIsOpen((v) => !v); }
              : () => onOpen(folder.id)
          }
          aria-label={isOpen ? "Klasörü kapat" : "Klasörü aç"}
        >
          {folderIcon}
        </button>

        {/* Klasör adı */}
        <button
          type="button"
          className={`sidebar-folder-name${isActive ? " active" : ""}`}
          onClick={() => onOpen(folder.id)}
          onContextMenu={(event) => onContextMenuOpen(event, folder)}
          draggable
          onDragStart={() => onDragFolderChange(folder.id)}
          onDragEnd={() => {
            onDragFolderChange(null);
            onDropTargetChange(null);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (draggedFolderId === folder.id) return;
            onDropTargetChange({ folderId: folder.id, mode: "inside" });
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (!draggedFolderId || draggedFolderId === folder.id) return;
            void onRelocateFolder(draggedFolderId, {
              parentId: folder.id,
              afterFolderId: null,
            });
          }}
        >
          {folder.name}
        </button>

        {/* Hover aksiyonları: +Not | +Klasör | ··· */}
        <div className="sidebar-row-actions">
          <button
            type="button"
            className="context-trigger sidebar-row-action"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); void onQuickCreate(folder.id); }}
            aria-label="Not oluştur"
            title="Not Oluştur"
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            className="context-trigger sidebar-row-action"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsCreatingSubFolder(true);
              setIsOpen(true);
            }}
            aria-label="Alt klasör oluştur"
            title="Alt Klasör Oluştur"
          >
            <FolderPlusIcon />
          </button>
          <button
            type="button"
            className="context-trigger sidebar-row-action"
            onClick={(event) => onTriggerMenuOpen(event, folder)}
            aria-label={`${folder.name} menüsünü aç`}
            title="Seçenekler"
          >
            <MoreHorizontalIcon />
          </button>
        </div>
      </div>

      {/* Sürükle-bırak bölgesi */}
      {draggedFolderId && draggedFolderId !== folder.id ? (
        <div
          className={`sidebar-folder-dropzone${isAfterDropTarget ? " active" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            onDropTargetChange({ folderId: folder.id, mode: "after" });
          }}
          onDrop={(event) => {
            event.preventDefault();
            void onRelocateFolder(draggedFolderId, {
              parentId: folder.parentId ?? null,
              afterFolderId: folder.id,
            });
          }}
        >
          {isInsideDropTarget ? "İçine bırak" : "Altına bırak"}
        </div>
      ) : null}

      {/* Açık içerik */}
      {isOpen ? (
        <div className="sidebar-folder-contents">
          {/* Alt klasör oluştur — inline creator */}
          {isCreatingSubFolder && (
            <div className="sidebar-inline-creator">
              <span className="sidebar-folder-icon-btn sidebar-folder-icon-btn--static" aria-hidden="true">
                <span className="material-symbols-outlined sm">folder</span>
              </span>
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                type="text"
                className="sidebar-inline-creator-input"
                defaultValue="Yeni Klasör"
                placeholder="Klasör adı"
                onFocus={(e) => e.currentTarget.select()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    subFolderHandledRef.current = true;
                    const name = e.currentTarget.value;
                    setIsCreatingSubFolder(false);
                    void onCreateSubFolder(folder.id, name);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    subFolderHandledRef.current = true;
                    setIsCreatingSubFolder(false);
                  }
                }}
                onBlur={(e) => {
                  if (subFolderHandledRef.current) {
                    subFolderHandledRef.current = false;
                    return;
                  }
                  const name = e.currentTarget.value;
                  setIsCreatingSubFolder(false);
                  void onCreateSubFolder(folder.id, name);
                }}
              />
            </div>
          )}

          {/* Bu klasördeki notlar */}
          {folderNotes.map((note) => (
            <SidebarNoteRow
              key={note.id}
              note={note}
              active={note.id === currentNoteId}
              onOpen={onNoteOpen}
              onContextMenuOpen={onNoteContextMenu}
              onTriggerMenuOpen={onNoteTriggerMenu}
            />
          ))}

          {/* Alt klasörler */}
          {hasChildren
            ? (folder.children ?? []).map((childFolder) => (
                <SidebarFolderItem
                  key={childFolder.id}
                  folder={childFolder}
                  pathname={pathname}
                  onOpen={onOpen}
                  onMoveFolder={onMoveFolder}
                  onRelocateFolder={onRelocateFolder}
                  onQuickCreate={onQuickCreate}
                  onContextMenuOpen={onContextMenuOpen}
                  onTriggerMenuOpen={onTriggerMenuOpen}
                  draggedFolderId={draggedFolderId}
                  folderDropTarget={folderDropTarget}
                  onDragFolderChange={onDragFolderChange}
                  onDropTargetChange={onDropTargetChange}
                  allNotes={allNotes}
                  currentNoteId={currentNoteId}
                  onNoteOpen={onNoteOpen}
                  onNoteContextMenu={onNoteContextMenu}
                  onNoteTriggerMenu={onNoteTriggerMenu}
                  onCreateSubFolder={onCreateSubFolder}
                  depth={depth + 1}
                />
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}
