"use client";

import { useState } from "react";
import { MachinesManager } from "./MachinesManager";
import { AgentsManager } from "./AgentsManager";
import { SessionsManager } from "./SessionsManager";

type Tab = "machines" | "agents" | "sessions";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "machines", label: "Machines", icon: "dns" },
  { key: "agents", label: "Agents", icon: "smart_toy" },
  { key: "sessions", label: "Sessions", icon: "hub" },
];

type Machine = {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  authType: string;
  status: string;
  lastPingAt: string | null;
  createdAt: string;
  _count: { agents: number };
};

type AgentMachine = { id: string; label: string; host: string; status: string };

type Agent = {
  id: string;
  label: string;
  agentType: string;
  agentCommand: string;
  systemPrompt: string;
  modelConfig: unknown;
  status: string;
  createdAt: string;
  machine: AgentMachine;
};

type SessionAgent = { id: string; label: string; status: string };
type SessionAgentEntry = { agent: SessionAgent };

type Session = {
  id: string;
  label: string;
  goal: string;
  status: string;
  supervisorModel: string;
  createdAt: string;
  endedAt: string | null;
  agents: SessionAgentEntry[];
  _count: { messages: number };
};

type AvailableAgent = { id: string; label: string; agentType: string };

interface AgentsHubClientProps {
  machines: Machine[];
  agents: Agent[];
  sessions: Session[];
  availableAgents: AvailableAgent[];
}

export function AgentsHubClient({
  machines,
  agents,
  sessions,
  availableAgents,
}: AgentsHubClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>("machines");

  // Convert string dates back to Date objects for child components
  const machinesWithDates = machines.map((m) => ({
    ...m,
    lastPingAt: m.lastPingAt ? new Date(m.lastPingAt) : null,
    createdAt: new Date(m.createdAt),
  }));

  const agentsWithDates = agents.map((a) => ({
    ...a,
    createdAt: new Date(a.createdAt),
  }));

  const sessionsWithDates = sessions.map((s) => ({
    ...s,
    createdAt: new Date(s.createdAt),
    endedAt: s.endedAt ? new Date(s.endedAt) : null,
  }));

  const machinesForAgents = machines.map((m) => ({
    id: m.id,
    label: m.label,
    host: m.host,
    status: m.status,
  }));

  return (
    <div className="agents-hub">
      <div className="agents-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`agents-tab ${activeTab === tab.key ? "active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {tab.icon}
            </span>
            {tab.label}
            {tab.key === "machines" && machines.length > 0 && (
              <span className="agents-tab-count">{machines.length}</span>
            )}
            {tab.key === "agents" && agents.length > 0 && (
              <span className="agents-tab-count">{agents.length}</span>
            )}
            {tab.key === "sessions" && sessions.length > 0 && (
              <span className="agents-tab-count">{sessions.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="agents-tab-panel" role="tabpanel">
        {activeTab === "machines" && (
          <MachinesManager machines={machinesWithDates} />
        )}
        {activeTab === "agents" && (
          <AgentsManager agents={agentsWithDates} machines={machinesForAgents} />
        )}
        {activeTab === "sessions" && (
          <SessionsManager sessions={sessionsWithDates} availableAgents={availableAgents} />
        )}
      </div>
    </div>
  );
}
