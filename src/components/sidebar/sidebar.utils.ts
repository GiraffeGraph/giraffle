import {
  DEFAULT_COLLAPSED_SECTIONS,
  DEFAULT_EXPANDED_SIDEBAR_WIDTH,
  SIDEBAR_COLLAPSE_STORAGE_KEY,
  SIDEBAR_COMPACT_STORAGE_KEY,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH_STORAGE_KEY,
  type SidebarCollapseState,
} from "@/lib/workspace-preferences";
import type { SidebarFolder } from "./sidebar.types";

export function extractActiveNoteId(pathname: string | null) {
  if (!pathname?.startsWith("/notes/")) return null;
  const [, , noteId] = pathname.split("/");
  return noteId ?? null;
}

export function areSidebarCollapseStatesEqual(
  left: SidebarCollapseState,
  right: SidebarCollapseState
) {
  return (
    left.spotter === right.spotter &&
    left.folders === right.folders &&
    left.tags === right.tags &&
    left.recentNotes === right.recentNotes
  );
}

export function loadSidebarCollapseState(): SidebarCollapseState {
  if (typeof window === "undefined") return DEFAULT_COLLAPSED_SECTIONS;
  try {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY);
    if (!stored) return DEFAULT_COLLAPSED_SECTIONS;
    const parsed = JSON.parse(stored) as Partial<SidebarCollapseState>;
    return {
      spotter: Boolean(parsed.spotter),
      folders: Boolean(parsed.folders),
      tags: Boolean(parsed.tags),
      recentNotes: Boolean(parsed.recentNotes),
    };
  } catch {
    return DEFAULT_COLLAPSED_SECTIONS;
  }
}

export function loadSidebarWidth(): number {
  if (typeof window === "undefined") return DEFAULT_EXPANDED_SIDEBAR_WIDTH;
  const stored = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
  const parsed = stored ? Number.parseInt(stored, 10) : NaN;
  return Number.isNaN(parsed) ? DEFAULT_EXPANDED_SIDEBAR_WIDTH : clampSidebarWidth(parsed);
}

export function loadSidebarCompactState(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return JSON.parse(
      window.localStorage.getItem(SIDEBAR_COMPACT_STORAGE_KEY) ?? "false"
    ) as boolean;
  } catch {
    return false;
  }
}

export function clampSidebarWidth(width: number) {
  return Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH);
}

export function filterFolderTree(
  folderTree: SidebarFolder[],
  query: string
): SidebarFolder[] {
  return folderTree.flatMap((folder) => {
    const filteredChildren = filterFolderTree(folder.children ?? [], query);
    const matchesSelf = folder.name.toLowerCase().includes(query);
    if (!matchesSelf && filteredChildren.length === 0) return [];
    return [{ ...folder, children: matchesSelf ? folder.children ?? [] : filteredChildren }];
  });
}

export function countFolders(folderTree: SidebarFolder[]): number {
  return folderTree.reduce(
    (total, folder) => total + 1 + countFolders(folder.children ?? []),
    0
  );
}

export function getFirstFolderId(folderTree: SidebarFolder[]): string | null {
  return folderTree[0]?.id ?? null;
}

export function findFolderById(
  folderTree: SidebarFolder[],
  folderId: string
): SidebarFolder | null {
  for (const folder of folderTree) {
    if (folder.id === folderId) return folder;
    const child = findFolderById(folder.children ?? [], folderId);
    if (child) return child;
  }
  return null;
}

export function flattenFolderTree(folderTree: SidebarFolder[]): SidebarFolder[] {
  return folderTree.flatMap((folder) => [
    folder,
    ...flattenFolderTree(folder.children ?? []),
  ]);
}
