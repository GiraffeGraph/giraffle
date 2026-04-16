"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { XTerminal } from "@/components/agents/XTerminal";
import {
  startAgentSessionAction,
  pauseAgentSessionAction,
} from "@/server/api/agent-sessions";

type Agent = {
  id: string;
  label: string;
  status: string;
  agentType: string;
  machine: { id: string; label: string; host: string };
};

type SessionAgent = { agent: Agent };

type Message = {
  id: string;
  role: string;
  content: string;
  messageType: string;
  createdAt: string;
  fromAgent: { id: string; label: string } | null;
  toAgent: { id: string; label: string } | null;
};

type Session = {
  id: string;
  label: string;
  goal: string;
  status: string;
  supervisorModel: string;
  createdAt: string;
  endedAt: string | null;
  agents: SessionAgent[];
  messages: Message[];
};

interface SessionDetailClientProps {
  session: Session;
}

const ROLE_COLORS: Record<string, string> = {
  system: "#8d8d89",
  user: "#5c8cff",
  assistant: "#e1a63e",
  tool: "#66bb6a",
};

const MSG_TYPE_ICONS: Record<string, string> = {
  task: "assignment",
  response: "reply",
  agent_message: "swap_horiz",
  done: "check_circle",
  error: "error",
  log: "info",
};

const STATUS_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  pending: { color: "var(--agents-status-unknown)", icon: "pending", label: "Pending" },
  running: { color: "var(--agents-status-online)", icon: "play_circle", label: "Running" },
  completed: { color: "#5c8cff", icon: "check_circle", label: "Completed" },
  failed: { color: "var(--agents-status-offline)", icon: "cancel", label: "Failed" },
};

type PanelTab = "messages" | string; // string = agent id

export function SessionDetailClient({ session }: SessionDetailClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<PanelTab>("messages");
  const [actionInProgress, setActionInProgress] = useState(false);

  const sessionStatus = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.pending;

  async function handleStart() {
    setActionInProgress(true);
    try {
      await startAgentSessionAction(session.id);
      router.refresh();
    } finally {
      setActionInProgress(false);
    }
  }

  async function handlePause() {
    setActionInProgress(true);
    try {
      await pauseAgentSessionAction(session.id);
      router.refresh();
    } finally {
      setActionInProgress(false);
    }
  }

  return (
    <div className="session-detail">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="session-detail-header">
        <div className="session-detail-title-row">
          <div className="session-detail-title-group">
            <h1 className="session-detail-title">{session.label}</h1>
            <span
              className="agents-status-badge"
              style={{ "--badge-color": sessionStatus.color } as React.CSSProperties}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                {sessionStatus.icon}
              </span>
              {sessionStatus.label}
            </span>
          </div>
          <div className="agents-row-actions">
            {(session.status === "pending" || session.status === "failed") && (
              <button
                className="agents-btn agents-btn-primary"
                onClick={handleStart}
                disabled={actionInProgress}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  play_arrow
                </span>
                Start
              </button>
            )}
            {session.status === "running" && (
              <button
                className="agents-btn agents-btn-ghost"
                onClick={handlePause}
                disabled={actionInProgress}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  pause
                </span>
                Pause
              </button>
            )}
            <button
              className="agents-icon-btn"
              title="Back to sessions"
              onClick={() => router.push("/agents")}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                arrow_back
              </span>
            </button>
          </div>
        </div>

        <p className="session-detail-goal">{session.goal}</p>

        <div className="session-detail-meta">
          <span className="agents-chip">
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
              smart_toy
            </span>
            {session.agents.length} agent{session.agents.length !== 1 ? "s" : ""}
          </span>
          <span className="agents-chip">
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
              psychology
            </span>
            {session.supervisorModel}
          </span>
          <span className="agents-chip">
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
              schedule
            </span>
            {new Date(session.createdAt).toLocaleString()}
          </span>
          {session.endedAt && (
            <span className="agents-chip">
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                flag
              </span>
              Ended {new Date(session.endedAt).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* ── Agent status bar ──────────────────────────────────────────── */}
      <div className="session-agent-bar">
        {session.agents.map(({ agent }) => (
          <div key={agent.id} className="session-agent-pill">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              smart_toy
            </span>
            <span className="session-agent-pill-label">{agent.label}</span>
            <span className="agents-chip agents-chip-accent" style={{ fontSize: "0.68rem" }}>
              {agent.machine.label}
            </span>
            <span
              className="agents-status-badge"
              style={
                {
                  "--badge-color":
                    agent.status === "running"
                      ? "var(--agents-status-online)"
                      : agent.status === "error"
                      ? "var(--agents-status-offline)"
                      : "var(--agents-status-unknown)",
                } as React.CSSProperties
              }
            >
              <span className="agents-status-dot" />
              {agent.status}
            </span>
          </div>
        ))}
      </div>

      {/* ── Main panel ────────────────────────────────────────────────── */}
      <div className="session-main-panel">
        {/* Tab bar */}
        <div className="agents-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === "messages"}
            className={`agents-tab ${activeTab === "messages" ? "active" : ""}`}
            onClick={() => setActiveTab("messages")}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              chat
            </span>
            Messages
            {session.messages.length > 0 && (
              <span className="agents-tab-count">{session.messages.length}</span>
            )}
          </button>

          {session.agents.map(({ agent }) => (
            <button
              key={agent.id}
              role="tab"
              aria-selected={activeTab === agent.id}
              className={`agents-tab ${activeTab === agent.id ? "active" : ""}`}
              onClick={() => setActiveTab(agent.id)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                terminal
              </span>
              {agent.label}
            </button>
          ))}
        </div>

        {/* Messages panel */}
        {activeTab === "messages" && (
          <div className="session-messages-panel">
            {session.messages.length === 0 ? (
              <div className="agents-empty">
                <span className="material-symbols-outlined agents-empty-icon">
                  chat_bubble_outline
                </span>
                <p>No messages yet. Start the session to begin orchestration.</p>
              </div>
            ) : (
              <div className="session-messages-list">
                {session.messages.map((msg) => (
                  <div key={msg.id} className={`session-message session-message-${msg.role}`}>
                    <div className="session-message-header">
                      <span
                        className="material-symbols-outlined session-message-type-icon"
                        style={{ color: ROLE_COLORS[msg.role] ?? "#8d8d89" }}
                      >
                        {MSG_TYPE_ICONS[msg.messageType] ?? "chat"}
                      </span>
                      <span
                        className="session-message-from"
                        style={{ color: ROLE_COLORS[msg.role] ?? "#8d8d89" }}
                      >
                        {msg.fromAgent?.label ?? msg.role}
                      </span>
                      {msg.toAgent && (
                        <>
                          <span className="material-symbols-outlined" style={{ fontSize: 13, opacity: 0.5 }}>
                            arrow_forward
                          </span>
                          <span className="session-message-to">{msg.toAgent.label}</span>
                        </>
                      )}
                      <span className="session-message-time">
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <pre className="session-message-content">{msg.content}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Terminal panels — one per agent */}
        {session.agents.map(({ agent }) =>
          activeTab === agent.id ? (
            <div key={agent.id} className="session-terminal-panel">
              <div className="session-terminal-toolbar">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  dns
                </span>
                <span>
                  {agent.label} — {agent.machine.host}
                </span>
                <span className="session-terminal-toolbar-spacer" />
                <span className="agents-chip" style={{ fontSize: "0.68rem" }}>
                  {agent.agentType}
                </span>
              </div>
              <XTerminal
                agentId={agent.id}
                className="session-xterm"
              />
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}
