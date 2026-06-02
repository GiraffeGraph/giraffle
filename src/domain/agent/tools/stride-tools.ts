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

function parseDate(value: string, label: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ${label}: ${value}`);
  return d;
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
      const todos = await getTodosForCalendar(
        userId,
        parseDate(input.start, "start"),
        parseDate(input.end, "end"),
      );
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
      await deleteCalendarTodo(userId, input.blockId);
      return { blockId: input.blockId, deleted: true };
    },
  },
];
