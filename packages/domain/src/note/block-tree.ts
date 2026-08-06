import { generateId, isRecord } from "../utils";
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
  "callout",
  "toggle",
  "kanban",
  "image",
  "horizontalRule",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
  "taskList",
  "taskItem",
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

export function insertBlockInDocument(
  document: TiptapDocument,
  block: BlockNodeContent,
  placement: {
    parentBlockId?: string | null;
    afterBlockId?: string | null;
  } = {}
): TiptapDocument {
  const nextBlock = ensureBlockIds(block);

  if (placement.parentBlockId) {
    const result = insertIntoNestedBlocks(
      document.content,
      placement.parentBlockId,
      placement.afterBlockId ?? null,
      nextBlock
    );

    if (!result.inserted) {
      throw new Error(`Parent block not found: ${placement.parentBlockId}`);
    }

    return {
      type: "doc",
      content: result.blocks,
    };
  }

  return {
    type: "doc",
    content: insertAmongSiblings(
      document.content,
      placement.afterBlockId ?? null,
      nextBlock
    ),
  };
}

export function updateBlockInDocument(
  document: TiptapDocument,
  blockId: string,
  update: Partial<BlockNodeContent>
): TiptapDocument {
  const result = mapDocumentBlocks(document.content, (node) => {
    if (getNodeBlockId(node) !== blockId) {
      return node;
    }

    const nextNode = ensureBlockIds({
      ...node,
      ...update,
      attrs: {
        ...toAttributes(node.attrs),
        ...toAttributes(update.attrs),
        blockId,
      },
      content: update.content ?? node.content,
    });

    return nextNode;
  });

  if (!result.changed) {
    throw new Error(`Block not found: ${blockId}`);
  }

  return {
    type: "doc",
    content: result.blocks,
  };
}

export function removeBlockFromDocument(
  document: TiptapDocument,
  blockId: string
): { document: TiptapDocument; removedBlock: BlockNodeContent | null } {
  const result = removeBlockFromNodes(document.content, blockId);

  return {
    document: {
      type: "doc",
      content: result.blocks,
    },
    removedBlock: result.removedBlock,
  };
}

export function moveBlockInDocument(
  document: TiptapDocument,
  blockId: string,
  placement: {
    parentBlockId?: string | null;
    afterBlockId?: string | null;
  }
): TiptapDocument {
  const removed = removeBlockFromDocument(document, blockId);

  if (!removed.removedBlock) {
    throw new Error(`Block not found: ${blockId}`);
  }

  return insertBlockInDocument(removed.document, removed.removedBlock, placement);
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

function insertIntoNestedBlocks(
  blocks: BlockNodeContent[],
  parentBlockId: string,
  afterBlockId: string | null,
  nextBlock: BlockNodeContent
): {
  blocks: BlockNodeContent[];
  inserted: boolean;
} {
  let inserted = false;

  const nextBlocks = blocks.map((block) => {
    if (getNodeBlockId(block) === parentBlockId) {
      inserted = true;
      const childBlocks = getChildBlocks(block);
      const inlineNodes = getInlineNodes(block);

      return {
        ...block,
        content: composeNodeContent(
          inlineNodes,
          insertAmongSiblings(childBlocks, afterBlockId, nextBlock)
        ),
      };
    }

    const childBlocks = getChildBlocks(block);

    if (childBlocks.length === 0) {
      return block;
    }

    const nestedResult = insertIntoNestedBlocks(
      childBlocks,
      parentBlockId,
      afterBlockId,
      nextBlock
    );

    if (!nestedResult.inserted) {
      return block;
    }

    inserted = true;

    return {
      ...block,
      content: composeNodeContent(getInlineNodes(block), nestedResult.blocks),
    };
  });

  return {
    blocks: nextBlocks,
    inserted,
  };
}

function mapDocumentBlocks(
  blocks: BlockNodeContent[],
  mapper: (node: BlockNodeContent) => BlockNodeContent
): {
  blocks: BlockNodeContent[];
  changed: boolean;
} {
  let changed = false;

  const nextBlocks = blocks.map((block) => {
    const mappedBlock = mapper(block);
    const childBlocks = getChildBlocks(mappedBlock);

    if (childBlocks.length === 0) {
      if (mappedBlock !== block) {
        changed = true;
      }

      return mappedBlock;
    }

    const nested = mapDocumentBlocks(childBlocks, mapper);
    const nextBlock = nested.changed
      ? {
          ...mappedBlock,
          content: composeNodeContent(getInlineNodes(mappedBlock), nested.blocks),
        }
      : mappedBlock;

    if (nextBlock !== block) {
      changed = true;
    }

    if (nested.changed) {
      changed = true;
    }

    return nextBlock;
  });

  return {
    blocks: nextBlocks,
    changed,
  };
}

function removeBlockFromNodes(
  blocks: BlockNodeContent[],
  blockId: string
): {
  blocks: BlockNodeContent[];
  removedBlock: BlockNodeContent | null;
} {
  let removedBlock: BlockNodeContent | null = null;
  const nextBlocks: BlockNodeContent[] = [];

  for (const block of blocks) {
    if (getNodeBlockId(block) === blockId) {
      removedBlock = block;
      continue;
    }

    const childBlocks = getChildBlocks(block);

    if (childBlocks.length === 0) {
      nextBlocks.push(block);
      continue;
    }

    const nested = removeBlockFromNodes(childBlocks, blockId);

    if (nested.removedBlock) {
      removedBlock = nested.removedBlock;
      nextBlocks.push({
        ...block,
        content: composeNodeContent(getInlineNodes(block), nested.blocks),
      });
      continue;
    }

    nextBlocks.push(block);
  }

  return {
    blocks: nextBlocks,
    removedBlock,
  };
}

function ensureBlockIds(node: BlockNodeContent): BlockNodeContent {
  const blockId = resolveSingleBlockId(node.attrs);
  const content = (node.content ?? []).map((child) =>
    isPersistedBlockNode(child) ? ensureBlockIds(child) : child
  );

  return {
    ...node,
    attrs: {
      ...toAttributes(node.attrs),
      blockId,
    },
    ...(content.length > 0 ? { content } : {}),
  };
}

function insertAmongSiblings(
  siblings: BlockNodeContent[],
  afterBlockId: string | null,
  nextBlock: BlockNodeContent
): BlockNodeContent[] {
  if (!afterBlockId) {
    return [...siblings, nextBlock];
  }

  const siblingIndex = siblings.findIndex(
    (candidate) => getNodeBlockId(candidate) === afterBlockId
  );

  if (siblingIndex === -1) {
    return [...siblings, nextBlock];
  }

  return [
    ...siblings.slice(0, siblingIndex + 1),
    nextBlock,
    ...siblings.slice(siblingIndex + 1),
  ];
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

function getInlineNodes(node: BlockNodeContent): TiptapNode[] {
  return splitNodeContent(node.content).inlineContent;
}

function getChildBlocks(node: BlockNodeContent): BlockNodeContent[] {
  return splitNodeContent(node.content).childBlocks;
}

function composeNodeContent(
  inlineContent: TiptapNode[],
  childBlocks: BlockNodeContent[]
): TiptapNode[] {
  return [...inlineContent, ...childBlocks];
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

function resolveSingleBlockId(attrs: BlockAttributes | undefined) {
  const candidate =
    typeof attrs?.blockId === "string" && attrs.blockId.trim().length > 0
      ? attrs.blockId
      : null;

  return candidate ?? generateId();
}

function getNodeBlockId(node: BlockNodeContent) {
  return typeof node.attrs?.blockId === "string" ? node.attrs.blockId : null;
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

