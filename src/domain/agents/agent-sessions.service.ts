import { db } from "@/lib/db";

export interface CreateAgentSessionInput {
  label: string;
  goal: string;
  supervisorModel?: string;
  workingDirectory?: string;
  agentIds: string[];
}

export interface CreateAgentMessageInput {
  sessionId: string;
  fromAgentId?: string | null;
  toAgentId?: string | null;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  messageType: "task" | "response" | "agent_message" | "done" | "error" | "log";
  metadata?: Record<string, unknown>;
}

export async function getAgentSessions() {
  return db.agentSession.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      agents: {
        include: {
          agent: { select: { id: true, label: true, status: true } },
        },
      },
      _count: { select: { messages: true } },
    },
  });
}

export async function getAgentSessionById(id: string) {
  return db.agentSession.findUnique({
    where: { id },
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
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          fromAgent: { select: { id: true, label: true } },
          toAgent: { select: { id: true, label: true } },
        },
      },
      terminals: {
        select: { id: true, agentId: true, wsChannel: true, isActive: true },
      },
    },
  });
}

export async function createAgentSession(input: CreateAgentSessionInput) {
  return db.agentSession.create({
    data: {
      label: input.label,
      goal: input.goal,
      supervisorModel: input.supervisorModel ?? process.env.ORCHESTRATOR_MODEL ?? "gpt-4o",
      workingDirectory: input.workingDirectory ?? "",
      status: "pending",
      agents: {
        create: input.agentIds.map((agentId) => ({ agentId })),
      },
    },
  });
}

export async function updateAgentSessionStatus(
  id: string,
  status: "pending" | "running" | "completed" | "failed",
) {
  return db.agentSession.update({
    where: { id },
    data: {
      status,
      ...(["completed", "failed"].includes(status) && { endedAt: new Date() }),
    },
  });
}

export async function updateAgentSessionPlan(id: string, plan: unknown[]) {
  return db.agentSession.update({
    where: { id },
    data: { plan: plan as object[] },
  });
}

export async function deleteAgentSession(id: string) {
  return db.agentSession.delete({ where: { id } });
}

export async function addAgentMessage(input: CreateAgentMessageInput) {
  return db.agentMessage.create({
    data: {
      sessionId: input.sessionId,
      fromAgentId: input.fromAgentId ?? null,
      toAgentId: input.toAgentId ?? null,
      role: input.role,
      content: input.content,
      messageType: input.messageType,
      metadata: (input.metadata ?? {}) as object,
    },
  });
}

export async function getSessionMessages(sessionId: string) {
  return db.agentMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    include: {
      fromAgent: { select: { id: true, label: true } },
      toAgent: { select: { id: true, label: true } },
    },
  });
}
