import type { ContextMenuItem } from "@/components/ui/ContextMenu";

export interface SidebarNote {
  id: string;
  title: string;
  slug?: string | null;
  icon: string | null;
  folderId?: string | null;
  position?: number;
  isPinned?: boolean;
  updatedAt: Date;
}

export interface SidebarFolder {
  id: string;
  name: string;
  icon: string | null;
  parentId?: string | null;
  position?: number;
  children?: SidebarFolder[];
  _count?: {
    notes: number;
  };
}

export interface SidebarSpotterSession {
  id: string;
  title: string;
  lastMessageAt: Date;
  createdAt: Date;
}

export interface SidebarProps {
  notes: SidebarNote[];
  folders: SidebarFolder[];
  spotterSessions: SidebarSpotterSession[];
  activeNoteId?: string;
}

export interface SidebarMenuState {
  position: { x: number; y: number };
  items: ContextMenuItem[];
}

export interface FolderDropTarget {
  folderId: string;
  mode: "inside" | "after";
}

export type SidebarSectionKey = "spotter" | "folders" | "recentNotes";

export interface SidebarFolderDragData {
  type: "sidebar-folder";
  folderId: string;
}

export interface SidebarNoteDragData {
  type: "sidebar-note";
  noteId: string;
  folderId: string | null;
  isPinned: boolean;
}

export interface SidebarFolderDropData {
  type: "sidebar-folder-drop-target";
  folderId: string;
  mode: "inside" | "after" | "root";
  parentId: string | null;
  afterFolderId: string | null;
}

export interface SidebarNoteDropData {
  type: "sidebar-note-drop-target";
  folderId: string | null;
  mode: "inside" | "after" | "root";
  afterNoteId: string | null;
  isPinned: boolean;
}

export function isSidebarFolderDragData(value: unknown): value is SidebarFolderDragData {
  return Boolean(
    value &&
    typeof value === "object" &&
    "type" in value &&
    "folderId" in value &&
    (value as SidebarFolderDragData).type === "sidebar-folder" &&
    typeof (value as SidebarFolderDragData).folderId === "string"
  );
}

export function isSidebarNoteDragData(value: unknown): value is SidebarNoteDragData {
  return Boolean(
    value &&
    typeof value === "object" &&
    "type" in value &&
    "noteId" in value &&
    "folderId" in value &&
    "isPinned" in value &&
    (value as SidebarNoteDragData).type === "sidebar-note" &&
    typeof (value as SidebarNoteDragData).noteId === "string" &&
    typeof (value as SidebarNoteDragData).isPinned === "boolean"
  );
}

export function isSidebarFolderDropData(value: unknown): value is SidebarFolderDropData {
  return Boolean(
    value &&
    typeof value === "object" &&
    "type" in value &&
    "folderId" in value &&
    "mode" in value &&
    "parentId" in value &&
    "afterFolderId" in value &&
    (value as SidebarFolderDropData).type === "sidebar-folder-drop-target" &&
    typeof (value as SidebarFolderDropData).folderId === "string" &&
    ((value as SidebarFolderDropData).mode === "inside" ||
      (value as SidebarFolderDropData).mode === "after" ||
      (value as SidebarFolderDropData).mode === "root")
  );
}

export function isSidebarNoteDropData(value: unknown): value is SidebarNoteDropData {
  return Boolean(
    value &&
    typeof value === "object" &&
    "type" in value &&
    "mode" in value &&
    "afterNoteId" in value &&
    "isPinned" in value &&
    (value as SidebarNoteDropData).type === "sidebar-note-drop-target" &&
    (typeof (value as SidebarNoteDropData).folderId === "string" ||
      (value as SidebarNoteDropData).folderId === null) &&
    ((value as SidebarNoteDropData).mode === "inside" ||
      (value as SidebarNoteDropData).mode === "after" ||
      (value as SidebarNoteDropData).mode === "root") &&
    (typeof (value as SidebarNoteDropData).afterNoteId === "string" ||
      (value as SidebarNoteDropData).afterNoteId === null) &&
    typeof (value as SidebarNoteDropData).isPinned === "boolean"
  );
}
