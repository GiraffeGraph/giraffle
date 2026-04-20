"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
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
  workingDirectory?: string;
  agentIds: string[];
}) {
  const session = await createAgentSession(input);
  revalidatePath("/agents/sessions");
  return session;
}

async function serializeCookiesForInternalFetch(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join("; ");
}

async function getInternalBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function startAgentSessionAction(id: string) {
  const sessionWithAgents = await getAgentSessionById(id);
  if (!sessionWithAgents) throw new Error("Session not found");

  if (sessionWithAgents.agents.length === 0) {
    throw new Error("Session has no participating agents");
  }

  const { hasAgentChannel, runAgentShell } = await import("@/lib/ws-terminal-server");
  const workingDirectory = sessionWithAgents.workingDirectory || "";

  const startResults = await Promise.allSettled(
    sessionWithAgents.agents.map(async ({ agent }) => {
      try {
        if (hasAgentChannel(agent.id)) {
          console.log(`[startAgentSessionAction] Agent ${agent.id} already has channel`);
          return;
        }
        console.log(`[startAgentSessionAction] Starting agent ${agent.id} (${agent.label}) on machine ${agent.machine.id}`);
        await runAgentShell(agent.id, agent.machine.id, agent.agentCommand, workingDirectory);
        console.log(`[startAgentSessionAction] Agent ${agent.id} started successfully`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[startAgentSessionAction] Failed to start agent ${agent.id} (${agent.label}): ${errMsg}`);
        // Agent start failure is non-fatal — orchestrator handles errors
      }
    }),
  );

  // Log results
  startResults.forEach((result, idx) => {
    const agent = sessionWithAgents.agents[idx];
    if (result.status === "rejected") {
      console.error(`[startAgentSessionAction] Start rejected for agent ${agent?.agent.id}: ${result.reason}`);
    }
  });

  const baseUrl = await getInternalBaseUrl();
  const cookieHeader = await serializeCookiesForInternalFetch();

  const res = await fetch(`${baseUrl}/api/agents/sessions/${id}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Could not start orchestrator (${res.status}): ${body || "Unknown error"}`);
  }

  const session = await getAgentSessionById(id);
  revalidatePath("/agents/sessions");
  revalidatePath(`/agents/sessions/${id}`);
  return session;
}

export async function pauseAgentSessionAction(id: string) {
  const baseUrl = await getInternalBaseUrl();
  const cookieHeader = await serializeCookiesForInternalFetch();

  await fetch(`${baseUrl}/api/agents/sessions/${id}/start`, {
    method: "DELETE",
    headers: {
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    cache: "no-store",
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
