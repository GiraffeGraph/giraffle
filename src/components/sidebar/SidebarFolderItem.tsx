import type { MouseEvent as ReactMouseEvent } from "react";
import type { FolderDropTarget, SidebarFolder } from "./sidebar.types";

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
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
  depth?: number;
}) {
  // onMoveFolder is kept in props for future use / context menu wiring
  void onMoveFolder;

  const isActive = pathname === `/folders/${folder.id}`;
  const isInsideDropTarget =
    folderDropTarget?.folderId === folder.id && folderDropTarget.mode === "inside";
  const isAfterDropTarget =
    folderDropTarget?.folderId === folder.id && folderDropTarget.mode === "after";

  return (
    <div className="sidebar-folder-node">
      <div
        className={`sidebar-entity-row ${isActive ? "active" : ""}${
          isInsideDropTarget ? " drag-target" : ""
        }`}
      >
        <button
          type="button"
          className={`sidebar-item sidebar-row-main ${isActive ? "active" : ""}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
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
          <span className="sidebar-item-icon">
            {folder.icon ? (
              folder.icon
            ) : (
              <span className="material-symbols-outlined sm" aria-hidden="true">folder</span>
            )}
          </span>
          <span className="sidebar-item-label">{folder.name}</span>
        </button>
        <div className="sidebar-row-actions">
          <button
            type="button"
            className="context-trigger sidebar-row-action"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void onQuickCreate(folder.id);
            }}
            aria-label={`${folder.name} içine not oluştur`}
            title="Not Oluştur"
          >
            <PlusIcon />
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

      {draggedFolderId && draggedFolderId !== folder.id ? (
        <div
          className={`sidebar-folder-dropzone${isAfterDropTarget ? " active" : ""}`}
          style={{ marginLeft: `${12 + depth * 16}px` }}
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

      {(folder.children ?? []).length > 0 ? (
        <div className="sidebar-folder-children">
          {(folder.children ?? []).map((childFolder) => (
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
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
