import { auth } from "@/lib/auth";
import { getAgentSessionById } from "@/domain/agents/agent-sessions.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const data = await getAgentSessionById(id);

  if (!data) {
    return new Response("Session not found", { status: 404 });
  }

  const payload = {
    ...data,
    createdAt: data.createdAt.toISOString(),
    updatedAt: data.updatedAt.toISOString(),
    endedAt: data.endedAt?.toISOString() ?? null,
    agents: data.agents.map((sa) => ({
      ...sa,
      agent: {
        ...sa.agent,
        createdAt: sa.agent.createdAt.toISOString(),
        updatedAt: sa.agent.updatedAt.toISOString(),
      },
    })),
    messages: data.messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
  };

  return Response.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
