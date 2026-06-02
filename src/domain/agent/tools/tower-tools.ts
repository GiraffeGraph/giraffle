import { z } from "zod";
import {
  addTodoToNote,
  getNoteTodoBlocks,
  getNotesWithTodoSummary,
  setTodoBlockQuadrant,
  toggleTodoBlock,
  updateNote,
} from "@/domain/note/note.service";
import type { EisenhowerQuadrant, MatrixSlot } from "@/domain/note/note.types";
import { db } from "@/lib/db";
import type { InternalToolDefinition } from "../internal-tools";

async function assertOwnedNote(userId: string, noteId: string): Promise<void> {
  const found = await db.note.findFirst({ where: { id: noteId, userId }, select: { id: true } });
  if (!found) throw new Error(`Note not found: ${noteId}`);
}

/**
 * Tower Matrix = Eisenhower prioritization. Notes carry a MatrixSlot
 * (DO/SCHEDULE/DELEGATE/ELIMINATE/BACKLOG); individual taskItems carry an
 * EisenhowerQuadrant. These tools mirror the userId-scoped service layer the
 * Tower Matrix UI uses.
 */

const QUADRANT = z.enum(["DO", "SCHEDULE", "DELEGATE", "ELIMINATE"]);
const MATRIX_SLOT = z.enum(["DO", "SCHEDULE", "DELEGATE", "ELIMINATE", "BACKLOG"]);

export const towerMatrixTools: InternalToolDefinition[] = [
  {
    name: "tower_list_matrix",
    destructive: false,
    description:
      "List all matrix-scoped notes with their slot (DO/SCHEDULE/DELEGATE/ELIMINATE/BACKLOG) and per-quadrant task counts.",
    inputSchema: z.object({}),
    execute: async (_raw, { userId }) => {
      const all = await getNotesWithTodoSummary(userId);
      // Bound the payload so a large matrix can't blow the MCP token budget.
      const LIMIT = 200;
      return { notes: all.slice(0, LIMIT), truncated: all.length > LIMIT, total: all.length };
    },
  },
  {
    name: "tower_list_note_tasks",
    destructive: false,
    description: "List the taskItem blocks of one note with their checked state and quadrant.",
    inputSchema: z.object({
      noteId: z.string().min(1),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { noteId: string };
      await assertOwnedNote(userId, input.noteId);
      const tasks = await getNoteTodoBlocks(userId, input.noteId);
      return { noteId: input.noteId, tasks };
    },
  },
  {
    name: "tower_assign_note",
    destructive: true,
    description:
      "Assign a note to a matrix slot (DO/SCHEDULE/DELEGATE/ELIMINATE/BACKLOG), or pass null to remove it from the matrix.",
    inputSchema: z.object({
      noteId: z.string().min(1),
      quadrant: MATRIX_SLOT.nullable(),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { noteId: string; quadrant: MatrixSlot | null };
      await updateNote(userId, input.noteId, { quadrant: input.quadrant });
      return { noteId: input.noteId, quadrant: input.quadrant };
    },
  },
  {
    name: "tower_add_task",
    destructive: true,
    description: "Add a taskItem to a note's task list.",
    inputSchema: z.object({
      noteId: z.string().min(1),
      text: z.string().min(1).max(2_000),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { noteId: string; text: string };
      await assertOwnedNote(userId, input.noteId);
      await addTodoToNote(userId, input.noteId, input.text);
      return { noteId: input.noteId, text: input.text, added: true };
    },
  },
  {
    name: "tower_assign_task",
    destructive: true,
    description:
      "Assign a single taskItem block to an Eisenhower quadrant (DO/SCHEDULE/DELEGATE/ELIMINATE), or pass null to clear it.",
    inputSchema: z.object({
      blockId: z.string().min(1),
      quadrant: QUADRANT.nullable(),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { blockId: string; quadrant: EisenhowerQuadrant | null };
      await setTodoBlockQuadrant(userId, input.blockId, input.quadrant);
      return { blockId: input.blockId, quadrant: input.quadrant };
    },
  },
  {
    name: "tower_toggle_task",
    destructive: true,
    description: "Mark a taskItem block complete or incomplete.",
    inputSchema: z.object({
      blockId: z.string().min(1),
      checked: z.boolean(),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { blockId: string; checked: boolean };
      await toggleTodoBlock(userId, input.blockId, input.checked);
      return { blockId: input.blockId, checked: input.checked };
    },
  },
];
