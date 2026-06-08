import { db } from "@/lib/db";
import type {
  CreateCardInput,
  KanbanBoardData,
  KanbanBoardSummary,
  KanbanCardData,
  KanbanColumnColor,
  KanbanColumnData,
  KanbanPriority,
  UpdateCardInput,
} from "./kanban.types";

// ─── Default scaffolding ──────────────────────────────────────

const DEFAULT_COLUMNS: Array<{ title: string; color: KanbanColumnColor }> = [
  { title: "To do", color: "neutral" },
  { title: "In progress", color: "blue" },
  { title: "Done", color: "green" },
];

// ─── Ownership guards ─────────────────────────────────────────

async function assertBoardOwner(userId: string, boardId: string): Promise<void> {
  const board = await db.kanbanBoard.findFirst({
    where: { id: boardId, userId },
    select: { id: true },
  });
  if (!board) throw new Error(`Board not found: ${boardId}`);
}

/** Returns the owning boardId, or throws if the column isn't the user's. */
async function assertColumnOwner(userId: string, columnId: string): Promise<string> {
  const column = await db.kanbanColumn.findFirst({
    where: { id: columnId, board: { userId } },
    select: { id: true, boardId: true },
  });
  if (!column) throw new Error(`Column not found: ${columnId}`);
  return column.boardId;
}

/** Returns the card's columnId, or throws if the card isn't the user's. */
async function assertCardOwner(userId: string, cardId: string): Promise<string> {
  const card = await db.kanbanCard.findFirst({
    where: { id: cardId, column: { board: { userId } } },
    select: { id: true, columnId: true },
  });
  if (!card) throw new Error(`Card not found: ${cardId}`);
  return card.columnId;
}

// ─── Serializers ──────────────────────────────────────────────

type RawCard = {
  id: string;
  columnId: string;
  title: string;
  description: string | null;
  priority: string | null;
  dueDate: Date | null;
  durationMinutes: number | null;
  completed: boolean;
  position: number;
};

function serializeCard(card: RawCard): KanbanCardData {
  return {
    id: card.id,
    columnId: card.columnId,
    title: card.title,
    description: card.description,
    priority: (card.priority as KanbanPriority | null) ?? null,
    dueDate: card.dueDate,
    durationMinutes: card.durationMinutes,
    completed: card.completed,
    position: card.position,
  };
}

// ─── Boards ───────────────────────────────────────────────────

export async function listBoards(userId: string): Promise<KanbanBoardSummary[]> {
  const boards = await db.kanbanBoard.findMany({
    where: { userId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      icon: true,
      description: true,
      position: true,
      updatedAt: true,
      columns: {
        select: {
          _count: { select: { cards: true } },
          cards: { where: { completed: true }, select: { id: true } },
        },
      },
    },
  });

  return boards.map((board) => {
    const cardCount = board.columns.reduce((sum, c) => sum + c._count.cards, 0);
    const completedCount = board.columns.reduce((sum, c) => sum + c.cards.length, 0);
    return {
      id: board.id,
      title: board.title,
      icon: board.icon,
      description: board.description,
      position: board.position,
      columnCount: board.columns.length,
      cardCount,
      completedCount,
      updatedAt: board.updatedAt,
    };
  });
}

export async function createBoard(
  userId: string,
  input: { title?: string; icon?: string | null; withDefaultColumns?: boolean } = {},
): Promise<string> {
  const last = await db.kanbanBoard.findFirst({
    where: { userId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? -1) + 1;

  const board = await db.kanbanBoard.create({
    data: {
      userId,
      title: input.title?.trim() || "Untitled board",
      icon: input.icon ?? null,
      position,
      ...(input.withDefaultColumns === false
        ? {}
        : {
            columns: {
              create: DEFAULT_COLUMNS.map((col, index) => ({
                title: col.title,
                color: col.color,
                position: index,
              })),
            },
          }),
    },
    select: { id: true },
  });
  return board.id;
}

export async function getBoard(
  userId: string,
  boardId: string,
): Promise<KanbanBoardData | null> {
  const board = await db.kanbanBoard.findFirst({
    where: { id: boardId, userId },
    select: {
      id: true,
      title: true,
      icon: true,
      description: true,
      position: true,
      createdAt: true,
      updatedAt: true,
      columns: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          boardId: true,
          title: true,
          color: true,
          position: true,
          cards: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              columnId: true,
              title: true,
              description: true,
              priority: true,
              dueDate: true,
              durationMinutes: true,
              completed: true,
              position: true,
            },
          },
        },
      },
    },
  });
  if (!board) return null;

  const columns: KanbanColumnData[] = board.columns.map((col) => ({
    id: col.id,
    boardId: col.boardId,
    title: col.title,
    color: (col.color as KanbanColumnColor | null) ?? null,
    position: col.position,
    cards: col.cards.map(serializeCard),
  }));

  return {
    id: board.id,
    title: board.title,
    icon: board.icon,
    description: board.description,
    position: board.position,
    columns,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
  };
}

export async function updateBoard(
  userId: string,
  boardId: string,
  patch: { title?: string; icon?: string | null; description?: string | null },
): Promise<void> {
  await assertBoardOwner(userId, boardId);
  const data: Record<string, unknown> = {};
  if (typeof patch.title === "string") data.title = patch.title.trim() || "Untitled board";
  if (patch.icon !== undefined) data.icon = patch.icon;
  if (patch.description !== undefined) data.description = patch.description;
  if (Object.keys(data).length === 0) return;
  await db.kanbanBoard.update({ where: { id: boardId }, data });
}

export async function deleteBoard(userId: string, boardId: string): Promise<void> {
  await assertBoardOwner(userId, boardId);
  await db.kanbanBoard.delete({ where: { id: boardId } });
}

// ─── Columns ──────────────────────────────────────────────────

export async function createColumn(
  userId: string,
  boardId: string,
  input: { title?: string; color?: KanbanColumnColor | null } = {},
): Promise<string> {
  await assertBoardOwner(userId, boardId);
  const last = await db.kanbanColumn.findFirst({
    where: { boardId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? -1) + 1;
  const column = await db.kanbanColumn.create({
    data: {
      boardId,
      title: input.title?.trim() || "New column",
      color: input.color ?? null,
      position,
    },
    select: { id: true },
  });
  return column.id;
}

export async function updateColumn(
  userId: string,
  columnId: string,
  patch: { title?: string; color?: KanbanColumnColor | null },
): Promise<void> {
  await assertColumnOwner(userId, columnId);
  const data: Record<string, unknown> = {};
  if (typeof patch.title === "string") data.title = patch.title.trim() || "New column";
  if (patch.color !== undefined) data.color = patch.color;
  if (Object.keys(data).length === 0) return;
  await db.kanbanColumn.update({ where: { id: columnId }, data });
}

export async function deleteColumn(userId: string, columnId: string): Promise<void> {
  await assertColumnOwner(userId, columnId);
  await db.kanbanColumn.delete({ where: { id: columnId } });
}

export async function moveColumn(
  userId: string,
  columnId: string,
  toIndex: number,
): Promise<void> {
  const boardId = await assertColumnOwner(userId, columnId);
  await db.$transaction(async (tx) => {
    const siblings = await tx.kanbanColumn.findMany({
      where: { boardId, id: { not: columnId } },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    const ids = siblings.map((s) => s.id);
    const idx = Math.max(0, Math.min(Math.trunc(toIndex), ids.length));
    ids.splice(idx, 0, columnId);
    await Promise.all(
      ids.map((id, i) => tx.kanbanColumn.update({ where: { id }, data: { position: i } })),
    );
  });
}

// ─── Cards ────────────────────────────────────────────────────

export async function createCard(
  userId: string,
  columnId: string,
  input: CreateCardInput,
): Promise<KanbanCardData> {
  await assertColumnOwner(userId, columnId);
  const last = await db.kanbanCard.findFirst({
    where: { columnId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? -1) + 1;
  const card = await db.kanbanCard.create({
    data: {
      columnId,
      title: input.title.trim(),
      description: input.description ?? null,
      priority: input.priority ?? null,
      dueDate: input.dueDate ?? null,
      durationMinutes: input.durationMinutes ?? null,
      position,
    },
    select: {
      id: true,
      columnId: true,
      title: true,
      description: true,
      priority: true,
      dueDate: true,
      durationMinutes: true,
      completed: true,
      position: true,
    },
  });
  return serializeCard(card);
}

export async function updateCard(
  userId: string,
  cardId: string,
  patch: UpdateCardInput,
): Promise<void> {
  await assertCardOwner(userId, cardId);
  const data: Record<string, unknown> = {};
  if (typeof patch.title === "string") data.title = patch.title.trim();
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.dueDate !== undefined) data.dueDate = patch.dueDate;
  if (patch.durationMinutes !== undefined) data.durationMinutes = patch.durationMinutes;
  if (typeof patch.completed === "boolean") data.completed = patch.completed;
  if (Object.keys(data).length === 0) return;
  await db.kanbanCard.update({ where: { id: cardId }, data });
}

export async function deleteCard(userId: string, cardId: string): Promise<void> {
  await assertCardOwner(userId, cardId);
  await db.kanbanCard.delete({ where: { id: cardId } });
}

export async function moveCard(
  userId: string,
  cardId: string,
  toColumnId: string,
  toIndex: number,
): Promise<void> {
  await assertCardOwner(userId, cardId);
  await assertColumnOwner(userId, toColumnId);
  await db.$transaction(async (tx) => {
    const siblings = await tx.kanbanCard.findMany({
      where: { columnId: toColumnId, id: { not: cardId } },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    const ids = siblings.map((s) => s.id);
    const idx = Math.max(0, Math.min(Math.trunc(toIndex), ids.length));
    ids.splice(idx, 0, cardId);
    await Promise.all(
      ids.map((id, i) =>
        tx.kanbanCard.update({
          where: { id },
          data: id === cardId ? { position: i, columnId: toColumnId } : { position: i },
        }),
      ),
    );
  });
}
