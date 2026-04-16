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
  // Real implementation: call LangGraph FastAPI sidecar POST /sessions/:id/start
  const session = await updateAgentSessionStatus(id, "running");
  revalidatePath("/agents/sessions");
  revalidatePath(`/agents/sessions/${id}`);
  return session;
}

export async function pauseAgentSessionAction(id: string) {
  // Real implementation: set paused flag in LangGraph state
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
