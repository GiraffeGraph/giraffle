export const EDITOR_NODE_TYPES = [
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "codeBlock",
  "blockquote",
  "hardBreak",
  "horizontalRule",
  "image",
  "taskList",
  "taskItem",
] as const;


export interface BlockMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface BlockAttributes extends Record<string, unknown> {
  /** Stable editor block identity. */
  id?: string;
}

export interface BlockTextContent {
  type: "text";
  text: string;
  marks?: BlockMark[];
}

export interface BlockNodeContent {
  type: string;
  attrs?: BlockAttributes;
  content?: TiptapNode[];
  marks?: BlockMark[];
}

export type TiptapNode = BlockTextContent | BlockNodeContent;

/** Canonical document JSON persisted for a page and consumed by Tiptap. */
export interface TiptapDocument {
  type: "doc";
  content: BlockNodeContent[];
}
