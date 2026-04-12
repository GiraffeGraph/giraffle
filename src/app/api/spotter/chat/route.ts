import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  appendSpotterMessage,
  assertSpotterSessionOwner,
  createSpotterSession,
  getRecentSpotterMessages,
  touchSpotterSession,
} from "@/domain/spotter/spotter.service";

export const maxDuration = 30;

const MAX_PROMPT_LENGTH = 4_000;
const MAX_CONTEXT_LENGTH = 20_000;
const SPOTTER_RATE_LIMIT = {
  limit: 12,
  windowMs: 60_000,
  blockMs: 5 * 60_000,
} as const;

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }

    const rateLimit = consumeRateLimit(`spotter:${userId}`, SPOTTER_RATE_LIMIT);

    if (!rateLimit.allowed) {
      return new Response("Too many requests", {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)),
        },
      });
    }

    const body = await req.json();
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const context = typeof body.context === "string" ? body.context : "";
    const requestedSessionId =
      typeof body.sessionId === "string" && body.sessionId.trim()
        ? body.sessionId.trim()
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

    const spotterSession = requestedSessionId
      ? await assertSpotterSessionOwner(userId, requestedSessionId)
      : await createSpotterSession(userId, prompt);

    if (!spotterSession) {
      return new Response("Session not found", { status: 404 });
    }

    await appendSpotterMessage({
      sessionId: spotterSession.id,
      role: "user",
      content: prompt,
    });
    await touchSpotterSession(spotterSession.id);

    const recentMessages = await getRecentSpotterMessages(spotterSession.id);
    const transcript = recentMessages
      .map((message) =>
        `${message.role === "user" ? "Kullanıcı" : "Spotter"}: ${message.content}`
      )
      .join("\n\n");

    const result = streamText({
      model: openai("gpt-4o-mini"),
      system: buildWorkspaceSystemPrompt(context),
      prompt: transcript,
      onFinish: async ({ text }) => {
        const answer = text.trim();

        if (!answer) {
          return;
        }

        await appendSpotterMessage({
          sessionId: spotterSession.id,
          role: "assistant",
          content: answer,
        });
        await touchSpotterSession(spotterSession.id);
        revalidatePath("/spotter");
      },
    });

    return result.toTextStreamResponse({
      headers: {
        "X-Spotter-Session-Id": spotterSession.id,
      },
    });
  } catch (error) {
    console.error("Spotter chat error", error);

    if (error instanceof Error) {
      return new Response(error.message, { status: 500 });
    }

    return new Response("Unknown Spotter error.", { status: 500 });
  }
}

function buildWorkspaceSystemPrompt(context: string) {
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
