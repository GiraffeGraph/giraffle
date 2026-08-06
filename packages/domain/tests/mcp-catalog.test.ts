import { describe, expect, it } from "vitest";
import { MCP_TOOL_SCHEMAS } from "../src/mcp";

describe("MCP tool catalog", () => {
  it("keeps internal names and wire names unique", () => {
    const names = MCP_TOOL_SCHEMAS.map((tool) => tool.name);
    const mcpNames = MCP_TOOL_SCHEMAS.map((tool) => tool.mcpName);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(mcpNames).size).toBe(mcpNames.length);
  });

  it("covers every workspace surface an agent can drive", () => {
    const prefixes = new Set(MCP_TOOL_SCHEMAS.map((tool) => tool.name.split("_")[0]));
    expect([...prefixes].sort()).toEqual([
      "kanban",
      "notes",
      "pages",
      "savanna",
      "stride",
      "tower",
    ]);
  });

  it("describes every tool for the agent that reads it", () => {
    for (const tool of MCP_TOOL_SCHEMAS) {
      expect(tool.description.length, tool.name).toBeGreaterThan(20);
      expect(tool.mcpName, tool.name).toMatch(/^giraffle-[a-z-]+$/);
    }
  });

  it("validates arguments rather than trusting the caller", () => {
    const search = MCP_TOOL_SCHEMAS.find((tool) => tool.name === "notes_search");
    expect(search?.inputSchema.parse({})).toEqual({ query: "", limit: 20 });
    expect(search?.inputSchema.safeParse({ limit: 500 }).success).toBe(false);

    // notes_append refuses a call that would append nothing.
    const append = MCP_TOOL_SCHEMAS.find((tool) => tool.name === "notes_append");
    expect(append?.inputSchema.safeParse({ noteId: "n1" }).success).toBe(false);
    expect(append?.inputSchema.safeParse({ noteId: "n1", markdown: "hi" }).success).toBe(true);
  });

  it("marks mutating tools destructive", () => {
    const byName = new Map(MCP_TOOL_SCHEMAS.map((tool) => [tool.name, tool]));
    expect(byName.get("notes_get")?.destructive).toBe(false);
    expect(byName.get("notes_create")?.destructive).toBe(true);
    expect(byName.get("kanban_delete_board")?.destructive).toBe(true);
  });
});
