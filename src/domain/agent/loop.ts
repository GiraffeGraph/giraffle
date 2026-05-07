import { createOpenAI } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type ModelMessage,
  type StepResult,
  type ToolSet,
  type UIMessage,
} from "ai";
import { resolveOpenAiConfigForUser } from "@/domain/integration/integration.service";
import { recordToolAudit } from "@/domain/agent/audit";
import { buildAgentToolset, type AgentToolset } from "@/domain/agent/registry";
import { buildSystemPrompt, type SpotterMode } from "@/domain/agent/system-prompt";
import { logger } from "@/lib/logger";

const DEFAULT_MAX_STEPS = 12;
const COMPACTION_TRIGGER = 30; // messages before we trim tool results
const COMPACTION_KEEP_TAIL = 20; // most-recent count to keep verbose

export interface RunAgentInput {
  userId: string;
  sessionId: string | null;
  mode: SpotterMode;
  uiMessages: UIMessage[];
  workspaceContext?: string;
  activeNoteContext?: string;
  abortSignal?: AbortSignal;
  modelId?: string;
  onUIMessagesFinalized?: (messages: UIMessage[]) => Promise<void> | void;
}

export interface RunAgentResult {
  response: Response;
}

export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const openAiConfig = await resolveOpenAiConfigForUser(input.userId);
  const apiKey =
    openAiConfig.apiKey ||
    process.env.OPENAI_API_KEY?.trim() ||
    null;
  if (!apiKey) {
    return {
      response: new Response("AI service is not configured", { status: 503 }),
    };
  }

  const provider = createOpenAI({
    apiKey,
    baseURL: openAiConfig.baseUrl ?? process.env.OPENAI_BASE_URL?.trim() ?? undefined,
  });

  const toolset: AgentToolset = await buildAgentToolset({ userId: input.userId });

  const system = buildSystemPrompt({
    mode: input.mode,
    catalog: toolset.catalog,
    workspaceContext: input.workspaceContext,
    activeNoteContext: input.activeNoteContext,
    trailErrors: toolset.trailErrors,
  });

  const modelMessages = await convertToModelMessages(input.uiMessages);

  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    try {
      await toolset.cleanup();
    } catch (error) {
      logger.warn("agent_cleanup_failed", { userId: input.userId, error });
    }
  };

  try {
    const result = streamText({
      model: provider(input.modelId ?? "gpt-4o-mini"),
      system,
      messages: modelMessages,
      tools: toolset.tools satisfies ToolSet,
      stopWhen: stepCountIs(DEFAULT_MAX_STEPS),
      abortSignal: input.abortSignal,
      prepareStep: async ({ messages, stepNumber }) => {
        if (messages.length <= COMPACTION_TRIGGER) return {};
        const head = messages.slice(0, 1);
        const tail = messages.slice(-COMPACTION_KEEP_TAIL);
        const middle = messages.slice(1, -COMPACTION_KEEP_TAIL);
        const compacted: ModelMessage[] = middle.map((msg) => {
          if (msg.role !== "tool") return msg;
          const summary = JSON.stringify(msg.content).slice(0, 240);
          return {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId:
                  Array.isArray(msg.content) && msg.content[0] && "toolCallId" in msg.content[0]
                    ? (msg.content[0] as { toolCallId: string }).toolCallId
                    : "compacted",
                toolName: "compacted",
                output: { type: "text", value: `[truncated tool result] ${summary}` },
              },
            ],
          } as ModelMessage;
        });
        logger.info("agent_compacted_history", {
          userId: input.userId,
          stepNumber,
          before: messages.length,
          kept: head.length + compacted.length + tail.length,
        });
        return { messages: [...head, ...compacted, ...tail] };
      },
      onStepFinish: async (step: StepResult<ToolSet>) => {
        for (const call of step.toolCalls ?? []) {
          const matchingResult = step.toolResults?.find(
            (r) => r.toolCallId === call.toolCallId,
          );
          const success = matchingResult && !("error" in matchingResult && matchingResult.error);
          await recordToolAudit({
            userId: input.userId,
            sessionId: input.sessionId,
            messageId: null,
            toolName: call.toolName,
            trailId: null,
            status: success ? "success" : "error",
            input: call.input,
            output: matchingResult ? (matchingResult as { output?: unknown }).output : undefined,
            error:
              matchingResult && "error" in matchingResult
                ? String((matchingResult as { error?: unknown }).error)
                : null,
            durationMs: null,
          });
        }
      },
      onFinish: async () => {
        await cleanup();
      },
      onError: async ({ error }) => {
        logger.error("agent_stream_error", { userId: input.userId, error });
        await cleanup();
      },
    });

    return {
      response: result.toUIMessageStreamResponse({
        sendSources: false,
        sendReasoning: false,
      }),
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
