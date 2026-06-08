import type { EisenhowerQuadrant } from "@/domain/note/note.types";

/**
 * Trek — Kanban boards.
 *
 * Cards reuse the Eisenhower `priority` taxonomy that the Tower Matrix and
 * Stride calendar already speak (DO/SCHEDULE/DELEGATE/ELIMINATE), so the three
 * task surfaces share one visual vocabulary. A board owns ordered columns
 * (custom statuses); each column owns ordered cards.
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
  description: string | null;
  position: number;
  columnCount: number;
  cardCount: number;
  completedCount: number;
  updatedAt: Date;
}

export interface KanbanBoardData {
  id: string;
  title: string;
  icon: string | null;
  description: string | null;
  position: number;
  columns: KanbanColumnData[];
  createdAt: Date;
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
