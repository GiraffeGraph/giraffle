import type { TrailKind } from "@/domain/trail/trail.types";

export interface ConnectorDocTool {
  name: string;
  description: string;
  destructive: boolean;
}

export interface ConnectorDoc {
  kind: TrailKind;
  oneLiner: string;
  signupUrl?: string;
  signupLabel?: string;
  envVars?: string[];
  callbackPathTemplate?: string;
  scopes?: string[];
  setupSteps: string[];
  tools: ConnectorDocTool[];
  notes?: string[];
}

export const CONNECTOR_DOCS: Record<TrailKind, ConnectorDoc> = {
  github: {
    kind: "github",
    oneLiner: "GitHub Issues, PRs, and repository metadata via the REST API.",
    signupUrl: "https://github.com/settings/developers",
    signupLabel: "GitHub OAuth Apps",
    envVars: ["TRAIL_GITHUB_CLIENT_ID", "TRAIL_GITHUB_CLIENT_SECRET"],
    callbackPathTemplate: "/api/trails/oauth/github/callback",
    scopes: ["read:user", "repo", "read:org"],
    setupSteps: [
      "Create a new OAuth App at github.com/settings/developers.",
      "Set Authorization callback URL to the path shown below.",
      "Copy Client ID and a fresh Client Secret into your server .env.",
      "Restart the dev server, then click Add and approve on GitHub.",
    ],
    tools: [
      {
        name: "github_search_issues",
        description: "Search issues and PRs (GitHub query syntax).",
        destructive: false,
      },
      {
        name: "github_get_repo",
        description: "Fetch a repo's metadata.",
        destructive: false,
      },
      {
        name: "github_create_issue",
        description: "Create a new issue in a repo.",
        destructive: true,
      },
    ],
    notes: ["The `repo` scope grants both private and public repo access. Drop it if you only need public read-only data."],
  },
  google_drive: {
    kind: "google_drive",
    oneLiner: "Search Google Drive and read text content from Docs, Sheets, and plain files.",
    signupUrl: "https://console.cloud.google.com/apis/credentials",
    signupLabel: "Google Cloud Console → APIs & Services → Credentials",
    envVars: ["TRAIL_GOOGLE_CLIENT_ID", "TRAIL_GOOGLE_CLIENT_SECRET"],
    callbackPathTemplate: "/api/trails/oauth/google_drive/callback",
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ],
    setupSteps: [
      "Create an OAuth 2.0 Client ID (type: Web application) in Google Cloud Console.",
      "Add the Drive callback URL below to Authorized redirect URIs.",
      "Enable the Drive API for the project under APIs & Services → Library.",
      "Drive and Calendar share the same TRAIL_GOOGLE_* env vars — list both callbacks on the same client.",
      "Set env vars, restart, then click Add.",
    ],
    tools: [
      {
        name: "drive_search_files",
        description: "Search Drive files using Drive query syntax.",
        destructive: false,
      },
      {
        name: "drive_read_text_file",
        description: "Read file contents as text (Docs/Sheets exported to text/plain).",
        destructive: false,
      },
    ],
    notes: ["Refresh tokens are sticky — once issued, Google may stop returning them on subsequent consents. We use access_type=offline + prompt=consent to force one on first connect."],
  },
  google_calendar: {
    kind: "google_calendar",
    oneLiner: "List and create Google Calendar events on the user's primary calendar.",
    signupUrl: "https://console.cloud.google.com/apis/credentials",
    signupLabel: "Google Cloud Console (same client as Drive)",
    envVars: ["TRAIL_GOOGLE_CLIENT_ID", "TRAIL_GOOGLE_CLIENT_SECRET"],
    callbackPathTemplate: "/api/trails/oauth/google_calendar/callback",
    scopes: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    setupSteps: [
      "Reuse the same Google OAuth client as the Drive Trail.",
      "Add the Calendar callback URL below to its Authorized redirect URIs.",
      "Enable the Calendar API in APIs & Services → Library.",
      "Click Add — Spotter will redirect to Google for consent.",
    ],
    tools: [
      {
        name: "cal_list_events",
        description: "List events between two ISO timestamps.",
        destructive: false,
      },
      {
        name: "cal_create_event",
        description: "Create an event with optional attendees.",
        destructive: true,
      },
    ],
  },
  notion: {
    kind: "notion",
    oneLiner: "Search Notion pages, fetch page contents, and append paragraphs.",
    signupUrl: "https://www.notion.so/profile/integrations",
    signupLabel: "Notion Integrations",
    envVars: ["TRAIL_NOTION_CLIENT_ID", "TRAIL_NOTION_CLIENT_SECRET"],
    callbackPathTemplate: "/api/trails/oauth/notion/callback",
    setupSteps: [
      "Create a Public OAuth integration (not internal) in Notion Integrations.",
      "Set the OAuth Domain & Redirect URI to your origin + the callback path below.",
      "Copy OAuth client ID and secret into your server .env.",
      "On Add, you'll be asked which workspace and which pages to share.",
    ],
    tools: [
      {
        name: "notion_search",
        description: "Search pages and databases the user shared with the integration.",
        destructive: false,
      },
      {
        name: "notion_get_page",
        description: "Fetch a page's metadata and child blocks.",
        destructive: false,
      },
      {
        name: "notion_append_paragraph",
        description: "Append a paragraph block to a page.",
        destructive: true,
      },
    ],
    notes: ["Spotter only sees pages the user explicitly grants during the OAuth flow. To add new pages, reconnect."],
  },
  linear: {
    kind: "linear",
    oneLiner: "Search and create Linear issues across teams via the GraphQL API.",
    signupUrl: "https://linear.app/settings/api/applications",
    signupLabel: "Linear OAuth Applications",
    envVars: ["TRAIL_LINEAR_CLIENT_ID", "TRAIL_LINEAR_CLIENT_SECRET"],
    callbackPathTemplate: "/api/trails/oauth/linear/callback",
    scopes: ["read", "write"],
    setupSteps: [
      "Create a new OAuth Application in Linear settings.",
      "Add the callback URL below as an authorized redirect URI.",
      "Copy Client ID and Client Secret into your server .env.",
      "Click Add — Linear will ask which workspace to authorize.",
    ],
    tools: [
      {
        name: "linear_search_issues",
        description: "Free-text search Linear issues. Returns id, identifier, title, state, team.",
        destructive: false,
      },
      {
        name: "linear_create_issue",
        description: "Create an issue in a given team. Requires teamId.",
        destructive: true,
      },
    ],
    notes: ["Use linear_search_issues to discover team keys before creating issues — agent typically chains them."],
  },
  perplexity: {
    kind: "perplexity",
    oneLiner: "Ask Perplexity Online for a synthesised answer with citations.",
    signupUrl: "https://www.perplexity.ai/settings/api",
    signupLabel: "Perplexity API keys",
    setupSteps: [
      "Create an API key at perplexity.ai/settings/api (paid tier).",
      "Click Add for Perplexity below, paste the key, Save.",
      "Default model is `sonar`. Override per call via the model field.",
    ],
    tools: [
      {
        name: "perplexity_ask",
        description: "Send a research question and get a Perplexity Online answer.",
        destructive: false,
      },
    ],
    notes: ["Pay-per-use — cheaper than scraping but not free. Each call returns model output plus a citations array."],
  },
  web_search: {
    kind: "web_search",
    oneLiner: "Web search via Tavily — LLM-friendly results plus an optional synth answer.",
    signupUrl: "https://app.tavily.com/home",
    signupLabel: "Tavily dashboard",
    setupSteps: [
      "Sign up at tavily.com — free tier includes 1,000 searches/month.",
      "Copy your API key (`tvly-...`) from the dashboard.",
      "Click Add for Web Search below, paste the key, Save.",
    ],
    tools: [
      {
        name: "web_search",
        description: "Search the open web. Returns title, url, content, score per hit + optional AI answer.",
        destructive: false,
      },
    ],
    notes: ["searchDepth: \"advanced\" costs more credits but pulls deeper context. Use \"basic\" for routine lookups."],
  },
  custom_mcp: {
    kind: "custom_mcp",
    oneLiner: "Bring your own MCP server. Spotter exposes its tools to the agent at runtime.",
    setupSteps: [
      "Click Add for Custom MCP below.",
      "Paste your MCP server URL (HTTP transport recommended).",
      "Optionally add an Authorization bearer token (stored encrypted) and/or extra headers.",
      "Click Test connection — Spotter discovers the tools on success.",
      "Tools appear with prefix `trail_<id>_<toolName>` and are treated as destructive by default. Use the Trail Access list to allow specific tools or mark them safe.",
    ],
    tools: [],
    notes: [
      "External MCP tools execute on a remote server you control. Spotter sees only what the server returns; output is treated as untrusted data.",
      "Sessionless mode (no MCP-Session-Id) is used. Each agent step opens its own short-lived connection.",
    ],
  },
};

export function getConnectorDoc(kind: TrailKind): ConnectorDoc {
  return CONNECTOR_DOCS[kind];
}
