import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { getValidAccessToken } from "@/domain/trail/oauth/access-token";
import { readApiKey } from "@/domain/trail/api-key";
import { authedFetchJson } from "./http";
import type { TrailKind } from "@/domain/trail/trail.types";

export interface ProviderToolContext {
  userId: string;
  trailId: string;
  trailKind: TrailKind;
  trailLabel: string | null;
  destructiveApproval: boolean;
}

interface ProviderToolDef {
  name: string;
  description: string;
  destructive: boolean;
  inputSchema: z.ZodTypeAny;
  execute: (input: unknown, token: string, ctx: ProviderToolContext) => Promise<unknown>;
}

function makeTokenGetter(ctx: ProviderToolContext) {
  return async () => {
    if (ctx.trailKind === "web_search" || ctx.trailKind === "perplexity") {
      const key = await readApiKey({ userId: ctx.userId, trailId: ctx.trailId });
      if (!key) throw new Error("Trail API key missing");
      return key;
    }
    return getValidAccessToken({
      userId: ctx.userId,
      trailId: ctx.trailId,
      trailKind: ctx.trailKind,
    });
  };
}

function buildTools(defs: ProviderToolDef[], ctx: ProviderToolContext): ToolSet {
  const out: ToolSet = {};
  const getToken = makeTokenGetter(ctx);
  for (const def of defs) {
    const needsApproval = ctx.destructiveApproval && def.destructive;
    out[def.name] = tool({
      description: def.description,
      inputSchema: def.inputSchema as never,
      needsApproval,
      execute: (async (input: unknown) => {
        const token = await getToken();
        return def.execute(input, token, ctx);
      }) as never,
    });
  }
  return out;
}

const githubTools: ProviderToolDef[] = [
  {
    name: "github_search_issues",
    description:
      "Search GitHub issues and pull requests using the standard GitHub search syntax (e.g. 'repo:owner/name state:open is:pr').",
    destructive: false,
    inputSchema: z.object({
      query: z.string().min(1).max(500),
      perPage: z.number().int().min(1).max(50).default(10),
    }),
    execute: async (raw, token) => {
      const input = raw as { query: string; perPage: number };
      return authedFetchJson("https://api.github.com/search/issues", token, {
        query: { q: input.query, per_page: input.perPage },
        headers: { Accept: "application/vnd.github+json" },
      });
    },
  },
  {
    name: "github_get_repo",
    description: "Fetch a GitHub repository's metadata.",
    destructive: false,
    inputSchema: z.object({
      owner: z.string().min(1),
      repo: z.string().min(1),
    }),
    execute: async (raw, token) => {
      const input = raw as { owner: string; repo: string };
      return authedFetchJson(
        `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}`,
        token,
        { headers: { Accept: "application/vnd.github+json" } },
      );
    },
  },
  {
    name: "github_create_issue",
    description: "Create a new GitHub issue in the given repository. Destructive — requires approval.",
    destructive: true,
    inputSchema: z.object({
      owner: z.string().min(1),
      repo: z.string().min(1),
      title: z.string().min(1).max(220),
      body: z.string().max(60_000).optional(),
      labels: z.array(z.string()).max(20).optional(),
    }),
    execute: async (raw, token) => {
      const input = raw as {
        owner: string;
        repo: string;
        title: string;
        body?: string;
        labels?: string[];
      };
      return authedFetchJson(
        `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/issues`,
        token,
        {
          method: "POST",
          headers: { Accept: "application/vnd.github+json" },
          body: JSON.stringify({
            title: input.title,
            body: input.body,
            labels: input.labels,
          }),
        },
      );
    },
  },
];

const driveTools: ProviderToolDef[] = [
  {
    name: "drive_search_files",
    description: "Search Google Drive files. Use Drive query syntax (e.g. \"name contains 'Q3'\").",
    destructive: false,
    inputSchema: z.object({
      q: z.string().min(1).max(500),
      pageSize: z.number().int().min(1).max(50).default(20),
    }),
    execute: async (raw, token) => {
      const input = raw as { q: string; pageSize: number };
      return authedFetchJson("https://www.googleapis.com/drive/v3/files", token, {
        query: {
          q: input.q,
          pageSize: input.pageSize,
          fields:
            "files(id,name,mimeType,modifiedTime,owners(displayName),webViewLink)",
        },
      });
    },
  },
  {
    name: "drive_read_text_file",
    description:
      "Read the text contents of a Drive file by id. Google Docs are exported as text/plain.",
    destructive: false,
    inputSchema: z.object({ fileId: z.string().min(1) }),
    execute: async (raw, token) => {
      const input = raw as { fileId: string };
      const meta = await authedFetchJson<{ mimeType: string; name: string }>(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.fileId)}`,
        token,
        { query: { fields: "id,name,mimeType" } },
      );
      const isGoogleDoc = meta.mimeType?.startsWith("application/vnd.google-apps");
      const downloadUrl = isGoogleDoc
        ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.fileId)}/export?mimeType=text/plain`
        : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(input.fileId)}?alt=media`;
      const res = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Drive download failed: ${res.status} ${res.statusText}`);
      }
      const text = await res.text();
      return { id: input.fileId, name: meta.name, mimeType: meta.mimeType, text: text.slice(0, 60_000) };
    },
  },
];

const calendarTools: ProviderToolDef[] = [
  {
    name: "cal_list_events",
    description:
      "List upcoming Google Calendar events between two ISO timestamps (defaults to the primary calendar).",
    destructive: false,
    inputSchema: z.object({
      timeMin: z.string().datetime(),
      timeMax: z.string().datetime(),
      calendarId: z.string().min(1).default("primary"),
      maxResults: z.number().int().min(1).max(50).default(20),
    }),
    execute: async (raw, token) => {
      const input = raw as {
        timeMin: string;
        timeMax: string;
        calendarId: string;
        maxResults: number;
      };
      return authedFetchJson(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events`,
        token,
        {
          query: {
            timeMin: input.timeMin,
            timeMax: input.timeMax,
            maxResults: input.maxResults,
            singleEvents: "true",
            orderBy: "startTime",
          },
        },
      );
    },
  },
  {
    name: "cal_create_event",
    description: "Create an event on the user's primary calendar. Destructive.",
    destructive: true,
    inputSchema: z.object({
      summary: z.string().min(1).max(220),
      description: z.string().max(8_000).optional(),
      start: z.string().datetime(),
      end: z.string().datetime(),
      calendarId: z.string().min(1).default("primary"),
      attendees: z.array(z.string().email()).max(50).optional(),
    }),
    execute: async (raw, token) => {
      const input = raw as {
        summary: string;
        description?: string;
        start: string;
        end: string;
        calendarId: string;
        attendees?: string[];
      };
      return authedFetchJson(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(input.calendarId)}/events`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            summary: input.summary,
            description: input.description,
            start: { dateTime: input.start },
            end: { dateTime: input.end },
            attendees: input.attendees?.map((email) => ({ email })),
          }),
        },
      );
    },
  },
];

const notionTools: ProviderToolDef[] = [
  {
    name: "notion_search",
    description: "Search Notion pages and databases the integration has access to.",
    destructive: false,
    inputSchema: z.object({
      query: z.string().min(1).max(220),
      pageSize: z.number().int().min(1).max(50).default(20),
    }),
    execute: async (raw, token) => {
      const input = raw as { query: string; pageSize: number };
      return authedFetchJson("https://api.notion.com/v1/search", token, {
        method: "POST",
        headers: { "Notion-Version": "2022-06-28" },
        body: JSON.stringify({ query: input.query, page_size: input.pageSize }),
      });
    },
  },
  {
    name: "notion_get_page",
    description: "Fetch a Notion page's metadata and child blocks.",
    destructive: false,
    inputSchema: z.object({ pageId: z.string().min(1) }),
    execute: async (raw, token) => {
      const input = raw as { pageId: string };
      const [meta, children] = await Promise.all([
        authedFetchJson(
          `https://api.notion.com/v1/pages/${encodeURIComponent(input.pageId)}`,
          token,
          { headers: { "Notion-Version": "2022-06-28" } },
        ),
        authedFetchJson(
          `https://api.notion.com/v1/blocks/${encodeURIComponent(input.pageId)}/children`,
          token,
          {
            headers: { "Notion-Version": "2022-06-28" },
            query: { page_size: 100 },
          },
        ),
      ]);
      return { meta, children };
    },
  },
  {
    name: "notion_append_paragraph",
    description: "Append a single paragraph block of text to a Notion page. Destructive.",
    destructive: true,
    inputSchema: z.object({
      pageId: z.string().min(1),
      text: z.string().min(1).max(2_000),
    }),
    execute: async (raw, token) => {
      const input = raw as { pageId: string; text: string };
      return authedFetchJson(
        `https://api.notion.com/v1/blocks/${encodeURIComponent(input.pageId)}/children`,
        token,
        {
          method: "PATCH",
          headers: { "Notion-Version": "2022-06-28" },
          body: JSON.stringify({
            children: [
              {
                object: "block",
                type: "paragraph",
                paragraph: {
                  rich_text: [{ type: "text", text: { content: input.text } }],
                },
              },
            ],
          }),
        },
      );
    },
  },
];

const linearTools: ProviderToolDef[] = [
  {
    name: "linear_search_issues",
    description:
      "Search Linear issues with a free-text query. Returns id, title, identifier, state, team.",
    destructive: false,
    inputSchema: z.object({
      query: z.string().min(1).max(220),
      first: z.number().int().min(1).max(50).default(15),
    }),
    execute: async (raw, token) => {
      const input = raw as { query: string; first: number };
      return authedFetchJson("https://api.linear.app/graphql", token, {
        method: "POST",
        body: JSON.stringify({
          query: `query Search($q: String!, $first: Int!) {
            issueSearch(query: $q, first: $first) {
              nodes { id identifier title state { name } team { key } url updatedAt }
            }
          }`,
          variables: { q: input.query, first: input.first },
        }),
      });
    },
  },
  {
    name: "linear_create_issue",
    description: "Create a Linear issue in a given team. Destructive.",
    destructive: true,
    inputSchema: z.object({
      teamId: z.string().min(1),
      title: z.string().min(1).max(220),
      description: z.string().max(60_000).optional(),
    }),
    execute: async (raw, token) => {
      const input = raw as { teamId: string; title: string; description?: string };
      return authedFetchJson("https://api.linear.app/graphql", token, {
        method: "POST",
        body: JSON.stringify({
          query: `mutation CreateIssue($input: IssueCreateInput!) {
            issueCreate(input: $input) {
              success
              issue { id identifier title url }
            }
          }`,
          variables: {
            input: {
              teamId: input.teamId,
              title: input.title,
              description: input.description,
            },
          },
        }),
      });
    },
  },
];

const webSearchTools: ProviderToolDef[] = [
  {
    name: "web_search",
    description:
      "Search the web via Tavily. Returns a list of {title, url, content, score}. Configure the Trail with a Tavily API key.",
    destructive: false,
    inputSchema: z.object({
      query: z.string().min(1).max(400),
      maxResults: z.number().int().min(1).max(20).default(5),
      searchDepth: z.enum(["basic", "advanced"]).default("basic"),
    }),
    execute: async (raw, apiKey) => {
      const input = raw as { query: string; maxResults: number; searchDepth: "basic" | "advanced" };
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query: input.query,
          max_results: input.maxResults,
          search_depth: input.searchDepth,
          include_answer: true,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Tavily ${res.status}: ${text.slice(0, 300)}`);
      }
      try {
        return JSON.parse(text);
      } catch {
        return { raw: text };
      }
    },
  },
];

const perplexityTools: ProviderToolDef[] = [
  {
    name: "perplexity_ask",
    description:
      "Ask Perplexity Online (model 'sonar') a research question and get a synthesised answer with citations.",
    destructive: false,
    inputSchema: z.object({
      question: z.string().min(1).max(2_000),
      model: z.string().min(1).max(80).default("sonar"),
    }),
    execute: async (raw, apiKey) => {
      const input = raw as { question: string; model: string };
      const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: input.model,
          messages: [{ role: "user", content: input.question }],
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Perplexity ${res.status}: ${text.slice(0, 300)}`);
      }
      try {
        return JSON.parse(text);
      } catch {
        return { raw: text };
      }
    },
  },
];

const PROVIDER_TOOLS_BY_KIND: Partial<Record<TrailKind, ProviderToolDef[]>> = {
  github: githubTools,
  google_drive: driveTools,
  google_calendar: calendarTools,
  notion: notionTools,
  linear: linearTools,
  web_search: webSearchTools,
  perplexity: perplexityTools,
};

export function getProviderToolDefs(kind: TrailKind): ProviderToolDef[] {
  return PROVIDER_TOOLS_BY_KIND[kind] ?? [];
}

export function buildProviderTools(ctx: ProviderToolContext): ToolSet {
  const defs = getProviderToolDefs(ctx.trailKind);
  if (defs.length === 0) return {};
  return buildTools(defs, ctx);
}

export function describeProviderTool(
  kind: TrailKind,
  toolName: string,
): { destructive: boolean; description: string } | null {
  const defs = getProviderToolDefs(kind);
  const found = defs.find((d) => d.name === toolName);
  if (!found) return null;
  return { destructive: found.destructive, description: found.description };
}

export function listProviderToolNames(kind: TrailKind): string[] {
  return getProviderToolDefs(kind).map((d) => d.name);
}
