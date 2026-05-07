import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { CallToolResult, ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { INTERNAL_TOOL_DEFINITIONS } from "@/domain/agent/internal-tools";

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

function requireMcpUserId(extra: ToolExtra) {
  const userId = extra.authInfo?.extra?.userId;
  if (typeof userId !== "string" || !userId) {
    throw new Error("Unauthorized MCP request.");
  }
  return userId;
}

function buildResult(name: string, output: unknown): CallToolResult {
  const summary = summarize(name, output);
  const structured =
    output && typeof output === "object" && !Array.isArray(output)
      ? (output as Record<string, unknown>)
      : { value: output };
  return {
    content: [{ type: "text", text: summary }],
    structuredContent: structured,
  };
}

function summarize(name: string, output: unknown): string {
  if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    const meta = obj.metadata as { title?: string; id?: string } | undefined;
    if (meta?.title && meta.id) return `${name}: ${meta.title} (${meta.id})`;
    if (typeof obj.title === "string" && typeof obj.id === "string") {
      return `${name}: ${obj.title} (${obj.id})`;
    }
    if (Array.isArray((obj as { hits?: unknown }).hits)) {
      return `${name}: ${(obj as { hits: unknown[] }).hits.length} hit(s)`;
    }
    if (Array.isArray((obj as { backlinks?: unknown }).backlinks)) {
      return `${name}: ${(obj as { backlinks: unknown[] }).backlinks.length} backlink(s)`;
    }
  }
  return `${name}: ok`;
}

const MCP_NAME_BY_INTERNAL: Record<string, string> = {
  notes_create: "giraffle-create-note",
  notes_update: "giraffle-update-note",
  notes_append: "giraffle-append-blocks",
  notes_get: "giraffle-get-note",
  notes_search: "giraffle-search-notes",
  notes_export: "giraffle-export-note",
  notes_backlinks: "giraffle-get-backlinks",
  notes_move: "giraffle-move-note",
  folders_create: "giraffle-create-folder",
  folders_list: "giraffle-list-folder",
};

export function createGiraffleMcpServer() {
  const server = new McpServer({
    name: "giraffle-mcp",
    version: "0.2.0",
    title: "Giraffle MCP",
  });

  const register = server.registerTool.bind(server) as unknown as (
    name: string,
    meta: Record<string, unknown>,
    handler: (input: unknown, extra: ToolExtra) => Promise<CallToolResult>,
  ) => void;

  for (const def of INTERNAL_TOOL_DEFINITIONS) {
    const mcpName = MCP_NAME_BY_INTERNAL[def.name] ?? def.name;
    register(
      mcpName,
      {
        title: def.name,
        description: def.description,
        inputSchema: def.inputSchema,
        annotations: {
          title: def.name,
          readOnlyHint: !def.destructive,
          destructiveHint: def.destructive,
          idempotentHint: !def.destructive,
        },
      },
      async (input, extra) => {
        const userId = requireMcpUserId(extra);
        const output = await def.execute(input, { userId });
        return buildResult(def.name, output);
      },
    );
  }

  return server;
}
