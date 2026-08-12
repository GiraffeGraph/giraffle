import { describe, expect, it } from "vitest";
import { MCP_TOOL_SCHEMAS } from "../src/mcp";

describe("MCP tool catalog", () => {
  it("keeps internal names and wire names unique", () => {
    const names = MCP_TOOL_SCHEMAS.map((tool) => tool.name);
    const mcpNames = MCP_TOOL_SCHEMAS.map((tool) => tool.mcpName);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(mcpNames).size).toBe(mcpNames.length);
  });

  it("uses the same plain feature names as the app", () => {
    const prefixes = new Set(MCP_TOOL_SCHEMAS.map((tool) => tool.name.split("_")[0]));
    expect([...prefixes].sort()).toEqual([
      "boards",
      "canvas",
      "pages",
      "priority",
      "tasks",
    ]);

  });

  it("describes and validates every public tool", () => {
    for (const tool of MCP_TOOL_SCHEMAS) {
      expect(tool.description.length, tool.name).toBeGreaterThan(20);
      expect(tool.mcpName, tool.name).toMatch(/^giraffle-[a-z-]+$/);
    }
  });

  it("validates representative inputs", () => {
    const search = MCP_TOOL_SCHEMAS.find((tool) => tool.name === "pages_search");
    expect(search?.inputSchema.safeParse({ query: "release" }).success).toBe(true);
    expect(search?.inputSchema.safeParse({ query: "", limit: 500 }).success).toBe(false);

    const move = MCP_TOOL_SCHEMAS.find((tool) => tool.name === "boards_move_task");
    expect(
      move?.inputSchema.safeParse({ taskId: "t1", columnId: "c1", afterTaskId: null }).success,
    ).toBe(true);
  });

  it("marks mutations as destructive", () => {
    const byName = new Map(MCP_TOOL_SCHEMAS.map((tool) => [tool.name, tool]));
    expect(byName.get("pages_get")?.destructive).toBe(false);
    expect(byName.get("pages_create")?.destructive).toBe(true);
    expect(byName.get("boards_delete")?.destructive).toBe(true);
  });
});
