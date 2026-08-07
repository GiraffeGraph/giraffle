import type { TiptapDocument } from "./note/note.types";

/**
 * The offline-first vault entity model: one flat graph of pages, tasks, boards
 * and canvases that every client materialises from its local store. Timestamps
 * are epoch milliseconds and positions are fractional index strings so two
 * devices can order siblings without a round trip.
 */
export type Id = string;

/** Eisenhower placement, stored lowercase as the `slot` column value. */
export type TaskPriority = "do" | "schedule" | "delegate" | "eliminate";

export interface Page {
  id: Id;
  title: string;
  icon: string | null;
  parentId: Id | null;
  position: string;
  isPinned: boolean;
  isArchived: boolean;
  document: TiptapDocument;
  createdAt: number;
  updatedAt: number;
}

export interface Task {
  id: Id;
  pageId: Id;
  boardId: Id | null;
  columnId: Id | null;
  content: string;
  completed: boolean;
  priority: TaskPriority | null;
  dueDate: string | null;
  durationMinutes: number | null;
  description: string | null;
  position: string;
  sourceLabel: string;
  createdAt: number;
  updatedAt: number;
}

export interface BoardStatus {
  id: Id;
  title: string;
  color: string | null;
  position: string;
}

export interface Board {
  id: Id;
  pageId: Id;
  statusId: Id | null;
  title: string;
  icon: string | null;
  position: string;
  createdAt: number;
  updatedAt: number;
}

export interface BoardColumn {
  id: Id;
  boardId: Id;
  title: string;
  color: string | null;
  position: string;
}

/** An Excalidraw scene element; `customData` carries the Giraffle page link. */
export interface CanvasElement {
  id: Id;
  type: string;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  customData?: { girafflePageId?: Id };
  [key: string]: unknown;
}

export interface Canvas {
  id: Id;
  title: string;
  elements: CanvasElement[];
  appState: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface Backlink {
  sourcePageId: Id;
  sourceTitle: string;
  targetPageId: Id;
  targetRaw: string;
}

export const EMPTY_DOCUMENT: TiptapDocument = {
  type: "doc",
  content: [{ type: "paragraph", attrs: { id: "root-paragraph" } }],
};
