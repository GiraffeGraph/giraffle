import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { getRequestId, logger } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";

const MAX_PROMPT_LENGTH = 4_000;
const MAX_CONTEXT_LENGTH = 20_000;

export const SPOTTER_CHAT_RATE_LIMIT = {
  limit: 12,
  windowMs: 60_000,
  blockMs: 5 * 60_000,
} as const;

type SpotterMode = "workspace" | "inline";
type SpotterPersistenceModule = typeof import("@/domain/spotter/spotter.service");

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

interface SpotterChatPayload {
  prompt?: unknown;
  context?: unknown;
  mode?: unknown;
  sessionId?: unknown;
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

    const payload = (await req.json().catch(() => ({}))) as SpotterChatPayload;
    const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
    const context = typeof payload.context === "string" ? payload.context : "";
    const mode = resolveSpotterMode(payload.mode, options.defaultMode);
    const requestedSessionId =
      typeof payload.sessionId === "string" && payload.sessionId.trim().length > 0
        ? payload.sessionId.trim()
        : null;

    if (!prompt) {
      return new Response("Prompt is required", { status: 400 });
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      return new Response("Prompt is too long", { status: 400 });
    }

    if (context.length > MAX_CONTEXT_LENGTH) {
      return new Response("Context is too long", { status: 400 });
    }

    let activeSessionId: string | null = null;
    let modelPrompt = prompt;
    let spotterPersistence: SpotterPersistenceModule | null = null;

    if (options.allowSession && mode === "workspace") {
      spotterPersistence = await import("@/domain/spotter/spotter.service");

      const spotterSession = requestedSessionId
        ? await spotterPersistence.assertSpotterSessionOwner(
            userId,
            requestedSessionId,
          )
        : await spotterPersistence.createSpotterSession(userId, prompt);

      if (!spotterSession) {
        return new Response("Session not found", { status: 404 });
      }

      activeSessionId = spotterSession.id;

      await spotterPersistence.appendSpotterMessage({
        sessionId: activeSessionId,
        role: "user",
        content: prompt,
      });
      await spotterPersistence.touchSpotterSession(activeSessionId);

      const recentMessages = await spotterPersistence.getRecentSpotterMessages(
        activeSessionId,
      );
      modelPrompt = recentMessages
        .map((message) =>
          `${message.role === "user" ? "User" : "Spotter"}: ${message.content}`,
        )
        .join("\n\n");
    }

    let openAiConfig = {
      apiKey: process.env.OPENAI_API_KEY?.trim() || null,
      baseUrl: process.env.OPENAI_BASE_URL?.trim() || null,
    } as const;

    if (!openAiConfig.apiKey && process.env.DATABASE_URL) {
      const { resolveOpenAiConfigForUser } = await import(
        "@/domain/integration/integration.service"
      );
      openAiConfig = await resolveOpenAiConfigForUser(userId);
    }

    if (!openAiConfig.apiKey) {
      return new Response("AI service is not configured", { status: 503 });
    }

    const provider = createOpenAI({
      apiKey: openAiConfig.apiKey,
      baseURL: openAiConfig.baseUrl ?? undefined,
    });

    const result = streamText({
      model: provider("gpt-4o-mini"),
      system: buildSpotterSystemPrompt({ mode, context }),
      prompt: modelPrompt,
      ...(activeSessionId && spotterPersistence
        ? {
            onFinish: async ({ text }: { text: string }) => {
              const answer = text.trim();

              if (!answer) {
                return;
              }

              await spotterPersistence.appendSpotterMessage({
                sessionId: activeSessionId,
                role: "assistant",
                content: answer,
              });
              await spotterPersistence.touchSpotterSession(activeSessionId);
              revalidatePath("/spotter");
            },
          }
        : {}),
    });

    if (activeSessionId && options.exposeSessionHeader) {
      return result.toTextStreamResponse({
        headers: {
          "X-Spotter-Session-Id": activeSessionId,
        },
      });
    }

    return result.toTextStreamResponse();
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

function resolveSpotterMode(value: unknown, fallback: SpotterMode): SpotterMode {
  if (value === "workspace" || value === "inline") {
    return value;
  }

  return fallback;
}

function buildSpotterSystemPrompt({
  mode,
  context,
}: {
  mode: SpotterMode;
  context: string;
}) {
  if (mode === "workspace") {
    return `You are Spotter inside GiraffeGraph.

Your job is to spot useful insights across the user's workspace library, including notes and folders.

Rules:
1. Be direct, useful, and concrete.
2. Organize the answer when it helps clarity.
3. Use note and folder names from the context when making suggestions.
4. Do not invent documents or structure that are not present in the context.

Workspace context:
------------------------------------------
${context}
------------------------------------------`;
  }

  return `You are Spotter inside GiraffeGraph.

You help rewrite, summarize, expand, or improve the active note content.

Important rules:
1. Return only the raw content the user asked for.
2. Do not add conversational framing.
3. Assume the output will be inserted directly into the editor.

Active note context:
------------------------------------------
${context}
------------------------------------------`;
}
