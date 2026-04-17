"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createMachineAction,
  deleteMachineAction,
  pingMachineAction,
  updateMachineAction,
} from "@/server/api/agents-machines";

type Machine = {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  authType: string;
  status: string;
  lastPingAt: Date | null;
  createdAt: Date;
  _count: { agents: number };
};

interface MachinesManagerProps {
  machines: Machine[];
}

type ModalMode = "add" | "edit";

interface FormState {
  label: string;
  host: string;
  port: string;
  username: string;
  authType: "password" | "key";
  sshCredential: string;
}

const DEFAULT_FORM: FormState = {
  label: "",
  host: "",
  port: "22",
  username: "root",
  authType: "password",
  sshCredential: "",
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    online: { label: "Online", color: "var(--agents-status-online)" },
    offline: { label: "Offline", color: "var(--agents-status-offline)" },
    unknown: { label: "Unknown", color: "var(--agents-status-unknown)" },
  };
  const s = map[status] ?? map.unknown;
  return (
    <span className="agents-status-badge" style={{ "--badge-color": s.color } as React.CSSProperties}>
      <span className="agents-status-dot" />
      {s.label}
    </span>
  );
}

export function MachinesManager({ machines }: MachinesManagerProps) {
  const router = useRouter();
  const [modal, setModal] = useState<{ mode: ModalMode; machine?: Machine } | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [pinging, setPinging] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  function openAdd() {
    setForm(DEFAULT_FORM);
    setModal({ mode: "add" });
  }

  function openEdit(machine: Machine) {
    setForm({
      label: machine.label,
      host: machine.host,
      port: String(machine.port),
      username: machine.username,
      authType: machine.authType as "password" | "key",
      sshCredential: "",
    });
    setModal({ mode: "edit", machine });
  }

  function closeModal() {
    if (submitting) return;
    setModal(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (modal?.mode === "add") {
        await createMachineAction({
          label: form.label,
          host: form.host,
          port: parseInt(form.port, 10) || 22,
          username: form.username,
          authType: form.authType,
          sshCredential: form.sshCredential,
        });
      } else if (modal?.machine) {
        const patch: Parameters<typeof updateMachineAction>[1] = {
          label: form.label,
          host: form.host,
          port: parseInt(form.port, 10) || 22,
          username: form.username,
          authType: form.authType,
        };
        if (form.sshCredential) patch.sshCredential = form.sshCredential;
        await updateMachineAction(modal.machine.id, patch);
      }
      setModal(null);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePing(id: string) {
    setPinging(id);
    try {
      await pingMachineAction(id);
      router.refresh();
    } finally {
      setPinging(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this machine? All associated agents will be deleted.")) return;
    setDeleting(id);
    try {
      await deleteMachineAction(id);
      router.refresh();
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="agents-section">
      <div className="agents-section-header">
        <div>
          <h2 className="agents-section-title">Machines</h2>
          <p className="agents-section-desc">Remote servers accessible via SSH</p>
        </div>
        <button className="agents-btn agents-btn-primary" onClick={openAdd}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
          Add Machine
        </button>
      </div>

      {machines.length === 0 ? (
        <div className="agents-empty">
          <span className="material-symbols-outlined agents-empty-icon">dns</span>
          <p>No machines yet. Add your first remote server.</p>
        </div>
      ) : (
        <div className="agents-table-wrap">
          <table className="agents-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>Host</th>
                <th>Auth</th>
                <th>Agents</th>
                <th>Status</th>
                <th>Last Ping</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {machines.map((m) => (
                <tr key={m.id}>
                  <td className="agents-table-label">{m.label}</td>
                  <td className="agents-table-mono">{m.host}:{m.port}</td>
                  <td>
                    <span className="agents-chip">{m.authType === "key" ? "SSH Key" : "Password"}</span>
                  </td>
                  <td>{m._count.agents}</td>
                  <td><StatusBadge status={m.status} /></td>
                  <td className="agents-table-muted">
                    {m.lastPingAt ? (
                      <time suppressHydrationWarning dateTime={m.lastPingAt.toISOString()}>
                        {m.lastPingAt.toLocaleTimeString()}
                      </time>
                    ) : "—"}
                  </td>
                  <td>
                    <div className="agents-row-actions">
                      <button
                        className="agents-icon-btn"
                        title="Ping"
                        disabled={pinging === m.id}
                        onClick={() => handlePing(m.id)}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                          {pinging === m.id ? "hourglass_empty" : "wifi_tethering"}
                        </span>
                      </button>
                      <button
                        className="agents-icon-btn"
                        title="Edit"
                        onClick={() => openEdit(m)}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                      </button>
                      <button
                        className="agents-icon-btn agents-icon-btn-danger"
                        title="Delete"
                        disabled={deleting === m.id}
                        onClick={() => handleDelete(m.id)}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="agents-modal-backdrop" onClick={closeModal} role="presentation">
          <div
            className="agents-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="agents-modal-header">
              <h3>{modal.mode === "add" ? "Add Machine" : "Edit Machine"}</h3>
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
                  placeholder="e.g. Hetzner-EU-1"
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                />
              </label>
              <div className="agents-form-row">
                <label className="agents-label" style={{ flex: 1 }}>
                  Host
                  <input
                    className="agents-input"
                    required
                    placeholder="192.168.1.1 or hostname"
                    value={form.host}
                    onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                  />
                </label>
                <label className="agents-label" style={{ width: 90 }}>
                  Port
                  <input
                    className="agents-input"
                    type="number"
                    min={1}
                    max={65535}
                    required
                    value={form.port}
                    onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                  />
                </label>
              </div>
              <label className="agents-label">
                Username
                <input
                  className="agents-input"
                  required
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                />
              </label>
              <label className="agents-label">
                Auth Type
                <select
                  className="agents-input"
                  value={form.authType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, authType: e.target.value as "password" | "key" }))
                  }
                >
                  <option value="password">Password</option>
                  <option value="key">SSH Key</option>
                </select>
              </label>
              <label className="agents-label">
                {form.authType === "key" ? "Private Key Content" : "Password"}
                {modal.mode === "edit" && (
                  <span className="agents-label-hint"> (leave blank to keep existing)</span>
                )}
                <textarea
                  className="agents-input agents-textarea"
                  rows={form.authType === "key" ? 4 : 1}
                  placeholder={
                    form.authType === "key"
                      ? "-----BEGIN OPENSSH PRIVATE KEY-----\n..."
                      : "Password"
                  }
                  value={form.sshCredential}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sshCredential: e.target.value }))
                  }
                  required={modal.mode === "add"}
                />
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
                <button
                  type="submit"
                  className="agents-btn agents-btn-primary"
                  disabled={submitting}
                >
                  {submitting ? "Saving…" : modal.mode === "add" ? "Add Machine" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
