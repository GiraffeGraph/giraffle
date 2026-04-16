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
  // Real implementation: SSH → open PTY shell → run agentCommand → inject systemPrompt
  const agent = await setAgentStatus(id, "running");
  revalidatePath("/agents");
  return agent;
}

export async function stopAgentAction(id: string) {
  // Real implementation: SSH → send SIGTERM → close channel
  const agent = await setAgentStatus(id, "stopped");
  revalidatePath("/agents");
  return agent;
}
