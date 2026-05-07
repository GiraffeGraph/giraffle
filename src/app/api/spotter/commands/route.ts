import { z } from "zod";
import { auth } from "@/lib/auth";
import { getRequestId, logger } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { executeSpotterCommand } from "@/domain/spotter-commands/execute";
import {
  assertSpotterSessionOwner,
  buildSpotterSessionTitle,
  createSpotterSession,
  touchSpotterSession,
} from "@/domain/spotter/spotter.service";

export const maxDuration = 30;

const SPOTTER_COMMAND_RATE_LIMIT = {
  limit: 40,
  windowMs: 60_000,
  blockMs: 5 * 60_000,
} as const;

const CommandBodySchema = z.object({
  id: z.string().min(1).optional(),
  command: z.string().min(1).max(80),
  args: z.string().max(8_000).default(""),
  userText: z.string().min(1).max(8_200),
  userMessageId: z.string().min(1),
  assistantMessageId: z.string().min(1),
});

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return new Response("Unauthorized", { status: 401 });

    const rateLimit = consumeRateLimit(
      `spotter-command:${userId}`,
      SPOTTER_COMMAND_RATE_LIMIT,
    );
    if (!rateLimit.allowed) {
      return new Response("Too many requests", {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)),
        },
      });
    }

    const rawBody = await req.json().catch(() => null);
    const parsed = CommandBodySchema.safeParse(rawBody);
    if (!parsed.success) return new Response("Invalid command payload", { status: 400 });

    let activeSessionId = parsed.data.id ?? null;
    if (activeSessionId) {
      const owned = await assertSpotterSessionOwner(userId, activeSessionId);
      if (!owned) return new Response("Session not found", { status: 404 });
      activeSessionId = owned.id;
    }

    const result = await executeSpotterCommand({
      userId,
      command: parsed.data.command,
      args: parsed.data.args,
    });
    const assistantText = `${result.title}\n\n${result.content}`;

    if (!activeSessionId) {
      const created = await createSpotterSession(
        userId,
        buildSpotterSessionTitle(parsed.data.userText),
      );
      activeSessionId = created.id;
    }

    await db.spotterMessage.createMany({
      data: [
        {
          id: parsed.data.userMessageId,
          sessionId: activeSessionId,
          role: "user",
          content: parsed.data.userText,
          parts: [{ type: "text", text: parsed.data.userText }] as never,
        },
        {
          id: parsed.data.assistantMessageId,
          sessionId: activeSessionId,
          role: "assistant",
          content: assistantText,
          parts: [{ type: "text", text: assistantText }] as never,
        },
      ],
      skipDuplicates: true,
    });
    await touchSpotterSession(activeSessionId);

    return Response.json({ ...result, sessionId: activeSessionId, assistantText });
  } catch (error) {
    logger.warn("spotter_command_failed", { requestId, error });
    const message = error instanceof Error ? error.message : "Unknown Spotter command error.";
    return Response.json({ error: message }, { status: 400 });
  }
}
