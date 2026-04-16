"use server";

import { revalidatePath } from "next/cache";
import {
  createAgentSession,
  deleteAgentSession,
  getAgentSessionById,
  getAgentSessions,
  updateAgentSessionStatus,
} from "@/domain/agents/agent-sessions.service";

export async function getAgentSessionsAction() {
  return getAgentSessions();
}

export async function getAgentSessionByIdAction(id: string) {
  return getAgentSessionById(id);
}

export async function createAgentSessionAction(input: {
  label: string;
  goal: string;
  supervisorModel?: string;
  agentIds: string[];
}) {
  const session = await createAgentSession(input);
  revalidatePath("/agents/sessions");
  return session;
}

export async function startAgentSessionAction(id: string) {
  // 1. Start all agents in the session on their machines
  const sessionWithAgents = await getAgentSessionById(id);
  if (!sessionWithAgents) throw new Error("Session not found");

  // Start each agent's SSH shell with their command
  await Promise.allSettled(
    sessionWithAgents.agents.map(async ({ agent }) => {
      try {
        const { sshOpenShell } = await import("@/lib/ssh-manager");
        const { broadcastToAgent } = await import("@/lib/ws-terminal-server");
        const channel = await sshOpenShell(agent.machine.id);
        // Pipe SSH output → WebSocket clients
        channel.on("data", (data: Buffer) =>
          broadcastToAgent(agent.id, data.toString("utf-8")),
        );
        if (agent.systemPrompt?.trim()) {
          channel.write(
            `export AGENT_SYSTEM_PROMPT=${JSON.stringify(agent.systemPrompt)}\n`,
          );
        }
        channel.write(agent.agentCommand + "\n");
      } catch {
        // Agent start failure is non-fatal — supervisor will handle errors
      }
    }),
  );

  // 2. Mark running in DB
  const session = await updateAgentSessionStatus(id, "running");

  // 3. Start the supervisor loop via API route (fire-and-forget, runs in background)
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  void fetch(`${baseUrl}/api/agents/sessions/${id}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  }).catch(() => undefined); // non-blocking

  revalidatePath("/agents/sessions");
  revalidatePath(`/agents/sessions/${id}`);
  return session;
}

export async function pauseAgentSessionAction(id: string) {
  // Abort the running supervisor loop
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  void fetch(`${baseUrl}/api/agents/sessions/${id}/start`, {
    method: "DELETE",
  }).catch(() => undefined);

  const session = await updateAgentSessionStatus(id, "pending");
  revalidatePath(`/agents/sessions/${id}`);
  return session;
}

export async function completeAgentSessionAction(id: string) {
  const session = await updateAgentSessionStatus(id, "completed");
  revalidatePath("/agents/sessions");
  revalidatePath(`/agents/sessions/${id}`);
  return session;
}

export async function deleteAgentSessionAction(id: string) {
  await deleteAgentSession(id);
  revalidatePath("/agents/sessions");
}
