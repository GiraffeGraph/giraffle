import { describe, expect, it } from "vitest";
import { COMMANDS, findCommand } from "../index";

describe("headless command catalog", () => {
  it("keeps command names and CLI paths unique", () => {
    expect(new Set(COMMANDS.map((command) => command.name)).size).toBe(COMMANDS.length);
    expect(new Set(COMMANDS.map((command) => command.path.join(" "))).size).toBe(COMMANDS.length);
  });

  it("covers every workspace feature", () => {
    expect(new Set(COMMANDS.map((command) => command.path[0]))).toEqual(
      new Set(["pages", "states", "categories", "canvas"]),
    );
    expect(findCommand("pages", "search")?.name).toBe("pages_search");
    expect(findCommand("states", "create")?.name).toBe("states_create");
  });

  it("validates inputs and documents every command", () => {
    for (const command of COMMANDS) {
      expect(command.summary.length, command.name).toBeGreaterThan(20);
      expect(command.usage.length, command.name).toBeGreaterThan(5);
    }
    expect(findCommand("pages", "search")?.inputSchema.safeParse({ query: "release" }).success).toBe(true);
    expect(findCommand("pages", "search")?.inputSchema.safeParse({ query: "", limit: 500 }).success).toBe(false);
  });
});
