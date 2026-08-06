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
import type { SidebarPage } from "./sidebar.types";

export function extractActiveNoteId(pathname: string | null) {
  if (!pathname?.startsWith("/notes/")) return null;
  const [, , noteId] = pathname.split("/");
  return noteId ?? null;
}

export function areSidebarCollapseStatesEqual(
  left: SidebarCollapseState,
  right: SidebarCollapseState
) {
  return left.pages === right.pages;
}

export function loadSidebarCollapseState(): SidebarCollapseState {
  if (typeof window === "undefined") return DEFAULT_COLLAPSED_SECTIONS;
  try {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY);
    if (!stored) return DEFAULT_COLLAPSED_SECTIONS;
    const parsed = JSON.parse(stored) as Partial<SidebarCollapseState>;
    return { pages: Boolean(parsed.pages) };
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

/**
 * Keep a page when it matches, or when any descendant matches — an ancestor
 * has to stay visible for its matching children to be reachable.
 */
export function filterPageTree(
  pages: SidebarPage[],
  query: string
): SidebarPage[] {
  return pages.flatMap((page) => {
    const filteredChildren = filterPageTree(page.children, query);
    const matchesSelf = page.title.toLowerCase().includes(query);

    if (!matchesSelf && filteredChildren.length === 0) return [];

    return [{ ...page, children: matchesSelf ? page.children : filteredChildren }];
  });
}

export function flattenPageTree(pages: SidebarPage[]): SidebarPage[] {
  return pages.flatMap((page) => [page, ...flattenPageTree(page.children)]);
}

export function countPages(pages: SidebarPage[]): number {
  return pages.reduce((total, page) => total + 1 + countPages(page.children), 0);
}
