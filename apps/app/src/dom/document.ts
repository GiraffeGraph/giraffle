import {
  generateId,
  type BlockNodeContent,
  type TiptapDocument,
  type TiptapNode,
} from "@giraffle/domain";

/**
 * Block nodes the mobile editor registers and that carry a stable `id`, so a
 * task item keeps its identity across saves and a toggle can name the block it
 * came from. Keep in step with the extension list in `Editor.tsx`.
 */
export const ID_BEARING_NODES = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "codeBlock",
  "blockquote",
  "horizontalRule",
  "image",
  "taskList",
  "taskItem",
] as const;

const ID_BEARING = new Set<string>(ID_BEARING_NODES);

export function isIdBearing(type: string): boolean {
  return ID_BEARING.has(type);
}

export interface TaskToggle {
  taskId: string;
  checked: boolean;
}

function isTextNode(node: TiptapNode): boolean {
  return node.type === "text";
}

/**
 * Fills in every missing or duplicated block id. Documents arrive from storage
 * written by any client, so ids are repaired before the editor adopts them
 * rather than trusted.
 */
export function assignBlockIds(
  document: TiptapDocument,
  mint: () => string = generateId,
): TiptapDocument {
  const used = new Set<string>();

  const nextId = (current: string | null): string => {
    if (current !== null && current.length > 0 && !used.has(current)) {
      used.add(current);
      return current;
    }
    let candidate = mint();
    while (used.has(candidate)) candidate = mint();
    used.add(candidate);
    return candidate;
  };

  // Ids are handed out in document order, so a rewritten document reads the
  // same way on every client.
  const visit = (node: TiptapNode): TiptapNode => {
    if (isTextNode(node)) return node;
    const block = node as BlockNodeContent;
    if (!ID_BEARING.has(block.type)) {
      const children = block.content?.map(visit);
      return children ? { ...block, content: children } : block;
    }
    const current = typeof block.attrs?.id === "string" ? block.attrs.id : null;
    const attrs = { ...block.attrs, id: nextId(current) };
    const children = block.content?.map(visit);
    return children ? { ...block, attrs, content: children } : { ...block, attrs };
  };

  return {
    type: "doc",
    content: document.content.map((node) => visit(node) as BlockNodeContent),
  };
}

function collectTaskStates(document: TiptapDocument): Map<string, boolean> {
  const states = new Map<string, boolean>();

  const visit = (node: TiptapNode): void => {
    if (isTextNode(node)) return;
    const block = node as BlockNodeContent;
    if (block.type === "taskItem" && typeof block.attrs?.id === "string") {
      states.set(block.attrs.id, block.attrs.checked === true);
    }
    block.content?.forEach(visit);
  };

  document.content.forEach(visit);
  return states;
}

/**
 * The checkboxes that flipped between two revisions of a document. Blocks that
 * appeared or disappeared are not toggles, so only ids present in both sides
 * with a changed state are reported.
 */
export function taskToggles(
  before: TiptapDocument,
  after: TiptapDocument,
): TaskToggle[] {
  const previous = collectTaskStates(before);
  const toggles: TaskToggle[] = [];

  for (const [taskId, checked] of collectTaskStates(after)) {
    const wasChecked = previous.get(taskId);
    if (wasChecked !== undefined && wasChecked !== checked) {
      toggles.push({ taskId, checked });
    }
  }

  return toggles;
}
