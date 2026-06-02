import { z } from "zod";
import {
  createCalendarTodo,
  deleteCalendarTodo,
  getTodosForCalendar,
  getUnscheduledTodos,
  setTodoDueDate,
  setTodoDuration,
  toggleCalendarTodo,
  updateCalendarTodoText,
} from "@/domain/note/note.service";
import { db } from "@/lib/db";
import type { InternalToolDefinition } from "../internal-tools";

/**
 * Stride = calendar-based task scheduling. Tasks are taskItem blocks with a
 * dueDate + duration. These tools expose the same userId-scoped service layer
 * the Stride UI uses, so any MCP client can plan the user's calendar.
 */

type CalendarTodo = {
  id: string;
  text: string;
  checked: boolean;
  quadrant: string | null;
  dueDate: Date;
  durationMinutes: number;
  position: number;
  note: { id: string; title: string; icon: string | null };
};

function serializeTodo(t: CalendarTodo) {
  return {
    id: t.id,
    text: t.text,
    checked: t.checked,
    quadrant: t.quadrant,
    dueDate: t.dueDate instanceof Date ? t.dueDate.toISOString() : t.dueDate,
    durationMinutes: t.durationMinutes,
    position: t.position,
    note: t.note,
  };
}

const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

function parseDate(value: string, label: string): Date {
  // A bare YYYY-MM-DD parses as UTC midnight, which the Stride UI (local-time
  // day boundaries) would show on the previous day west of UTC. Pin date-only
  // strings to local midnight; full timestamps are honored as given.
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ${label}: ${value}`);
  return d;
}

/**
 * The underlying service mutations use updateMany/deleteMany scoped by owner,
 * which silently affect 0 rows for a missing/unowned blockId. Assert ownership
 * first so the agent gets an honest "task not found" instead of false success.
 */
async function assertOwnedTaskBlock(userId: string, blockId: string): Promise<void> {
  const found = await db.block.findFirst({
    where: { id: blockId, type: "taskItem", note: { userId } },
    select: { id: true },
  });
  if (!found) throw new Error(`Task not found: ${blockId}`);
}

export const strideTools: InternalToolDefinition[] = [
  {
    name: "stride_list_scheduled",
    destructive: false,
    description:
      "List scheduled Stride tasks (taskItems with a due date) within a date range. Provide ISO 8601 start and end timestamps.",
    inputSchema: z.object({
      start: z.string().min(1),
      end: z.string().min(1),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { start: string; end: string };
      const start = parseDate(input.start, "start");
      const end = parseDate(input.end, "end");
      if (start.getTime() >= end.getTime()) {
        throw new Error("start must be before end");
      }
      if (end.getTime() - start.getTime() > MAX_RANGE_MS) {
        throw new Error("Date range too large; query at most ~1 year at a time");
      }
      const todos = await getTodosForCalendar(userId, start, end);
      return { todos: (todos as CalendarTodo[]).map(serializeTodo) };
    },
  },
  {
    name: "stride_list_unscheduled",
    destructive: false,
    description: "List unscheduled Stride tasks (taskItems with no due date). Up to 200 items.",
    inputSchema: z.object({}),
    execute: async (_raw, { userId }) => {
      const todos = await getUnscheduledTodos(userId);
      return { todos: (todos as CalendarTodo[]).map(serializeTodo) };
    },
  },
  {
    name: "stride_create_task",
    destructive: true,
    description:
      "Create a scheduled Stride task in the user's Daily note. Provide text, an ISO 8601 dueDate, and an estimated durationMinutes.",
    inputSchema: z.object({
      text: z.string().min(1).max(2_000),
      dueDate: z.string().min(1),
      durationMinutes: z.number().int().min(1).max(1_440).default(60),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { text: string; dueDate: string; durationMinutes: number };
      const todo = await createCalendarTodo(
        userId,
        input.text,
        parseDate(input.dueDate, "dueDate"),
        input.durationMinutes,
      );
      return serializeTodo(todo as CalendarTodo);
    },
  },
  {
    name: "stride_schedule_task",
    destructive: true,
    description:
      "Set or clear a task's due date. Pass an ISO 8601 dueDate to schedule, or null to move it back to the unscheduled backlog.",
    inputSchema: z.object({
      blockId: z.string().min(1),
      dueDate: z.string().min(1).nullable(),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { blockId: string; dueDate: string | null };
      await assertOwnedTaskBlock(userId, input.blockId);
      await setTodoDueDate(
        userId,
        input.blockId,
        input.dueDate ? parseDate(input.dueDate, "dueDate") : null,
      );
      return { blockId: input.blockId, dueDate: input.dueDate };
    },
  },
  {
    name: "stride_set_duration",
    destructive: true,
    description: "Update a task's estimated duration in minutes.",
    inputSchema: z.object({
      blockId: z.string().min(1),
      durationMinutes: z.number().int().min(1).max(1_440),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { blockId: string; durationMinutes: number };
      await assertOwnedTaskBlock(userId, input.blockId);
      await setTodoDuration(userId, input.blockId, input.durationMinutes);
      return { blockId: input.blockId, durationMinutes: input.durationMinutes };
    },
  },
  {
    name: "stride_toggle_task",
    destructive: true,
    description: "Mark a Stride task complete or incomplete.",
    inputSchema: z.object({
      blockId: z.string().min(1),
      checked: z.boolean(),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { blockId: string; checked: boolean };
      await assertOwnedTaskBlock(userId, input.blockId);
      await toggleCalendarTodo(userId, input.blockId, input.checked);
      return { blockId: input.blockId, checked: input.checked };
    },
  },
  {
    name: "stride_update_task_text",
    destructive: true,
    description: "Edit the text of a Stride task.",
    inputSchema: z.object({
      blockId: z.string().min(1),
      text: z.string().min(1).max(2_000),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { blockId: string; text: string };
      await assertOwnedTaskBlock(userId, input.blockId);
      await updateCalendarTodoText(userId, input.blockId, input.text);
      return { blockId: input.blockId, text: input.text };
    },
  },
  {
    name: "stride_delete_task",
    destructive: true,
    description: "Permanently delete a Stride task and its child blocks.",
    inputSchema: z.object({
      blockId: z.string().min(1),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { blockId: string };
      await assertOwnedTaskBlock(userId, input.blockId);
      await deleteCalendarTodo(userId, input.blockId);
      return { blockId: input.blockId, deleted: true };
    },
  },
];
