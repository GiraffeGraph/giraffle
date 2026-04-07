import type {
  BlockNodeContent,
  TiptapDocument,
  TiptapNode,
} from "@/domain/note/note.types";
import type { TemplateBlock } from "./template.types";

const TEMPLATE_BLOCK_NODE_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "codeBlock",
  "blockquote",
  "callout",
  "toggle",
  "image",
  "horizontalRule",
  "table",
]);

export function templateBlocksToDocument(blocks: unknown): TiptapDocument {
  return {
    type: "doc",
    content: Array.isArray(blocks)
      ? blocks
          .filter(
            (block): block is TemplateBlock =>
              isRecord(block) && typeof block.type === "string"
          )
          .map(templateBlockToNode)
      : [],
  };
}

export function documentToTemplateBlocks(document: TiptapDocument): TemplateBlock[] {
  return Array.isArray(document.content)
    ? document.content.map(documentNodeToTemplateBlock)
    : [];
}

function templateBlockToNode(block: TemplateBlock): BlockNodeContent {
  const sourceContent =
    isRecord(block.content) && !Array.isArray(block.content) ? block.content : {};
  const parsedContentNodes = toTemplateNodes(
    Array.isArray(block.content) ? block.content : sourceContent.content
  );
  const inlineContent = parsedContentNodes.filter(
    (node) => !isTemplateChildBlock(node)
  );
  const legacyChildBlocks = parsedContentNodes.filter(isTemplateChildBlock);
  const childBlocks = [
    ...legacyChildBlocks,
    ...(block.children ?? []).map(templateBlockToNode),
  ];
  const attrs = {
    ...toAttributes((block as { attrs?: unknown }).attrs),
    ...toAttributes(sourceContent.attrs),
    ...toAttributes(block.attributes),
  };
  const content = [...inlineContent, ...childBlocks];

  return {
    type: block.type,
    ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
    ...(content.length > 0 ? { content } : {}),
  };
}

function documentNodeToTemplateBlock(node: BlockNodeContent): TemplateBlock {
  const inlineContent: TiptapNode[] = [];
  const childBlocks: BlockNodeContent[] = [];

  for (const child of Array.isArray(node.content) ? node.content : []) {
    if (isTemplateChildBlock(child)) {
      childBlocks.push(child);
      continue;
    }

    inlineContent.push(child);
  }

  const attributes = omitBlockId(node.attrs);

  return {
    type: node.type,
    content: inlineContent.length > 0 ? { content: inlineContent } : {},
    ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
    ...(childBlocks.length > 0
      ? { children: childBlocks.map(documentNodeToTemplateBlock) }
      : {}),
  };
}

function toTemplateNodes(value: unknown): TiptapNode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is TiptapNode =>
      isRecord(item) && typeof item.type === "string"
  );
}

function isTemplateChildBlock(node: TiptapNode): node is BlockNodeContent {
  return node.type !== "text" && TEMPLATE_BLOCK_NODE_TYPES.has(node.type);
}

function toAttributes(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || Array.isArray(value)) {
    return {};
  }

  return { ...value };
}

function omitBlockId(value: unknown): Record<string, unknown> {
  const attributes = toAttributes(value);
  delete attributes.blockId;
  return attributes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
