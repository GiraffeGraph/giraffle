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
  agentType: "pi" | "claude_code" | "custom";
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
    agentType?: "pi" | "claude_code" | "custom";
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
    const { sendToAgentChannel, closeAgentChannel } = await import(
      "@/lib/ws-terminal-server"
    );
    const { sshOpenShell } = await import("@/lib/ssh-manager");

    // Close any existing channel first
    closeAgentChannel(id);

    // Open new shell on the machine
    const channel = await sshOpenShell(agent.machine.id);

    // Inject system prompt via stdin if non-empty, then run the agent command
    if (agent.systemPrompt?.trim()) {
      // Write the command that sets env var with system prompt
      channel.write(`export AGENT_SYSTEM_PROMPT=${JSON.stringify(agent.systemPrompt)}\n`);
    }
    channel.write(agent.agentCommand + "\n");

    // Store channel reference in ws-terminal-server's map
    const { broadcastToAgent } = await import("@/lib/ws-terminal-server");
    channel.on("data", (data: Buffer) => broadcastToAgent(id, data.toString("utf-8")));
    channel.on("close", () => {
      void setAgentStatus(id, "stopped");
    });
    sendToAgentChannel; // ref so TS doesn't warn

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
    const { closeAgentChannel } = await import("@/lib/ws-terminal-server");
    closeAgentChannel(id);
  } catch {
    // ignore
  }

  const agent = await setAgentStatus(id, "stopped");
  revalidatePath("/agents");
  return agent;
}
