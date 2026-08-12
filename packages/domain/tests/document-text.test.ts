import { describe, expect, it } from "vitest";
import { documentPlainText, parseWikilinks } from "@giraffle/domain";

describe("document plain text", () => {
  it("flattens nested content depth first", () => {
    const document = {
      type: "doc",
      content: [
        { type: "heading", content: [{ type: "text", text: "Field log" }] },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Pack water" }] }],
            },
          ],
        },
      ],
    };

    expect(documentPlainText(document)).toBe("Field log Pack water");
  });

  it("tolerates anything that is not a node", () => {
    expect(documentPlainText(null)).toBe("");
    expect(documentPlainText("text")).toBe("");
    expect(documentPlainText({ type: "paragraph" })).toBe("");
  });

  it("feeds the wikilink parser the text the search index sees", () => {
    const document = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "See [[Field Research]] and" }] },
        { type: "paragraph", content: [{ type: "text", text: "[[Map|the map]]" }] },
      ],
    };

    expect(parseWikilinks(documentPlainText(document)).map((link) => link.target)).toEqual([
      "Field Research",
      "Map",
    ]);
  });
});
