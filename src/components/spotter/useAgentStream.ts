"use client";

import { useCallback, useRef, useState } from "react";
import { drainNdjson, type AgentEvent } from "@/lib/agent-stream";

export type TimelineItem =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string }
  | { id: string; role: "thinking"; text: string }
  | {
      id: string;
      role: "tool";
      toolId: string;
      name: string;
      label: string;
      input: unknown;
      result: string | null;
      isError: boolean;
      status: "running" | "done";
    }
  | { id: string; role: "error"; message: string };

let counter = 0;
function nextId(): string {
  counter += 1;
  return `item-${counter}`;
}

export interface UseAgentStream {
  items: TimelineItem[];
  isStreaming: boolean;
  send: (prompt: string) => Promise<void>;
  stop: () => void;
  reset: () => void;
}

export function useAgentStream(): UseAgentStream {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const sessionRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Ref mirrors isStreaming so send() can guard synchronously against a
  // double-submit fired before the state update commits.
  const isStreamingRef = useRef(false);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    isStreamingRef.current = false;
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    sessionRef.current = null;
    setItems([]);
  }, [stop]);

  const send = useCallback(async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed || isStreamingRef.current) return;

    isStreamingRef.current = true;
    setItems((prev) => [...prev, { id: nextId(), role: "user", text: trimmed }]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // Whether the current assistant turn's text bubble is still open (i.e. the
    // last item should keep receiving text). Mutated only OUTSIDE setItems so
    // the updater stays pure/idempotent under React StrictMode + concurrency.
    let assistantOpen = false;

    const appendText = (text: string) => {
      setItems((prev) => {
        const last = prev[prev.length - 1];
        if (assistantOpen && last?.role === "assistant") {
          return [...prev.slice(0, -1), { ...last, text: last.text + text }];
        }
        return [...prev, { id: nextId(), role: "assistant", text }];
      });
      assistantOpen = true;
    };

    try {
      const res = await fetch("/api/spotter/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, resume: sessionRef.current }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const msg = res.status === 401 ? "Not signed in." : `Agent request failed (${res.status}).`;
        setItems((prev) => [...prev, { id: nextId(), role: "error", message: msg }]);
        return;
      }

      const applyEvent = (ev: AgentEvent) => {
        // Ignore events from a run that has been superseded by stop()/reset()/a
        // new send(); their already-buffered chunks must not mutate the new
        // timeline or resume the stale session.
        if (abortRef.current !== controller) return;
        switch (ev.kind) {
          case "session":
            sessionRef.current = ev.sessionId;
            break;
          case "text":
            appendText(ev.text);
            break;
          case "thinking":
            assistantOpen = false;
            setItems((prev) => [...prev, { id: nextId(), role: "thinking", text: ev.text }]);
            break;
          case "tool_call":
            assistantOpen = false;
            setItems((prev) => [
              ...prev,
              {
                id: nextId(),
                role: "tool",
                toolId: ev.id,
                name: ev.name,
                label: ev.label,
                input: ev.input,
                result: null,
                isError: false,
                status: "running",
              },
            ]);
            break;
          case "tool_result":
            setItems((prev) => {
              let targetId: string | null = null;
              if (ev.toolUseId) {
                // Match strictly by id; a provided-but-unmatched id must NOT
                // resolve some other running tool (would mislabel parallel calls).
                const match = prev.find(
                  (it) => it.role === "tool" && it.status === "running" && it.toolId === ev.toolUseId,
                );
                targetId = match?.id ?? null;
              } else {
                // No id on the result: fall back to the last still-running tool
                // so its row doesn't hang forever.
                for (let i = prev.length - 1; i >= 0; i -= 1) {
                  const it = prev[i];
                  if (it.role === "tool" && it.status === "running") {
                    targetId = it.id;
                    break;
                  }
                }
              }
              if (!targetId) return prev;
              return prev.map((it) =>
                it.id === targetId && it.role === "tool"
                  ? { ...it, result: ev.preview, isError: ev.isError, status: "done" }
                  : it,
              );
            });
            break;
          case "rate_limit":
            // Informational telemetry — the agent CLI backs off and retries on
            // its own. Surfacing it as a persistent red error (with no "resumed"
            // event to clear it) is misleading, so we don't render it.
            break;
          case "done":
            if (ev.sessionId) sessionRef.current = ev.sessionId;
            if (ev.isError && ev.result) {
              setItems((prev) => [...prev, { id: nextId(), role: "error", message: ev.result }]);
            }
            break;
          case "error":
            setItems((prev) => [...prev, { id: nextId(), role: "error", message: ev.message }]);
            break;
        }
      };

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = drainNdjson(buffer);
        buffer = rest;
        for (const ev of events) applyEvent(ev);
      }
      // Flush a final line that arrived without a trailing newline (carries the
      // `done` event with the session id used for --resume).
      for (const ev of drainNdjson(buffer + decoder.decode()).events) applyEvent(ev);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setItems((prev) => [
          ...prev,
          { id: nextId(), role: "error", message: "Stream interrupted." },
        ]);
      }
    } finally {
      abortRef.current = null;
      isStreamingRef.current = false;
      setIsStreaming(false);
    }
  }, []);

  return { items, isStreaming, send, stop, reset };
}
