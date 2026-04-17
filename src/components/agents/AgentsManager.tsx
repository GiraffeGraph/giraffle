"use client";

import React from "react";

import { useRouter } from "next/navigation";
import { useState } from "react";
import dynamic from "next/dynamic";
import {
  createAgentAction,
  deleteAgentAction,
  startAgentAction,
  stopAgentAction,
  updateAgentAction,
} from "@/server/api/agents";

// Lazy-load the terminal so it doesn't bloat the initial bundle
const XTerminal = dynamic(
  () => import("@/components/agents/XTerminal").then((m) => ({ default: m.XTerminal })),
  { ssr: false, loading: () => <div className="xterm-loading">Loading terminal…</div> },
);

type Machine = { id: string; label: string; host: string; status: string };

type Agent = {
  id: string;
  label: string;
  agentType: AgentType | string;
  agentCommand: string;
  systemPrompt: string;
  modelConfig: unknown;
  status: string;
  createdAt: Date;
  machine: Machine;
};

interface AgentsManagerProps {
  agents: Agent[];
  machines: Machine[];
}

type ModalMode = "add" | "edit" | "prompt";

type AgentType = "pi" | "claude_code" | "aider" | "opencode" | "codex" | "custom";

interface FormState {
  label: string;
  machineId: string;
  agentType: AgentType;
  agentCommand: string;
  modelName: string;
}

/** Preset configs for known CLI coding agents. */
const AGENT_PRESETS: Record<AgentType, { command: string; model: string; hint: string }> = {
  claude_code: {
    command: "claude",
    model: "claude-sonnet-4-5",
    hint: "Uses ANTHROPIC_API_KEY env var. Model set via Claude Code's own config.",
  },
  pi: {
    command: "pi",
    model: "gpt-4o",
    hint: "Uses OPENAI_API_KEY. Model passed via pi's own config or flags.",
  },
  aider: {
    command: "aider --no-auto-commits",
    model: "gpt-4o",
    hint: "Model can be set via --model flag. Uses OPENAI_API_KEY or ANTHROPIC_API_KEY.",
  },
  opencode: {
    command: "opencode",
    model: "claude-sonnet-4-5",
    hint: "OpenCode CLI agent. Uses its own API key config.",
  },
  codex: {
    command: "codex",
    model: "o4-mini",
    hint: "OpenAI Codex CLI. Uses OPENAI_API_KEY.",
  },
  custom: {
    command: "",
    model: "",
    hint: "Enter any CLI command that starts an interactive AI coding agent.",
  },
};

const DEFAULT_FORM: FormState = {
  label: "",
  machineId: "",
  agentType: "claude_code",
  agentCommand: AGENT_PRESETS.claude_code.command,
  modelName: AGENT_PRESETS.claude_code.model,
};

const STATUS_MAP: Record<string, { label: string; icon: string; color: string }> = {
  idle: { label: "Idle", icon: "radio_button_unchecked", color: "var(--agents-status-unknown)" },
  running: { label: "Running", icon: "play_circle", color: "var(--agents-status-online)" },
  error: { label: "Error", icon: "error", color: "var(--agents-status-offline)" },
  stopped: { label: "Stopped", icon: "stop_circle", color: "var(--agents-status-unknown)" },
};

function AgentStatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? STATUS_MAP.idle;
  return (
    <span className="agents-status-badge" style={{ "--badge-color": s.color } as React.CSSProperties}>
      <span className="material-symbols-outlined" style={{ fontSize: 13, lineHeight: 1 }}>{s.icon}</span>
      {s.label}
    </span>
  );
}

const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  pi: "pi",
  claude_code: "Claude Code",
  aider: "Aider",
  opencode: "OpenCode",
  codex: "Codex CLI",
  custom: "Custom",
};

export function AgentsManager({ agents, machines }: AgentsManagerProps) {
  const router = useRouter();
  const [modal, setModal] = useState<{ mode: ModalMode; agent?: Agent } | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [promptDraft, setPromptDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  // Inline terminal panel — which agent is expanded
  const [terminalAgentId, setTerminalAgentId] = useState<string | null>(null);

  function openAdd() {
    const preset = AGENT_PRESETS.claude_code;
    setForm({
      ...DEFAULT_FORM,
      machineId: machines[0]?.id ?? "",
      agentCommand: preset.command,
      modelName: preset.model,
    });
    setModal({ mode: "add" });
  }

  function openEdit(agent: Agent) {
    const mappedType: AgentType =
      agent.agentType in AGENT_PRESETS ? (agent.agentType as AgentType) : "custom";

    setForm({
      label: agent.label,
      machineId: agent.machine.id,
      agentType: mappedType,
      agentCommand: agent.agentCommand,
      modelName: (agent.modelConfig as Record<string, string> | null)?.model ?? "",
    });
    setModal({ mode: "edit", agent });
  }

  function handleAgentTypeChange(type: AgentType) {
    const preset = AGENT_PRESETS[type];
    setForm((f) => ({
      ...f,
      agentType: type,
      // Only auto-fill command/model if user hasn't already customized them
      agentCommand: preset.command,
      modelName: preset.model,
    }));
  }

  function openPrompt(agent: Agent) {
    setPromptDraft(agent.systemPrompt);
    setModal({ mode: "prompt", agent });
  }

  function closeModal() {
    if (submitting) return;
    setModal(null);
  }

  function toggleTerminal(agentId: string) {
    setTerminalAgentId((prev) => (prev === agentId ? null : agentId));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (modal?.mode === "add") {
        await createAgentAction({
          label: form.label,
          machineId: form.machineId,
          agentType: form.agentType,
          agentCommand: form.agentCommand,
          modelConfig: { model: form.modelName },
        });
      } else if (modal?.mode === "edit" && modal.agent) {
        await updateAgentAction(modal.agent.id, {
          label: form.label,
          machineId: form.machineId,
          agentType: form.agentType,
          agentCommand: form.agentCommand,
          modelConfig: { model: form.modelName },
        });
      } else if (modal?.mode === "prompt" && modal.agent) {
        await updateAgentAction(modal.agent.id, { systemPrompt: promptDraft });
      }
      setModal(null);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggle(agent: Agent) {
    setToggling(agent.id);
    try {
      if (agent.status === "running") {
        await stopAgentAction(agent.id);
      } else {
        await startAgentAction(agent.id);
        // Auto-open terminal when starting
        setTerminalAgentId(agent.id);
      }
      router.refresh();
    } finally {
      setToggling(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this agent?")) return;
    if (terminalAgentId === id) setTerminalAgentId(null);
    await deleteAgentAction(id);
    router.refresh();
  }

  return (
    <div className="agents-section">
      <div className="agents-section-header">
        <div>
          <h2 className="agents-section-title">Agents</h2>
          <p className="agents-section-desc">CLI-based AI coding agents running on machines</p>
        </div>
        <button
          className="agents-btn agents-btn-primary"
          onClick={openAdd}
          disabled={machines.length === 0}
          title={machines.length === 0 ? "Add a machine first" : ""}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
          Add Agent
        </button>
      </div>

      {agents.length === 0 ? (
        <div className="agents-empty">
          <span className="material-symbols-outlined agents-empty-icon">smart_toy</span>
          <p>
            {machines.length === 0
              ? "Add a machine first, then create agents."
              : "No agents yet. Add your first agent."}
          </p>
        </div>
      ) : (
        <div className="agents-table-wrap">
          <table className="agents-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Machine</th>
                <th>Type</th>
                <th>Command</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <React.Fragment key={a.id}>
                  <tr className={terminalAgentId === a.id ? "agents-table-row-active" : ""}>
                    <td className="agents-table-label">{a.label}</td>
                    <td>
                      <span className="agents-chip">{a.machine.label}</span>
                    </td>
                    <td>
                      <span className="agents-chip agents-chip-accent">
                        {AGENT_TYPE_LABELS[a.agentType as AgentType] ?? a.agentType}
                      </span>
                    </td>
                    <td className="agents-table-mono agents-table-truncate">{a.agentCommand}</td>
                    <td><AgentStatusBadge status={a.status} /></td>
                    <td>
                      <div className="agents-row-actions">
                        {/* ── Start / Stop ─────────────────── */}
                        <button
                          className={`agents-icon-btn ${a.status === "running" ? "agents-icon-btn-active" : ""}`}
                          title={a.status === "running" ? "Stop agent" : "Start agent"}
                          disabled={toggling === a.id}
                          onClick={() => handleToggle(a)}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                            {toggling === a.id
                              ? "hourglass_empty"
                              : a.status === "running"
                              ? "stop"
                              : "play_arrow"}
                          </span>
                        </button>

                        {/* ── Terminal toggle ───────────────── */}
                        <button
                          className={`agents-icon-btn ${terminalAgentId === a.id ? "agents-icon-btn-active" : ""}`}
                          title={terminalAgentId === a.id ? "Close terminal" : "Open terminal"}
                          onClick={() => toggleTerminal(a.id)}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                            terminal
                          </span>
                        </button>

                        {/* ── System Prompt ─────────────────── */}
                        <button
                          className="agents-icon-btn"
                          title="Edit system prompt"
                          onClick={() => openPrompt(a)}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>psychology</span>
                        </button>

                        {/* ── Edit ─────────────────────────── */}
                        <button
                          className="agents-icon-btn"
                          title="Edit"
                          onClick={() => openEdit(a)}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                        </button>

                        {/* ── Delete ───────────────────────── */}
                        <button
                          className="agents-icon-btn agents-icon-btn-danger"
                          title="Delete"
                          onClick={() => handleDelete(a.id)}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* ── Inline terminal panel ─────────────────────────── */}
                  {terminalAgentId === a.id && (
                    <tr key={`terminal-${a.id}`} className="agents-terminal-row">
                      <td colSpan={6} style={{ padding: 0 }}>
                        <div className="agents-inline-terminal">
                          <div className="agents-inline-terminal-bar">
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>dns</span>
                            <span>
                              <strong>{a.label}</strong> — {a.machine.host}
                            </span>
                            <span className="agents-chip agents-chip-accent" style={{ fontSize: "0.68rem" }}>
                              {a.agentCommand}
                            </span>
                            <span style={{ flex: 1 }} />
                            <AgentStatusBadge status={a.status} />
                            <button
                              className="agents-icon-btn"
                              title="Close terminal"
                              onClick={() => setTerminalAgentId(null)}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                            </button>
                          </div>
                          <XTerminal
                            agentId={a.id}
                            className="agents-inline-xterm"
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add / Edit Modal ──────────────────────────────────────────── */}
      {modal && modal.mode !== "prompt" && (
        <div className="agents-modal-backdrop" onClick={closeModal} role="presentation">
          <div
            className="agents-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="agents-modal-header">
              <h3>{modal.mode === "add" ? "Add Agent" : "Edit Agent"}</h3>
              <button className="agents-modal-close" onClick={closeModal} disabled={submitting}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form className="agents-modal-body" onSubmit={handleSubmit}>
              <label className="agents-label">
                Label
                <input
                  className="agents-input"
                  required
                  placeholder="e.g. Architect Agent"
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                />
              </label>
              <label className="agents-label">
                Machine
                <select
                  className="agents-input"
                  required
                  value={form.machineId}
                  onChange={(e) => setForm((f) => ({ ...f, machineId: e.target.value }))}
                >
                  <option value="">Select machine…</option>
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.host})
                    </option>
                  ))}
                </select>
              </label>
              <label className="agents-label">
                Agent Type
                <select
                  className="agents-input"
                  value={form.agentType}
                  onChange={(e) => handleAgentTypeChange(e.target.value as AgentType)}
                >
                  <option value="claude_code">Claude Code — claude</option>
                  <option value="pi">pi</option>
                  <option value="aider">Aider</option>
                  <option value="opencode">OpenCode</option>
                  <option value="codex">Codex CLI</option>
                  <option value="custom">Custom…</option>
                </select>
                <span className="agents-label-hint">
                  {AGENT_PRESETS[form.agentType].hint}
                </span>
              </label>
              <label className="agents-label">
                Agent Command
                <input
                  className="agents-input agents-input-mono"
                  required
                  placeholder="claude"
                  value={form.agentCommand}
                  onChange={(e) => setForm((f) => ({ ...f, agentCommand: e.target.value }))}
                />
                <span className="agents-label-hint">
                  The CLI command that launches the agent on the remote machine.
                  You can add extra flags here (e.g. <code>claude --model claude-opus-4-5</code>).
                </span>
              </label>
              <label className="agents-label">
                Model (metadata)
                <input
                  className="agents-input"
                  placeholder="claude-sonnet-4-5"
                  value={form.modelName}
                  onChange={(e) => setForm((f) => ({ ...f, modelName: e.target.value }))}
                />
                <span className="agents-label-hint">
                  For reference only — the actual model is configured by the CLI tool via its own env vars / flags.
                  This value is stored and shown in the supervisor context.
                </span>
              </label>
              <div className="agents-modal-actions">
                <button
                  type="button"
                  className="agents-btn agents-btn-ghost"
                  onClick={closeModal}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="agents-btn agents-btn-primary" disabled={submitting}>
                  {submitting ? "Saving…" : modal.mode === "add" ? "Add Agent" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── System Prompt Modal ───────────────────────────────────────── */}
      {modal?.mode === "prompt" && modal.agent && (
        <div className="agents-modal-backdrop" onClick={closeModal} role="presentation">
          <div
            className="agents-modal agents-modal-wide"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="agents-modal-header">
              <h3>System Prompt — {modal.agent.label}</h3>
              <button className="agents-modal-close" onClick={closeModal} disabled={submitting}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form className="agents-modal-body" onSubmit={handleSubmit}>
              <textarea
                className="agents-input agents-textarea agents-prompt-editor"
                rows={18}
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                placeholder="Inject orchestration context and role description here…"
              />
              <div className="agents-modal-actions">
                <button
                  type="button"
                  className="agents-btn agents-btn-ghost"
                  onClick={closeModal}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="agents-btn agents-btn-primary" disabled={submitting}>
                  {submitting ? "Saving…" : "Save Prompt"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
