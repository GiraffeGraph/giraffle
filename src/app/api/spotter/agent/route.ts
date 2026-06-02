import { z } from "zod";
import { auth } from "@/lib/auth";
import { getRequestId, logger } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";
import { spawnAgentRun } from "@/domain/agent/cli-runner";
import { createMcpAccessToken, revokeMcpAccessToken } from "@/domain/mcp/token.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  prompt: z.string().min(1).max(20_000),
  resume: z.string().min(1).nullable().optional(),
  model: z.string().min(1).max(80).optional(),
});

const AGENT_TOKEN_TTL_MS = 10 * 60_000;
const SIGKILL_GRACE_MS = 2_500;

// Pin the MCP endpoint the spawned agent connects to. Deriving it from the
// request URL would let a spoofed Host header redirect the live bearer token to
// an attacker origin, so this is configuration, never request-controlled.
const MCP_BASE_URL = process.env.GIRAFFLE_MCP_BASE_URL || "http://localhost:3000";

/**
 * Drives a local CLI agent (Claude Code) over Giraffle's MCP server and streams
 * its stream-json output back to the client. The agent uses its own auth (e.g.
 * a Claude subscription) — no API key lives in Giraffle. A short-lived MCP token
 * is minted per run and revoked when the run ends.
 */
export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const rate = consumeRateLimit(`spotter-agent:${userId}`, {
    limit: 12,
    windowMs: 60_000,
    blockMs: 5 * 60_000,
  });
  if (!rate.allowed) {
    return new Response("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) },
    });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Invalid agent payload", { status: 400 });
  const { prompt, resume, model } = parsed.data;

  const mcpUrl = new URL("/api/mcp", MCP_BASE_URL).toString();
  const ephemeralToken = await createMcpAccessToken(userId, {
    name: "Spotter agent (auto)",
    expiresAt: new Date(Date.now() + AGENT_TOKEN_TTL_MS),
  });

  let child: ReturnType<typeof spawnAgentRun>;
  try {
    child = spawnAgentRun({ prompt, mcpUrl, mcpToken: ephemeralToken.token, resume, model });
  } catch (error) {
    await revokeMcpAccessToken(userId, ephemeralToken.id).catch(() => {});
    logger.error("spotter_agent_spawn_failed", { requestId, userId, error });
    return new Response("Failed to launch agent CLI", { status: 500 });
  }

  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  // Terminate the process politely, then force-kill if it ignores SIGTERM so a
  // wedged agent can't hold its live MCP token for the full TTL.
  const killChild = () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGTERM");
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }, SIGKILL_GRACE_MS);
    timer.unref?.();
    child.once("close", () => clearTimeout(timer));
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let settled = false;

      const safeEnqueue = (chunk: Uint8Array) => {
        try {
          controller.enqueue(chunk);
        } catch {
          // Controller already closed/errored — drop late output.
        }
      };

      // Revoke the ephemeral token exactly once, regardless of which path ends
      // the run (clean exit, error, or client disconnect).
      const finish = async () => {
        if (settled) return;
        settled = true;
        await revokeMcpAccessToken(userId, ephemeralToken.id).catch(() => {});
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      child.stdout.on("data", (chunk: Buffer) => safeEnqueue(chunk));
      child.on("error", async (error) => {
        logger.error("spotter_agent_error", { requestId, userId, error });
        safeEnqueue(
          encoder.encode(
            JSON.stringify({ type: "giraffle_error", message: "Agent process error" }) + "\n",
          ),
        );
        await finish();
      });
      child.on("close", async (code) => {
        if (code && code !== 0) {
          logger.warn("spotter_agent_nonzero_exit", { requestId, userId, code, stderr: stderr.slice(0, 2_000) });
          safeEnqueue(
            encoder.encode(
              JSON.stringify({ type: "giraffle_error", code, message: stderr.slice(0, 2_000) || `Agent exited ${code}` }) + "\n",
            ),
          );
        }
        await finish();
      });

      req.signal.addEventListener("abort", () => killChild());
    },
    cancel() {
      killChild();
      void revokeMcpAccessToken(userId, ephemeralToken.id).catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
