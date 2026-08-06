import { EMPTY_DOCUMENT, type Page } from "@/domain/models";
import { pageAncestors, pageLabel, selectableParentPages } from "@/domain/pages/tree";

function page(id: string, title: string, parentId: string | null): Page {
  return {
    id,
    title,
    icon: null,
    parentId,
    position: "1",
    isPinned: false,
    isArchived: false,
    document: EMPTY_DOCUMENT,
    createdAt: 0,
    updatedAt: 0,
  };
}

const pages: Page[] = [
  page("root", "Project", null),
  page("child", "Research", "root"),
  page("grandchild", "Sources", "child"),
  page("other", "Personal", null),
];

describe("page tree", () => {
  test("ancestors run outermost first and exclude the page itself", () => {
    expect(pageAncestors(pages, "grandchild").map((item) => item.id)).toEqual([
      "root",
      "child",
    ]);
    expect(pageAncestors(pages, "root")).toEqual([]);
  });

  test("label joins the full ancestor path", () => {
    expect(pageLabel(pages, pages[2] as Page)).toBe("Project / Research / Sources");
  });

  test("a page cannot be moved into itself or its descendants", () => {
    const options = selectableParentPages(pages, "root").map((item) => item.id);
    expect(options).toEqual(["other"]);
  });

  test("descendants of other branches stay selectable", () => {
    const options = selectableParentPages(pages, "other").map((item) => item.id);
    expect(options).toEqual(["root", "child", "grandchild"]);
  });

  test("a broken parent link cannot loop forever", () => {
    const cyclic = [page("a", "A", "b"), page("b", "B", "a")];
    expect(pageAncestors(cyclic, "a").map((item) => item.id)).toEqual(["b"]);
  });
});
