import type { ToolSet } from "ai";
import { db } from "@/lib/db";
import {
  buildInternalTools,
  INTERNAL_TOOL_DEFINITIONS,
  type AgentToolContext,
} from "@/domain/agent/internal-tools";
import {
  closeMcpClients,
  flattenMcpTools,
  openMcpClientsForUser,
  type ActiveMcpClient,
} from "@/domain/agent/mcp-clients";
import {
  buildApprovalPolicy,
  getApprovalMode,
  type ApprovalPolicy,
} from "@/domain/agent/permissions";
import {
  buildProviderTools,
  getProviderToolDefs,
} from "@/domain/trail/providers";
import type { TrailKind } from "@/domain/trail/trail.types";

export type ToolSource = "internal" | "trail";

export interface ToolCatalogEntry {
  name: string;
  source: ToolSource;
  trailId: string | null;
  trailKind: string | null;
  trailLabel: string | null;
  destructive: boolean;
  description: string;
}

export interface AgentToolset {
  tools: ToolSet;
  catalog: ToolCatalogEntry[];
  trailErrors: Array<{ trailId: string; error: string }>;
  approval: ApprovalPolicy;
  cleanup: () => Promise<void>;
}

interface AllowMap {
  // Map<trailId, Map<toolName, allowed>>
  byTrail: Map<string, Map<string, boolean>>;
}

async function loadAllowMap(userId: string): Promise<AllowMap> {
  const rows = await db.trailToolAllow.findMany({
    where: { trail: { userId } },
    select: { trailId: true, toolName: true, allowed: true },
  });
  const byTrail = new Map<string, Map<string, boolean>>();
  for (const row of rows) {
    let inner = byTrail.get(row.trailId);
    if (!inner) {
      inner = new Map();
      byTrail.set(row.trailId, inner);
    }
    inner.set(row.toolName, row.allowed);
  }
  return { byTrail };
}

function isTrailToolAllowed(
  allow: AllowMap,
  trailId: string,
  rawToolName: string,
  prefix: string,
): boolean {
  const inner = allow.byTrail.get(trailId);
  if (!inner) return true;
  const baseName = rawToolName.startsWith(prefix)
    ? rawToolName.slice(prefix.length)
    : rawToolName;
  const explicit = inner.get(baseName);
  if (typeof explicit === "boolean") return explicit;
  return true;
}

export async function buildAgentToolset(ctx: AgentToolContext): Promise<AgentToolset> {
  const approval =
    ctx.approval ?? buildApprovalPolicy(await getApprovalMode(ctx.userId));
  const internalCtx: AgentToolContext = { ...ctx, approval };
  const internalTools = buildInternalTools(internalCtx);
  const catalog: ToolCatalogEntry[] = INTERNAL_TOOL_DEFINITIONS.map((def) => ({
    name: def.name,
    source: "internal",
    trailId: null,
    trailKind: null,
    trailLabel: null,
    destructive: def.destructive,
    description: def.description,
  }));

  const allowMap = await loadAllowMap(ctx.userId);
  const { clients, errors } = await openMcpClientsForUser(ctx.userId);
  const filteredClients: ActiveMcpClient[] = [];

  for (const entry of clients) {
    const allowedTools: ToolSet = {};
    for (const [name, def] of Object.entries(entry.tools)) {
      if (!isTrailToolAllowed(allowMap, entry.trailId, name, "")) continue;
      const destructive = true;
      const wrapped = {
        ...(def as Record<string, unknown>),
        needsApproval: approval.needsApprovalFor(`${entry.prefix}${name}`, destructive),
      } as ToolSet[string];
      allowedTools[name] = wrapped;
      catalog.push({
        name: `${entry.prefix}${name}`,
        source: "trail",
        trailId: entry.trailId,
        trailKind: "custom_mcp",
        trailLabel: entry.trailLabel,
        destructive,
        description:
          (def as { description?: string }).description?.toString() ?? "External MCP tool",
      });
    }
    filteredClients.push({ ...entry, tools: allowedTools });
  }

  const trailTools = flattenMcpTools(filteredClients);

  const providerTools: ToolSet = {};
  const activeProviderTrails = await db.trail.findMany({
    where: {
      userId: ctx.userId,
      status: "active",
      kind: {
        in: [
          "github",
          "google_drive",
          "google_calendar",
          "notion",
          "linear",
          "web_search",
          "perplexity",
        ],
      },
    },
    select: { id: true, kind: true, label: true },
  });
  for (const trail of activeProviderTrails) {
    const kind = trail.kind as TrailKind;
    const defs = getProviderToolDefs(kind);
    if (defs.length === 0) continue;
    const prefix = `trail_${trail.id.slice(0, 8)}_`;
    const built = buildProviderTools({
      userId: ctx.userId,
      trailId: trail.id,
      trailKind: kind,
      trailLabel: trail.label,
      destructiveApproval: approval.mode === "ask",
    });
    for (const [name, def] of Object.entries(built)) {
      if (!isTrailToolAllowed(allowMap, trail.id, name, "")) continue;
      const prefixed = `${prefix}${name}`;
      providerTools[prefixed] = def;
      const meta = defs.find((d) => d.name === name);
      catalog.push({
        name: prefixed,
        source: "trail",
        trailId: trail.id,
        trailKind: trail.kind,
        trailLabel: trail.label,
        destructive: meta?.destructive ?? false,
        description: meta?.description ?? `${kind} tool`,
      });
    }
  }

  const tools: ToolSet = { ...internalTools, ...trailTools, ...providerTools };

  return {
    tools,
    catalog,
    trailErrors: errors,
    approval,
    cleanup: async () => {
      await closeMcpClients(clients);
    },
  };
}
