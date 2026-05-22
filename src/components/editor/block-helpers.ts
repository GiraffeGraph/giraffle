import type { Editor as TiptapEditor } from "@tiptap/core";
import type { BlockNodeContent } from "@/domain/note/note.types";
import { generateId } from "@/lib/utils";

export function resolveColorSelectionRange(
  editor: TiptapEditor,
  range: { from: number; to: number } | null,
) {
  const fallbackRange = range ?? {
    from: editor.state.selection.from,
    to: editor.state.selection.to,
  };

  if (fallbackRange.from !== fallbackRange.to) return fallbackRange;

  const resolvedPosition = editor.state.doc.resolve(fallbackRange.from);
  if (!resolvedPosition.parent.isTextblock) return fallbackRange;

  const text = resolvedPosition.parent.textContent ?? "";
  if (!text.trim()) return fallbackRange;

  let cursor = Math.max(
    0,
    Math.min(resolvedPosition.parentOffset, text.length),
  );

  if (cursor === text.length && cursor > 0) cursor -= 1;

  const isBoundary = (character: string | undefined) =>
    !character || /\s/.test(character);

  if (isBoundary(text[cursor]) && cursor > 0 && !isBoundary(text[cursor - 1])) {
    cursor -= 1;
  }
  if (isBoundary(text[cursor])) return fallbackRange;

  let start = cursor;
  let end = cursor + 1;
  while (start > 0 && !isBoundary(text[start - 1])) start -= 1;
  while (end < text.length && !isBoundary(text[end])) end += 1;
  if (start === end) return fallbackRange;

  const offset = resolvedPosition.start();
  return { from: offset + start, to: offset + end };
}

export function getClosestBlockElement(
  target: HTMLElement,
  rootElement: HTMLElement,
): HTMLElement | null {
  const blockElement = target.closest("[data-block-id]");
  if (!(blockElement instanceof HTMLElement)) return null;
  if (!rootElement.contains(blockElement)) return null;
  return blockElement;
}

export function getSelectionBlockId(editor: TiptapEditor) {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    const blockId = node.attrs?.blockId;
    if (typeof blockId === "string") return blockId;
  }
  return null;
}

export function focusBlockById(editor: TiptapEditor, blockId: string) {
  const blockElement = document.querySelector(
    `[data-block-id="${blockId}"]`,
  );
  if (!(blockElement instanceof HTMLElement)) {
    editor.commands.focus("end");
    return;
  }
  try {
    const position = editor.view.posAtDOM(blockElement, 0);
    editor.chain().focus().setTextSelection(position + 1).run();
  } catch {
    editor.commands.focus("end");
  }
}

export function getBlockId(block: BlockNodeContent) {
  return typeof block.attrs?.blockId === "string" ? block.attrs.blockId : null;
}

export function getChildBlocks(node: BlockNodeContent) {
  return (node.content ?? []).filter(
    (child): child is BlockNodeContent => child.type !== "text",
  );
}

export function findBlockLocation(
  blocks: BlockNodeContent[],
  blockId: string,
  parentBlockId: string | null = null,
): {
  block: BlockNodeContent;
  parentBlockId: string | null;
  siblings: BlockNodeContent[];
  index: number;
} | null {
  for (const [index, block] of blocks.entries()) {
    if (getBlockId(block) === blockId) {
      return { block, parentBlockId, siblings: blocks, index };
    }
    const childBlocks = getChildBlocks(block);
    if (childBlocks.length === 0) continue;
    const nestedResult = findBlockLocation(
      childBlocks,
      blockId,
      getBlockId(block) ?? null,
    );
    if (nestedResult) return nestedResult;
  }
  return null;
}

export function cloneBlockTree(block: BlockNodeContent): BlockNodeContent {
  const nextBlockId = generateId();
  return {
    ...block,
    attrs: {
      ...(block.attrs ?? {}),
      blockId: nextBlockId,
    },
    content: (block.content ?? []).map((child) =>
      child.type === "text" ? { ...child } : cloneBlockTree(child),
    ),
  };
}
