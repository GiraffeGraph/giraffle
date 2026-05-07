import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  closeMcpClients,
  openCustomMcpClient,
  type CustomMcpConfig,
} from "@/domain/agent/mcp-clients";
import { updateTrail } from "@/domain/trail/trail.service";

export const runtime = "nodejs";

function parseConfig(raw: unknown): CustomMcpConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const cfg = raw as Record<string, unknown>;
  if (typeof cfg.url !== "string" || cfg.url.length === 0) return null;
  return {
    url: cfg.url,
    transport: cfg.transport === "sse" ? "sse" : "http",
    headers:
      cfg.headers && typeof cfg.headers === "object"
        ? (Object.fromEntries(
            Object.entries(cfg.headers as Record<string, unknown>).filter(
              ([, v]) => typeof v === "string",
            ) as [string, string][],
          ))
        : undefined,
  };
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const trail = await db.trail.findFirst({
    where: { id, userId },
    select: { id: true, kind: true, label: true, config: true },
  });
  if (!trail) return new Response("Not found", { status: 404 });
  if (trail.kind !== "custom_mcp") {
    return new Response("Test endpoint only supports custom_mcp", { status: 400 });
  }
  const config = parseConfig(trail.config);
  if (!config) {
    await updateTrail(userId, id, { status: "error", lastError: "Invalid config: url required" });
    return Response.json(
      { ok: false, error: "Invalid config: url required" },
      { status: 400 },
    );
  }

  try {
    const active = await openCustomMcpClient({
      trailId: trail.id,
      trailLabel: trail.label,
      config,
    });
    const toolNames = Object.keys(active.tools);
    await closeMcpClients([active]);
    await updateTrail(userId, id, {
      status: "active",
      lastError: null,
      lastSyncAt: new Date(),
    });
    return Response.json({ ok: true, toolCount: toolNames.length, tools: toolNames });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateTrail(userId, id, { status: "error", lastError: message });
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
