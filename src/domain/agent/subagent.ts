import { createOpenAI } from "@ai-sdk/openai";
import { generateText, stepCountIs, type ToolSet } from "ai";
import { resolveOpenAiConfigForUser } from "@/domain/integration/integration.service";
import { logger } from "@/lib/logger";
import { buildAgentToolset, type AgentToolset } from "@/domain/agent/registry";

export interface RunSubagentInput {
  userId: string;
  prompt: string;
  allowedToolNames?: string[];
  modelId?: string;
}

export interface RunSubagentResult {
  text: string;
  toolCallCount: number;
  durationMs: number;
  steps: number;
}

const SUBAGENT_MAX_STEPS = 6;

function filterToolset(toolset: AgentToolset, allowed?: string[]): ToolSet {
  const all = toolset.tools;
  const next: ToolSet = {};
  // Always exclude `delegate` to prevent recursive subagent spawning.
  for (const [name, def] of Object.entries(all)) {
    if (name === "delegate") continue;
    if (allowed && allowed.length > 0 && !allowed.includes(name)) continue;
    next[name] = def;
  }
  return next;
}

export async function runSubagent(input: RunSubagentInput): Promise<RunSubagentResult> {
  const start = Date.now();
  const config = await resolveOpenAiConfigForUser(input.userId);
  const apiKey = config.apiKey;
  if (!apiKey) {
    throw new Error("AI service is not configured");
  }
  const provider = createOpenAI({
    apiKey,
    baseURL: config.baseUrl ?? undefined,
  });
  const toolset = await buildAgentToolset({ userId: input.userId });
  const tools = filterToolset(toolset, input.allowedToolNames);
  let toolCallCount = 0;

  try {
    const result = await generateText({
      model: provider(input.modelId ?? "gpt-5.4-mini"),
      tools,
      stopWhen: stepCountIs(SUBAGENT_MAX_STEPS),
      system:
        "You are a focused sub-agent invoked by Spotter to complete one specific task. " +
        "Use the available tools to do the work, then return a concise summary as plain text. " +
        "Do not ask follow-up questions. Do not call the delegate tool. Stop as soon as you have an answer.",
      prompt: input.prompt,
      onStepFinish: (step) => {
        toolCallCount += step.toolCalls?.length ?? 0;
      },
    });
    return {
      text: result.text,
      toolCallCount,
      durationMs: Date.now() - start,
      steps: result.steps?.length ?? 0,
    };
  } catch (error) {
    logger.warn("subagent_failed", { userId: input.userId, error });
    throw error;
  } finally {
    await toolset.cleanup();
  }
}
