import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractCanvasReferences } from "@/domain/savanna/savanna.service";

describe("domain boundaries", () => {
  it("keeps boards, task metadata, page priority, and canvas references explicit", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");

    for (const model of [
      "Board",
      "BoardColumn",
      "BoardStatus",
      "BoardTask",
      "TaskMetadata",
      "PagePriority",
      "CanvasReference",
    ]) {
      expect(schema).toContain(`model ${model} {`);
    }
    expect(schema).not.toContain("kanbanColumns");
    expect(schema).not.toContain("boardColumns");
  });

  it("projects live note links from canvas elements", () => {
    expect(
      extractCanvasReferences([
        { id: "a", link: "/notes/note-a" },
        { id: "b", link: "https://example.test/notes/note-b/embed" },
        { id: "c", link: "/notes/deleted", isDeleted: true },
        { id: "d", link: "https://example.test/other" },
      ]),
    ).toEqual([
      { elementId: "a", noteId: "note-a" },
      { elementId: "b", noteId: "note-b" },
    ]);
  });
});
