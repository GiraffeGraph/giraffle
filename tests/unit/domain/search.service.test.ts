import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {},
}));

let parseWorkspaceSearchQuery: typeof import("@/domain/search/search.service").parseWorkspaceSearchQuery;

beforeAll(async () => {
  ({ parseWorkspaceSearchQuery } = await import("@/domain/search/search.service"));
});

describe("search.service", () => {
  it("parses operators, phrases, and negation", () => {
    const parsed = parseWorkspaceSearchQuery(
      'folder:"Product Roadmap" title:weekly is:pinned "launch plan" -draft',
    );

    expect(parsed.folderFilters).toEqual(["product roadmap"]);
    expect(parsed.titleFilters).toEqual(["weekly"]);
    expect(parsed.phrases).toEqual(["launch plan"]);
    expect(parsed.negativeTokens).toContain("draft");
    expect(parsed.isPinned).toBe(true);
  });

  it("detects regex mode", () => {
    const parsed = parseWorkspaceSearchQuery("/roadmap|plan/i");

    expect(parsed.isRegex).toBe(true);
    expect(parsed.regex).toBeInstanceOf(RegExp);
    expect(parsed.regexError).toBeNull();
  });
});
