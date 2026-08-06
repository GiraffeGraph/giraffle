"use server";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { generateId, isRecord } from "@giraffle/domain";
import {
  EISENHOWER_QUADRANTS,
  MATRIX_SLOTS,
} from "@giraffle/domain";
import type {
  BlockNodeContent,
  EisenhowerQuadrant,
  MatrixSlot,
} from "@giraffle/domain";
import { createNote, insertBlock } from "./page.service";

function extractBlockText(content: unknown): string {
  if (!isRecord(content)) return "";
  if (content.type === "text" && typeof content.text === "string") return content.text;
  if (Array.isArray(content.content)) return content.content.map(extractBlockText).join("");
  return "";
}

function asPriority(value: unknown): EisenhowerQuadrant | null {
  return (EISENHOWER_QUADRANTS as readonly unknown[]).includes(value)
    ? (value as EisenhowerQuadrant)
    : null;
}

async function assertOwnedTask(userId: string, blockId: string) {
  const block = await db.block.findFirst({
    where: { id: blockId, type: "taskItem", note: { userId } },
    select: { id: true, attributes: true },
  });
  if (!block) throw new Error("Task not found");
  return block;
}

export async function setPagePriority(
  userId: string,
  noteId: string,
  slot: MatrixSlot | null,
): Promise<void> {
  const note = await db.note.findFirst({
    where: { id: noteId, userId, boardTaskSource: null },
    select: { id: true },
  });
  if (!note) throw new Error("Note not found");

  if (slot === null) {
    await db.pagePriority.deleteMany({ where: { noteId } });
    return;
  }
  if (!(MATRIX_SLOTS as readonly string[]).includes(slot)) {
    throw new Error("Invalid page priority");
  }
  await db.pagePriority.upsert({
    where: { noteId },
    create: { noteId, slot },
    update: { slot },
  });
}

export async function getNotesWithTodoSummary(userId: string) {
  const rows = await db.note.findMany({
    where: {
      userId,
      isArchived: false,
      boardTaskSource: null,
      pagePriority: { is: { slot: { in: [...MATRIX_SLOTS] } } },
    },
    orderBy: [{ isPinned: "desc" }, { position: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      icon: true,
      pagePriority: { select: { slot: true } },
      blocks: {
        where: { type: "taskItem" },
        select: { taskMetadata: { select: { completed: true, priority: true } } },
      },
    },
  });

  return rows.map((row) => {
    const todos = row.blocks.map((block) => ({
      checked: block.taskMetadata?.completed === true,
      quadrant: asPriority(block.taskMetadata?.priority),
    }));
    const slot = row.pagePriority?.slot;
    return {
      id: row.id,
      title: row.title,
      icon: row.icon,
      quadrant: (MATRIX_SLOTS as readonly string[]).includes(slot ?? "")
        ? (slot as MatrixSlot)
        : null,
      todoTotal: todos.length,
      todoCompleted: todos.filter((todo) => todo.checked).length,
      todoByQuadrant: Object.fromEntries(
        EISENHOWER_QUADRANTS.map((quadrant) => [
          quadrant,
          todos.filter((todo) => todo.quadrant === quadrant).length,
        ]),
      ) as Record<EisenhowerQuadrant, number>,
    };
  });
}

export async function getNoteTodoBlocks(userId: string, noteId: string) {
  const note = await db.note.findFirst({
    where: { id: noteId, userId },
    select: {
      blocks: {
        where: { type: "taskItem" },
        select: {
          id: true,
          content: true,
          position: true,
          taskMetadata: { select: { completed: true, priority: true } },
          children: {
            select: { content: true },
            orderBy: { position: "asc" },
          },
        },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!note) return [];

  return note.blocks.map((block) => ({
    id: block.id,
    text:
      block.children.length > 0
        ? block.children.map((child) => extractBlockText(child.content)).join("")
        : extractBlockText(block.content),
    checked: block.taskMetadata?.completed === true,
    quadrant: asPriority(block.taskMetadata?.priority),
    position: block.position,
  }));
}

export async function addTodoToNote(
  userId: string,
  noteId: string,
  text: string,
): Promise<void> {
  await createTaskItemInNote(userId, noteId, text);
}

export async function createTaskItemInNote(
  userId: string,
  noteId: string,
  text: string,
  metadata: Record<string, unknown> = {},
): Promise<string> {
  const blockId = generateId();
  const taskItemNode: BlockNodeContent = {
    type: "taskItem",
    attrs: { blockId, checked: false },
    content: [
      {
        type: "paragraph",
        content: text.trim()
          ? [{ type: "text", text: text.trim() } as { type: "text"; text: string }]
          : [],
      },
    ],
  };
  const existingTaskList = await db.block.findFirst({
    where: { noteId, type: "taskList", note: { userId } },
    select: { id: true },
  });
  await insertBlock(userId, noteId, existingTaskList
    ? { block: taskItemNode, parentBlockId: existingTaskList.id }
    : { block: { type: "taskList", content: [taskItemNode] } });

  const priority = asPriority(metadata.priority ?? metadata.quadrant);
  const durationMinutes =
    typeof metadata.durationMinutes === "number" && metadata.durationMinutes > 0
      ? Math.trunc(metadata.durationMinutes)
      : null;
  const description = typeof metadata.description === "string" ? metadata.description : null;
  await db.taskMetadata.upsert({
    where: { blockId },
    create: { blockId, priority, durationMinutes, description },
    update: { priority, durationMinutes, description },
  });
  return blockId;
}

export async function setTodoBlockQuadrant(
  userId: string,
  blockId: string,
  quadrant: EisenhowerQuadrant | null,
): Promise<void> {
  await assertOwnedTask(userId, blockId);
  await db.taskMetadata.upsert({
    where: { blockId },
    create: { blockId, priority: quadrant },
    update: { priority: quadrant },
  });
}

export async function toggleTodoBlock(
  userId: string,
  blockId: string,
  checked: boolean,
): Promise<void> {
  const block = await assertOwnedTask(userId, blockId);
  const attributes = isRecord(block.attributes) ? block.attributes : {};
  await db.$transaction([
    db.block.update({
      where: { id: blockId },
      data: { attributes: { ...attributes, checked } as Prisma.InputJsonValue },
    }),
    db.taskMetadata.upsert({
      where: { blockId },
      create: { blockId, completed: checked },
      update: { completed: checked },
    }),
  ]);
}

type CalendarMetadata = {
  blockId: string;
  priority: string | null;
  dueDate: Date | null;
  durationMinutes: number | null;
  completed: boolean;
  block: {
    id: string;
    content: unknown;
    position: number;
    children: { content: unknown }[];
    note: {
      id: string;
      title: string;
      icon: string | null;
      boardTaskSource: { id: string; title: string; icon: string | null } | null;
    };
  };
};

function toCalendarTodo(row: CalendarMetadata) {
  const source = row.block.note.boardTaskSource;
  return {
    id: row.blockId,
    text:
      row.block.children.length > 0
        ? row.block.children.map((child) => extractBlockText(child.content)).join("")
        : extractBlockText(row.block.content),
    checked: row.completed,
    quadrant: asPriority(row.priority),
    dueDate: row.dueDate,
    durationMinutes: row.durationMinutes ?? 60,
    position: row.block.position,
    note: source
      ? { id: source.id, title: source.title, icon: source.icon, isBoard: true }
      : {
          id: row.block.note.id,
          title: row.block.note.title,
          icon: row.block.note.icon,
          isBoard: false,
        },
  };
}

const CALENDAR_SELECT = {
  blockId: true,
  priority: true,
  dueDate: true,
  durationMinutes: true,
  completed: true,
  block: {
    select: {
      id: true,
      content: true,
      position: true,
      children: { select: { content: true }, orderBy: { position: "asc" as const } },
      note: {
        select: {
          id: true,
          title: true,
          icon: true,
          boardTaskSource: { select: { id: true, title: true, icon: true } },
        },
      },
    },
  },
} as const;

export async function getTodosForCalendar(userId: string, start: Date, end: Date) {
  const rows = await db.taskMetadata.findMany({
    where: {
      dueDate: { gte: start, lt: end },
      block: { type: "taskItem", note: { userId, isArchived: false } },
    },
    select: CALENDAR_SELECT,
    orderBy: { dueDate: "asc" },
  });
  return rows.map((row) => toCalendarTodo(row));
}

export async function getUnscheduledTodos(userId: string) {
  const rows = await db.taskMetadata.findMany({
    where: {
      dueDate: null,
      block: { type: "taskItem", note: { userId, isArchived: false } },
    },
    select: CALENDAR_SELECT,
    orderBy: [{ block: { note: { updatedAt: "desc" } } }, { block: { position: "asc" } }],
    take: 200,
  });
  return rows.map((row) => toCalendarTodo(row));
}

export async function setTodoDueDate(
  userId: string,
  blockId: string,
  dueDate: Date | null,
): Promise<void> {
  await assertOwnedTask(userId, blockId);
  await db.taskMetadata.upsert({
    where: { blockId },
    create: { blockId, dueDate },
    update: { dueDate },
  });
}

export async function toggleCalendarTodo(
  userId: string,
  blockId: string,
  checked: boolean,
): Promise<void> {
  await toggleTodoBlock(userId, blockId, checked);
}

export async function createCalendarTodo(
  userId: string,
  text: string,
  dueDate: Date,
  durationMinutes: number,
) {
  let note = await db.note.findFirst({
    where: { userId, title: "Daily", isArchived: false, boardTaskSource: null },
    select: { id: true, title: true, icon: true },
  });
  if (!note) {
    const noteId = await createNote(userId, { title: "Daily" });
    note = { id: noteId, title: "Daily", icon: null };
  }
  const blockId = await createTaskItemInNote(userId, note.id, text, { durationMinutes });
  await setTodoDueDate(userId, blockId, dueDate);
  return {
    id: blockId,
    text: text.trim() || "New task",
    checked: false,
    quadrant: null as EisenhowerQuadrant | null,
    dueDate,
    durationMinutes,
    position: 0,
    note: { id: note.id, title: note.title, icon: note.icon, isBoard: false },
  };
}

export async function updateCalendarTodoText(
  userId: string,
  blockId: string,
  text: string,
): Promise<void> {
  await assertOwnedTask(userId, blockId);
  const newContent = {
    type: "paragraph",
    content: text.trim() ? [{ type: "text", text: text.trim() }] : [],
  };
  const child = await db.block.findFirst({
    where: { parentId: blockId, type: "paragraph", note: { userId } },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  if (child) {
    await db.block.update({ where: { id: child.id }, data: { content: newContent } });
  } else {
    await db.block.update({ where: { id: blockId }, data: { content: newContent } });
  }
}

export async function deleteCalendarTodo(userId: string, blockId: string): Promise<void> {
  await db.block.deleteMany({ where: { id: blockId, type: "taskItem", note: { userId } } });
}

export async function setTodoDuration(
  userId: string,
  blockId: string,
  durationMinutes: number,
): Promise<void> {
  await assertOwnedTask(userId, blockId);
  await db.taskMetadata.upsert({
    where: { blockId },
    create: { blockId, durationMinutes },
    update: { durationMinutes },
  });
}

export async function setTodoDescription(
  userId: string,
  blockId: string,
  description: string | null,
): Promise<void> {
  await assertOwnedTask(userId, blockId);
  await db.taskMetadata.upsert({
    where: { blockId },
    create: { blockId, description },
    update: { description },
  });
}
