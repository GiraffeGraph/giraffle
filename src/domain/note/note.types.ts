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
  "kanban",
  "image",
  "horizontalRule",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
  "taskList",
  "taskItem",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];
export const DEFAULT_NOTE_TITLE = "Untitled";

// ─── Eisenhower Matrix ────────────────────────────────────────
export type EisenhowerQuadrant = "DO" | "SCHEDULE" | "DELEGATE" | "ELIMINATE";

export const EISENHOWER_QUADRANTS = [
  "DO",
  "SCHEDULE",
  "DELEGATE",
  "ELIMINATE",
] as const satisfies EisenhowerQuadrant[];

// Matrix slot = priority quadrant or backlog (parking lot for matrix-scoped notes
// that haven't been prioritized yet). Notes with a null slot are not in matrix at all.
export type MatrixSlot = EisenhowerQuadrant | "BACKLOG";

export const MATRIX_SLOTS = [
  ...EISENHOWER_QUADRANTS,
  "BACKLOG",
] as const satisfies MatrixSlot[];

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
  slug: string | null;
  icon: string | null;
  coverImage: string | null;
  folderId: string | null;
  categoryId?: string | null;
  category?: {
    id: string;
    name: string;
    color: string;
    icon: string | null;
  } | null;
  position: number;
  isPinned: boolean;
  isArchived: boolean;
  isPublished: boolean;
  quadrant: MatrixSlot | null;
  createdAt: Date;
  updatedAt: Date;
  blocks?: Block[];
}

export interface NoteReference {
  id: string;
  title: string;
  folderId: string | null;
  slug?: string | null;
  updatedAt?: Date;
}

export interface CreateNoteInput {
  title?: string;
  icon?: string;
  folderId?: string;
  categoryId?: string;
}

export interface UpdateNoteInput {
  title?: string;
  slug?: string | null;
  icon?: string | null;
  coverImage?: string | null;
  folderId?: string | null;
  categoryId?: string | null;
  position?: number;
  isPinned?: boolean;
  isArchived?: boolean;
  isPublished?: boolean;
  quadrant?: MatrixSlot | null;
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
