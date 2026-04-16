import { PageTopbar } from "@/components/ui/PageTopbar";
import { getMachinesAction } from "@/server/api/agents-machines";
import { getAgentsAction } from "@/server/api/agents";
import { getAgentSessionsAction } from "@/server/api/agent-sessions";
import { AgentsHubClient } from "@/components/agents/AgentsHubClient";

export default async function AgentsPage() {
  const [machines, agents, sessions] = await Promise.all([
    getMachinesAction(),
    getAgentsAction(),
    getAgentSessionsAction(),
  ]);

  const serializedMachines = machines.map((m) => ({
    ...m,
    lastPingAt: m.lastPingAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  }));

  const serializedAgents = agents.map((a) => ({
    ...a,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    machine: {
      ...a.machine,
    },
  }));

  const serializedSessions = sessions.map((s) => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    endedAt: s.endedAt?.toISOString() ?? null,
  }));

  const availableAgents = agents.map((a) => ({
    id: a.id,
    label: a.label,
    agentType: a.agentType,
  }));

  return (
    <>
      <PageTopbar icon="hub" label="Agents" />
      <div className="agents-page app-page">
        <div className="agents-page-inner">
          <div className="agents-page-hero">
            <div className="agents-page-hero-icon">
              <span className="material-symbols-outlined">hub</span>
            </div>
            <div>
              <h1 className="agents-page-title">Giraffe Agents</h1>
              <p className="agents-page-subtitle">
                Distributed multi-agent terminal orchestration system
              </p>
            </div>
            <div className="agents-page-stats">
              <div className="agents-stat">
                <span className="agents-stat-value">{machines.length}</span>
                <span className="agents-stat-label">Machines</span>
              </div>
              <div className="agents-stat">
                <span className="agents-stat-value">{agents.length}</span>
                <span className="agents-stat-label">Agents</span>
              </div>
              <div className="agents-stat">
                <span className="agents-stat-value">
                  {sessions.filter((s) => s.status === "running").length}
                </span>
                <span className="agents-stat-label">Running</span>
              </div>
            </div>
          </div>

          <AgentsHubClient
            machines={serializedMachines as Parameters<typeof AgentsHubClient>[0]["machines"]}
            agents={serializedAgents as Parameters<typeof AgentsHubClient>[0]["agents"]}
            sessions={serializedSessions as Parameters<typeof AgentsHubClient>[0]["sessions"]}
            availableAgents={availableAgents}
          />
        </div>
      </div>
    </>
  );
}
