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
