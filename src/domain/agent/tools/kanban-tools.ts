import { z } from "zod";
import {
  createBoard,
  createCard,
  createColumn,
  deleteBoard,
  deleteCard,
  deleteColumn,
  getBoard,
  getBoardsOverview,
  listBoards,
  moveBoardToStatus,
  moveCard,
  updateBoard,
  updateCard,
  updateColumn,
} from "@/domain/kanban/kanban.service";
import type {
  KanbanBoardData,
  KanbanCardData,
  KanbanColumnColor,
  KanbanPriority,
} from "@/domain/kanban/kanban.types";
import type { InternalToolDefinition } from "../internal-tools";

/**
 * Trek (Kanban) tools. A board IS a note (boardId === noteId); its columns are
 * the note's kanbanColumns and its cards are the note's taskItem blocks
 * (cardId === blockId). Because cards are real tasks, a dated card also shows in
 * Stride and a prioritized card shows in Tower. Priority is the Eisenhower
 * quadrant (DO/SCHEDULE/DELEGATE/ELIMINATE).
 */

const PRIORITY = z.enum(["DO", "SCHEDULE", "DELEGATE", "ELIMINATE"]);
const COLUMN_COLOR = z.enum(["neutral", "blue", "amber", "green", "red", "purple"]);

function parseDueDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid dueDate: ${value}`);
  return date;
}

function serializeCard(card: KanbanCardData) {
  return {
    id: card.id,
    columnId: card.columnId,
    title: card.title,
    description: card.description,
    priority: card.priority,
    dueDate: card.dueDate ? card.dueDate.toISOString() : null,
    durationMinutes: card.durationMinutes,
    completed: card.completed,
    position: card.position,
  };
}

function serializeBoard(board: KanbanBoardData) {
  return {
    id: board.id,
    title: board.title,
    icon: board.icon,
    columns: board.columns.map((col) => ({
      id: col.id,
      title: col.title,
      color: col.color,
      position: col.position,
      cards: col.cards.map(serializeCard),
    })),
  };
}

export const kanbanTools: InternalToolDefinition[] = [
  {
    name: "kanban_list_boards",
    destructive: false,
    description:
      "List the user's Trek (Kanban) boards with column and card counts. A board is a note; boardId === noteId. Use this first to discover board ids.",
    inputSchema: z.object({}),
    execute: async (_raw, { userId }) => {
      const boards = await listBoards(userId);
      return {
        boards: boards.map((b) => ({
          id: b.id,
          title: b.title,
          icon: b.icon,
          status: b.status,
          columnCount: b.columnCount,
          cardCount: b.cardCount,
          completedCount: b.completedCount,
          updatedAt: b.updatedAt.toISOString(),
        })),
      };
    },
  },
  {
    name: "kanban_list_board_statuses",
    destructive: false,
    description:
      "List the board-of-boards status columns (the top level grouping boards sit in) with how many boards are in each.",
    inputSchema: z.object({}),
    execute: async (_raw, { userId }) => {
      const overview = await getBoardsOverview(userId);
      return {
        statuses: overview.columns.map((c) => ({
          id: c.id,
          title: c.title,
          color: c.color,
          boardCount: c.boards.length,
        })),
      };
    },
  },
  {
    name: "kanban_set_board_status",
    destructive: true,
    description:
      "Move a board into a board-of-boards status column (its top-level status). Use kanban_list_board_statuses for status ids.",
    inputSchema: z.object({
      boardId: z.string().min(1),
      statusId: z.string().min(1),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { boardId: string; statusId: string };
      await moveBoardToStatus(userId, input.boardId, input.statusId, 100_000);
      return { boardId: input.boardId, statusId: input.statusId };
    },
  },
  {
    name: "kanban_get_board",
    destructive: false,
    description:
      "Get one Trek board in full: ordered columns and the ordered cards in each (with priority, dueDate, completed). cardId === blockId; the same cards appear in Stride/Tower.",
    inputSchema: z.object({ boardId: z.string().min(1) }),
    execute: async (raw, { userId }) => {
      const input = raw as { boardId: string };
      const board = await getBoard(userId, input.boardId);
      if (!board) throw new Error(`Board not found: ${input.boardId}`);
      return serializeBoard(board);
    },
  },
  {
    name: "kanban_create_board",
    destructive: true,
    description:
      "Create a Trek board (a note seeded with To do / In progress / Done columns). Returns the board with its column ids.",
    inputSchema: z.object({ title: z.string().min(1).max(220) }),
    execute: async (raw, { userId }) => {
      const input = raw as { title: string };
      const boardId = await createBoard(userId, { title: input.title });
      const board = await getBoard(userId, boardId);
      return board ? serializeBoard(board) : { id: boardId };
    },
  },
  {
    name: "kanban_update_board",
    destructive: true,
    description: "Update a Trek board's title or icon.",
    inputSchema: z.object({
      boardId: z.string().min(1),
      title: z.string().min(1).max(220).optional(),
      icon: z.string().max(20).nullable().optional(),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { boardId: string; title?: string; icon?: string | null };
      await updateBoard(userId, input.boardId, { title: input.title, icon: input.icon });
      return { boardId: input.boardId, updated: true };
    },
  },
  {
    name: "kanban_delete_board",
    destructive: true,
    description: "Delete a Trek board (deletes the underlying note and all its cards).",
    inputSchema: z.object({ boardId: z.string().min(1) }),
    execute: async (raw, { userId }) => {
      const input = raw as { boardId: string };
      await deleteBoard(userId, input.boardId);
      return { boardId: input.boardId, deleted: true };
    },
  },
  {
    name: "kanban_add_column",
    destructive: true,
    description: "Add a column (status) to the end of a Trek board.",
    inputSchema: z.object({
      boardId: z.string().min(1),
      title: z.string().min(1).max(160),
      color: COLUMN_COLOR.nullable().optional(),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { boardId: string; title: string; color?: KanbanColumnColor | null };
      const columnId = await createColumn(userId, input.boardId, {
        title: input.title,
        color: input.color ?? null,
      });
      return { columnId, boardId: input.boardId };
    },
  },
  {
    name: "kanban_update_column",
    destructive: true,
    description: "Rename a column or change its accent color.",
    inputSchema: z.object({
      boardId: z.string().min(1),
      columnId: z.string().min(1),
      title: z.string().min(1).max(160).optional(),
      color: COLUMN_COLOR.nullable().optional(),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as {
        boardId: string;
        columnId: string;
        title?: string;
        color?: KanbanColumnColor | null;
      };
      await updateColumn(userId, input.boardId, input.columnId, {
        title: input.title,
        color: input.color,
      });
      return { columnId: input.columnId, updated: true };
    },
  },
  {
    name: "kanban_delete_column",
    destructive: true,
    description: "Delete a column; its cards move to the first remaining column.",
    inputSchema: z.object({
      boardId: z.string().min(1),
      columnId: z.string().min(1),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { boardId: string; columnId: string };
      await deleteColumn(userId, input.boardId, input.columnId);
      return { columnId: input.columnId, deleted: true };
    },
  },
  {
    name: "kanban_add_card",
    destructive: true,
    description:
      "Add a card (task) to a column. Optionally set an Eisenhower priority, an ISO dueDate (with time — it will appear in Stride at that hour), and a duration in minutes.",
    inputSchema: z.object({
      boardId: z.string().min(1),
      columnId: z.string().min(1),
      title: z.string().min(1).max(2_000),
      description: z.string().max(10_000).nullable().optional(),
      priority: PRIORITY.nullable().optional(),
      dueDate: z.string().min(1).max(40).nullable().optional(),
      durationMinutes: z.number().int().min(0).max(100_000).nullable().optional(),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as {
        boardId: string;
        columnId: string;
        title: string;
        description?: string | null;
        priority?: KanbanPriority | null;
        dueDate?: string | null;
        durationMinutes?: number | null;
      };
      const card = await createCard(userId, input.boardId, input.columnId, {
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? null,
        dueDate: parseDueDate(input.dueDate) ?? null,
        durationMinutes: input.durationMinutes ?? null,
      });
      return serializeCard(card);
    },
  },
  {
    name: "kanban_update_card",
    destructive: true,
    description:
      "Update a card's title, description, priority, dueDate (ISO or null), duration, or completed state. cardId === blockId.",
    inputSchema: z.object({
      cardId: z.string().min(1),
      title: z.string().min(1).max(2_000).optional(),
      description: z.string().max(10_000).nullable().optional(),
      priority: PRIORITY.nullable().optional(),
      dueDate: z.string().min(1).max(40).nullable().optional(),
      durationMinutes: z.number().int().min(0).max(100_000).nullable().optional(),
      completed: z.boolean().optional(),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as {
        cardId: string;
        title?: string;
        description?: string | null;
        priority?: KanbanPriority | null;
        dueDate?: string | null;
        durationMinutes?: number | null;
        completed?: boolean;
      };
      await updateCard(userId, input.cardId, {
        title: input.title,
        description: input.description,
        priority: input.priority,
        dueDate: parseDueDate(input.dueDate),
        durationMinutes: input.durationMinutes,
        completed: input.completed,
      });
      return { cardId: input.cardId, updated: true };
    },
  },
  {
    name: "kanban_move_card",
    destructive: true,
    description:
      "Move a card to a target column at a zero-based index (its Kanban status change). Pass a large toIndex to append.",
    inputSchema: z.object({
      cardId: z.string().min(1),
      toColumnId: z.string().min(1),
      toIndex: z.number().int().min(0).max(100_000).default(100_000),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { cardId: string; toColumnId: string; toIndex: number };
      await moveCard(userId, input.cardId, input.toColumnId, input.toIndex);
      return { cardId: input.cardId, toColumnId: input.toColumnId, toIndex: input.toIndex };
    },
  },
  {
    name: "kanban_delete_card",
    destructive: true,
    description: "Delete a card (task) from a Trek board.",
    inputSchema: z.object({ cardId: z.string().min(1) }),
    execute: async (raw, { userId }) => {
      const input = raw as { cardId: string };
      await deleteCard(userId, input.cardId);
      return { cardId: input.cardId, deleted: true };
    },
  },
];
