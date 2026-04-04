export const SIDEBAR_COLLAPSE_STORAGE_KEY = "graffle.sidebar.sections";
export const SIDEBAR_WIDTH_STORAGE_KEY = "graffle.sidebar.width";
export const SIDEBAR_COMPACT_STORAGE_KEY = "graffle.sidebar.compact";
export const LOCAL_SYNC_QUEUE_STORAGE_KEY = "graffle.localSync.queue";

export const DEFAULT_EXPANDED_SIDEBAR_WIDTH = 272;
export const SIDEBAR_MIN_WIDTH = 240;
export const SIDEBAR_MAX_WIDTH = 420;
export const SIDEBAR_COMPACT_WIDTH = 68;

export interface SidebarCollapseState {
  folders: boolean;
  tags: boolean;
  recentNotes: boolean;
}

export const DEFAULT_COLLAPSED_SECTIONS: SidebarCollapseState = {
  folders: false,
  tags: false,
  recentNotes: false,
};

export interface LocalSyncQueueItem {
  id: string;
  entityType: "note" | "folder" | "template" | "proposal";
  entityId: string;
  actionType: string;
  queuedAt: string;
  payload?: unknown;
}

export function clampSidebarWidth(width: number) {
  return Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH);
}
