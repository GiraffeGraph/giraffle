import type { ContextMenuItem } from "@/components/ui/ContextMenu";

export interface SidebarPage {
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  position: string;
  isPinned: boolean;
  updatedAt: Date;
  children: SidebarPage[];
}

export interface SidebarProps {
  pages: SidebarPage[];
  activeNoteId?: string;
}

export interface SidebarMenuState {
  position: { x: number; y: number };
  items: ContextMenuItem[];
}

/**
 * "inside" nests the dragged page under the target, "after" places it as the
 * next sibling, "root" lifts it to the top level.
 */
export type SidebarDropMode = "inside" | "after" | "root";

export interface SidebarPageDropTarget {
  pageId: string | null;
  mode: SidebarDropMode;
}

export interface SidebarPageDragData {
  type: "sidebar-page";
  pageId: string;
  parentId: string | null;
  isPinned: boolean;
}

export interface SidebarPageDropData {
  type: "sidebar-page-drop-target";
  mode: SidebarDropMode;
  parentId: string | null;
  afterNoteId: string | null;
  pageId: string | null;
}

export function isSidebarPageDragData(value: unknown): value is SidebarPageDragData {
  return Boolean(
    value &&
    typeof value === "object" &&
    "type" in value &&
    "pageId" in value &&
    (value as SidebarPageDragData).type === "sidebar-page" &&
    typeof (value as SidebarPageDragData).pageId === "string"
  );
}

export function isSidebarPageDropData(value: unknown): value is SidebarPageDropData {
  return Boolean(
    value &&
    typeof value === "object" &&
    "type" in value &&
    "mode" in value &&
    "parentId" in value &&
    "afterNoteId" in value &&
    (value as SidebarPageDropData).type === "sidebar-page-drop-target" &&
    ((value as SidebarPageDropData).mode === "inside" ||
      (value as SidebarPageDropData).mode === "after" ||
      (value as SidebarPageDropData).mode === "root")
  );
}
