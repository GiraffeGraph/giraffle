export type TrailKind =
  | "github"
  | "google_drive"
  | "google_calendar"
  | "notion"
  | "linear"
  | "web_search"
  | "perplexity"
  | "custom_mcp";

export type TrailStatus = "disconnected" | "connecting" | "active" | "error" | "revoked";

export interface TrailKindMeta {
  kind: TrailKind;
  label: string;
  description: string;
  icon: string;
  authMode: "oauth" | "api_key" | "url";
  destructiveByDefault: boolean;
}

export const TRAIL_KIND_CATALOG: Record<TrailKind, TrailKindMeta> = {
  github: {
    kind: "github",
    label: "GitHub",
    description: "Issues, PRs, repository search.",
    icon: "code",
    authMode: "oauth",
    destructiveByDefault: true,
  },
  google_drive: {
    kind: "google_drive",
    label: "Google Drive",
    description: "Docs, sheets, attachments.",
    icon: "folder_open",
    authMode: "oauth",
    destructiveByDefault: true,
  },
  google_calendar: {
    kind: "google_calendar",
    label: "Google Calendar",
    description: "Events and availability.",
    icon: "calendar_month",
    authMode: "oauth",
    destructiveByDefault: true,
  },
  notion: {
    kind: "notion",
    label: "Notion",
    description: "Pages and databases.",
    icon: "menu_book",
    authMode: "oauth",
    destructiveByDefault: true,
  },
  linear: {
    kind: "linear",
    label: "Linear",
    description: "Projects, issues, cycles.",
    icon: "task_alt",
    authMode: "oauth",
    destructiveByDefault: true,
  },
  perplexity: {
    kind: "perplexity",
    label: "Perplexity",
    description: "Answer-grade web search.",
    icon: "travel_explore",
    authMode: "api_key",
    destructiveByDefault: false,
  },
  web_search: {
    kind: "web_search",
    label: "Web Search",
    description: "Open web lookups.",
    icon: "language",
    authMode: "api_key",
    destructiveByDefault: false,
  },
  custom_mcp: {
    kind: "custom_mcp",
    label: "Custom MCP",
    description: "Bring your own MCP server.",
    icon: "extension",
    authMode: "url",
    destructiveByDefault: true,
  },
};

export interface TrailSummary {
  id: string;
  kind: TrailKind;
  label: string | null;
  status: TrailStatus;
  lastError: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrailDetail extends TrailSummary {
  config: Record<string, unknown>;
  toolAllows: Array<{ toolName: string; allowed: boolean }>;
  hasCredential: boolean;
}
