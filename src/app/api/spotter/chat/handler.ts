import { z } from "zod";
import type { UIMessage } from "ai";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRequestId, logger } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";
import { runAgent } from "@/domain/agent/loop";
import {
  appendSpotterMessage,
  assertSpotterSessionOwner,
  buildSpotterSessionTitle,
  createSpotterSession,
  touchSpotterSession,
} from "@/domain/spotter/spotter.service";

export const SPOTTER_CHAT_RATE_LIMIT = {
  limit: 12,
  windowMs: 60_000,
  blockMs: 5 * 60_000,
} as const;

const MAX_INLINE_CONTEXT_LENGTH = 20_000;

type SpotterMode = "workspace" | "inline";

interface SpotterChatHandlerOptions {
  route: string;
  defaultMode: SpotterMode;
  allowSession: boolean;
  exposeSessionHeader: boolean;
  rateLimitKeyPrefix: string;
  rateLimit: {
    limit: number;
    windowMs: number;
    blockMs?: number;
  };
}

const ChatBodySchema = z.object({
  id: z.string().min(1).optional(),
  messages: z.array(z.unknown()).min(1),
  mode: z.enum(["workspace", "inline"]).optional(),
  activeNoteContext: z.string().max(MAX_INLINE_CONTEXT_LENGTH).optional(),
  workspaceContext: z.string().max(MAX_INLINE_CONTEXT_LENGTH).optional(),
});

function extractTextFromUIMessage(message: UIMessage): string {
  const parts = (message as { parts?: Array<{ type: string; text?: string }> }).parts ?? [];
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n")
    .trim();
}

export async function handleSpotterChatRequest(
  req: Request,
  options: SpotterChatHandlerOptions,
) {
  const requestId = getRequestId(req);
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const rateLimit = consumeRateLimit(
      `${options.rateLimitKeyPrefix}:${userId}`,
      options.rateLimit,
    );
    if (!rateLimit.allowed) {
      logger.warn("spotter_rate_limited", {
        requestId,
        userId,
        route: options.route,
        retryAfterMs: rateLimit.retryAfterMs,
      });
      return new Response("Too many requests", {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)),
        },
      });
    }

    const rawBody = await req.json().catch(() => null);
    const parsed = ChatBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response("Invalid chat payload", { status: 400 });
    }
    const body = parsed.data;
    const uiMessages = body.messages as UIMessage[];
    const mode: SpotterMode = body.mode ?? options.defaultMode;

    let activeSessionId: string | null = null;
    if (options.allowSession && mode === "workspace") {
      if (body.id) {
        const owned = await assertSpotterSessionOwner(userId, body.id);
        if (!owned) return new Response("Session not found", { status: 404 });
        activeSessionId = owned.id;
      } else {
        const lastUserText = extractTextFromUIMessage(
          uiMessages[uiMessages.length - 1] ?? ({ parts: [] } as unknown as UIMessage),
        );
        const created = await createSpotterSession(
          userId,
          buildSpotterSessionTitle(lastUserText || "New chat"),
        );
        activeSessionId = created.id;
      }
    }

    const result = await runAgent({
      userId,
      sessionId: activeSessionId,
      mode,
      uiMessages,
      activeNoteContext: body.activeNoteContext,
      workspaceContext: body.workspaceContext,
      onUIMessagesFinalized: activeSessionId
        ? async (messages) => {
            // Persist any new messages that aren't already stored. We compare
            // against existing messages by id.
            const existing = await db.spotterMessage.findMany({
              where: { sessionId: activeSessionId },
              select: { id: true },
            });
            const existingIds = new Set(existing.map((m) => m.id));
            const newMessages = messages.filter((m) => !existingIds.has(m.id));

            for (const m of newMessages) {
              const textContent = extractTextFromUIMessage(m);
              await db.spotterMessage.create({
                data: {
                  id: m.id,
                  sessionId: activeSessionId,
                  role: m.role,
                  content: textContent,
                  parts: (m as unknown as { parts: unknown }).parts as never,
                },
              });
            }
            await touchSpotterSession(activeSessionId);
          }
        : undefined,
    });

    if (activeSessionId && options.exposeSessionHeader) {
      const headers = new Headers(result.response.headers);
      headers.set("X-Spotter-Session-Id", activeSessionId);
      return new Response(result.response.body, {
        status: result.response.status,
        statusText: result.response.statusText,
        headers,
      });
    }
    return result.response;
  } catch (error) {
    logger.error("spotter_request_failed", {
      requestId,
      route: options.route,
      error,
    });
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 });
    }
    return new Response("Unknown Spotter error.", { status: 500 });
  }
}

// Keep this exported helper to avoid breaking older callers; tools that just
// want the legacy single-shot string can derive it from the streamed response.
export { appendSpotterMessage };
