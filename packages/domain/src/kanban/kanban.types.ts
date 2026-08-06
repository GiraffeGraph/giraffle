import type { EisenhowerQuadrant } from "../note/note.types";

/**
 * Trek — Kanban boards.
 *
 * Boards, columns, and task placement have explicit relational models. Cards
 * still point to canonical taskItem blocks through BoardTask, so dates appear
 * in Stride and priorities appear in Tower — one task, three lenses.
 */
export type KanbanPriority = EisenhowerQuadrant;

/** Named accent keys for columns — mapped to CSS tokens in the UI layer. */
export type KanbanColumnColor =
  | "neutral"
  | "blue"
  | "amber"
  | "green"
  | "red"
  | "purple";

export const KANBAN_COLUMN_COLORS: KanbanColumnColor[] = [
  "neutral",
  "blue",
  "amber",
  "green",
  "red",
  "purple",
];

/** Ordered column definition returned by the board service. */
export interface KanbanColumnDef {
  id: string;
  title: string;
  color: KanbanColumnColor | null;
  position: number;
}

export interface KanbanCardData {
  id: string;
  columnId: string;
  title: string;
  description: string | null;
  priority: KanbanPriority | null;
  dueDate: Date | null;
  durationMinutes: number | null;
  completed: boolean;
  position: number;
}

export interface KanbanColumnData {
  id: string;
  boardId: string;
  title: string;
  color: KanbanColumnColor | null;
  position: number;
  cards: KanbanCardData[];
}

export interface KanbanBoardSummary {
  id: string;
  title: string;
  icon: string | null;
  status: string | null;
  columnCount: number;
  cardCount: number;
  completedCount: number;
  updatedAt: Date;
}

/** A board-of-boards status column persisted as BoardStatus. */
export interface KanbanBoardStatusDef {
  id: string;
  title: string;
  color: KanbanColumnColor | null;
  position: number;
}

export interface KanbanBoardStatusColumnData extends KanbanBoardStatusDef {
  boards: KanbanBoardSummary[];
}

export interface KanbanBoardsOverview {
  columns: KanbanBoardStatusColumnData[];
}

export interface KanbanBoardData {
  id: string;
  title: string;
  icon: string | null;
  columns: KanbanColumnData[];
  updatedAt: Date;
}

export interface CreateCardInput {
  title: string;
  description?: string | null;
  priority?: KanbanPriority | null;
  dueDate?: Date | null;
  durationMinutes?: number | null;
}

export interface UpdateCardInput {
  title?: string;
  description?: string | null;
  priority?: KanbanPriority | null;
  dueDate?: Date | null;
  durationMinutes?: number | null;
  completed?: boolean;
}
