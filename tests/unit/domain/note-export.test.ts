import { describe, expect, it } from "vitest";
import { buildNoteExportArtifact } from "@/domain/note/note.export";

describe("note export", () => {
  it("builds Markdown and MDX without publishing metadata", () => {
    const artifact = buildNoteExportArtifact({
      id: "note-1",
      title: 'A "portable" note',
      updatedAt: new Date("2026-04-12T10:00:00.000Z"),
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Hello" }],
          },
        ],
      },
    });

    expect(artifact).toEqual({
      noteId: "note-1",
      title: 'A "portable" note',
      markdown: "Hello",
      mdx: [
        "---",
        'title: "A \\"portable\\" note"',
        'noteId: "note-1"',
        'updatedAt: "2026-04-12T10:00:00.000Z"',
        "---",
        "",
        "Hello",
      ].join("\n"),
    });
    expect(artifact.mdx).not.toMatch(/publish|slug/i);
  });
});
