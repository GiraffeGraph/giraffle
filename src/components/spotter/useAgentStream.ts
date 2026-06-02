"use client";

import { useCallback, useRef, useState } from "react";
import { drainNdjson } from "@/lib/agent-stream";

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

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    sessionRef.current = null;
    setItems([]);
  }, [stop]);

  const send = useCallback(async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed || isStreaming) return;

    setItems((prev) => [...prev, { id: nextId(), role: "user", text: trimmed }]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // Track the assistant text item we merge consecutive text chunks into.
    let assistantId: string | null = null;

    const appendText = (text: string) => {
      setItems((prev) => {
        if (assistantId) {
          return prev.map((it) =>
            it.id === assistantId && it.role === "assistant"
              ? { ...it, text: it.text + text }
              : it,
          );
        }
        const id = nextId();
        assistantId = id;
        return [...prev, { id, role: "assistant", text }];
      });
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

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = drainNdjson(buffer);
        buffer = rest;

        for (const ev of events) {
          switch (ev.kind) {
            case "session":
              sessionRef.current = ev.sessionId;
              break;
            case "text":
              appendText(ev.text);
              break;
            case "thinking":
              assistantId = null;
              setItems((prev) => [...prev, { id: nextId(), role: "thinking", text: ev.text }]);
              break;
            case "tool_call":
              assistantId = null;
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
              setItems((prev) =>
                prev.map((it) =>
                  it.role === "tool" && it.status === "running" && it.toolId === ev.toolUseId
                    ? { ...it, result: ev.preview, isError: ev.isError, status: "done" }
                    : it,
                ),
              );
              break;
            case "rate_limit":
              setItems((prev) => [...prev, { id: nextId(), role: "error", message: ev.message }]);
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
        }
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setItems((prev) => [
          ...prev,
          { id: nextId(), role: "error", message: "Stream interrupted." },
        ]);
      }
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }, [isStreaming]);

  return { items, isStreaming, send, stop, reset };
}
