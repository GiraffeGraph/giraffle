import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  createNote,
  deleteNote,
} from "@/domain/note/page.service";
import {
  createTaskItemInNote,
  deleteCalendarTodo,
  setTodoBlockQuadrant,
  setTodoDescription,
  setTodoDueDate,
  toggleTodoBlock,
  updateCalendarTodoText,
} from "@/domain/note/task.service";
import type {
  CreateCardInput,
  KanbanBoardData,
  KanbanBoardSummary,
  KanbanCardData,
  KanbanColumnColor,
  KanbanColumnData,
  KanbanColumnDef,
  KanbanPriority,
  UpdateCardInput,
} from "./kanban.types";

const EISENHOWER = ["DO", "SCHEDULE", "DELEGATE", "ELIMINATE"] as const;
const DEFAULT_COLUMN_SEEDS: Array<{ title: string; color: KanbanColumnColor }> = [
  { title: "To do", color: "neutral" },
  { title: "In progress", color: "blue" },
  { title: "Done", color: "green" },
];
const BOARD_STATUS_SEEDS: Array<{ title: string; color: KanbanColumnColor }> = [
  { title: "Planning", color: "neutral" },
  { title: "Active", color: "blue" },
  { title: "Done", color: "green" },
];

function isColumnColor(value: unknown): value is KanbanColumnColor {
  return ["neutral", "blue", "amber", "green", "red", "purple"].includes(String(value));
}

function asColumnColor(value: string | null): KanbanColumnColor | null {
  return isColumnColor(value) ? value : null;
}

function asPriority(value: string | null): KanbanPriority | null {
  return EISENHOWER.includes(value as (typeof EISENHOWER)[number])
    ? (value as KanbanPriority)
    : null;
}

function extractText(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const node = content as { text?: unknown; content?: unknown };
  if (typeof node.text === "string") return node.text;
  return Array.isArray(node.content) ? node.content.map(extractText).join("") : "";
}

async function assertBoard(userId: string, boardId: string) {
  const board = await db.board.findFirst({
    where: { id: boardId, userId },
    select: { id: true, taskSourceNoteId: true },
  });
  if (!board) throw new Error(`Board not found: ${boardId}`);
  return board;
}

async function assertCardOwner(userId: string, cardId: string) {
  const placement = await db.boardTask.findFirst({
    where: { blockId: cardId, board: { userId } },
    select: { boardId: true, blockId: true },
  });
  if (!placement) throw new Error(`Card not found: ${cardId}`);
  return placement;
}

async function touchBoard(boardId: string): Promise<void> {
  await db.board.update({ where: { id: boardId }, data: { updatedAt: new Date() } });
}

const BOARD_SUMMARY_SELECT = {
  id: true,
  title: true,
  icon: true,
  statusId: true,
  statusPosition: true,
  updatedAt: true,
  _count: { select: { columns: true, tasks: true } },
  tasks: {
    select: { block: { select: { taskMetadata: { select: { completed: true } } } } },
  },
} as const;

type BoardSummaryRow = Prisma.BoardGetPayload<{
  select: typeof BOARD_SUMMARY_SELECT;
}>;

function toSummary(board: BoardSummaryRow): KanbanBoardSummary {
  return {
    id: board.id,
    title: board.title,
    icon: board.icon,
    status: board.statusId,
    columnCount: board._count.columns,
    cardCount: board._count.tasks,
    completedCount: board.tasks.filter((task) => task.block.taskMetadata?.completed).length,
    updatedAt: board.updatedAt,
  };
}

export async function listBoards(userId: string): Promise<KanbanBoardSummary[]> {
  const boards = await db.board.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: BOARD_SUMMARY_SELECT,
  });
  return boards.map(toSummary);
}

export async function createBoard(
  userId: string,
  input: { title?: string; status?: string } = {},
): Promise<string> {
  const statuses = await ensureBoardColumns(userId);
  const statusId =
    input.status && statuses.some((status) => status.id === input.status)
      ? input.status
      : statuses[0]?.id ?? null;
  const title = input.title?.trim() || "Untitled board";
  const taskSourceNoteId = await createNote(userId, { title, icon: "view_kanban" });
  try {
    const statusPosition = await db.board.count({ where: { userId, statusId } });
    const board = await db.board.create({
      data: {
        userId,
        title,
        icon: "view_kanban",
        taskSourceNoteId,
        statusId,
        statusPosition,
        columns: {
          create: DEFAULT_COLUMN_SEEDS.map((column, position) => ({ ...column, position })),
        },
      },
    });
    return board.id;
  } catch (error) {
    await deleteNote(userId, taskSourceNoteId);
    throw error;
  }
}

export async function getBoard(userId: string, boardId: string): Promise<KanbanBoardData | null> {
  const board = await db.board.findFirst({
    where: { id: boardId, userId },
    select: {
      id: true,
      title: true,
      icon: true,
      updatedAt: true,
      columns: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          title: true,
          color: true,
          position: true,
          tasks: {
            orderBy: { position: "asc" },
            select: {
              position: true,
              block: {
                select: {
                  id: true,
                  content: true,
                  children: { select: { content: true }, orderBy: { position: "asc" } },
                  taskMetadata: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!board) return null;

  const columns: KanbanColumnData[] = board.columns.map((column) => ({
    id: column.id,
    boardId: board.id,
    title: column.title,
    color: asColumnColor(column.color),
    position: column.position,
    cards: column.tasks.map((placement) => {
      const metadata = placement.block.taskMetadata;
      const title = placement.block.children.length > 0
        ? placement.block.children.map((child) => extractText(child.content)).join("")
        : extractText(placement.block.content);
      return {
        id: placement.block.id,
        columnId: column.id,
        title,
        description: metadata?.description ?? null,
        priority: asPriority(metadata?.priority ?? null),
        dueDate: metadata?.dueDate ?? null,
        durationMinutes: metadata?.durationMinutes ?? null,
        completed: metadata?.completed ?? false,
        position: placement.position,
      };
    }),
  }));
  return { id: board.id, title: board.title, icon: board.icon, columns, updatedAt: board.updatedAt };
}

export async function updateBoard(
  userId: string,
  boardId: string,
  patch: { title?: string; icon?: string | null },
): Promise<void> {
  const board = await assertBoard(userId, boardId);
  const data: { title?: string; icon?: string | null } = {};
  if (patch.title !== undefined) data.title = patch.title.trim() || "Untitled board";
  if (patch.icon !== undefined) data.icon = patch.icon;
  if (Object.keys(data).length === 0) return;
  await db.$transaction([
    db.board.update({ where: { id: boardId }, data }),
    db.note.update({ where: { id: board.taskSourceNoteId }, data }),
  ]);
}

export async function deleteBoard(userId: string, boardId: string): Promise<void> {
  const board = await assertBoard(userId, boardId);
  await deleteNote(userId, board.taskSourceNoteId);
}

export async function createColumn(
  userId: string,
  boardId: string,
  input: { title?: string; color?: KanbanColumnColor | null } = {},
): Promise<string> {
  await assertBoard(userId, boardId);
  const position = await db.boardColumn.count({ where: { boardId } });
  const column = await db.boardColumn.create({
    data: {
      boardId,
      title: input.title?.trim() || "New column",
      color: input.color ?? null,
      position,
    },
  });
  await touchBoard(boardId);
  return column.id;
}

export async function updateColumn(
  userId: string,
  boardId: string,
  columnId: string,
  patch: { title?: string; color?: KanbanColumnColor | null },
): Promise<void> {
  await assertBoard(userId, boardId);
  const result = await db.boardColumn.updateMany({
    where: { id: columnId, boardId },
    data: {
      ...(patch.title !== undefined ? { title: patch.title.trim() || "New column" } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
    },
  });
  if (result.count === 0) throw new Error(`Column not found: ${columnId}`);
  await touchBoard(boardId);
}

export async function deleteColumn(userId: string, boardId: string, columnId: string): Promise<void> {
  await assertBoard(userId, boardId);
  const columns = await db.boardColumn.findMany({
    where: { boardId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  if (!columns.some((column) => column.id === columnId)) throw new Error(`Column not found: ${columnId}`);
  if (columns.length <= 1) throw new Error("A board needs at least one column.");
  const fallback = columns.find((column) => column.id !== columnId)!;
  await db.$transaction(async (tx) => {
    const start = await tx.boardTask.count({ where: { columnId: fallback.id } });
    const moving = await tx.boardTask.findMany({
      where: { columnId },
      orderBy: { position: "asc" },
      select: { boardId: true, blockId: true },
    });
    for (const [index, task] of moving.entries()) {
      await tx.boardTask.update({
        where: { boardId_blockId: task },
        data: { columnId: fallback.id, position: start + index },
      });
    }
    await tx.boardColumn.delete({ where: { id: columnId } });
  });
  await normalizeColumnPositions(boardId);
  await touchBoard(boardId);
}

async function normalizeColumnPositions(boardId: string): Promise<void> {
  const columns = await db.boardColumn.findMany({
    where: { boardId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  await db.$transaction(columns.map((column, position) =>
    db.boardColumn.update({ where: { id: column.id }, data: { position } })));
}

export async function moveColumn(
  userId: string,
  boardId: string,
  columnId: string,
  toIndex: number,
): Promise<void> {
  await assertBoard(userId, boardId);
  const columns = await db.boardColumn.findMany({
    where: { boardId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  const moving = columns.find((column) => column.id === columnId);
  if (!moving) throw new Error(`Column not found: ${columnId}`);
  const rest = columns.filter((column) => column.id !== columnId);
  rest.splice(Math.max(0, Math.min(Math.trunc(toIndex), rest.length)), 0, moving);
  await db.$transaction(rest.map((column, position) =>
    db.boardColumn.update({ where: { id: column.id }, data: { position } })));
  await touchBoard(boardId);
}

export async function createCard(
  userId: string,
  boardId: string,
  columnId: string,
  input: CreateCardInput,
): Promise<KanbanCardData> {
  const board = await assertBoard(userId, boardId);
  const column = await db.boardColumn.findFirst({ where: { id: columnId, boardId } });
  if (!column) throw new Error(`Column not found: ${columnId}`);
  const position = await db.boardTask.count({ where: { columnId } });
  const blockId = await createTaskItemInNote(userId, board.taskSourceNoteId, input.title, {
    priority: input.priority,
    durationMinutes: input.durationMinutes,
    description: input.description,
  });
  try {
    await db.boardTask.create({ data: { boardId, blockId, columnId, position } });
    if (input.dueDate) await setTodoDueDate(userId, blockId, input.dueDate);
    await touchBoard(boardId);
  } catch (error) {
    await deleteCalendarTodo(userId, blockId);
    throw error;
  }
  return {
    id: blockId,
    columnId,
    title: input.title.trim(),
    description: input.description ?? null,
    priority: input.priority ?? null,
    dueDate: input.dueDate ?? null,
    durationMinutes: input.durationMinutes ?? null,
    completed: false,
    position,
  };
}

export async function updateCard(userId: string, cardId: string, patch: UpdateCardInput): Promise<void> {
  const placement = await assertCardOwner(userId, cardId);
  if (patch.title !== undefined) await updateCalendarTodoText(userId, cardId, patch.title);
  if (patch.priority !== undefined) await setTodoBlockQuadrant(userId, cardId, patch.priority);
  if (patch.dueDate !== undefined) await setTodoDueDate(userId, cardId, patch.dueDate);
  if (patch.durationMinutes !== undefined) {
    await db.taskMetadata.update({
      where: { blockId: cardId },
      data: { durationMinutes: patch.durationMinutes },
    });
  }
  if (patch.description !== undefined) await setTodoDescription(userId, cardId, patch.description);
  if (patch.completed !== undefined) await toggleTodoBlock(userId, cardId, patch.completed);
  await touchBoard(placement.boardId);
}

export async function deleteCard(userId: string, cardId: string): Promise<void> {
  const placement = await assertCardOwner(userId, cardId);
  await deleteCalendarTodo(userId, cardId);
  await touchBoard(placement.boardId);
}

export async function moveCard(
  userId: string,
  cardId: string,
  toColumnId: string,
  toIndex: number,
): Promise<void> {
  const placement = await assertCardOwner(userId, cardId);
  const column = await db.boardColumn.findFirst({
    where: { id: toColumnId, boardId: placement.boardId },
    select: { id: true },
  });
  if (!column) throw new Error(`Column not found: ${toColumnId}`);
  const siblings = await db.boardTask.findMany({
    where: { columnId: toColumnId, blockId: { not: cardId } },
    orderBy: { position: "asc" },
    select: { boardId: true, blockId: true },
  });
  const index = Math.max(0, Math.min(Math.trunc(toIndex), siblings.length));
  siblings.splice(index, 0, { boardId: placement.boardId, blockId: cardId });
  await db.$transaction(siblings.map((task, position) => db.boardTask.update({
    where: { boardId_blockId: task },
    data: { columnId: toColumnId, position },
  })));
  await touchBoard(placement.boardId);
}

async function ensureBoardColumns(userId: string): Promise<KanbanColumnDef[]> {
  let statuses = await db.boardStatus.findMany({
    where: { userId },
    orderBy: { position: "asc" },
  });
  if (statuses.length === 0) {
    await db.boardStatus.createMany({
      data: BOARD_STATUS_SEEDS.map((status, position) => ({ userId, ...status, position })),
    });
    statuses = await db.boardStatus.findMany({ where: { userId }, orderBy: { position: "asc" } });
  }
  return statuses.map((status) => ({
    id: status.id,
    title: status.title,
    color: asColumnColor(status.color),
    position: status.position,
  }));
}

export async function getBoardsOverview(userId: string) {
  const statuses = await ensureBoardColumns(userId);
  const boards = await db.board.findMany({
    where: { userId },
    orderBy: [{ statusPosition: "asc" }, { updatedAt: "desc" }],
    select: BOARD_SUMMARY_SELECT,
  });
  const fallback = statuses[0]?.id ?? "";
  const valid = new Set(statuses.map((status) => status.id));
  const buckets = new Map(statuses.map((status) => [status.id, [] as KanbanBoardSummary[]]));
  for (const row of boards) {
    const summary = toSummary(row);
    const statusId = summary.status && valid.has(summary.status) ? summary.status : fallback;
    buckets.get(statusId)?.push(summary);
  }
  return { columns: statuses.map((status) => ({ ...status, boards: buckets.get(status.id) ?? [] })) };
}

export async function createBoardStatusColumn(
  userId: string,
  input: { title?: string; color?: KanbanColumnColor | null } = {},
): Promise<string> {
  await ensureBoardColumns(userId);
  const position = await db.boardStatus.count({ where: { userId } });
  const status = await db.boardStatus.create({
    data: { userId, title: input.title?.trim() || "New status", color: input.color, position },
  });
  return status.id;
}

export async function updateBoardStatusColumn(
  userId: string,
  statusId: string,
  patch: { title?: string; color?: KanbanColumnColor | null },
): Promise<void> {
  const result = await db.boardStatus.updateMany({
    where: { id: statusId, userId },
    data: {
      ...(patch.title !== undefined ? { title: patch.title.trim() || "New status" } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
    },
  });
  if (result.count === 0) throw new Error(`Status not found: ${statusId}`);
}

export async function deleteBoardStatusColumn(userId: string, statusId: string): Promise<void> {
  const statuses = await ensureBoardColumns(userId);
  if (statuses.length <= 1) throw new Error("A board needs at least one status column.");
  if (!statuses.some((status) => status.id === statusId)) throw new Error(`Status not found: ${statusId}`);
  const fallback = statuses.find((status) => status.id !== statusId)!;
  await db.$transaction(async (tx) => {
    const offset = await tx.board.count({ where: { statusId: fallback.id } });
    const moving = await tx.board.findMany({
      where: { statusId },
      orderBy: { statusPosition: "asc" },
      select: { id: true },
    });
    for (const [index, board] of moving.entries()) {
      await tx.board.update({
        where: { id: board.id },
        data: { statusId: fallback.id, statusPosition: offset + index },
      });
    }
    await tx.boardStatus.delete({ where: { id: statusId } });
  });
  await normalizeStatusPositions(userId);
}

async function normalizeStatusPositions(userId: string): Promise<void> {
  const statuses = await db.boardStatus.findMany({
    where: { userId }, orderBy: { position: "asc" }, select: { id: true },
  });
  await db.$transaction(statuses.map((status, position) =>
    db.boardStatus.update({ where: { id: status.id }, data: { position } })));
}

export async function moveBoardStatusColumn(
  userId: string,
  statusId: string,
  toIndex: number,
): Promise<void> {
  const statuses = await ensureBoardColumns(userId);
  const moving = statuses.find((status) => status.id === statusId);
  if (!moving) throw new Error(`Status not found: ${statusId}`);
  const rest = statuses.filter((status) => status.id !== statusId);
  rest.splice(Math.max(0, Math.min(Math.trunc(toIndex), rest.length)), 0, moving);
  await db.$transaction(rest.map((status, position) =>
    db.boardStatus.update({ where: { id: status.id }, data: { position } })));
}

export async function moveBoardToStatus(
  userId: string,
  boardId: string,
  statusId: string,
  toIndex: number,
): Promise<void> {
  await assertBoard(userId, boardId);
  const status = await db.boardStatus.findFirst({ where: { id: statusId, userId } });
  if (!status) throw new Error(`Status not found: ${statusId}`);
  const siblings = await db.board.findMany({
    where: { userId, statusId, id: { not: boardId } },
    orderBy: { statusPosition: "asc" },
    select: { id: true },
  });
  siblings.splice(
    Math.max(0, Math.min(Math.trunc(toIndex), siblings.length)),
    0,
    { id: boardId },
  );
  await db.$transaction(siblings.map((board, statusPosition) => db.board.update({
    where: { id: board.id },
    data: { statusId, statusPosition },
  })));
}
