import type { TiptapDocument } from "@giraffle/domain";
import type { Editor } from "@tiptap/core";
import { assignBlockIds, ID_BEARING_NODES } from "@/dom/editor-document";
import { filterSlashCommands, SLASH_COMMANDS } from "@/dom/slash-menu";
import { editorCssVariables } from "@/dom/theme";
import { wikilinkRanges } from "@/dom/wikilinks";

function counter(): () => string {
  let index = 0;
  return () => `minted-${++index}`;
}

describe("editor document model", () => {
  test("mints an id for every block that has none", () => {
    const document: TiptapDocument = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Field research" }] },
        {
          type: "taskList",
          content: [
            { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph" }] },
          ],
        },
      ],
    };

    const result = assignBlockIds(document, counter());

    expect(result.content[0]?.attrs?.id).toBe("minted-1");
    const taskList = result.content[1];
    expect(taskList?.attrs?.id).toBe("minted-2");
    const taskItem = taskList?.content?.[0] as { attrs?: Record<string, unknown> } | undefined;
    expect(taskItem?.attrs?.id).toBe("minted-3");
    const paragraph = (taskItem as { content?: { attrs?: Record<string, unknown> }[] }).content?.[0];
    expect(paragraph?.attrs?.id).toBe("minted-4");
  });

  test("keeps ids that are already there", () => {
    const result = assignBlockIds(
      { type: "doc", content: [{ type: "paragraph", attrs: { id: "kept" } }] },
      counter(),
    );

    expect(result.content[0]?.attrs?.id).toBe("kept");
  });

  test("replaces an id a second block already claimed", () => {
    const result = assignBlockIds(
      {
        type: "doc",
        content: [
          { type: "paragraph", attrs: { id: "same" } },
          { type: "paragraph", attrs: { id: "same" } },
        ],
      },
      counter(),
    );

    expect(result.content[0]?.attrs?.id).toBe("same");
    expect(result.content[1]?.attrs?.id).toBe("minted-1");
  });

  test("leaves text nodes and their marks untouched", () => {
    const text = { type: "text", text: "Pack water", marks: [{ type: "bold" }] };
    const result = assignBlockIds(
      { type: "doc", content: [{ type: "paragraph", content: [text] }] },
      counter(),
    );

    expect(result.content[0]?.content?.[0]).toEqual(text);
  });

  test("only blocks the editor registers carry an id", () => {
    expect(ID_BEARING_NODES).toContain("taskItem");
    expect(ID_BEARING_NODES).not.toContain("text");
    expect(ID_BEARING_NODES).not.toContain("unsupportedNode");
  });
});

describe("wikilink ranges", () => {
  test("covers the brackets so the decoration wraps the whole link", () => {
    const text = "see [[Field Research]] later";
    const [range] = wikilinkRanges(text);

    expect(range).toEqual({ from: 4, to: 22, target: "Field Research" });
    expect(text.slice(range?.from ?? 0, range?.to ?? 0)).toBe("[[Field Research]]");
  });

  test("an alias links to the target, not the label", () => {
    expect(wikilinkRanges("[[Field Research|research]]")[0]?.target).toBe("Field Research");
  });

  test("finds every link in one text node", () => {
    expect(wikilinkRanges("[[A]] and [[B]]").map((range) => range.target)).toEqual(["A", "B"]);
  });

  test("plain text has none", () => {
    expect(wikilinkRanges("nothing to see")).toEqual([]);
    expect(wikilinkRanges("[[]]")).toEqual([]);
  });
});

describe("editor theme", () => {
  test("carries every colour the editor paints with", () => {
    expect(
      editorCssVariables({ text: "#111", muted: "#888", link: "#00f", background: "#f5efe5" }),
    ).toEqual({
      "--giraffle-ink": "#111",
      "--giraffle-muted": "#888",
      "--giraffle-link": "#00f",
      "--giraffle-bg": "#f5efe5",
    });
  });
});

interface ChainCall {
  name: string;
  args: unknown[];
}

/** Stands in for the editor so a slash command's chain can be read back. */
function recorder(): { calls: ChainCall[]; editor: Editor } {
  const calls: ChainCall[] = [];
  const chain: unknown = new Proxy(
    {},
    {
      get: (_target, name: string) =>
        (...args: unknown[]) => {
          calls.push({ name, args });
          return chain;
        },
    },
  );
  return { calls, editor: { chain: () => chain } as unknown as Editor };
}

describe("slash menu", () => {
  test("an empty query offers every block", () => {
    expect(filterSlashCommands("").map((command) => command.id)).toEqual(
      SLASH_COMMANDS.map((command) => command.id),
    );
  });

  test("filters on the title and on what a person might type instead", () => {
    expect(filterSlashCommands("head").map((command) => command.id)).toEqual([
      "heading1",
      "heading2",
      "heading3",
    ]);
    expect(filterSlashCommands("h2").map((command) => command.id)).toEqual(["heading2"]);
    expect(filterSlashCommands("checkbox").map((command) => command.id)).toEqual(["taskList"]);
    expect(filterSlashCommands("nothing at all")).toEqual([]);
  });

  test("a conversion replaces the typed query and keeps the block id", () => {
    const { calls, editor } = recorder();
    SLASH_COMMANDS.find((command) => command.id === "heading2")?.run(
      editor,
      { from: 1, to: 3 },
      "block-1",
    );

    expect(calls).toContainEqual({ name: "deleteRange", args: [{ from: 1, to: 3 }] });
    expect(calls).toContainEqual({ name: "setNode", args: ["heading", { level: 2, id: "block-1" }] });
  });

  test("a block with no id yet is converted without one, and the mint fills it in", () => {
    const { calls, editor } = recorder();
    SLASH_COMMANDS.find((command) => command.id === "text")?.run(editor, { from: 1, to: 2 }, null);

    expect(calls).toContainEqual({ name: "setNode", args: ["paragraph", {}] });
  });
});
