"use server";

import { revalidatePath } from "next/cache";
import {
  createAgent,
  deleteAgent,
  getAgentById,
  getAgents,
  setAgentStatus,
  updateAgent,
} from "@/domain/agents/agents.service";

export async function getAgentsAction() {
  return getAgents();
}

export async function getAgentByIdAction(id: string) {
  return getAgentById(id);
}

export async function createAgentAction(input: {
  label: string;
  machineId: string;
  agentType: "pi" | "claude_code" | "aider" | "opencode" | "codex" | "custom";
  agentCommand: string;
  systemPrompt?: string;
  modelConfig?: Record<string, unknown>;
}) {
  const agent = await createAgent(input);
  revalidatePath("/agents");
  return agent;
}

export async function updateAgentAction(
  id: string,
  input: {
    label?: string;
    machineId?: string;
    agentType?: "pi" | "claude_code" | "aider" | "opencode" | "codex" | "custom";
    agentCommand?: string;
    systemPrompt?: string;
    modelConfig?: Record<string, unknown>;
    status?: "idle" | "running" | "error" | "stopped";
  },
) {
  const agent = await updateAgent(id, input);
  revalidatePath("/agents");
  return agent;
}

export async function deleteAgentAction(id: string) {
  await deleteAgent(id);
  revalidatePath("/agents");
}

export async function startAgentAction(id: string) {
  const agent = await getAgentById(id);
  if (!agent) throw new Error("Agent not found");

  try {
    const { runAgentShell } = await import("@/lib/ws-terminal-server");

    await runAgentShell(
      id,
      agent.machine.id,
      agent.agentCommand,
      agent.systemPrompt ?? undefined,
    );
  } catch (err) {
    await setAgentStatus(id, "error");
    throw err;
  }

  const updated = await setAgentStatus(id, "running");
  revalidatePath("/agents");
  return updated;
}

export async function stopAgentAction(id: string) {
  try {
    const { stopAgentRuntime } = await import("@/lib/ws-terminal-server");
    await stopAgentRuntime(id);
  } catch {
    // ignore
  }

  const agent = await setAgentStatus(id, "stopped");
  revalidatePath("/agents");
  return agent;
}

export async function restartAgentShellAction(id: string) {
  const agent = await getAgentById(id);
  if (!agent) throw new Error("Agent not found");

  try {
    const { runAgentShell } = await import("@/lib/ws-terminal-server");
    await runAgentShell(
      id,
      agent.machine.id,
      agent.agentCommand,
      agent.systemPrompt ?? undefined,
    );
  } catch (err) {
    await setAgentStatus(id, "error");
    throw err;
  }

  const updated = await setAgentStatus(id, "running");
  revalidatePath("/agents");
  revalidatePath("/agents/sessions");
  return updated;
}

export async function clearAgentTerminalHistoryAction(id: string) {
  const { clearAgentTerminalHistory } = await import("@/lib/ws-terminal-server");
  await clearAgentTerminalHistory(id);
}
