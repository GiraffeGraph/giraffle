import { describe, expect, it } from "vitest";
import { markdownToBlocks } from "@giraffle/domain";

describe("note markdown serializer", () => {
  it("parses pasted markdown blocks into Tiptap nodes", () => {
    const document = markdownToBlocks(`# Heading\n\n- First\n- Second\n\n- [x] Done`);

    expect(document.content).toMatchObject([
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Heading" }],
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "First" }] },
            ],
          },
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Second" }] },
            ],
          },
        ],
      },
      {
        type: "taskList",
        content: [
          {
            type: "taskItem",
            attrs: { checked: true },
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Done" }] },
            ],
          },
        ],
      },
    ]);
  });

  it("parses inline markdown marks", () => {
    const document = markdownToBlocks(
      "A **bold** *italic* `code` [link](https://example.com) [[Note|Wiki]]"
    );

    expect(document.content[0]).toMatchObject({
      type: "paragraph",
      content: [
        { type: "text", text: "A " },
        { type: "text", text: "bold", marks: [{ type: "bold" }] },
        { type: "text", text: " " },
        { type: "text", text: "italic", marks: [{ type: "italic" }] },
        { type: "text", text: " " },
        { type: "text", text: "code", marks: [{ type: "code" }] },
        { type: "text", text: " " },
        {
          type: "text",
          text: "link",
          marks: [{ type: "link", attrs: { href: "https://example.com" } }],
        },
        { type: "text", text: " " },
        {
          type: "text",
          text: "Wiki",
          marks: [
            {
              type: "wikilink",
              attrs: { target: "Note", displayText: "Wiki" },
            },
          ],
        },
      ],
    });
  });
});
