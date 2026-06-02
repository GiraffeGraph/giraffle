/**
 * Normalizes Claude Code's stream-json events (emitted by `claude -p
 * --output-format stream-json`) into a small UI-friendly event set. Pure: no
 * React, no IO — easy to unit test and reuse for any CLI agent that speaks the
 * same protocol.
 */

export type AgentEvent =
  | { kind: "session"; sessionId: string }
  | { kind: "thinking"; text: string }
  | { kind: "text"; text: string }
  | { kind: "tool_call"; id: string; name: string; label: string; input: unknown }
  | { kind: "tool_result"; toolUseId: string | null; isError: boolean; preview: string }
  | { kind: "rate_limit"; message: string }
  | { kind: "done"; result: string; isError: boolean; sessionId: string | null }
  | { kind: "error"; message: string };

interface RawBlock {
  type?: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

/** Strip the `mcp__giraffle__giraffle-` noise so tool names read cleanly. */
export function prettyToolName(name: string): string {
  return name
    .replace(/^mcp__[^_]+__/, "")
    .replace(/^giraffle-/, "")
    .replace(/-/g, " ");
}

function previewContent(content: unknown): string {
  if (typeof content === "string") return content.slice(0, 600);
  if (Array.isArray(content)) {
    return content
      .map((c) =>
        c && typeof c === "object" && "text" in (c as Record<string, unknown>)
          ? String((c as { text: unknown }).text)
          : JSON.stringify(c),
      )
      .join("\n")
      .slice(0, 600);
  }
  if (content == null) return "";
  return JSON.stringify(content).slice(0, 600);
}

/** Convert one parsed stream-json object into zero or more normalized events. */
export function parseAgentEvent(raw: unknown): AgentEvent[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  const type = obj.type;

  // Giraffle-injected error line from the API route.
  if (type === "giraffle_error") {
    return [{ kind: "error", message: String(obj.message ?? "Agent error") }];
  }

  if (type === "rate_limit_event") {
    return [{ kind: "rate_limit", message: "Rate limit reached — the agent paused." }];
  }

  if (type === "result") {
    return [
      {
        kind: "done",
        result: typeof obj.result === "string" ? obj.result : "",
        isError: obj.is_error === true,
        sessionId: typeof obj.session_id === "string" ? obj.session_id : null,
      },
    ];
  }

  if (type === "assistant") {
    const message = obj.message as { content?: RawBlock[] } | undefined;
    const out: AgentEvent[] = [];
    for (const block of message?.content ?? []) {
      if (block.type === "thinking" && typeof block.thinking === "string") {
        out.push({ kind: "thinking", text: block.thinking });
      } else if (block.type === "text" && typeof block.text === "string") {
        out.push({ kind: "text", text: block.text });
      } else if (block.type === "tool_use" && typeof block.name === "string") {
        out.push({
          kind: "tool_call",
          id: String(block.id ?? ""),
          name: block.name,
          label: prettyToolName(block.name),
          input: block.input,
        });
      }
    }
    return out;
  }

  if (type === "user") {
    const message = obj.message as { content?: RawBlock[] } | undefined;
    const out: AgentEvent[] = [];
    for (const block of message?.content ?? []) {
      if (block.type === "tool_result") {
        out.push({
          kind: "tool_result",
          toolUseId: typeof block.tool_use_id === "string" ? block.tool_use_id : null,
          isError: block.is_error === true,
          preview: previewContent(block.content),
        });
      }
    }
    return out;
  }

  // system / init / hook events: capture session id only.
  if (type === "system" && typeof obj.session_id === "string") {
    return [{ kind: "session", sessionId: obj.session_id }];
  }

  return [];
}

/**
 * Splits a streaming text buffer into complete NDJSON lines, returning parsed
 * agent events plus the unconsumed remainder. Call repeatedly as chunks arrive.
 */
export function drainNdjson(buffer: string): { events: AgentEvent[]; rest: string } {
  const events: AgentEvent[] = [];
  let rest = buffer;
  let idx: number;
  while ((idx = rest.indexOf("\n")) !== -1) {
    const line = rest.slice(0, idx).trim();
    rest = rest.slice(idx + 1);
    if (!line) continue;
    try {
      events.push(...parseAgentEvent(JSON.parse(line)));
    } catch {
      // Partial or non-JSON line; skip.
    }
  }
  return { events, rest };
}
