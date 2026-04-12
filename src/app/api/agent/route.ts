import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { auth } from "@/lib/auth";
import { getAiRuntimeEnv } from "@/lib/env.server";
import { getRequestId, logger } from "@/lib/logger";
import { consumeRateLimit } from "@/lib/rate-limit";

export const maxDuration = 30;

const MAX_PROMPT_LENGTH = 4_000;
const MAX_CONTEXT_LENGTH = 20_000;
const AGENT_RATE_LIMIT = {
  limit: 20,
  windowMs: 60_000,
  blockMs: 5 * 60_000,
} as const;

export async function POST(req: Request) {
  const requestId = getRequestId(req);

  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const rateLimit = consumeRateLimit(`agent:${userId}`, AGENT_RATE_LIMIT);

    if (!rateLimit.allowed) {
      logger.warn("agent_rate_limited", {
        requestId,
        userId,
        retryAfterMs: rateLimit.retryAfterMs,
      });

      return new Response("Too many requests", {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)),
        },
      });
    }

    const ai = getAiRuntimeEnv();

    if (!ai.apiKey) {
      return new Response("AI service is not configured", { status: 503 });
    }

    const body = await req.json();
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const context = typeof body.context === "string" ? body.context : "";
    const mode = body.mode === "workspace" ? "workspace" : "inline";

    if (!prompt) {
      return new Response("Prompt is required", { status: 400 });
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      return new Response("Prompt is too long", { status: 400 });
    }

    if (context.length > MAX_CONTEXT_LENGTH) {
      return new Response("Context is too long", { status: 400 });
    }

    const result = streamText({
      model: openai("gpt-4o-mini"),
      system: buildSystemPrompt({ mode, context }),
      prompt,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    logger.error("agent_request_failed", {
      requestId,
      route: "/api/agent",
      error,
    });

    if (error instanceof Error) {
      return new Response(error.message, { status: 500 });
    }

    return new Response("Unknown AI error.", { status: 500 });
  }
}

function buildSystemPrompt({
  mode,
  context,
}: {
  mode: "inline" | "workspace";
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

  return `You are the inline AI assistant inside GiraffeGraph.

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
