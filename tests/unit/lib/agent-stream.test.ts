import { describe, expect, it } from "vitest";
import { parseAgentEvent, drainNdjson, prettyToolName } from "@/lib/agent-stream";

describe("parseAgentEvent", () => {
  it("extracts text, thinking, and tool_use from an assistant message", () => {
    const events = parseAgentEvent({
      type: "assistant",
      message: {
        content: [
          { type: "thinking", thinking: "hmm" },
          { type: "text", text: "hello" },
          { type: "tool_use", id: "t1", name: "mcp__giraffle__giraffle-search-notes", input: { q: 1 } },
        ],
      },
    });
    expect(events).toEqual([
      { kind: "thinking", text: "hmm" },
      { kind: "text", text: "hello" },
      { kind: "tool_call", id: "t1", name: "mcp__giraffle__giraffle-search-notes", label: "search notes", input: { q: 1 } },
    ]);
  });

  it("extracts tool_result from a user message", () => {
    const events = parseAgentEvent({
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "t1", is_error: false, content: "ok" }] },
    });
    expect(events).toEqual([{ kind: "tool_result", toolUseId: "t1", isError: false, preview: "ok" }]);
  });

  it("maps result to a done event with session id", () => {
    expect(parseAgentEvent({ type: "result", result: "answer", is_error: false, session_id: "s1" })).toEqual([
      { kind: "done", result: "answer", isError: false, sessionId: "s1" },
    ]);
  });

  it("captures session id from a system event", () => {
    expect(parseAgentEvent({ type: "system", session_id: "s2" })).toEqual([{ kind: "session", sessionId: "s2" }]);
  });

  it("maps giraffle_error and rate_limit_event", () => {
    expect(parseAgentEvent({ type: "giraffle_error", message: "boom" })).toEqual([{ kind: "error", message: "boom" }]);
    expect(parseAgentEvent({ type: "rate_limit_event" })[0].kind).toBe("rate_limit");
  });

  it("returns no events for non-array message.content (string)", () => {
    expect(parseAgentEvent({ type: "assistant", message: { content: "oops" } })).toEqual([]);
  });

  it("returns [] for junk", () => {
    expect(parseAgentEvent(null)).toEqual([]);
    expect(parseAgentEvent({ type: "unknown" })).toEqual([]);
  });
});

describe("drainNdjson", () => {
  it("parses complete lines and keeps the trailing partial in rest", () => {
    const buf =
      JSON.stringify({ type: "system", session_id: "s" }) +
      "\n" +
      JSON.stringify({ type: "result", result: "r", is_error: false, session_id: "s" }).slice(0, 10);
    const { events, rest } = drainNdjson(buf);
    expect(events).toEqual([{ kind: "session", sessionId: "s" }]);
    expect(rest.length).toBeGreaterThan(0);
  });

  it("skips blank and non-JSON lines", () => {
    const { events } = drainNdjson("\nnot json\n" + JSON.stringify({ type: "system", session_id: "x" }) + "\n");
    expect(events).toEqual([{ kind: "session", sessionId: "x" }]);
  });

  it("drops a runaway partial line instead of buffering without bound", () => {
    const { rest } = drainNdjson("x".repeat(6_000_000));
    expect(rest).toBe("");
  });
});

describe("prettyToolName", () => {
  it("strips the mcp/giraffle prefixes and normalizes separators", () => {
    expect(prettyToolName("mcp__giraffle__giraffle-search-notes")).toBe("search notes");
    expect(prettyToolName("mcp__giraffle__stride_list_scheduled")).toBe("stride list scheduled");
  });
});
