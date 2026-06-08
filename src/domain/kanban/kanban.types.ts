import type { EisenhowerQuadrant } from "@/domain/note/note.types";

/**
 * Trek — Kanban boards.
 *
 * A board IS a note: `note.kanbanColumns` holds the ordered column defs, and the
 * cards are the note's `taskItem` blocks placed via
 * `block.attributes.kanbanColumnId` / `kanbanPosition`. Because cards are real
 * taskItems, a dated card also appears in Stride and a prioritized card appears
 * in Tower — one task, three lenses. Priority reuses the Eisenhower quadrant.
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

/** Column definition persisted as JSON on the board note (`note.kanbanColumns`). */
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
  columnCount: number;
  cardCount: number;
  completedCount: number;
  updatedAt: Date;
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
