import type { TiptapDocument } from "@giraffle/domain";
import { assignBlockIds, ID_BEARING_NODES, taskToggles } from "@/dom/document";
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
        { type: "paragraph", content: [{ type: "text", text: "Field notes" }] },
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
    expect(ID_BEARING_NODES).not.toContain("kanban");
  });
});

describe("task toggles", () => {
  const document = (checked: boolean): TiptapDocument => ({
    type: "doc",
    content: [
      {
        type: "taskList",
        attrs: { id: "list" },
        content: [{ type: "taskItem", attrs: { id: "task-1", checked }, content: [] }],
      },
    ],
  });

  test("reports a checkbox that flipped", () => {
    expect(taskToggles(document(false), document(true))).toEqual([
      { blockId: "task-1", checked: true },
    ]);
    expect(taskToggles(document(true), document(false))).toEqual([
      { blockId: "task-1", checked: false },
    ]);
  });

  test("stays quiet when nothing flipped", () => {
    expect(taskToggles(document(false), document(false))).toEqual([]);
  });

  test("a newly typed task is not a toggle", () => {
    const before: TiptapDocument = { type: "doc", content: [] };
    expect(taskToggles(before, document(true))).toEqual([]);
  });

  test("a task without an id cannot be named, so it is not reported", () => {
    const before: TiptapDocument = {
      type: "doc",
      content: [{ type: "taskItem", attrs: { checked: false }, content: [] }],
    };
    const after: TiptapDocument = {
      type: "doc",
      content: [{ type: "taskItem", attrs: { checked: true }, content: [] }],
    };

    expect(taskToggles(before, after)).toEqual([]);
  });
});

describe("wikilink ranges", () => {
  test("covers the brackets so the decoration wraps the whole link", () => {
    const text = "see [[Field Notes]] later";
    const [range] = wikilinkRanges(text);

    expect(range).toEqual({ from: 4, to: 19, target: "Field Notes" });
    expect(text.slice(range?.from ?? 0, range?.to ?? 0)).toBe("[[Field Notes]]");
  });

  test("an alias links to the target, not the label", () => {
    expect(wikilinkRanges("[[Field Notes|notes]]")[0]?.target).toBe("Field Notes");
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
