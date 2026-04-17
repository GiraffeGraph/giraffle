"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createAgentSessionAction,
  deleteAgentSessionAction,
  startAgentSessionAction,
  pauseAgentSessionAction,
} from "@/server/api/agent-sessions";

type AgentInSession = {
  id: string;
  label: string;
  status: string;
};

type Session = {
  id: string;
  label: string;
  goal: string;
  status: string;
  supervisorModel: string;
  createdAt: Date;
  endedAt: Date | null;
  agents: { agent: AgentInSession }[];
  _count: { messages: number };
};

type AvailableAgent = { id: string; label: string; agentType: string };

interface SessionsManagerProps {
  sessions: Session[];
  availableAgents: AvailableAgent[];
}

interface CreateForm {
  label: string;
  goal: string;
  supervisorModel: string;
  agentIds: string[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: "Pending", color: "var(--agents-status-unknown)", icon: "pending" },
  running: { label: "Running", color: "var(--agents-status-online)", icon: "play_circle" },
  completed: { label: "Completed", color: "#5c8cff", icon: "check_circle" },
  failed: { label: "Failed", color: "var(--agents-status-offline)", icon: "cancel" },
};

function SessionStatusBadge({ status }: { status: string }) {
  const s = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span className="agents-status-badge" style={{ "--badge-color": s.color } as React.CSSProperties}>
      <span className="material-symbols-outlined" style={{ fontSize: 13, lineHeight: 1 }}>{s.icon}</span>
      {s.label}
    </span>
  );
}

export function SessionsManager({ sessions, availableAgents }: SessionsManagerProps) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>({
    label: "",
    goal: "",
    supervisorModel: "claude-3-5-sonnet-20241022",
    agentIds: [],
  });
  const [submitting, setSubmitting] = useState(false);

  function closeModal() {
    if (submitting) return;
    setShowCreate(false);
  }

  function toggleAgent(id: string) {
    setForm((f) => ({
      ...f,
      agentIds: f.agentIds.includes(id)
        ? f.agentIds.filter((a) => a !== id)
        : [...f.agentIds, id],
    }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createAgentSessionAction(form);
      setShowCreate(false);
      setForm({
        label: "",
        goal: "",
        supervisorModel: "claude-3-5-sonnet-20241022",
        agentIds: [],
      });
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStart(id: string) {
    await startAgentSessionAction(id);
    router.refresh();
  }

  async function handlePause(id: string) {
    await pauseAgentSessionAction(id);
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this session and all its messages?")) return;
    await deleteAgentSessionAction(id);
    router.refresh();
  }

  return (
    <div className="agents-section">
      <div className="agents-section-header">
        <div>
          <h2 className="agents-section-title">Sessions</h2>
          <p className="agents-section-desc">Orchestration runs managed by the LangGraph supervisor</p>
        </div>
        <button
          className="agents-btn agents-btn-primary"
          onClick={() => setShowCreate(true)}
          disabled={availableAgents.length === 0}
          title={availableAgents.length === 0 ? "Create agents first" : ""}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
          New Session
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="agents-empty">
          <span className="material-symbols-outlined agents-empty-icon">hub</span>
          <p>
            {availableAgents.length === 0
              ? "Create agents first, then start a session."
              : "No sessions yet. Start a new orchestration run."}
          </p>
        </div>
      ) : (
        <div className="agents-sessions-list">
          {sessions.map((s) => (
            <div key={s.id} className="agents-session-card">
              <div className="agents-session-card-header">
                <div className="agents-session-card-title-row">
                  <span className="agents-session-card-label">{s.label}</span>
                  <SessionStatusBadge status={s.status} />
                </div>
                <div className="agents-row-actions">
                  {(s.status === "pending" || s.status === "failed") && (
                    <button
                      className="agents-icon-btn"
                      title="Start session"
                      onClick={() => handleStart(s.id)}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>play_arrow</span>
                    </button>
                  )}
                  {s.status === "running" && (
                    <button
                      className="agents-icon-btn"
                      title="Pause session"
                      onClick={() => handlePause(s.id)}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>pause</span>
                    </button>
                  )}
                  <button
                    className="agents-icon-btn"
                    title="View session detail"
                    onClick={() => router.push(`/agents/sessions/${s.id}`)}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
                  </button>
                  <button
                    className="agents-icon-btn agents-icon-btn-danger"
                    title="Delete session"
                    onClick={() => handleDelete(s.id)}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                  </button>
                </div>
              </div>
              <p className="agents-session-goal">{s.goal}</p>
              <div className="agents-session-meta">
                <span className="agents-session-meta-item">
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>smart_toy</span>
                  {s.agents.map((a) => a.agent.label).join(", ") || "No agents"}
                </span>
                <span className="agents-session-meta-item">
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>chat</span>
                  {s._count.messages} messages
                </span>
                <span className="agents-session-meta-item">
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>schedule</span>
                  <time suppressHydrationWarning dateTime={s.createdAt.toISOString()}>
                    {s.createdAt.toLocaleDateString()}
                  </time>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="agents-modal-backdrop" onClick={closeModal} role="presentation">
          <div
            className="agents-modal agents-modal-wide"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="agents-modal-header">
              <h3>New Session</h3>
              <button className="agents-modal-close" onClick={closeModal} disabled={submitting}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form className="agents-modal-body" onSubmit={handleCreate}>
              <label className="agents-label">
                Session Label
                <input
                  className="agents-input"
                  required
                  placeholder="e.g. Build ToDo API"
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                />
              </label>
              <label className="agents-label">
                Goal
                <textarea
                  className="agents-input agents-textarea"
                  rows={4}
                  required
                  placeholder="Describe the top-level task for the supervisor…"
                  value={form.goal}
                  onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
                />
              </label>
              <label className="agents-label">
                Supervisor Model
                <input
                  className="agents-input"
                  value={form.supervisorModel}
                  onChange={(e) => setForm((f) => ({ ...f, supervisorModel: e.target.value }))}
                />
              </label>
              <div className="agents-label">
                Participating Agents
                <div className="agents-agent-picker">
                  {availableAgents.map((a) => (
                    <label key={a.id} className="agents-agent-pick-item">
                      <input
                        type="checkbox"
                        checked={form.agentIds.includes(a.id)}
                        onChange={() => toggleAgent(a.id)}
                      />
                      <span>{a.label}</span>
                      <span className="agents-chip agents-chip-accent" style={{ marginLeft: "auto" }}>
                        {a.agentType}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="agents-modal-actions">
                <button
                  type="button"
                  className="agents-btn agents-btn-ghost"
                  onClick={closeModal}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="agents-btn agents-btn-primary"
                  disabled={submitting || form.agentIds.length === 0}
                >
                  {submitting ? "Creating…" : "Create Session"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
