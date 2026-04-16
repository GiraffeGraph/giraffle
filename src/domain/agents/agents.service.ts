import { db } from "@/lib/db";

export interface CreateAgentInput {
  label: string;
  machineId: string;
  agentType: "pi" | "claude_code" | "custom";
  agentCommand: string;
  systemPrompt?: string;
  modelConfig?: Record<string, unknown>;
}

export interface UpdateAgentInput {
  label?: string;
  machineId?: string;
  agentType?: "pi" | "claude_code" | "custom";
  agentCommand?: string;
  systemPrompt?: string;
  modelConfig?: Record<string, unknown>;
  status?: "idle" | "running" | "error" | "stopped";
}

export async function getAgents() {
  return db.agent.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      machine: { select: { id: true, label: true, host: true, status: true } },
    },
  });
}

export async function getAgentById(id: string) {
  return db.agent.findUnique({
    where: { id },
    include: {
      machine: true,
      terminalSessions: { where: { isActive: true }, take: 1 },
    },
  });
}

export async function createAgent(input: CreateAgentInput) {
  return db.agent.create({
    data: {
      label: input.label,
      machineId: input.machineId,
      agentType: input.agentType,
      agentCommand: input.agentCommand,
      systemPrompt: input.systemPrompt ?? "",
      modelConfig: (input.modelConfig ?? {}) as object,
      status: "idle",
    },
  });
}

export async function updateAgent(id: string, input: UpdateAgentInput) {
  return db.agent.update({
    where: { id },
    data: {
      ...(input.label !== undefined && { label: input.label }),
      ...(input.machineId !== undefined && { machineId: input.machineId }),
      ...(input.agentType !== undefined && { agentType: input.agentType }),
      ...(input.agentCommand !== undefined && {
        agentCommand: input.agentCommand,
      }),
      ...(input.systemPrompt !== undefined && {
        systemPrompt: input.systemPrompt,
      }),
      ...(input.modelConfig !== undefined && {
        modelConfig: input.modelConfig as object,
      }),
      ...(input.status !== undefined && { status: input.status }),
    },
  });
}

export async function deleteAgent(id: string) {
  return db.agent.delete({ where: { id } });
}

export async function setAgentStatus(
  id: string,
  status: "idle" | "running" | "error" | "stopped",
) {
  return db.agent.update({ where: { id }, data: { status } });
}
