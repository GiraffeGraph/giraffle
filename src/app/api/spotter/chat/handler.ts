import { z } from "zod";
import type { UIMessage } from "ai";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRequestId, logger } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";
import { runAgent } from "@/domain/agent/loop";
import {
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
  toolIntent: z.enum(["web_search"]).optional(),
});

function extractTextFromUIMessage(message: UIMessage): string {
  const parts = (message as { parts?: Array<{ type: string; text?: string }> }).parts ?? [];
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n")
    .trim();
}

async function persistSpotterMessages(sessionId: string, messages: UIMessage[]) {
  const persistable = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      id: message.id,
      sessionId,
      role: message.role,
      content: extractTextFromUIMessage(message),
      parts: (message as unknown as { parts: unknown }).parts as never,
    }));

  if (persistable.length === 0) return;

  const updateResults = await Promise.all(
    persistable.map((message) =>
      db.spotterMessage.updateMany({
        where: { id: message.id, sessionId },
        data: {
          role: message.role,
          content: message.content,
          parts: message.parts,
        },
      }),
    ),
  );
  const missingMessages = persistable.filter((_, index) => updateResults[index]?.count === 0);
  if (missingMessages.length > 0) {
    await db.spotterMessage.createMany({
      data: missingMessages,
      skipDuplicates: true,
    });
  }
  await touchSpotterSession(sessionId);
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

    if (activeSessionId) {
      const latestUserMessage = [...uiMessages]
        .reverse()
        .find((message) => message.role === "user");
      if (latestUserMessage) {
        await persistSpotterMessages(activeSessionId, [latestUserMessage]);
      }
    }

    const result = await runAgent({
      userId,
      sessionId: activeSessionId,
      mode,
      uiMessages,
      activeNoteContext: body.activeNoteContext,
      workspaceContext: body.workspaceContext,
      toolIntent: body.toolIntent,
      onUIMessagesFinalized: activeSessionId
        ? async (messages) => {
            await persistSpotterMessages(activeSessionId, messages);
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
