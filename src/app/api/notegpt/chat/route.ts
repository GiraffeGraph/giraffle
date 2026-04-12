import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import {
  appendNoteGptMessage,
  assertNoteGptSessionOwner,
  createNoteGptSession,
  getRecentNoteGptMessages,
  touchNoteGptSession,
} from "@/domain/notegpt/notegpt.service";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
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

    const noteGptSession = requestedSessionId
      ? await assertNoteGptSessionOwner(userId, requestedSessionId)
      : await createNoteGptSession(userId, prompt);

    if (!noteGptSession) {
      return new Response("Session not found", { status: 404 });
    }

    await appendNoteGptMessage({
      sessionId: noteGptSession.id,
      role: "user",
      content: prompt,
    });
    await touchNoteGptSession(noteGptSession.id);

    const recentMessages = await getRecentNoteGptMessages(noteGptSession.id);
    const transcript = recentMessages
      .map((message) =>
        `${message.role === "user" ? "Kullanıcı" : "NoteGPT"}: ${message.content}`
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

        await appendNoteGptMessage({
          sessionId: noteGptSession.id,
          role: "assistant",
          content: answer,
        });
        await touchNoteGptSession(noteGptSession.id);
        revalidatePath("/notegpt");
      },
    });

    return result.toTextStreamResponse({
      headers: {
        "X-NoteGPT-Session-Id": noteGptSession.id,
      },
    });
  } catch (error) {
    console.error("NoteGPT chat error", error);

    if (error instanceof Error) {
      return new Response(error.message, { status: 500 });
    }

    return new Response("Unknown NoteGPT error.", { status: 500 });
  }
}

function buildWorkspaceSystemPrompt(context: string) {
  return `You are NoteGPT inside GiraffeGraph.

Your job is to help the user reason across their workspace library, including notes and folders.

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
