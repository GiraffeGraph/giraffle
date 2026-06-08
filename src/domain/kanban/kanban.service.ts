import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  createNote,
  createTaskItemInNote,
  deleteCalendarTodo,
  deleteNote,
  setTodoBlockQuadrant,
  setTodoDueDate,
  setTodoDuration,
  toggleTodoBlock,
  updateCalendarTodoText,
  updateNote,
} from "@/domain/note/note.service";
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

// A board is a Note whose `kanbanColumns` JSON is non-null; cards are that
// note's taskItem blocks, placed via attributes.kanbanColumnId/kanbanPosition.

const EISENHOWER = ["DO", "SCHEDULE", "DELEGATE", "ELIMINATE"];

const DEFAULT_COLUMN_SEEDS: Array<{ title: string; color: KanbanColumnColor }> = [
  { title: "To do", color: "neutral" },
  { title: "In progress", color: "blue" },
  { title: "Done", color: "green" },
];

function defaultColumns(): KanbanColumnDef[] {
  return DEFAULT_COLUMN_SEEDS.map((c, i) => ({
    id: randomUUID(),
    title: c.title,
    color: c.color,
    position: i,
  }));
}

function isColumnColor(v: unknown): v is KanbanColumnColor {
  return (
    v === "neutral" ||
    v === "blue" ||
    v === "amber" ||
    v === "green" ||
    v === "red" ||
    v === "purple"
  );
}

function parseColumns(raw: unknown): KanbanColumnDef[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === "object")
    .map((c, i) => ({
      id: typeof c.id === "string" ? c.id : randomUUID(),
      title: typeof c.title === "string" ? c.title : "Column",
      color: isColumnColor(c.color) ? c.color : null,
      position: typeof c.position === "number" ? c.position : i,
    }))
    .sort((a, b) => a.position - b.position);
}

function extractText(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const node = content as { text?: unknown; content?: unknown };
  if (typeof node.text === "string") return node.text;
  if (Array.isArray(node.content)) return node.content.map(extractText).join("");
  return "";
}

const asJson = (cols: KanbanColumnDef[]): Prisma.InputJsonValue =>
  cols as unknown as Prisma.InputJsonValue;

// ─── Guards ───────────────────────────────────────────────────

async function assertBoard(userId: string, boardId: string): Promise<KanbanColumnDef[]> {
  const note = await db.note.findFirst({
    where: { id: boardId, userId },
    select: { id: true, kanbanColumns: true },
  });
  if (!note || note.kanbanColumns == null) throw new Error(`Board not found: ${boardId}`);
  return parseColumns(note.kanbanColumns);
}

async function assertCardOwner(userId: string, cardId: string): Promise<void> {
  const block = await db.block.findFirst({
    where: { id: cardId, type: "taskItem", note: { userId } },
    select: { id: true },
  });
  if (!block) throw new Error(`Card not found: ${cardId}`);
}

async function patchBlockAttrs(
  userId: string,
  blockId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const block = await db.block.findFirst({
    where: { id: blockId, note: { userId } },
    select: { attributes: true },
  });
  if (!block) throw new Error(`Card not found: ${blockId}`);
  const attrs = (block.attributes ?? {}) as Record<string, unknown>;
  await db.block.update({
    where: { id: blockId },
    data: { attributes: { ...attrs, ...patch } as Prisma.InputJsonValue },
  });
}

async function writeColumns(boardId: string, cols: KanbanColumnDef[]): Promise<void> {
  const ordered = [...cols].sort((a, b) => a.position - b.position).map((c, i) => ({ ...c, position: i }));
  await db.note.update({ where: { id: boardId }, data: { kanbanColumns: asJson(ordered) } });
}

// ─── Serializers ──────────────────────────────────────────────

type RawCardBlock = {
  id: string;
  content: unknown;
  attributes: unknown;
  dueDate: Date | null;
  position: number;
  children: { content: unknown }[];
};

function blockToCard(b: RawCardBlock, validColumnIds: Set<string>, fallback: string): KanbanCardData {
  const attrs = (b.attributes ?? {}) as Record<string, unknown>;
  const text =
    b.children.length > 0
      ? b.children.map((c) => extractText(c.content)).join("")
      : extractText(b.content);
  const rawCol = typeof attrs.kanbanColumnId === "string" ? attrs.kanbanColumnId : null;
  const columnId = rawCol && validColumnIds.has(rawCol) ? rawCol : fallback;
  const dur = attrs.durationMinutes;
  const kpos = attrs.kanbanPosition;
  return {
    id: b.id,
    columnId,
    title: text,
    description: typeof attrs.description === "string" ? attrs.description : null,
    priority: EISENHOWER.includes(String(attrs.quadrant ?? ""))
      ? (attrs.quadrant as KanbanPriority)
      : null,
    dueDate: b.dueDate,
    durationMinutes: typeof dur === "number" && dur > 0 ? dur : null,
    completed: attrs.checked === true,
    position: typeof kpos === "number" ? kpos : b.position,
  };
}

// ─── Boards ───────────────────────────────────────────────────

export async function listBoards(userId: string): Promise<KanbanBoardSummary[]> {
  const notes = await db.note.findMany({
    where: { userId, isArchived: false, kanbanColumns: { not: Prisma.DbNull } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      icon: true,
      updatedAt: true,
      kanbanColumns: true,
      blocks: { where: { type: "taskItem" }, select: { attributes: true } },
    },
  });
  return notes.map((n) => {
    const completedCount = n.blocks.filter(
      (b) => ((b.attributes ?? {}) as Record<string, unknown>).checked === true,
    ).length;
    return {
      id: n.id,
      title: n.title,
      icon: n.icon,
      columnCount: parseColumns(n.kanbanColumns).length,
      cardCount: n.blocks.length,
      completedCount,
      updatedAt: n.updatedAt,
    };
  });
}

export async function createBoard(
  userId: string,
  input: { title?: string } = {},
): Promise<string> {
  const noteId = await createNote(userId, {
    title: input.title?.trim() || "Untitled board",
    icon: "view_kanban",
  });
  await db.note.update({
    where: { id: noteId },
    data: { kanbanColumns: asJson(defaultColumns()) },
  });
  return noteId;
}

export async function getBoard(userId: string, boardId: string): Promise<KanbanBoardData | null> {
  const note = await db.note.findFirst({
    where: { id: boardId, userId },
    select: {
      id: true,
      title: true,
      icon: true,
      updatedAt: true,
      kanbanColumns: true,
      blocks: {
        where: { type: "taskItem" },
        orderBy: { position: "asc" },
        select: {
          id: true,
          content: true,
          attributes: true,
          dueDate: true,
          position: true,
          children: { select: { content: true }, orderBy: { position: "asc" } },
        },
      },
    },
  });
  if (!note || note.kanbanColumns == null) return null;

  const cols = parseColumns(note.kanbanColumns);
  const fallback = cols[0]?.id ?? "";
  const validIds = new Set(cols.map((c) => c.id));
  const buckets = new Map<string, KanbanCardData[]>();
  for (const col of cols) buckets.set(col.id, []);
  for (const block of note.blocks) {
    const card = blockToCard(block as RawCardBlock, validIds, fallback);
    (buckets.get(card.columnId) ?? buckets.get(fallback))?.push(card);
  }
  for (const list of buckets.values()) list.sort((a, b) => a.position - b.position);

  const columns: KanbanColumnData[] = cols.map((c) => ({
    id: c.id,
    boardId: note.id,
    title: c.title,
    color: c.color,
    position: c.position,
    cards: buckets.get(c.id) ?? [],
  }));

  return { id: note.id, title: note.title, icon: note.icon, columns, updatedAt: note.updatedAt };
}

export async function updateBoard(
  userId: string,
  boardId: string,
  patch: { title?: string; icon?: string | null },
): Promise<void> {
  await assertBoard(userId, boardId);
  const data: { title?: string; icon?: string | null } = {};
  if (patch.title !== undefined) data.title = patch.title.trim() || "Untitled board";
  if (patch.icon !== undefined) data.icon = patch.icon;
  if (Object.keys(data).length > 0) await updateNote(userId, boardId, data);
}

export async function deleteBoard(userId: string, boardId: string): Promise<void> {
  await assertBoard(userId, boardId);
  await deleteNote(userId, boardId);
}

// ─── Columns (mutate note.kanbanColumns) ──────────────────────

export async function createColumn(
  userId: string,
  boardId: string,
  input: { title?: string; color?: KanbanColumnColor | null } = {},
): Promise<string> {
  const cols = await assertBoard(userId, boardId);
  const id = randomUUID();
  cols.push({
    id,
    title: input.title?.trim() || "New column",
    color: input.color ?? null,
    position: cols.length,
  });
  await writeColumns(boardId, cols);
  return id;
}

export async function updateColumn(
  userId: string,
  boardId: string,
  columnId: string,
  patch: { title?: string; color?: KanbanColumnColor | null },
): Promise<void> {
  const cols = await assertBoard(userId, boardId);
  const col = cols.find((c) => c.id === columnId);
  if (!col) throw new Error(`Column not found: ${columnId}`);
  if (patch.title !== undefined) col.title = patch.title.trim() || "New column";
  if (patch.color !== undefined) col.color = patch.color;
  await writeColumns(boardId, cols);
}

export async function deleteColumn(userId: string, boardId: string, columnId: string): Promise<void> {
  const cols = await assertBoard(userId, boardId);
  const remaining = cols.filter((c) => c.id !== columnId).map((c, i) => ({ ...c, position: i }));
  const fallback = remaining[0]?.id ?? null;
  await db.$transaction(async (tx) => {
    const blocks = await tx.block.findMany({
      where: { type: "taskItem", note: { id: boardId, userId } },
      select: { id: true, attributes: true },
    });
    for (const b of blocks) {
      const a = (b.attributes ?? {}) as Record<string, unknown>;
      if (a.kanbanColumnId === columnId) {
        await tx.block.update({
          where: { id: b.id },
          data: { attributes: { ...a, kanbanColumnId: fallback } },
        });
      }
    }
    await tx.note.update({ where: { id: boardId }, data: { kanbanColumns: asJson(remaining) } });
  });
}

export async function moveColumn(
  userId: string,
  boardId: string,
  columnId: string,
  toIndex: number,
): Promise<void> {
  const cols = await assertBoard(userId, boardId);
  const moving = cols.find((c) => c.id === columnId);
  if (!moving) throw new Error(`Column not found: ${columnId}`);
  const rest = cols.filter((c) => c.id !== columnId);
  const idx = Math.max(0, Math.min(Math.trunc(toIndex), rest.length));
  rest.splice(idx, 0, moving);
  await writeColumns(boardId, rest);
}

// ─── Cards (taskItem blocks) ──────────────────────────────────

export async function createCard(
  userId: string,
  boardId: string,
  columnId: string,
  input: CreateCardInput,
): Promise<KanbanCardData> {
  const cols = await assertBoard(userId, boardId);
  const col = cols.find((c) => c.id === columnId) ?? cols[0];
  if (!col) throw new Error("Board has no columns");

  const siblings = await db.block.findMany({
    where: { type: "taskItem", note: { id: boardId, userId } },
    select: { attributes: true },
  });
  const colCount = siblings.filter(
    (b) => ((b.attributes ?? {}) as Record<string, unknown>).kanbanColumnId === col.id,
  ).length;

  const attrs: Record<string, unknown> = { kanbanColumnId: col.id, kanbanPosition: colCount };
  if (input.priority) attrs.quadrant = input.priority;
  if (input.durationMinutes != null) attrs.durationMinutes = input.durationMinutes;
  if (input.description) attrs.description = input.description;

  const blockId = await createTaskItemInNote(userId, boardId, input.title, attrs);
  if (input.dueDate) await setTodoDueDate(userId, blockId, input.dueDate);

  return {
    id: blockId,
    columnId: col.id,
    title: input.title.trim(),
    description: input.description ?? null,
    priority: input.priority ?? null,
    dueDate: input.dueDate ?? null,
    durationMinutes: input.durationMinutes ?? null,
    completed: false,
    position: colCount,
  };
}

export async function updateCard(
  userId: string,
  cardId: string,
  patch: UpdateCardInput,
): Promise<void> {
  await assertCardOwner(userId, cardId);
  if (patch.title !== undefined) await updateCalendarTodoText(userId, cardId, patch.title);
  if (patch.priority !== undefined) await setTodoBlockQuadrant(userId, cardId, patch.priority);
  if (patch.dueDate !== undefined) await setTodoDueDate(userId, cardId, patch.dueDate);
  if (patch.durationMinutes !== undefined) {
    if (patch.durationMinutes == null) await patchBlockAttrs(userId, cardId, { durationMinutes: null });
    else await setTodoDuration(userId, cardId, patch.durationMinutes);
  }
  if (patch.description !== undefined) {
    await patchBlockAttrs(userId, cardId, { description: patch.description });
  }
  if (typeof patch.completed === "boolean") await toggleTodoBlock(userId, cardId, patch.completed);
}

export async function deleteCard(userId: string, cardId: string): Promise<void> {
  await assertCardOwner(userId, cardId);
  await deleteCalendarTodo(userId, cardId);
}

export async function moveCard(
  userId: string,
  cardId: string,
  toColumnId: string,
  toIndex: number,
): Promise<void> {
  const card = await db.block.findFirst({
    where: { id: cardId, type: "taskItem", note: { userId } },
    select: { id: true, noteId: true, note: { select: { kanbanColumns: true } } },
  });
  if (!card || card.note.kanbanColumns == null) throw new Error(`Card not found: ${cardId}`);
  const cols = parseColumns(card.note.kanbanColumns);
  if (!cols.some((c) => c.id === toColumnId)) throw new Error(`Column not found: ${toColumnId}`);

  await db.$transaction(async (tx) => {
    const blocks = await tx.block.findMany({
      where: { type: "taskItem", noteId: card.noteId },
      select: { id: true, attributes: true },
    });
    const order = blocks
      .filter((b) => {
        if (b.id === cardId) return false;
        return ((b.attributes ?? {}) as Record<string, unknown>).kanbanColumnId === toColumnId;
      })
      .map((b) => ({
        id: b.id,
        pos: Number(((b.attributes ?? {}) as Record<string, unknown>).kanbanPosition ?? 0),
      }))
      .sort((a, b) => a.pos - b.pos)
      .map((b) => b.id);

    const idx = Math.max(0, Math.min(Math.trunc(toIndex), order.length));
    order.splice(idx, 0, cardId);

    for (let i = 0; i < order.length; i++) {
      const id = order[i];
      const src = blocks.find((b) => b.id === id);
      const a = (src?.attributes ?? {}) as Record<string, unknown>;
      await tx.block.update({
        where: { id },
        data: { attributes: { ...a, kanbanColumnId: toColumnId, kanbanPosition: i } },
      });
    }
  });
}
