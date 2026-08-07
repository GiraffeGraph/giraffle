import { describe, expect, it } from "vitest";
import {
  extractCanvasReferences,
  extractCanvasTaskReferences,
  type CanvasElement,
} from "@giraffle/domain";

function element(overrides: Partial<CanvasElement> & { id: string }): CanvasElement {
  return {
    type: "rectangle",
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    ...overrides,
  };
}

describe("canvas references", () => {
  it("keeps only live elements that link to a page", () => {
    const references = extractCanvasReferences([
      element({ id: "b", customData: { girafflePageId: "page-b" } }),
      element({ id: "a", isDeleted: true, customData: { girafflePageId: "page-a" } }),
      element({ id: "c" }),
      element({ id: "d", customData: {} }),
    ]);

    expect(references).toEqual([{ elementId: "b", pageId: "page-b" }]);
  });

  it("orders by element id so a rebuilt table is byte-identical across devices", () => {
    const scene = [
      element({ id: "c", customData: { girafflePageId: "page-c" } }),
      element({ id: "a", customData: { girafflePageId: "page-a" } }),
      element({ id: "b", customData: { girafflePageId: "page-b" } }),
    ];

    expect(extractCanvasReferences(scene).map((item) => item.elementId)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(extractCanvasReferences([...scene].reverse())).toEqual(
      extractCanvasReferences(scene),
    );
  });

  it("collapses duplicate element ids to the last write", () => {
    expect(
      extractCanvasReferences([
        element({ id: "a", customData: { girafflePageId: "page-old" } }),
        element({ id: "a", version: 2, customData: { girafflePageId: "page-new" } }),
      ]),
    ).toEqual([{ elementId: "a", pageId: "page-new" }]);
  });

  it("extracts canonical task links independently from page links", () => {
    const scene = [
      element({ id: "b", customData: { giraffleTaskId: "task-b" } }),
      element({ id: "a", customData: { girafflePageId: "page-a" } }),
    ];

    expect(extractCanvasTaskReferences(scene)).toEqual([
      { elementId: "b", taskId: "task-b" },
    ]);
    expect(extractCanvasReferences(scene)).toEqual([
      { elementId: "a", pageId: "page-a" },
    ]);
  });

  it("returns nothing for an empty scene", () => {
    expect(extractCanvasReferences([])).toEqual([]);
    expect(extractCanvasTaskReferences([])).toEqual([]);
  });
});
