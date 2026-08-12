import { describe, expect, it } from "vitest";
import { buildPageExportArtifact } from "@giraffle/domain";

describe("page export", () => {
  it("builds Markdown and MDX without publishing metadata", () => {
    const artifact = buildPageExportArtifact({
      id: "page-1",
      title: 'A "portable" page',
      updatedAt: new Date("2026-04-12T10:00:00.000Z").getTime(),
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
      pageId: "page-1",
      title: 'A "portable" page',
      markdown: "Hello",
      mdx: [
        "---",
        'title: "A \\"portable\\" page"',
        'pageId: "page-1"',
        'updatedAt: "2026-04-12T10:00:00.000Z"',
        "---",
        "",
        "Hello",
      ].join("\n"),
    });
    expect(artifact.mdx).not.toMatch(/publish|slug/i);
  });
});
