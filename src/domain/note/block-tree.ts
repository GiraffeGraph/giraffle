import { generateId } from "@/lib/utils";
import type {
  BlockAttributes,
  BlockNodeContent,
  TiptapDocument,
  TiptapNode,
} from "./note.types";

const PERSISTED_BLOCK_NODE_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "codeBlock",
  "blockquote",
  "image",
  "horizontalRule",
  "table",
]);

export interface PersistedBlockRecord {
  id: string;
  noteId: string;
  type: string;
  content: Record<string, unknown>;
  attributes: BlockAttributes;
  parentId: string | null;
  position: number;
  depth: number;
}

export interface PersistedBlockSource {
  id: string;
  type: string;
  content: unknown;
  attributes: unknown;
  parentId: string | null;
  position: number;
}

export function createEmptyDocument(): TiptapDocument {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: {
          blockId: generateId(),
        },
        content: [],
      },
    ],
  };
}

export function documentToPersistedBlocks(
  noteId: string,
  document: TiptapDocument
): PersistedBlockRecord[] {
  const blocks: PersistedBlockRecord[] = [];
  const usedBlockIds = new Set<string>();

  document.content.forEach((node, index) => {
    flattenBlockNode(node, noteId, null, index, 0, usedBlockIds, blocks);
  });

  return blocks;
}

export function persistedBlocksToDocument(
  blocks: PersistedBlockSource[]
): TiptapDocument {
  const childrenByParent = new Map<string | null, PersistedBlockSource[]>();

  for (const block of blocks) {
    const key = block.parentId ?? null;
    const siblings = childrenByParent.get(key) ?? [];
    siblings.push(block);
    childrenByParent.set(key, siblings);
  }

  for (const siblings of childrenByParent.values()) {
    siblings.sort((left, right) => left.position - right.position);
  }

  const rootBlocks = childrenByParent.get(null) ?? [];

  return {
    type: "doc",
    content: rootBlocks.map((block) =>
      buildDocumentNode(block, childrenByParent)
    ),
  };
}

function flattenBlockNode(
  node: BlockNodeContent,
  noteId: string,
  parentId: string | null,
  position: number,
  depth: number,
  usedBlockIds: Set<string>,
  blocks: PersistedBlockRecord[]
) {
  const blockId = resolveBlockId(node.attrs, usedBlockIds);
  const attributes: BlockAttributes = {
    ...toAttributes(node.attrs),
    blockId,
  };
  const content = splitNodeContent(node.content);

  blocks.push({
    id: blockId,
    noteId,
    type: node.type,
    content: {
      type: node.type,
      ...(Object.keys(attributes).length > 0 ? { attrs: attributes } : {}),
      ...(content.inlineContent.length > 0
        ? { content: content.inlineContent }
        : {}),
    },
    attributes,
    parentId,
    position,
    depth,
  });

  content.childBlocks.forEach((childBlock, childIndex) => {
    flattenBlockNode(
      childBlock,
      noteId,
      blockId,
      childIndex,
      depth + 1,
      usedBlockIds,
      blocks
    );
  });
}

function buildDocumentNode(
  block: PersistedBlockSource,
  childrenByParent: Map<string | null, PersistedBlockSource[]>
): BlockNodeContent {
  const storedContent = isRecord(block.content) ? block.content : {};
  const inlineContent = toNodeArray(storedContent.content).filter(
    (node) => !isPersistedBlockNode(node)
  );
  const attributes = {
    ...toAttributes(storedContent.attrs),
    ...toAttributes(block.attributes),
    blockId: block.id,
  };
  const childNodes = (childrenByParent.get(block.id) ?? []).map((childBlock) =>
    buildDocumentNode(childBlock, childrenByParent)
  );
  const content = [...inlineContent, ...childNodes];

  return {
    type: block.type,
    ...(Object.keys(attributes).length > 0 ? { attrs: attributes } : {}),
    ...(content.length > 0 ? { content } : {}),
  };
}

function splitNodeContent(content: TiptapNode[] | undefined) {
  const inlineContent: TiptapNode[] = [];
  const childBlocks: BlockNodeContent[] = [];

  for (const child of content ?? []) {
    if (isPersistedBlockNode(child)) {
      childBlocks.push(child);
      continue;
    }

    inlineContent.push(child);
  }

  return {
    inlineContent,
    childBlocks,
  };
}

function resolveBlockId(
  attrs: BlockAttributes | undefined,
  usedBlockIds: Set<string>
) {
  const candidate =
    typeof attrs?.blockId === "string" && attrs.blockId.trim().length > 0
      ? attrs.blockId
      : null;

  if (candidate && !usedBlockIds.has(candidate)) {
    usedBlockIds.add(candidate);
    return candidate;
  }

  let generatedId = generateId();

  while (usedBlockIds.has(generatedId)) {
    generatedId = generateId();
  }

  usedBlockIds.add(generatedId);
  return generatedId;
}

function isPersistedBlockNode(node: TiptapNode): node is BlockNodeContent {
  return (
    node.type !== "text" && PERSISTED_BLOCK_NODE_TYPES.has(node.type)
  );
}

function toNodeArray(value: unknown): TiptapNode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isTiptapNode);
}

function isTiptapNode(value: unknown): value is TiptapNode {
  return isRecord(value) && typeof value.type === "string";
}

function toAttributes(value: unknown): BlockAttributes {
  if (!isRecord(value)) {
    return {};
  }

  return { ...value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
