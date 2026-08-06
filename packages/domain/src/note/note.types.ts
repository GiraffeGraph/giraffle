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
  icon: string | null;
  coverImage: string | null;
  parentId: string | null;
  position: string;
  isPinned: boolean;
  isArchived: boolean;
  quadrant: MatrixSlot | null;
  createdAt: Date;
  updatedAt: Date;
  blocks?: Block[];
}

export interface PageTreeNode {
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  position: string;
  isPinned: boolean;
  updatedAt: Date;
  children: PageTreeNode[];
}

export interface PageBreadcrumb {
  id: string;
  title: string;
  icon: string | null;
}

export interface NoteReference {
  id: string;
  title: string;
  parentId: string | null;
  updatedAt?: Date;
}

export interface CreateNoteInput {
  title?: string;
  icon?: string;
  parentId?: string;
}

export interface UpdateNoteInput {
  title?: string;
  icon?: string | null;
  coverImage?: string | null;
  parentId?: string | null;
  position?: string;
  isPinned?: boolean;
  isArchived?: boolean;
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
