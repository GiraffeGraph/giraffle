/**
 * Giraffe Agents — Supervisor Orchestrator
 *
 * A LangGraph-style supervisor loop implemented directly in TypeScript
 * using the Vercel AI SDK. No Python sidecar needed.
 *
 * Architecture:
 *  1. Supervisor LLM decides which agent to delegate tasks to using tool-calling.
 *  2. Each agent tool call sends a command to the agent's running SSH shell.
 *  3. The shell output is captured and returned as the tool result.
 *  4. The loop continues until the supervisor calls `complete_session`.
 *  5. All messages (task, response, etc.) are persisted in AgentMessage table.
 *
 * Tools available to the supervisor:
 *  - delegate_task(agentId, task)  → sends task to agent's SSH shell, returns output
 *  - complete_session(summary)     → marks session done
 *  - log_thought(thought)          → records a supervisor reasoning step
 */

import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  addAgentMessage,
  updateAgentSessionStatus,
} from "@/domain/agents/agent-sessions.service";

const MAX_ITERATIONS = 32;
const AGENT_RESPONSE_TIMEOUT_MS = 180_000;

/** Capture real terminal output for up to `timeoutMs` after sending a task. */
async function captureAgentResponse(
  agentId: string,
  sinceCursor: number,
  timeoutMs = AGENT_RESPONSE_TIMEOUT_MS,
): Promise<string> {
  const { waitForAgentOutput } = await import("@/lib/ws-terminal-server");

  const delta = await waitForAgentOutput(agentId, sinceCursor, timeoutMs);

  if (!delta || !delta.text.trim()) {
    return "[No output yet]";
  }

  return delta.text.trim();
}

/** Send a task string to an agent's running SSH shell. */
async function sendTaskToAgent(
  agentId: string,
  machineId: string,
  task: string,
): Promise<void> {
  const { sendToAgentChannel } = await import("@/lib/ws-terminal-server");

  // If there's a live agent shell, send directly to its stdin
  const wroteToLiveShell = sendToAgentChannel(agentId, task);

  if (wroteToLiveShell) {
    return;
  }

  // Fallback: persist task in temp file for manual/agent-side polling.
  try {
    const { sshExec } = await import("@/lib/ssh-manager");
    const taskFile = `/tmp/giraffe_task_${agentId.replace(/-/g, "_")}.in`;
    await sshExec(machineId, `echo ${JSON.stringify(task)} > ${taskFile}`);
  } catch {
    // ignore
  }
}

export interface RunSupervisorOptions {
  sessionId: string;
  /** Abort signal — set when user pauses the session. */
  signal?: AbortSignal;
}

/**
 * Run the full supervisor orchestration loop for a session.
 * This is a long-running async function — call it in a background context
 * (e.g., from an API route with `void runSupervisor(...)` after returning 202).
 */
export async function runSupervisor({ sessionId, signal }: RunSupervisorOptions) {
  // Load session + agents
  const session = await db.agentSession.findUnique({
    where: { id: sessionId },
    include: {
      agents: {
        include: {
          agent: {
            include: {
              machine: { select: { id: true, label: true, host: true } },
            },
          },
        },
      },
    },
  });

  if (!session) throw new Error(`Session ${sessionId} not found`);

  // Mark as running
  await updateAgentSessionStatus(sessionId, "running");

  // Build agent registry for the supervisor
  const agentRegistry = session.agents.map(({ agent }) => ({
    id: agent.id,
    label: agent.label,
    agentType: agent.agentType,
    machineHost: agent.machine.host,
    machineLabel: agent.machine.label,
    machineId: agent.machine.id,
    systemPrompt: agent.systemPrompt,
    agentCommand: agent.agentCommand,
  }));

  // Log initial supervisor context
  await addAgentMessage({
    sessionId,
    role: "system",
    content: buildSupervisorSystemPrompt(session.goal, agentRegistry),
    messageType: "log",
  });

  // Tool definitions
  const delegateTaskTool = tool({
    description:
      "Delegate a specific coding task to one of the registered agents. " +
      "The agent will execute the task in its SSH terminal and return the output.",
    inputSchema: z.object({
      agentId: z
        .string()
        .describe("The ID of the agent to delegate the task to"),
      task: z
        .string()
        .describe(
          "A clear, specific task description for the agent. Include context and expected output format.",
        ),
      expectedOutput: z
        .string()
        .optional()
        .describe("What you expect the agent to return"),
    }),
    execute: async ({ agentId, task, expectedOutput }) => {
      if (signal?.aborted) return "Session was paused.";

      const agentInfo = agentRegistry.find((a) => a.id === agentId);
      if (!agentInfo) return `Agent ${agentId} not found in this session.`;

      // Log the delegation
      await addAgentMessage({
        sessionId,
        fromAgentId: null,
        toAgentId: agentId,
        role: "user",
        content: task,
        messageType: "task",
        metadata: { expectedOutput },
      });

      const { getAgentOutputCursor } = await import("@/lib/ws-terminal-server");
      const cursorBeforeTask = getAgentOutputCursor(agentId);

      // Send task to agent
      await sendTaskToAgent(agentId, agentInfo.machineId, task);

      // Capture response
      const response = await captureAgentResponse(agentId, cursorBeforeTask);

      // Log the response
      await addAgentMessage({
        sessionId,
        fromAgentId: agentId,
        toAgentId: null,
        role: "assistant",
        content: response,
        messageType: "response",
      });

      return response;
    },
  });

  const completeSessionTool = tool({
    description:
      "Mark the session as complete when the overall goal has been achieved. " +
      "Provide a comprehensive summary of what was accomplished.",
    inputSchema: z.object({
      summary: z.string().describe("Summary of what was accomplished"),
      deliverables: z
        .array(z.string())
        .optional()
        .describe("List of concrete deliverables produced"),
    }),
    execute: async ({ summary, deliverables }) => {
      await addAgentMessage({
        sessionId,
        role: "assistant",
        content: summary,
        messageType: "done",
        metadata: { deliverables },
      });

      await updateAgentSessionStatus(sessionId, "completed");
      return "Session marked as complete.";
    },
  });

  const logThoughtTool = tool({
    description:
      "Record a supervisor reasoning step or observation without delegating to an agent. " +
      "Use this to explain your planning process.",
    inputSchema: z.object({
      thought: z.string().describe("The supervisor's reasoning or observation"),
    }),
    execute: async ({ thought }) => {
      await addAgentMessage({
        sessionId,
        role: "system",
        content: thought,
        messageType: "log",
      });
      return "Thought logged.";
    },
  });

  // Build initial conversation
  const messages: ModelMessage[] = [
    {
      role: "user",
      content: `Your goal: ${session.goal}\n\nBegin orchestrating the agents to achieve this goal.`,
    },
  ];

  let iterations = 0;
  let sessionDone = false;

  // Main supervisor loop
  while (!sessionDone && iterations < MAX_ITERATIONS) {
    if (signal?.aborted) {
      await updateAgentSessionStatus(sessionId, "pending");
      break;
    }

    iterations++;

    try {
      const result = await generateText({
        model: openai(session.supervisorModel ?? "gpt-4o"),
        system: buildSupervisorSystemPrompt(session.goal, agentRegistry),
        messages,
        tools: {
          delegate_task: delegateTaskTool,
          complete_session: completeSessionTool,
          log_thought: logThoughtTool,
        },
        stopWhen: stepCountIs(1), // one step per outer loop iteration for observability
        temperature: 0.2,
      });

      // Append model/tool messages returned by this generation step.
      messages.push(...result.response.messages);

      // Check if session was completed via tool
      const completeCalled = result.toolCalls?.some(
        (call) => call.toolName === "complete_session",
      );

      if (completeCalled) {
        sessionDone = true;
        break;
      }

      // If no tool calls were made, the supervisor finished without completing
      if (!result.toolCalls || result.toolCalls.length === 0) {
        // Nudge the supervisor
        messages.push({
          role: "user",
          content:
            "Continue. Either delegate more tasks to agents or call complete_session if the goal is achieved.",
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await addAgentMessage({
        sessionId,
        role: "system",
        content: `Supervisor error at iteration ${iterations}: ${message}`,
        messageType: "error",
      });

      await updateAgentSessionStatus(sessionId, "failed");
      break;
    }
  }

  // If hit max iterations without completion
  if (!sessionDone && iterations >= MAX_ITERATIONS && !signal?.aborted) {
    await addAgentMessage({
      sessionId,
      role: "system",
      content: `Session stopped after reaching maximum iterations (${MAX_ITERATIONS}).`,
      messageType: "log",
    });
    await updateAgentSessionStatus(sessionId, "failed");
  }
}

function buildSupervisorSystemPrompt(
  goal: string,
  agents: Array<{
    id: string;
    label: string;
    agentType: string;
    machineHost: string;
    machineLabel: string;
    systemPrompt: string;
    agentCommand: string;
  }>,
): string {
  const agentDescriptions = agents
    .map(
      (a) =>
        `- Agent ID: ${a.id}\n  Label: ${a.label}\n  Type: ${a.agentType}\n  Machine: ${a.machineLabel} (${a.machineHost})\n  Command: ${a.agentCommand}\n  Role: ${a.systemPrompt || "General purpose coding agent"}`,
    )
    .join("\n\n");

  return `You are a supervisor AI orchestrating a team of specialized coding agents to achieve a goal.

## Your Goal
${goal}

## Available Agents
${agentDescriptions}

## Instructions
1. Break down the goal into specific, actionable tasks.
2. Delegate each task to the most suitable agent using \`delegate_task\`.
3. Review the agent's output and decide the next step.
4. Use \`log_thought\` to record important decisions or observations.
5. When the goal is fully achieved, call \`complete_session\` with a summary.
6. Be methodical — verify each step before proceeding.
7. If an agent returns an error, retry with a clearer instruction or delegate to a different agent.

## Rules
- Never assume a task is done without seeing the agent's output.
- Keep tasks small and verifiable.
- One delegation at a time for maximum observability.
- Always call complete_session when done — never leave the session running.`;
}
