import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";
import { db } from "@/lib/db";
import { decryptSecretValue } from "@/lib/secret-box";
import { logger } from "@/lib/logger";

const CONNECT_TIMEOUT_MS = 8_000;

export type CustomMcpTransportKind = "http" | "sse";

export interface CustomMcpConfig {
  transport?: CustomMcpTransportKind;
  url: string;
  headers?: Record<string, string>;
}

export interface ActiveMcpClient {
  trailId: string;
  trailLabel: string | null;
  client: MCPClient;
  tools: ToolSet;
  prefix: string;
}

function parseCustomMcpConfig(raw: unknown): CustomMcpConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const cfg = raw as Record<string, unknown>;
  if (typeof cfg.url !== "string" || cfg.url.length === 0) return null;
  const transport: CustomMcpTransportKind =
    cfg.transport === "sse" ? "sse" : "http";
  const headers =
    cfg.headers && typeof cfg.headers === "object"
      ? Object.fromEntries(
          Object.entries(cfg.headers as Record<string, unknown>).filter(
            ([, v]) => typeof v === "string",
          ) as [string, string][],
        )
      : undefined;
  return { transport, url: cfg.url, headers };
}

async function loadBearerToken(trailId: string): Promise<string | null> {
  const credential = await db.trailCredential.findFirst({
    where: { trailId, scope: "bearer" },
    select: { encryptedSecret: true },
  });
  if (!credential) return null;
  try {
    return decryptSecretValue(credential.encryptedSecret);
  } catch (error) {
    logger.error("trail_bearer_decrypt_failed", { trailId, error });
    return null;
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`MCP connect timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function openCustomMcpClient(input: {
  trailId: string;
  trailLabel: string | null;
  config: CustomMcpConfig;
}): Promise<ActiveMcpClient> {
  const bearer = await loadBearerToken(input.trailId);
  const headers = { ...(input.config.headers ?? {}) };
  if (bearer && !headers.Authorization) {
    headers.Authorization = `Bearer ${bearer}`;
  }
  const client = await withTimeout(
    createMCPClient({
      transport: {
        type: input.config.transport ?? "http",
        url: input.config.url,
        headers,
      },
    }),
    CONNECT_TIMEOUT_MS,
  );
  const tools = (await client.tools()) as ToolSet;
  const prefix = `trail_${input.trailId.slice(0, 8)}_`;
  return {
    trailId: input.trailId,
    trailLabel: input.trailLabel,
    client,
    tools,
    prefix,
  };
}

export interface OpenMcpClientsResult {
  clients: ActiveMcpClient[];
  errors: Array<{ trailId: string; error: string }>;
}

export async function openMcpClientsForUser(userId: string): Promise<OpenMcpClientsResult> {
  const trails = await db.trail.findMany({
    where: { userId, kind: "custom_mcp", status: "active" },
    select: { id: true, label: true, config: true },
  });
  const out: ActiveMcpClient[] = [];
  const errors: Array<{ trailId: string; error: string }> = [];
  await Promise.all(
    trails.map(async (trail) => {
      const config = parseCustomMcpConfig(trail.config);
      if (!config) {
        errors.push({ trailId: trail.id, error: "invalid_config" });
        return;
      }
      try {
        const active = await openCustomMcpClient({
          trailId: trail.id,
          trailLabel: trail.label,
          config,
        });
        out.push(active);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn("trail_mcp_connect_failed", { trailId: trail.id, error: message });
        errors.push({ trailId: trail.id, error: message });
      }
    }),
  );
  return { clients: out, errors };
}

export async function closeMcpClients(clients: ActiveMcpClient[]) {
  await Promise.all(
    clients.map(async (entry) => {
      try {
        await entry.client.close();
      } catch (error) {
        logger.warn("trail_mcp_close_failed", { trailId: entry.trailId, error });
      }
    }),
  );
}

export function flattenMcpTools(clients: ActiveMcpClient[]): ToolSet {
  const out: ToolSet = {};
  for (const entry of clients) {
    for (const [toolName, def] of Object.entries(entry.tools)) {
      out[`${entry.prefix}${toolName}`] = def;
    }
  }
  return out;
}
