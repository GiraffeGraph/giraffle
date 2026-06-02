import { describe, expect, it } from "vitest";
import { buildAgentArgs } from "@/domain/agent/cli-runner";

const BASE = {
  prompt: "do the thing",
  mcpUrl: "http://localhost:3000/api/mcp",
  mcpToken: "gfl_mcp_abc",
};

describe("buildAgentArgs", () => {
  it("builds the headless stream-json command with the loopback MCP config", () => {
    const args = buildAgentArgs(BASE, "bypassPermissions");
    expect(args[0]).toBe("-p");
    expect(args[1]).toBe("do the thing");
    expect(args).toContain("stream-json");
    expect(args).toContain("--strict-mcp-config");
    expect(args[args.indexOf("--permission-mode") + 1]).toBe("bypassPermissions");
    expect(args[args.indexOf("--model") + 1]).toBe("sonnet");

    const cfg = JSON.parse(args[args.indexOf("--mcp-config") + 1]);
    expect(cfg.mcpServers.giraffle.url).toBe(BASE.mcpUrl);
    expect(cfg.mcpServers.giraffle.headers.Authorization).toBe("Bearer gfl_mcp_abc");
  });

  it("appends --resume only when a session id is provided", () => {
    expect(buildAgentArgs(BASE)).not.toContain("--resume");
    const args = buildAgentArgs({ ...BASE, resume: "sess-1" });
    expect(args[args.indexOf("--resume") + 1]).toBe("sess-1");
  });

  it("honors an explicit model", () => {
    const args = buildAgentArgs({ ...BASE, model: "opus" });
    expect(args[args.indexOf("--model") + 1]).toBe("opus");
  });

  it("rejects option-injection via model or resume", () => {
    expect(() => buildAgentArgs({ ...BASE, model: "--dangerously" })).toThrow(/model/);
    expect(() => buildAgentArgs({ ...BASE, resume: "-p" })).toThrow(/resume/);
  });
});
