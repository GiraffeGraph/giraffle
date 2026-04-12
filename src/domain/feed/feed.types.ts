export const WORKSPACE_FEED_KINDS = ["suggestion", "news"] as const;
export type WorkspaceFeedKind = (typeof WORKSPACE_FEED_KINDS)[number];

export const WORKSPACE_FEED_LANGUAGES = ["tr", "en", "mixed"] as const;
export type WorkspaceFeedLanguage = (typeof WORKSPACE_FEED_LANGUAGES)[number];

export const WORKSPACE_FEED_QUERY_MODES = ["auto", "manual"] as const;
export type WorkspaceFeedQueryMode = (typeof WORKSPACE_FEED_QUERY_MODES)[number];

export const WORKSPACE_FEED_SOURCE_TYPES = ["note", "folder"] as const;
export type WorkspaceFeedSourceType = (typeof WORKSPACE_FEED_SOURCE_TYPES)[number];

export interface WorkspaceFeedSourceInput {
  sourceType: WorkspaceFeedSourceType;
  noteId?: string;
  folderId?: string;
  includeChildren?: boolean;
}

export interface CreateWorkspaceFeedInput {
  title: string;
  description?: string | null;
  kind: WorkspaceFeedKind;
  refreshIntervalHours?: number;
  language?: WorkspaceFeedLanguage;
  queryMode?: WorkspaceFeedQueryMode;
  queryOverride?: string | null;
  isEnabled?: boolean;
  showOnDashboard?: boolean;
  sources?: WorkspaceFeedSourceInput[];
}

export interface UpdateWorkspaceFeedInput {
  title?: string;
  description?: string | null;
  refreshIntervalHours?: number;
  language?: WorkspaceFeedLanguage;
  queryMode?: WorkspaceFeedQueryMode;
  queryOverride?: string | null;
  isEnabled?: boolean;
  showOnDashboard?: boolean;
}

export interface FeedSourceBadge {
  id: string;
  sourceId: string;
  sourceType: WorkspaceFeedSourceType;
  label: string;
  href: string;
}

export interface WorkspaceFeedSummary {
  id: string;
  title: string;
  description: string | null;
  kind: WorkspaceFeedKind;
  refreshIntervalHours: number;
  language: WorkspaceFeedLanguage;
  queryMode: WorkspaceFeedQueryMode;
  queryOverride: string | null;
  isEnabled: boolean;
  showOnDashboard: boolean;
  lastRefreshedAt: Date | null;
  nextRefreshAt: Date | null;
  sourceCount: number;
  sources: FeedSourceBadge[];
  itemCount: number;
  items: WorkspaceFeedEntry[];
}

export interface WorkspaceFeedEntry {
  id: string;
  itemType: string;
  title: string;
  summary: string | null;
  whyRelevant: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  publishedAt: Date | null;
  position: number;
  payload: Record<string, unknown>;
}

export interface FeedAssignmentSummary {
  id: string;
  title: string;
  kind: WorkspaceFeedKind;
  isSelected: boolean;
  refreshIntervalHours: number;
  itemCount: number;
}

export interface RefreshWorkspaceFeedResult {
  feedId: string;
  refreshedAt: Date;
  itemCount: number;
}
