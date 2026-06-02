"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { MarkdownText } from "./MarkdownText";
import { useAgentStream, type TimelineItem } from "./useAgentStream";

/**
 * Visual panel for driving Giraffle through a local CLI agent (Claude Code).
 * The agent runs over Giraffle's MCP server with its own subscription auth — no
 * API key. Tool calls, results, and reasoning are surfaced inline.
 */
export function AgentPanel() {
  const { items, isStreaming, send, stop, reset } = useAgentStream();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  // Auto-follow only when the user is already near the bottom, so scrolling up
  // to read an earlier tool result isn't yanked back down mid-stream.
  const atBottomRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [items]);

  const submit = () => {
    if (!draft.trim() || isStreaming) return;
    void send(draft);
    setDraft("");
  };

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <div>
          <p style={styles.kicker}>Spotter · Claude Code</p>
          <h1 style={styles.title}>Agent</h1>
        </div>
        <Button variant="text" onClick={reset} disabled={isStreaming || items.length === 0}>
          New chat
        </Button>
      </header>

      <div
        ref={scrollRef}
        style={styles.timeline}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
      >
        {items.length === 0 ? (
          <div style={styles.empty}>
            Ask the agent to work across your notes, Stride, Tower Matrix, and Savanna — it drives
            Giraffle through MCP tools.
          </div>
        ) : (
          items.map((item) => <TimelineRow key={item.id} item={item} />)
        )}
        {isStreaming ? <div style={styles.streaming}>● working…</div> : null}
      </div>

      <div style={styles.composer}>
        <textarea
          style={styles.textarea}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Don't submit mid-IME-composition (e.g. Turkish/CJK input) — Enter
            // there commits the candidate, it isn't a send.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Tell the agent what to do…"
          aria-label="Agent prompt"
          rows={3}
        />
        {isStreaming ? (
          <Button variant="tonal" onClick={stop}>Stop</Button>
        ) : (
          <Button variant="filled" onClick={submit} disabled={!draft.trim()}>Send</Button>
        )}
      </div>
    </div>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  switch (item.role) {
    case "user":
      return (
        <div style={styles.userRow}>
          <div style={styles.userBubble}>{item.text}</div>
        </div>
      );
    case "assistant":
      return (
        <div style={styles.assistantRow}>
          <MarkdownText text={item.text} />
        </div>
      );
    case "thinking":
      return <Collapsible summary="Reasoning" muted body={item.text} />;
    case "tool":
      return <ToolRow item={item} />;
    case "error":
      return <div style={styles.error}>{item.message}</div>;
    default:
      return null;
  }
}

function ToolRow({ item }: { item: Extract<TimelineItem, { role: "tool" }> }) {
  const inputStr =
    item.input && Object.keys(item.input as object).length > 0
      ? JSON.stringify(item.input, null, 2)
      : "";
  return (
    <div style={{ ...styles.tool, borderColor: item.isError ? "var(--md-sys-color-error)" : "var(--md-sys-color-outline-variant)" }}>
      <div style={styles.toolHead}>
        <span style={styles.toolIcon} aria-hidden>
          {item.status === "running" ? "⟳" : item.isError ? "✕" : "✓"}
        </span>
        <span style={styles.toolName}>{item.label}</span>
        <span style={styles.toolStatus}>{item.status === "running" ? "running" : item.isError ? "error" : "done"}</span>
      </div>
      {inputStr ? <Collapsible summary="Input" body={inputStr} mono /> : null}
      {item.result ? <Collapsible summary="Result" body={item.result} mono /> : null}
    </div>
  );
}

function Collapsible({
  summary,
  body,
  muted,
  mono,
}: {
  summary: string;
  body: string;
  muted?: boolean;
  mono?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ ...styles.collapsible, ...(muted ? styles.collapsibleMuted : {}) }}>
      <button
        type="button"
        style={styles.collapsibleToggle}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden>{open ? "▾" : "▸"}</span> {summary}
      </button>
      {open ? (
        <pre style={{ ...styles.collapsibleBody, ...(mono ? {} : { whiteSpace: "pre-wrap", fontFamily: "inherit" }) }}>
          {body}
        </pre>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0 },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid var(--md-sys-color-outline-variant)",
  },
  kicker: { margin: 0, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: "var(--md-sys-color-on-surface-variant)" },
  title: { margin: 0, fontSize: 20 },
  timeline: { flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 14, minHeight: 0 },
  empty: { color: "var(--md-sys-color-on-surface-variant)", fontSize: 14, maxWidth: 520, lineHeight: 1.5 },
  streaming: { color: "var(--md-sys-color-primary)", fontSize: 13 },
  userRow: { display: "flex", justifyContent: "flex-end" },
  userBubble: {
    background: "var(--md-sys-color-primary-container)",
    color: "var(--md-sys-color-on-primary-container)",
    padding: "10px 14px",
    borderRadius: 14,
    maxWidth: "80%",
    whiteSpace: "pre-wrap",
  },
  assistantRow: { maxWidth: "90%" },
  error: {
    background: "var(--md-sys-color-error-container)",
    color: "var(--md-sys-color-on-error-container)",
    padding: "10px 14px",
    borderRadius: 12,
    fontSize: 13,
  },
  tool: {
    border: "1px solid var(--md-sys-color-outline-variant)",
    borderRadius: 12,
    padding: "10px 12px",
    background: "var(--md-sys-color-surface-container-low)",
  },
  toolHead: { display: "flex", alignItems: "center", gap: 8 },
  toolIcon: { color: "var(--md-sys-color-primary)" },
  toolName: { fontWeight: 600, fontSize: 14 },
  toolStatus: { marginLeft: "auto", fontSize: 11, color: "var(--md-sys-color-on-surface-variant)" },
  collapsible: { marginTop: 8 },
  collapsibleMuted: { opacity: 0.75 },
  collapsibleToggle: {
    background: "none",
    border: "none",
    color: "var(--md-sys-color-on-surface-variant)",
    cursor: "pointer",
    fontSize: 12,
    padding: 0,
  },
  collapsibleBody: {
    marginTop: 6,
    fontSize: 12,
    background: "var(--md-sys-color-surface-container)",
    padding: "8px 10px",
    borderRadius: 8,
    overflowX: "auto",
    maxHeight: 280,
  },
  composer: {
    display: "flex",
    gap: 10,
    alignItems: "flex-end",
    padding: "14px 20px",
    borderTop: "1px solid var(--md-sys-color-outline-variant)",
  },
  textarea: {
    flex: 1,
    resize: "none",
    borderRadius: 12,
    border: "1px solid var(--md-sys-color-outline-variant)",
    padding: "10px 12px",
    font: "inherit",
    background: "var(--md-sys-color-surface)",
    color: "var(--md-sys-color-on-surface)",
  },
};
