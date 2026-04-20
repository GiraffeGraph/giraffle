/**
 * Giraffe Orchestrator — LangGraph State Machine
 *
 * Architecture: Smart Orchestrator, Dumb Agents
 *
 * Agents are terminal sessions. Giraffle doesn't set their model or system prompt —
 * those are configured inside the CLI tool itself. The orchestrator's only job:
 * send the right prompt to the right terminal at the right time.
 *
 * Flow:
 *   START → planner → runStep (loop) → END
 *
 * planner: LLM breaks the goal into ordered steps (which agent, what task).
 * runStep:
 *   1. Send task + handoff note from previous agent to current agent's terminal.
 *   2. Poll tmux capture-pane until the agent's idle marker appears.
 *   3. If more steps remain: prompt agent for a handoff note in [HANDOFF_START]...[HANDOFF_END].
 *      Wait for idle again, capture the note.
 *   4. Advance to next step or END.
 */

import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  addAgentMessage,
  updateAgentSessionStatus,
  updateAgentSessionPlan,
} from "@/domain/agents/agent-sessions.service";

const IDLE_TIMEOUT_MS = 300_000; // 5 min max per agent step
const HANDOFF_TIMEOUT_MS = 120_000; // 2 min for handoff note

// ─── State ────────────────────────────────────────────────────────────────────

export interface PlanStep {
  agentId: string;
  agentLabel: string;
  task: string;
  status: "pending" | "executing" | "done" | "failed";
  handoffNote: string;
}

interface AgentInfo {
  id: string;
  label: string;
  agentType: string;
  machineId: string;
  machineLabel: string;
  idleMarker: string;
  agentCommand: string;
}

const OrchestratorState = Annotation.Root({
  sessionId: Annotation<string>(),
  goal: Annotation<string>(),
  workingDirectory: Annotation<string>(),
  supervisorModel: Annotation<string>(),
  agentRegistry: Annotation<AgentInfo[]>({ reducer: (_, y) => y, default: () => [] }),
  plan: Annotation<PlanStep[]>({ reducer: (_, y) => y, default: () => [] }),
  currentStepIndex: Annotation<number>({ reducer: (_, y) => y, default: () => 0 }),
  handoffPayload: Annotation<string>({ reducer: (_, y) => y, default: () => "" }),
  phase: Annotation<string>({ reducer: (_, y) => y, default: () => "planning" }),
  aborted: Annotation<boolean>({ reducer: (_, y) => y, default: () => false }),
  error: Annotation<string>({ reducer: (_, y) => y, default: () => "" }),
});

type OState = typeof OrchestratorState.State;

// ─── Planner node ─────────────────────────────────────────────────────────────

async function plannerNode(state: OState): Promise<Partial<OState>> {
  const { sessionId, goal, agentRegistry, workingDirectory, supervisorModel } = state;

  await addAgentMessage({
    sessionId,
    role: "system",
    content: `Planning session. Goal: ${goal}${workingDirectory ? `\nWorking directory: ${workingDirectory}` : ""}`,
    messageType: "log",
  });

  const agentDescriptions = agentRegistry
    .map((a) => `- ID: ${a.id}, Label: "${a.label}", Command: ${a.agentCommand}`)
    .join("\n");

  const { text } = await generateText({
    model: openai(supervisorModel || "gpt-4o"),
    system: `You are an orchestrator that plans tasks for AI coding agents running in terminals.
Each agent is a CLI coding tool (Claude Code, Aider, etc.) already configured with its own model and settings.
Your job: break the goal into ordered steps and assign each step to the right agent.`,
    prompt: `Goal: ${goal}
${workingDirectory ? `Working directory: ${workingDirectory}` : ""}

Available agents:
${agentDescriptions}

Return a JSON array of steps. Each step:
{ "agentId": "<id>", "agentLabel": "<label>", "task": "<clear task description>" }

Return ONLY a raw JSON array. No markdown fences, no backticks, no commentary. Start your response with [ and end with ].`,
    temperature: 0.1,
  });

  let plan: PlanStep[] = [];
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as Array<{
      agentId: string;
      agentLabel: string;
      task: string;
    }>;
    plan = parsed.map((step) => ({
      agentId: step.agentId,
      agentLabel: step.agentLabel,
      task: step.task,
      status: "pending" as const,
      handoffNote: "",
    }));
  } catch {
    await addAgentMessage({
      sessionId,
      role: "system",
      content: `Planner returned invalid JSON. Raw: ${text}`,
      messageType: "error",
    });
    return { phase: "failed", error: "Invalid plan JSON from planner" };
  }

  if (plan.length === 0) {
    return { phase: "failed", error: "Planner returned empty plan" };
  }

  await updateAgentSessionPlan(sessionId, plan);

  await addAgentMessage({
    sessionId,
    role: "system",
    content: `Plan created with ${plan.length} step(s):\n${plan.map((s, i) => `${i + 1}. [${s.agentLabel}] ${s.task}`).join("\n")}`,
    messageType: "log",
  });

  return { plan, currentStepIndex: 0, phase: "executing", handoffPayload: "" };
}

// ─── runStep node ─────────────────────────────────────────────────────────────

async function runStepNode(state: OState): Promise<Partial<OState>> {
  const { sessionId, plan, currentStepIndex, handoffPayload, agentRegistry } = state;

  if (currentStepIndex >= plan.length) {
    return { phase: "done" };
  }

  const step = plan[currentStepIndex];
  const agent = agentRegistry.find((a) => a.id === step.agentId);

  if (!agent) {
    const updatedPlan = [...plan];
    updatedPlan[currentStepIndex] = { ...step, status: "failed" };
    await addAgentMessage({
      sessionId,
      role: "system",
      content: `Step ${currentStepIndex + 1} failed: agent ${step.agentId} not found.`,
      messageType: "error",
    });
    return { plan: updatedPlan, phase: "failed", error: `Agent ${step.agentId} not found` };
  }

  // Mark step as executing
  const updatedPlan = [...plan];
  updatedPlan[currentStepIndex] = { ...step, status: "executing" };
  await updateAgentSessionPlan(sessionId, updatedPlan);

  // Build task message (include handoff from previous agent)
  const taskMessage = handoffPayload
    ? `Previous agent's handoff note:\n${handoffPayload}\n\n---\nYour task: ${step.task}`
    : step.task;

  await addAgentMessage({
    sessionId,
    toAgentId: agent.id,
    role: "user",
    content: taskMessage,
    messageType: "task",
  });

  // Send task to agent's terminal
  const { sendToAgentInput, waitForIdleMarker, extractHandoffNote, captureTmuxPane } =
    await import("@/lib/ws-terminal-server");

  const sent = await sendToAgentInput(agent.id, taskMessage);
  if (!sent) {
    const errorMsg = `Failed to send task to agent ${agent.label} (${agent.id}). Agent runtime or tmux session may not be initialized.`;
    console.error(`[orchestrator] ${errorMsg}`);
    await addAgentMessage({
      sessionId,
      role: "system",
      content: errorMsg,
      messageType: "error",
    });
    updatedPlan[currentStepIndex] = { ...step, status: "failed" };
    await updateAgentSessionPlan(sessionId, updatedPlan);
    return { plan: updatedPlan, phase: "failed", error: errorMsg };
  }

  await addAgentMessage({
    sessionId,
    role: "system",
    content: `Waiting for ${agent.label} to complete (idle marker: "${agent.idleMarker}")…`,
    messageType: "log",
  });

  // Wait for agent to become idle
  const isIdle = await waitForIdleMarker(agent.id, agent.idleMarker, IDLE_TIMEOUT_MS);

  if (!isIdle) {
    updatedPlan[currentStepIndex] = { ...step, status: "failed" };
    await addAgentMessage({
      sessionId,
      fromAgentId: agent.id,
      role: "system",
      content: `${agent.label} timed out after ${IDLE_TIMEOUT_MS / 1000}s.`,
      messageType: "error",
    });
    return { plan: updatedPlan, phase: "failed", error: `Agent ${agent.label} timed out` };
  }

  // Capture what the agent did
  const agentOutput = await captureTmuxPane(agent.id, 100);

  await addAgentMessage({
    sessionId,
    fromAgentId: agent.id,
    role: "assistant",
    content: agentOutput || "[no terminal output captured]",
    messageType: "response",
  });

  const isLastStep = currentStepIndex === plan.length - 1;

  // Request handoff note if there are more steps
  let newHandoffPayload = "";
  if (!isLastStep) {
    const nextStep = plan[currentStepIndex + 1];
    const handoffPrompt =
      `I am now handing over to ${nextStep.agentLabel} for the next task: "${nextStep.task}". ` +
      `Please write a concise handoff note summarizing what you did and any relevant context for the next agent. ` +
      `Wrap your response in [HANDOFF_START] and [HANDOFF_END] tags.`;

    await sendToAgentInput(agent.id, handoffPrompt);

    await addAgentMessage({
      sessionId,
      toAgentId: agent.id,
      role: "user",
      content: handoffPrompt,
      messageType: "agent_message",
    });

    // Wait for agent to write handoff note
    await waitForIdleMarker(agent.id, agent.idleMarker, HANDOFF_TIMEOUT_MS);
    newHandoffPayload = await extractHandoffNote(agent.id);

    if (newHandoffPayload) {
      await addAgentMessage({
        sessionId,
        fromAgentId: agent.id,
        role: "assistant",
        content: `Handoff note:\n${newHandoffPayload}`,
        messageType: "agent_message",
      });
    }
  }

  // Mark step done
  updatedPlan[currentStepIndex] = { ...step, status: "done", handoffNote: newHandoffPayload };
  await updateAgentSessionPlan(sessionId, updatedPlan);

  const nextIndex = currentStepIndex + 1;

  if (isLastStep) {
    await addAgentMessage({
      sessionId,
      role: "assistant",
      content: `All ${plan.length} step(s) completed successfully.`,
      messageType: "done",
    });
    return { plan: updatedPlan, currentStepIndex: nextIndex, phase: "done" };
  }

  return {
    plan: updatedPlan,
    currentStepIndex: nextIndex,
    handoffPayload: newHandoffPayload,
    phase: "executing",
  };
}

// ─── Route edges ──────────────────────────────────────────────────────────────

function routeAfterPlanner(state: OState): "runStep" | typeof END {
  if (state.phase === "failed" || state.plan.length === 0) return END;
  return "runStep";
}

function routeAfterStep(state: OState): "runStep" | typeof END {
  if (state.phase === "done" || state.phase === "failed" || state.aborted) return END;
  return "runStep";
}

// ─── Graph ────────────────────────────────────────────────────────────────────

const graph = new StateGraph(OrchestratorState)
  .addNode("planner", plannerNode)
  .addNode("runStep", runStepNode)
  .addEdge(START, "planner")
  .addConditionalEdges("planner", routeAfterPlanner)
  .addConditionalEdges("runStep", routeAfterStep);

const orchestratorGraph = graph.compile();

// ─── Public entry point ───────────────────────────────────────────────────────

export interface RunOrchestratorOptions {
  sessionId: string;
  signal?: AbortSignal;
}

export async function runOrchestrator({ sessionId, signal }: RunOrchestratorOptions) {
  const session = await db.agentSession.findUnique({
    where: { id: sessionId },
    include: {
      agents: {
        include: {
          agent: {
            include: { machine: { select: { id: true, label: true, host: true } } },
          },
        },
      },
    },
  });

  if (!session) throw new Error(`Session ${sessionId} not found`);

  await updateAgentSessionStatus(sessionId, "running");

  const agentRegistry: AgentInfo[] = session.agents.map(({ agent }) => ({
    id: agent.id,
    label: agent.label,
    agentType: agent.agentType,
    machineId: agent.machine.id,
    machineLabel: agent.machine.label,
    idleMarker: agent.idleMarker,
    agentCommand: agent.agentCommand,
  }));

  const initialState: OState = {
    sessionId,
    goal: session.goal,
    workingDirectory: session.workingDirectory,
    supervisorModel: session.supervisorModel,
    agentRegistry,
    plan: [],
    currentStepIndex: 0,
    handoffPayload: "",
    phase: "planning",
    aborted: false,
    error: "",
  };

  try {
    const finalState = await orchestratorGraph.invoke(initialState, {
      recursionLimit: 64,
      signal,
    });

    if (finalState.phase === "done") {
      await updateAgentSessionStatus(sessionId, "completed");
    } else if (finalState.phase === "failed") {
      await addAgentMessage({
        sessionId,
        role: "system",
        content: `Session failed: ${finalState.error || "unknown error"}`,
        messageType: "error",
      });
      await updateAgentSessionStatus(sessionId, "failed");
    }
  } catch (err) {
    if (signal?.aborted) {
      await updateAgentSessionStatus(sessionId, "pending");
      return;
    }

    const message = err instanceof Error ? err.message : String(err);
    await addAgentMessage({
      sessionId,
      role: "system",
      content: `Orchestrator crashed: ${message}`,
      messageType: "error",
    });
    await updateAgentSessionStatus(sessionId, "failed");
  }
}

// ─── Plan-step schema for external validation ─────────────────────────────────

export const PlanStepSchema = z.object({
  agentId: z.string(),
  agentLabel: z.string(),
  task: z.string(),
  status: z.enum(["pending", "executing", "done", "failed"]).default("pending"),
  handoffNote: z.string().default(""),
});
