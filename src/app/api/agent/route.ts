import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { prompt, context, mode } = await req.json();
    const system = buildSystemPrompt({
      mode: mode === "workspace" ? "workspace" : "inline",
      context: typeof context === "string" ? context : "",
    });

    const result = streamText({
      model: openai("gpt-4o-mini"),
      system,
      prompt: typeof prompt === "string" ? prompt : "",
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("AI Stream Error:", error);

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
