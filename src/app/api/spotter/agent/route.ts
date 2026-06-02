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

  const mcpUrl = new URL("/api/mcp", new URL(req.url).origin).toString();
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const cleanup = async () => {
        await revokeMcpAccessToken(userId, ephemeralToken.id).catch(() => {});
      };

      child.stdout.on("data", (chunk: Buffer) => {
        controller.enqueue(chunk);
      });
      child.on("error", async (error) => {
        logger.error("spotter_agent_error", { requestId, userId, error });
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "giraffle_error", message: "Agent process error" }) + "\n",
          ),
        );
        await cleanup();
        controller.close();
      });
      child.on("close", async (code) => {
        if (code && code !== 0) {
          logger.warn("spotter_agent_nonzero_exit", { requestId, userId, code, stderr: stderr.slice(0, 2_000) });
          controller.enqueue(
            encoder.encode(
              JSON.stringify({ type: "giraffle_error", code, message: stderr.slice(0, 2_000) || `Agent exited ${code}` }) + "\n",
            ),
          );
        }
        await cleanup();
        controller.close();
      });
    },
    cancel() {
      child.kill("SIGTERM");
      void revokeMcpAccessToken(userId, ephemeralToken.id).catch(() => {});
    },
  });

  req.signal.addEventListener("abort", () => child.kill("SIGTERM"));

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
