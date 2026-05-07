"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  TRAIL_KIND_CATALOG,
  type TrailDetail,
  type TrailKind,
  type TrailSummary,
} from "@/domain/trail/trail.types";

interface TrailLog {
  id: string;
  toolName: string;
  status: string;
  trailId: string | null;
  durationMs: number | null;
  error: string | null;
  outputSnippet: string | null;
  createdAt: string;
}

interface Props {
  initialTrails: TrailSummary[];
  initialOauthEnabled?: TrailKind[];
}

export function TrailsManager({ initialTrails, initialOauthEnabled = [] }: Props) {
  const [trails, setTrails] = useState<TrailSummary[]>(initialTrails);
  const [oauthEnabled, setOauthEnabled] = useState<TrailKind[]>(initialOauthEnabled);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TrailDetail | null>(null);
  const [logs, setLogs] = useState<TrailLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const installedByKind = useMemo(() => {
    const map = new Map<TrailKind, number>();
    for (const t of trails) map.set(t.kind, (map.get(t.kind) ?? 0) + 1);
    return map;
  }, [trails]);

  const loadDetail = useCallback(async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trails/${id}`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { trail: TrailDetail };
      setDetail(data.trail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshTrails = useCallback(async () => {
    const res = await fetch("/api/trails");
    if (!res.ok) return;
    const data = (await res.json()) as { trails: TrailSummary[] };
    setTrails(data.trails);
  }, []);

  const loadLogs = useCallback(async (trailId?: string) => {
    const url = new URL("/api/trails/logs", window.location.origin);
    if (trailId) url.searchParams.set("trailId", trailId);
    url.searchParams.set("limit", "30");
    const res = await fetch(url.toString());
    if (!res.ok) return;
    const data = (await res.json()) as { logs: TrailLog[] };
    setLogs(data.logs);
  }, []);

  useEffect(() => {
    if (!activeId) {
      setDetail(null);
      return;
    }
    loadDetail(activeId);
    loadLogs(activeId);
  }, [activeId, loadDetail, loadLogs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get("oauth");
    const message = params.get("message") ?? "";
    if (oauth === "success") {
      setBanner({ kind: "success", message: message || "Trail connected." });
    } else if (oauth === "error") {
      setBanner({ kind: "error", message: message || "OAuth failed." });
    }
    if (oauth) {
      params.delete("oauth");
      params.delete("message");
      const url = new URL(window.location.href);
      url.search = params.toString();
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  useEffect(() => {
    if (initialOauthEnabled.length > 0) return;
    void fetch("/api/trails/oauth")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.enabled) setOauthEnabled(data.enabled);
      })
      .catch(() => {});
  }, [initialOauthEnabled.length]);

  const addTrail = useCallback(
    async (kind: TrailKind) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/trails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { trail: TrailSummary };
        setTrails((prev) => [...prev, data.trail]);
        setActiveId(data.trail.id);
        const meta = TRAIL_KIND_CATALOG[kind];
        if (meta?.authMode === "oauth" && oauthEnabled.includes(kind)) {
          window.location.href = `/api/trails/oauth/${kind}/start?trailId=${encodeURIComponent(data.trail.id)}`;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add");
      } finally {
        setBusy(false);
      }
    },
    [oauthEnabled],
  );

  const reconnectOauth = useCallback((kind: TrailKind, trailId: string) => {
    window.location.href = `/api/trails/oauth/${kind}/start?trailId=${encodeURIComponent(trailId)}`;
  }, []);

  const removeTrail = useCallback(
    async (id: string) => {
      if (!window.confirm("Delete this trail?")) return;
      setBusy(true);
      try {
        const res = await fetch(`/api/trails/${id}`, { method: "DELETE" });
        if (!res.ok && res.status !== 204) throw new Error(await res.text());
        setTrails((prev) => prev.filter((t) => t.id !== id));
        if (activeId === id) setActiveId(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to delete");
      } finally {
        setBusy(false);
      }
    },
    [activeId],
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 360px) 1fr", gap: 24 }}>
      <aside>
        <h3 style={{ margin: 0, fontSize: 14, opacity: 0.85 }}>Active Trails</h3>
        {trails.length === 0 && (
          <p style={{ marginTop: 8, opacity: 0.6, fontSize: 13 }}>None yet. Add one from Trailhead below.</p>
        )}
        <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 8 }}>
          {trails.map((trail) => {
            const meta = TRAIL_KIND_CATALOG[trail.kind];
            const isActive = activeId === trail.id;
            return (
              <li key={trail.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(trail.id)}
                  className={`trail-row${isActive ? " trail-row--active" : ""}`}
                  style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    gap: 8,
                    padding: 10,
                    border: "1px solid var(--md-sys-color-outline-variant)",
                    borderRadius: 12,
                    background: isActive ? "var(--md-sys-color-secondary-container)" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                    {meta?.icon ?? "extension"}
                  </span>
                  <span style={{ display: "grid", textAlign: "left", flex: 1 }}>
                    <strong style={{ fontSize: 13 }}>
                      {trail.label ?? meta?.label ?? trail.kind}
                    </strong>
                    <span style={{ fontSize: 11, opacity: 0.7 }}>
                      {trail.kind} · {trail.status}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <h3 style={{ margin: "24px 0 8px", fontSize: 14, opacity: 0.85 }}>Trailhead</h3>
        <div style={{ display: "grid", gap: 6 }}>
          {Object.values(TRAIL_KIND_CATALOG).map((meta) => {
            const installed = installedByKind.get(meta.kind) ?? 0;
            return (
              <div
                key={meta.kind}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: 8,
                  border: "1px dashed var(--md-sys-color-outline-variant)",
                  borderRadius: 12,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  {meta.icon}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{meta.label}</div>
                  <div style={{ fontSize: 11, opacity: 0.65 }}>{meta.description}</div>
                  <div style={{ fontSize: 11, opacity: 0.55 }}>
                    {meta.authMode === "oauth" &&
                      (oauthEnabled.includes(meta.kind)
                        ? "OAuth"
                        : "OAuth (server env not configured)")}
                    {meta.authMode === "api_key" && "API key"}
                    {meta.authMode === "url" && "URL + headers"}
                    {installed > 0 && ` · ${installed} installed`}
                  </div>
                </div>
                <Button
                  variant="tonal"
                  onClick={() => addTrail(meta.kind)}
                  disabled={
                    busy ||
                    (meta.authMode === "oauth" && !oauthEnabled.includes(meta.kind))
                  }
                >
                  Add
                </Button>
              </div>
            );
          })}
        </div>
      </aside>

      <section>
        {banner && (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              marginBottom: 12,
              background:
                banner.kind === "success"
                  ? "var(--md-sys-color-tertiary-container)"
                  : "var(--md-sys-color-error-container)",
              color:
                banner.kind === "success"
                  ? "var(--md-sys-color-on-tertiary-container)"
                  : "var(--md-sys-color-on-error-container)",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ flex: 1 }}>{banner.message}</span>
            <button
              type="button"
              onClick={() => setBanner(null)}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "inherit" }}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        )}
        {error && (
          <div
            role="alert"
            style={{
              padding: 12,
              borderRadius: 12,
              marginBottom: 12,
              background: "var(--md-sys-color-error-container)",
              color: "var(--md-sys-color-on-error-container)",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
        {!detail && (
          <div style={{ opacity: 0.6, fontSize: 14 }}>Select a Trail to configure.</div>
        )}
        {detail && (
          <TrailEditor
            key={detail.id}
            detail={detail}
            logs={logs}
            busy={busy}
            oauthEnabled={oauthEnabled}
            onChanged={async () => {
              if (activeId) await loadDetail(activeId);
              await refreshTrails();
            }}
            onLogsRefresh={() => loadLogs(detail.id)}
            onDelete={() => removeTrail(detail.id)}
            onOauthReconnect={() => reconnectOauth(detail.kind, detail.id)}
          />
        )}
      </section>
    </div>
  );
}

interface EditorProps {
  detail: TrailDetail;
  logs: TrailLog[];
  busy: boolean;
  oauthEnabled: TrailKind[];
  onChanged: () => Promise<void> | void;
  onLogsRefresh: () => Promise<void> | void;
  onDelete: () => void;
  onOauthReconnect: () => void;
}

function TrailEditor({
  detail,
  logs,
  busy,
  oauthEnabled,
  onChanged,
  onLogsRefresh,
  onDelete,
  onOauthReconnect,
}: EditorProps) {
  const meta = TRAIL_KIND_CATALOG[detail.kind];
  const isCustomMcp = detail.kind === "custom_mcp";
  const isOauth = meta?.authMode === "oauth";
  const isApiKey = meta?.authMode === "api_key";
  const oauthAvailable = isOauth && oauthEnabled.includes(detail.kind);
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState(detail.label ?? "");
  const [url, setUrl] = useState(typeof detail.config.url === "string" ? detail.config.url : "");
  const [transport, setTransport] = useState(
    detail.config.transport === "sse" ? "sse" : "http",
  );
  const [headerEntries, setHeaderEntries] = useState<Array<[string, string]>>(() => {
    const headers = (detail.config.headers ?? {}) as Record<string, string>;
    return Object.entries(headers);
  });
  const [bearerToken, setBearerToken] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

  const save = useCallback(async () => {
    const config: Record<string, unknown> = { ...detail.config };
    if (isCustomMcp) {
      config.url = url;
      config.transport = transport;
      config.headers = Object.fromEntries(headerEntries.filter(([k]) => k.trim()));
    }
    const desiredStatus =
      isApiKey && apiKey.trim() ? "active" : undefined;
    const res = await fetch(`/api/trails/${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: label || null,
        config,
        ...(desiredStatus ? { status: desiredStatus } : {}),
      }),
    });
    if (!res.ok) {
      setTestResult(`Save failed: ${await res.text()}`);
      return;
    }
    if (isCustomMcp && bearerToken) {
      const credRes = await fetch(`/api/trails/${detail.id}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "bearer", secret: bearerToken }),
      });
      if (!credRes.ok) {
        setTestResult(`Credential failed: ${await credRes.text()}`);
        return;
      }
    }
    if (isApiKey && apiKey.trim()) {
      const credRes = await fetch(`/api/trails/${detail.id}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "apikey", secret: apiKey.trim() }),
      });
      if (!credRes.ok) {
        setTestResult(`Credential failed: ${await credRes.text()}`);
        return;
      }
    }
    setBearerToken("");
    setApiKey("");
    setTestResult("Saved.");
    await onChanged();
  }, [
    detail.id,
    detail.config,
    isCustomMcp,
    isApiKey,
    apiKey,
    url,
    transport,
    headerEntries,
    label,
    bearerToken,
    onChanged,
  ]);

  const test = useCallback(async () => {
    if (!isCustomMcp) return;
    setTestResult("Testing...");
    const res = await fetch(`/api/trails/${detail.id}/test`, { method: "POST" });
    const json = (await res.json().catch(() => null)) as
      | { ok: boolean; toolCount?: number; tools?: string[]; error?: string }
      | null;
    if (json?.ok) {
      setTestResult(`OK — ${json.toolCount} tool(s): ${(json.tools ?? []).slice(0, 4).join(", ")}${
        (json.tools?.length ?? 0) > 4 ? "…" : ""
      }`);
    } else {
      setTestResult(`Failed: ${json?.error ?? "unknown error"}`);
    }
    await onChanged();
    await onLogsRefresh();
  }, [detail.id, isCustomMcp, onChanged, onLogsRefresh]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 24 }}>
          {meta?.icon ?? "extension"}
        </span>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{meta?.label ?? detail.kind}</h3>
          <div style={{ fontSize: 12, opacity: 0.6 }}>
            ID: {detail.id} · status: {detail.status}
          </div>
        </div>
        <Button variant="text" onClick={onDelete}>
          Delete
        </Button>
      </header>

      <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
        Label
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={meta?.label}
          style={inputStyle}
        />
      </label>

      {isApiKey && (
        <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
          API key (encrypted; leave empty to keep existing)
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={detail.hasCredential ? "•••••• already set" : "Paste API key"}
            style={inputStyle}
            autoComplete="off"
          />
        </label>
      )}

      {isCustomMcp && (
        <>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            MCP server URL
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/mcp"
              style={inputStyle}
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Transport
            <select value={transport} onChange={(e) => setTransport(e.target.value)} style={inputStyle}>
              <option value="http">HTTP (recommended)</option>
              <option value="sse">SSE</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Bearer token (stored encrypted; leave empty to keep existing)
            <input
              type="password"
              value={bearerToken}
              onChange={(e) => setBearerToken(e.target.value)}
              placeholder={detail.hasCredential ? "•••••• already set" : "Optional"}
              style={inputStyle}
            />
          </label>
          <fieldset style={{ border: "1px solid var(--md-sys-color-outline-variant)", borderRadius: 12, padding: 12 }}>
            <legend style={{ fontSize: 12, padding: "0 6px" }}>Custom headers</legend>
            <div style={{ display: "grid", gap: 6 }}>
              {headerEntries.map((entry, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6 }}>
                  <input
                    value={entry[0]}
                    placeholder="Header name"
                    onChange={(e) => {
                      const next = [...headerEntries];
                      next[idx] = [e.target.value, entry[1]];
                      setHeaderEntries(next);
                    }}
                    style={inputStyle}
                  />
                  <input
                    value={entry[1]}
                    placeholder="Value"
                    onChange={(e) => {
                      const next = [...headerEntries];
                      next[idx] = [entry[0], e.target.value];
                      setHeaderEntries(next);
                    }}
                    style={inputStyle}
                  />
                  <Button
                    variant="text"
                    onClick={() => setHeaderEntries(headerEntries.filter((_, i) => i !== idx))}
                  >
                    −
                  </Button>
                </div>
              ))}
              <Button variant="tonal" onClick={() => setHeaderEntries([...headerEntries, ["", ""]])}>
                Add header
              </Button>
            </div>
          </fieldset>
        </>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="filled" onClick={save} disabled={busy}>
          Save
        </Button>
        {isCustomMcp && (
          <Button variant="outlined" onClick={test} disabled={busy}>
            Test connection
          </Button>
        )}
        {isOauth && (
          <Button
            variant="outlined"
            onClick={onOauthReconnect}
            disabled={busy || !oauthAvailable}
            title={oauthAvailable ? "Reconnect" : "OAuth credentials missing in server env"}
          >
            {detail.status === "active" ? "Reconnect" : "Connect"}
          </Button>
        )}
      </div>
      {testResult && <div style={{ fontSize: 12, opacity: 0.8 }}>{testResult}</div>}

      <section>
        <h4 style={{ margin: "8px 0", fontSize: 13, opacity: 0.85 }}>Tool access</h4>
        {detail.toolAllows.length === 0 && (
          <p style={{ fontSize: 12, opacity: 0.6 }}>
            All tools allowed by default. Test the connection first to discover tools, then customize here.
          </p>
        )}
        {detail.toolAllows.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
            {detail.toolAllows.map((row) => (
              <li key={row.toolName} style={{ fontSize: 12 }}>
                {row.allowed ? "✓" : "✗"} {row.toolName}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4 style={{ margin: "8px 0", fontSize: 13, opacity: 0.85 }}>Recent Trail Logs</h4>
        {logs.length === 0 && <p style={{ fontSize: 12, opacity: 0.6 }}>No logs yet.</p>}
        {logs.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
            {logs.map((entry) => (
              <li key={entry.id} style={{ fontSize: 12, opacity: entry.status === "error" ? 0.9 : 0.7 }}>
                <strong>{entry.toolName}</strong> · {entry.status}
                {entry.durationMs ? ` · ${entry.durationMs}ms` : ""}
                {entry.error ? ` · ${entry.error}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--md-sys-color-outline-variant)",
  background: "var(--md-sys-color-surface-container-low)",
  color: "var(--md-sys-color-on-surface)",
  fontSize: 13,
};
