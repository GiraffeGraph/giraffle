import { z } from "zod";
import { BlockNodeContentSchema } from "./schemas";

/**
 * The agent-facing contract of a Giraffle workspace, independent of storage.
 *
 * A tool is split in two: this catalog owns the wire contract (names, prose the
 * agent reads, argument validation, destructiveness) while the host that mounts
 * the catalog owns `execute`. The sync relay is blind — it holds ciphertext and
 * cannot answer a single one of these calls — so the only place an MCP host can
 * run is inside a client that already holds the vault key. Keeping the contract
 * here lets that host be written without re-deriving 42 schemas.
 */
export interface McpToolSchema {
  /** Stable internal identifier a host binds its handler to. */
  name: string;
  /** Name exposed over MCP. */
  mcpName: string;
  description: string;
  /** Mutates the workspace; hosts should surface it as non-read-only. */
  destructive: boolean;
  inputSchema: z.ZodTypeAny;
}

const PRIORITY = z.enum(["DO", "SCHEDULE", "DELEGATE", "ELIMINATE"]);
const MATRIX_SLOT = z.enum(["DO", "SCHEDULE", "DELEGATE", "ELIMINATE", "BACKLOG"]);
const COLUMN_COLOR = z.enum(["neutral", "blue", "amber", "green", "red", "purple"]);

export const MCP_TOOL_SCHEMAS: McpToolSchema[] = [
  {
    name: "notes_search",
    mcpName: "giraffle-search-notes",
    destructive: false,
    description:
      "Search the user's workspace notes. Supports plain words, quoted phrases, /regex/, folder: filters, title: filters, -negative terms, and pinned:true/false.",
    inputSchema: z.object({
      query: z.string().max(220).default(""),
      limit: z.number().int().min(1).max(120).default(20),
    }),
  },
  {
    name: "notes_get",
    mcpName: "giraffle-get-note",
    destructive: false,
    description:
      "Retrieve one note by noteId. Returns metadata, canonical Tiptap document, and Markdown rendering.",
    inputSchema: z.object({
      noteId: z.string().min(1),
      includeArchived: z.boolean().optional(),
    }),
  },
  {
    name: "notes_export",
    mcpName: "giraffle-export-note",
    destructive: false,
    description: "Export a note as Markdown or MDX from its canonical block document.",
    inputSchema: z.object({
      noteId: z.string().min(1),
      format: z.enum(["markdown", "mdx"]).default("markdown"),
    }),
  },
  {
    name: "notes_backlinks",
    mcpName: "giraffle-get-backlinks",
    destructive: false,
    description: "Get persisted backlinks pointing to a note.",
    inputSchema: z.object({ noteId: z.string().min(1) }),
  },
  {
    name: "pages_children",
    mcpName: "giraffle-list-child-pages",
    destructive: false,
    description:
      "List the child pages of one page. If pageId is omitted or null, lists the top-level pages.",
    inputSchema: z.object({
      pageId: z.string().min(1).nullable().optional(),
    }),
  },
  {
    name: "notes_create",
    mcpName: "giraffle-create-note",
    destructive: true,
    description:
      "Create a note in the workspace. Optional initialMarkdown is parsed into canonical blocks; optional initialBlocks must be Tiptap block JSON.",
    inputSchema: z.object({
      title: z.string().min(1).max(220),
      parentId: z.string().min(1).optional(),
      icon: z.string().max(20).optional(),
      isPinned: z.boolean().optional(),
      initialMarkdown: z.string().max(200_000).optional(),
      initialBlocks: z.array(BlockNodeContentSchema).max(200).optional(),
    }),
  },
  {
    name: "notes_update",
    mcpName: "giraffle-update-note",
    destructive: true,
    description:
      "Update note metadata such as title, pin state, folder, icon, cover image, or archive state. Use tower_assign_note for matrix placement.",
    inputSchema: z.object({
      noteId: z.string().min(1),
      title: z.string().min(1).max(220).optional(),
      icon: z.string().max(20).nullable().optional(),
      coverImage: z.string().max(2_000).nullable().optional(),
      folderId: z.string().min(1).nullable().optional(),
      isPinned: z.boolean().optional(),
      isArchived: z.boolean().optional(),
    }),
  },
  {
    name: "notes_append",
    mcpName: "giraffle-append-blocks",
    destructive: true,
    description:
      "Append content to an existing note. Provide markdown for simple writes or Tiptap block JSON for precise canonical blocks.",
    inputSchema: z
      .object({
        noteId: z.string().min(1),
        parentBlockId: z.string().min(1).nullable().optional(),
        afterBlockId: z.string().min(1).nullable().optional(),
        markdown: z.string().max(200_000).optional(),
        blocks: z.array(BlockNodeContentSchema).max(100).optional(),
      })
      .refine((v) => Boolean(v.markdown?.trim()) || Boolean(v.blocks?.length), {
        message: "Provide markdown or at least one block.",
      }),
  },
  {
    name: "notes_move",
    mcpName: "giraffle-move-note",
    destructive: true,
    description:
      "Move a note inside another page, or to the workspace root when targetParentId is null. Use afterNoteId to position relative to a sibling.",
    inputSchema: z.object({
      noteId: z.string().min(1),
      targetParentId: z.string().min(1).nullable().optional(),
      afterNoteId: z.string().min(1).nullable().optional(),
    }),
  },

  // Stride = calendar-based task scheduling. Tasks are taskItem blocks carrying
  // a due date and a duration.
  {
    name: "stride_list_scheduled",
    mcpName: "giraffle-stride-list-scheduled",
    destructive: false,
    description:
      "List scheduled Stride tasks (taskItems with a due date) within a date range. Provide ISO 8601 start and end timestamps.",
    inputSchema: z.object({
      start: z.string().min(1).max(40),
      end: z.string().min(1).max(40),
    }),
  },
  {
    name: "stride_list_unscheduled",
    mcpName: "giraffle-stride-list-unscheduled",
    destructive: false,
    description: "List unscheduled Stride tasks (taskItems with no due date). Up to 200 items.",
    inputSchema: z.object({}),
  },
  {
    name: "stride_create_task",
    mcpName: "giraffle-stride-create-task",
    destructive: true,
    description:
      "Create a scheduled Stride task in the user's Daily note. Provide text, an ISO 8601 dueDate, and an estimated durationMinutes.",
    inputSchema: z.object({
      text: z.string().min(1).max(2_000),
      dueDate: z.string().min(1).max(40),
      durationMinutes: z.number().int().min(1).max(1_440).default(60),
    }),
  },
  {
    name: "stride_schedule_task",
    mcpName: "giraffle-stride-schedule-task",
    destructive: true,
    description:
      "Set or clear a task's due date. Pass an ISO 8601 dueDate to schedule, or null to move it back to the unscheduled backlog.",
    inputSchema: z.object({
      blockId: z.string().min(1),
      dueDate: z.string().min(1).max(40).nullable(),
    }),
  },
  {
    name: "stride_set_duration",
    mcpName: "giraffle-stride-set-duration",
    destructive: true,
    description: "Update a task's estimated duration in minutes.",
    inputSchema: z.object({
      blockId: z.string().min(1),
      durationMinutes: z.number().int().min(1).max(1_440),
    }),
  },
  {
    name: "stride_toggle_task",
    mcpName: "giraffle-stride-toggle-task",
    destructive: true,
    description: "Mark a Stride task complete or incomplete.",
    inputSchema: z.object({
      blockId: z.string().min(1),
      checked: z.boolean(),
    }),
  },
  {
    name: "stride_update_task_text",
    mcpName: "giraffle-stride-update-task-text",
    destructive: true,
    description: "Edit the text of a Stride task.",
    inputSchema: z.object({
      blockId: z.string().min(1),
      text: z.string().min(1).max(2_000),
    }),
  },
  {
    name: "stride_delete_task",
    mcpName: "giraffle-stride-delete-task",
    destructive: true,
    description: "Permanently delete a Stride task and its child blocks.",
    inputSchema: z.object({
      blockId: z.string().min(1),
    }),
  },

  // Tower Matrix = Eisenhower prioritization over the same task records.
  {
    name: "tower_list_matrix",
    mcpName: "giraffle-tower-list-matrix",
    destructive: false,
    description:
      "List all matrix-scoped notes with their slot (DO/SCHEDULE/DELEGATE/ELIMINATE/BACKLOG) and per-quadrant task counts.",
    inputSchema: z.object({}),
  },
  {
    name: "tower_list_note_tasks",
    mcpName: "giraffle-tower-list-note-tasks",
    destructive: false,
    description: "List the taskItem blocks of one note with their checked state and quadrant.",
    inputSchema: z.object({
      noteId: z.string().min(1),
    }),
  },
  {
    name: "tower_assign_note",
    mcpName: "giraffle-tower-assign-note",
    destructive: true,
    description:
      "Assign a note to a matrix slot (DO/SCHEDULE/DELEGATE/ELIMINATE/BACKLOG), or pass null to remove it from the matrix.",
    inputSchema: z.object({
      noteId: z.string().min(1),
      quadrant: MATRIX_SLOT.nullable(),
    }),
  },
  {
    name: "tower_add_task",
    mcpName: "giraffle-tower-add-task",
    destructive: true,
    description: "Add a taskItem to a note's task list.",
    inputSchema: z.object({
      noteId: z.string().min(1),
      text: z.string().min(1).max(2_000),
    }),
  },
  {
    name: "tower_assign_task",
    mcpName: "giraffle-tower-assign-task",
    destructive: true,
    description:
      "Assign a single taskItem block to an Eisenhower quadrant (DO/SCHEDULE/DELEGATE/ELIMINATE), or pass null to clear it.",
    inputSchema: z.object({
      blockId: z.string().min(1),
      quadrant: PRIORITY.nullable(),
    }),
  },
  {
    name: "tower_toggle_task",
    mcpName: "giraffle-tower-toggle-task",
    destructive: true,
    description: "Mark a taskItem block complete or incomplete.",
    inputSchema: z.object({
      blockId: z.string().min(1),
      checked: z.boolean(),
    }),
  },

  // Savanna = free-form Excalidraw canvases. Element payloads can be large, so
  // the full array is only returned when explicitly requested.
  {
    name: "savanna_list",
    mcpName: "giraffle-savanna-list",
    destructive: false,
    description: "List the user's Savanna canvases (id, title, timestamps, element count).",
    inputSchema: z.object({}),
  },
  {
    name: "savanna_get",
    mcpName: "giraffle-savanna-get",
    destructive: false,
    description:
      "Get one Savanna canvas. By default returns metadata + element count; set includeElements to true to return the full Excalidraw element array and appState.",
    inputSchema: z.object({
      id: z.string().min(1),
      includeElements: z.boolean().optional(),
    }),
  },
  {
    name: "savanna_create",
    mcpName: "giraffle-savanna-create",
    destructive: true,
    description: "Create a new empty Savanna canvas with an optional title.",
    inputSchema: z.object({
      title: z.string().max(220).optional(),
    }),
  },
  {
    name: "savanna_rename",
    mcpName: "giraffle-savanna-rename",
    destructive: true,
    description: "Rename a Savanna canvas.",
    inputSchema: z.object({
      id: z.string().min(1),
      title: z.string().min(1).max(220),
    }),
  },
  {
    name: "savanna_delete",
    mcpName: "giraffle-savanna-delete",
    destructive: true,
    description: "Permanently delete a Savanna canvas.",
    inputSchema: z.object({
      id: z.string().min(1),
    }),
  },

  // Boards (Kanban). Every board owns a visible page and every card is a
  // canonical task block, so scheduling and priority are shared with Tasks.
  {
    name: "kanban_list_boards",
    mcpName: "giraffle-trek-list-boards",
    destructive: false,
    description:
      "List the user's Kanban boards with column and card counts. Each board owns a visible page. Use this first to discover board ids.",
    inputSchema: z.object({}),
  },
  {
    name: "kanban_list_board_statuses",
    mcpName: "giraffle-trek-list-board-statuses",
    destructive: false,
    description:
      "List the board-of-boards status columns (the top level grouping boards sit in) with how many boards are in each.",
    inputSchema: z.object({}),
  },
  {
    name: "kanban_set_board_status",
    mcpName: "giraffle-trek-set-board-status",
    destructive: true,
    description:
      "Move a board into a board-of-boards status column (its top-level status). Use kanban_list_board_statuses for status ids.",
    inputSchema: z.object({
      boardId: z.string().min(1),
      statusId: z.string().min(1),
    }),
  },
  {
    name: "kanban_get_board",
    mcpName: "giraffle-trek-get-board",
    destructive: false,
    description:
      "Get one board in full: ordered columns and cards with priority, due date, and completion. cardId === blockId; the same tasks appear in Calendar and Priority.",
    inputSchema: z.object({ boardId: z.string().min(1) }),
  },
  {
    name: "kanban_create_board",
    mcpName: "giraffle-trek-create-board",
    destructive: true,
    description:
      "Create a board with a visible page and an initial To do column. Returns the board with its column ids.",
    inputSchema: z.object({ title: z.string().min(1).max(220) }),
  },
  {
    name: "kanban_update_board",
    mcpName: "giraffle-trek-update-board",
    destructive: true,
    description: "Update a Trek board's title or icon.",
    inputSchema: z.object({
      boardId: z.string().min(1),
      title: z.string().min(1).max(220).optional(),
      icon: z.string().max(20).nullable().optional(),
    }),
  },
  {
    name: "kanban_delete_board",
    mcpName: "giraffle-trek-delete-board",
    destructive: true,
    description: "Delete a board, its page, and all its cards.",
    inputSchema: z.object({ boardId: z.string().min(1) }),
  },
  {
    name: "kanban_add_column",
    mcpName: "giraffle-trek-add-column",
    destructive: true,
    description: "Add a column (status) to the end of a Trek board.",
    inputSchema: z.object({
      boardId: z.string().min(1),
      title: z.string().min(1).max(160),
      color: COLUMN_COLOR.nullable().optional(),
    }),
  },
  {
    name: "kanban_update_column",
    mcpName: "giraffle-trek-update-column",
    destructive: true,
    description: "Rename a column or change its accent color.",
    inputSchema: z.object({
      boardId: z.string().min(1),
      columnId: z.string().min(1),
      title: z.string().min(1).max(160).optional(),
      color: COLUMN_COLOR.nullable().optional(),
    }),
  },
  {
    name: "kanban_delete_column",
    mcpName: "giraffle-trek-delete-column",
    destructive: true,
    description: "Delete a column; its cards move to the first remaining column.",
    inputSchema: z.object({
      boardId: z.string().min(1),
      columnId: z.string().min(1),
    }),
  },
  {
    name: "kanban_add_card",
    mcpName: "giraffle-trek-add-card",
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
  },
  {
    name: "kanban_update_card",
    mcpName: "giraffle-trek-update-card",
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
  },
  {
    name: "kanban_move_card",
    mcpName: "giraffle-trek-move-card",
    destructive: true,
    description:
      "Move a card to a target column at a zero-based index (its Kanban status change). Pass a large toIndex to append.",
    inputSchema: z.object({
      cardId: z.string().min(1),
      toColumnId: z.string().min(1),
      toIndex: z.number().int().min(0).max(100_000).default(100_000),
    }),
  },
  {
    name: "kanban_delete_card",
    mcpName: "giraffle-trek-delete-card",
    destructive: true,
    description: "Delete a card (task) from a Trek board.",
    inputSchema: z.object({ cardId: z.string().min(1) }),
  },
];
