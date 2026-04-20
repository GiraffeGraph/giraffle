import { notFound } from "next/navigation";
import { getAgentSessionById } from "@/domain/agents/agent-sessions.service";
import { SessionDetailClient } from "@/components/agents/SessionDetailClient";

interface SessionPageProps {
  params: Promise<{ id: string }>;
}

export default async function SessionPage({ params }: SessionPageProps) {
  const { id } = await params;
  const session = await getAgentSessionById(id);

  if (!session) notFound();

  // Serialize dates for client serialization boundary
  const serialized = {
    ...session,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    agents: session.agents.map((sa) => ({
      ...sa,
      agent: {
        ...sa.agent,
        createdAt: sa.agent.createdAt.toISOString(),
        updatedAt: sa.agent.updatedAt.toISOString(),
      },
    })),
    messages: session.messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
    terminals: session.terminals,
  };

  return (
    <div className="agents-page app-page">
      <div className="agents-page-inner" style={{ maxWidth: 1200, gap: 16 }}>
        <SessionDetailClient
          session={
            serialized as unknown as Parameters<typeof SessionDetailClient>[0]["session"]
          }
        />
      </div>
    </div>
  );
}
