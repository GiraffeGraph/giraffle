// ─── Block Types ──────────────────────────────────────────────
export const BLOCK_TYPES = [
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
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

// ─── Block Content (Tiptap JSON-compatible) ───────────────────
export interface BlockMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface BlockAttributes extends Record<string, unknown> {
  blockId?: string;
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

// ─── Block ────────────────────────────────────────────────────
export interface Block {
  id: string;
  noteId: string;
  type: BlockType;
  content: BlockNodeContent;
  attributes: Record<string, unknown>;
  parentId: string | null;
  position: number;
  children?: Block[];
}

// ─── Note ─────────────────────────────────────────────────────
export interface Note {
  id: string;
  title: string;
  icon: string | null;
  coverImage: string | null;
  folderId: string | null;
  templateId: string | null;
  isArchived: boolean;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  blocks?: Block[];
  tags?: string[];
}

export interface NoteReference {
  id: string;
  title: string;
  folderId: string | null;
  updatedAt?: Date;
}

export interface CreateNoteInput {
  title?: string;
  icon?: string;
  folderId?: string;
  templateId?: string;
}

export interface UpdateNoteInput {
  title?: string;
  icon?: string | null;
  coverImage?: string | null;
  folderId?: string | null;
  isArchived?: boolean;
  isPublished?: boolean;
}

export interface BlockPlacementInput {
  parentBlockId?: string | null;
  afterBlockId?: string | null;
}

export interface InsertBlockInput extends BlockPlacementInput {
  block: BlockNodeContent;
}

export interface UpdateBlockInput {
  type?: string;
  attrs?: BlockAttributes;
  content?: TiptapNode[];
}

// ─── Tiptap Document JSON (canonical AST format) ─────────────
export interface TiptapDocument {
  type: "doc";
  content: BlockNodeContent[];
}
