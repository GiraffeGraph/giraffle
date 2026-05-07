import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

const OUTPUT_SNIPPET_LIMIT = 600;
const INPUT_BYTES_LIMIT = 4_000;

export interface ToolAuditPayload {
  userId: string;
  sessionId: string | null;
  messageId: string | null;
  toolName: string;
  trailId: string | null;
  status: "success" | "error" | "denied" | "approved";
  input?: unknown;
  output?: unknown;
  error?: string | null;
  durationMs?: number | null;
}

function truncateInput(input: unknown): unknown {
  if (input === undefined) return null;
  try {
    const json = JSON.stringify(input);
    if (json.length <= INPUT_BYTES_LIMIT) return input;
    return { _truncated: true, preview: json.slice(0, INPUT_BYTES_LIMIT) };
  } catch {
    return { _unserializable: true };
  }
}

function snippet(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    const json = typeof value === "string" ? value : JSON.stringify(value);
    return json.slice(0, OUTPUT_SNIPPET_LIMIT);
  } catch {
    return null;
  }
}

function deriveTrailIdFromTool(toolName: string): string | null {
  if (!toolName.startsWith("trail_")) return null;
  // Tool name pattern: trail_<8charPrefix>_<originalName>
  const rest = toolName.slice("trail_".length);
  const idPrefix = rest.split("_")[0];
  if (!idPrefix) return null;
  return idPrefix;
}

export async function recordToolAudit(payload: ToolAuditPayload): Promise<void> {
  try {
    let trailId = payload.trailId;
    if (!trailId) {
      const idPrefix = deriveTrailIdFromTool(payload.toolName);
      if (idPrefix) {
        const match = await db.trail.findFirst({
          where: { userId: payload.userId, id: { startsWith: idPrefix } },
          select: { id: true },
        });
        trailId = match?.id ?? null;
      }
    }
    await db.trailLog.create({
      data: {
        userId: payload.userId,
        trailId,
        sessionId: payload.sessionId,
        messageId: payload.messageId,
        toolName: payload.toolName,
        status: payload.status,
        input: truncateInput(payload.input) as never,
        outputSnippet: snippet(payload.output),
        error: payload.error ?? null,
        durationMs: payload.durationMs ?? null,
      },
    });
  } catch (error) {
    logger.error("trail_audit_failed", {
      userId: payload.userId,
      toolName: payload.toolName,
      error,
    });
  }
}
