import type { CanvasElement } from "@giraffle/domain";
import {
  liveElements,
  normalizeReferenceLinks,
  pageIdForElement,
  pageReferenceSkeleton,
  referenceSkeleton,
  sceneMatches,
  sceneViewport,
  taskIdForElement,
} from "@/dom/scene";
import { canvasCssVariables, type CanvasTheme } from "@/dom/theme";

const element = (id: string, overrides: Partial<CanvasElement> = {}): CanvasElement => ({
  id,
  type: "rectangle",
  version: 1,
  versionNonce: 7,
  isDeleted: false,
  ...overrides,
});

describe("scene transformation", () => {
  test("drops the tombstones Excalidraw keeps for undo", () => {
    const scene = [element("a"), element("b", { isDeleted: true }), element("c")];

    expect(liveElements(scene).map((item) => item.id)).toEqual(["a", "c"]);
  });

  test("ignores anything that is not an element object", () => {
    expect(liveElements([null, undefined, "rectangle", 7])).toEqual([]);
  });

  test("a scene only counts as changed when an element did", () => {
    const scene = [element("a"), element("b")];

    expect(sceneMatches(scene, [element("a"), element("b")])).toBe(true);
    expect(sceneMatches(scene, [element("a")])).toBe(false);
    expect(sceneMatches(scene, [element("a"), element("c")])).toBe(false);
    expect(sceneMatches(scene, [element("a"), element("b", { version: 2 })])).toBe(false);
    expect(sceneMatches(scene, [element("a"), element("b", { versionNonce: 8 })])).toBe(false);
    expect(sceneMatches([], [])).toBe(true);
  });

  test("persists only the viewport, and defaults it when absent", () => {
    expect(sceneViewport({ scrollX: 12, scrollY: -4, zoom: { value: 2 } })).toEqual({
      scrollX: 12,
      scrollY: -4,
    });
    expect(sceneViewport({})).toEqual({ scrollX: 0, scrollY: 0 });
    expect(sceneViewport(undefined)).toEqual({ scrollX: 0, scrollY: 0 });
    expect(sceneViewport({ scrollX: "12" })).toEqual({ scrollX: 0, scrollY: 0 });
  });
});

describe("page references", () => {
  test("reads the page an element links to", () => {
    expect(pageIdForElement(element("a", { customData: { girafflePageId: "page-1" } }))).toBe(
      "page-1",
    );
  });

  test("an element without a link names no page", () => {
    expect(pageIdForElement(element("a"))).toBeNull();
    expect(pageIdForElement(element("a", { customData: {} }))).toBeNull();
    expect(pageIdForElement(null)).toBeNull();
  });

  test("a reference carries the id and nonce the host minted", () => {
    const skeleton = pageReferenceSkeleton(
      { kind: "page", pageId: "page-1", title: "Field Research", elementId: "element-1", versionNonce: 99 },
      0,
    );

    expect(skeleton).toMatchObject({
      type: "rectangle",
      id: "element-1",
      versionNonce: 99,
      label: { text: "Field Research" },
      link: "https://giraffle.local/page/page-1",
      customData: { girafflePageId: "page-1" },
    });
  });

  test("reference tiles lay out two per row so a busy canvas does not stack them", () => {
    const request = { kind: "page" as const, pageId: "p", title: "t", elementId: "e", versionNonce: 1 };

    expect(pageReferenceSkeleton(request, 0)).toMatchObject({ x: 24, y: 24 });
    expect(pageReferenceSkeleton(request, 1)).toMatchObject({ x: 284, y: 24 });
    expect(pageReferenceSkeleton(request, 2)).toMatchObject({ x: 24, y: 164 });
  });

  test("normalizes internal links before Excalidraw parses them", () => {
    const [normalized] = normalizeReferenceLinks([
      element("reference", {
        customData: { girafflePageId: "page-1" },
        link: "giraffle://page/page-1",
      }),
    ]);

    expect(normalized?.link).toBe("https://giraffle.local/page/page-1");
  });

  test("a task reference keeps the canonical task id", () => {
    const skeleton = referenceSkeleton(
      { kind: "task", taskId: "task-1", title: "Ship build", elementId: "element-2", versionNonce: 7 },
      0,
    );

    expect(skeleton).toMatchObject({
      label: { text: "Ship build" },
      link: "https://giraffle.local/task/task-1",
      customData: { giraffleTaskId: "task-1" },
    });
    expect(taskIdForElement(skeleton)).toBe("task-1");
  });
});

describe("canvas theme", () => {
  const theme: CanvasTheme = {
    bg: "#bg",
    dot: "#dot",
    surface: "#surface",
    ink: "#ink",
    muted: "#muted",
    border: "#border",
    accent: "#accent",
    danger: "#danger",
  };

  test("every colour the host sends reaches a custom property", () => {
    const variables = canvasCssVariables(theme);
    const applied = new Set(Object.values(variables));

    for (const colour of Object.values(theme)) {
      expect(applied.has(colour)).toBe(true);
    }
  });

  test("maps onto the properties Excalidraw styles its chrome from", () => {
    const variables = canvasCssVariables(theme);

    expect(variables["--island-bg-color"]).toBe("#surface");
    expect(variables["--text-primary-color"]).toBe("#ink");
    expect(variables["--default-border-color"]).toBe("#border");
    expect(variables["--color-primary"]).toBe("#accent");
    expect(variables["--color-danger"]).toBe("#danger");
    expect(variables["--giraffle-canvas-bg"]).toBe("#bg");
    expect(variables["--giraffle-canvas-dot"]).toBe("#dot");
  });
});
