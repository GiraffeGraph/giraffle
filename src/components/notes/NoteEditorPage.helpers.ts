import type { CSSProperties } from "react";
import type { NoteCategorySummary } from "@/domain/category/category.types";
import type { TiptapDocument } from "@/domain/note/note.types";

export interface TocHeading {
  level: number;
  text: string;
  blockId: string | null;
}

export function buildFolderLabel(
  folder: { id: string; name: string; parentId: string | null },
  folders: Array<{ id: string; name: string; parentId: string | null }>,
) {
  const foldersById = new Map(
    folders.map((candidate) => [candidate.id, candidate]),
  );
  const labels = [folder.name];
  let currentParentId = folder.parentId;

  while (currentParentId) {
    const parentFolder = foldersById.get(currentParentId);

    if (!parentFolder) {
      break;
    }

    labels.unshift(parentFolder.name);
    currentParentId = parentFolder.parentId;
  }

  return labels.join(" / ");
}

export function buildCategoryChipStyle(
  isActive: boolean,
  colors: { background: string; foreground: string },
) {
  return {
    background: isActive
      ? colors.background
      : "var(--md-sys-color-surface-container-low)",
    color: isActive
      ? colors.foreground
      : "var(--md-sys-color-on-surface-variant)",
    border: "none",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    opacity: 1,
  } satisfies CSSProperties;
}

export function buildSelectStyle(): CSSProperties {
  return {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "12px",
    border: "1px solid var(--md-sys-color-outline)",
    background: "transparent",
    color: "var(--md-sys-color-on-surface)",
    fontSize: "14px",
  };
}

export function sortCategories(categories: NoteCategorySummary[]) {
  return [...categories].sort((left, right) =>
    left.name.localeCompare(right.name, "tr"),
  );
}

export function extractHeadings(doc: TiptapDocument): TocHeading[] {
  const headings: TocHeading[] = [];
  for (const node of doc.content) {
    if (node.type === "heading" && node.content) {
      const level =
        typeof node.attrs?.level === "number" ? node.attrs.level : 1;
      const text = node.content
        .filter((n): n is { type: "text"; text: string } => n.type === "text")
        .map((n) => n.text)
        .join("");
      const blockId =
        typeof node.attrs?.blockId === "string" ? node.attrs.blockId : null;
      if (text.trim()) {
        headings.push({ level, text, blockId });
      }
    }
  }
  return headings;
}
