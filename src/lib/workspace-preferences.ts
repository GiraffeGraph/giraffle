export const SIDEBAR_COLLAPSE_STORAGE_KEY = "giraffle.sidebar.sections";
export const SIDEBAR_WIDTH_STORAGE_KEY = "giraffle.sidebar.width";
export const SIDEBAR_COMPACT_STORAGE_KEY = "giraffle.sidebar.compact";
export const LOCAL_SYNC_QUEUE_STORAGE_KEY = "giraffle.localSync.queue";

export const DEFAULT_EXPANDED_SIDEBAR_WIDTH = 232;
export const SIDEBAR_MIN_WIDTH = 216;
export const SIDEBAR_MAX_WIDTH = 420;
export const SIDEBAR_COMPACT_WIDTH = 60;

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
  entityType: "note" | "folder" | "template";
  entityId: string;
  actionType: string;
  queuedAt: string;
  payload?: unknown;
}

export function clampSidebarWidth(width: number) {
  return Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), SIDEBAR_MAX_WIDTH);
}
