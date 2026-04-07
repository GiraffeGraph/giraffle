import type { ContextMenuItem } from "@/components/ui/ContextMenu";
import type { TemplateVariable } from "@/domain/template/template.types";

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

export interface SidebarTag {
  id: string;
  name: string;
  noteCount: number;
}

export interface SidebarTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  icon: string | null;
  variables: TemplateVariable[];
}

export interface SidebarProps {
  notes: SidebarNote[];
  folders: SidebarFolder[];
  templates: SidebarTemplate[];
  tags: SidebarTag[];
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

export type SidebarSectionKey = "folders" | "tags" | "recentNotes";

export interface SidebarFolderDragData {
  type: "sidebar-folder";
  folderId: string;
}

export interface SidebarFolderDropData {
  type: "sidebar-folder-drop-target";
  folderId: string;
  mode: "inside" | "after" | "root";
  parentId: string | null;
  afterFolderId: string | null;
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
