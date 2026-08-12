import { z } from "zod";
import { BlockNodeContentSchema, TaskPrioritySchema } from "./schemas";

/** Storage-independent tool contract for a future client-side MCP host. */
export interface McpToolSchema {
  /** Stable identifier used by the host implementation. */
  name: string;
  /** Public name exposed over MCP. */
  mcpName: string;
  description: string;
  destructive: boolean;
  inputSchema: z.ZodTypeAny;
}

const id = z.string().min(1).max(256);
const nullableId = id.nullable();
const dueDate = z.string().min(10).max(40).nullable();
const duration = z.number().int().min(1).max(1_440).nullable();
const taskFields = {
  taskId: id,
  content: z.string().min(1).max(2_000).optional(),
  description: z.string().max(10_000).nullable().optional(),
  priority: TaskPrioritySchema.nullable().optional(),
  dueDate: dueDate.optional(),
  durationMinutes: duration.optional(),
  completed: z.boolean().optional(),
};

export const MCP_TOOL_SCHEMAS: McpToolSchema[] = [
  {
    name: "pages_search",
    mcpName: "giraffle-pages-search",
    destructive: false,
    description: "Search local page titles, page documents, and task text using plain words.",
    inputSchema: z.object({ query: z.string().min(1).max(220), limit: z.number().int().min(1).max(50).default(20) }),
  },
  {
    name: "pages_get",
    mcpName: "giraffle-pages-get",
    destructive: false,
    description: "Read one page with its metadata, canonical Tiptap document, tasks, and Markdown rendering.",
    inputSchema: z.object({ pageId: id, includeArchived: z.boolean().default(false) }),
  },
  {
    name: "pages_export",
    mcpName: "giraffle-pages-export-markdown",
    destructive: false,
    description: "Render one page's canonical document as Markdown.",
    inputSchema: z.object({ pageId: id }),
  },
  {
    name: "pages_backlinks",
    mcpName: "giraffle-pages-list-backlinks",
    destructive: false,
    description: "List pages whose documents link to the selected page.",
    inputSchema: z.object({ pageId: id }),
  },
  {
    name: "pages_children",
    mcpName: "giraffle-pages-list-children",
    destructive: false,
    description: "List direct child pages, or top-level pages when parentId is null.",
    inputSchema: z.object({ parentId: nullableId.default(null) }),
  },
  {
    name: "pages_create",
    mcpName: "giraffle-pages-create",
    destructive: true,
    description: "Create a page, optionally nested inside another page and seeded with supported Tiptap blocks.",
    inputSchema: z.object({
      title: z.string().min(1).max(220),
      parentId: nullableId.default(null),
      icon: z.string().max(20).nullable().optional(),
      isPinned: z.boolean().default(false),
      blocks: z.array(BlockNodeContentSchema).max(200).optional(),
    }),
  },
  {
    name: "pages_update",
    mcpName: "giraffle-pages-update",
    destructive: true,
    description: "Update a page title, icon, pin state, or archive state.",
    inputSchema: z.object({
      pageId: id,
      title: z.string().min(1).max(220).optional(),
      icon: z.string().max(20).nullable().optional(),
      isPinned: z.boolean().optional(),
      isArchived: z.boolean().optional(),
    }),
  },
  {
    name: "pages_append",
    mcpName: "giraffle-pages-append-blocks",
    destructive: true,
    description: "Append supported Tiptap blocks to an existing page document.",
    inputSchema: z.object({ pageId: id, blocks: z.array(BlockNodeContentSchema).min(1).max(100) }),
  },
  {
    name: "pages_move",
    mcpName: "giraffle-pages-move",
    destructive: true,
    description: "Move a page under another page or to the workspace root, with optional sibling placement.",
    inputSchema: z.object({ pageId: id, parentId: nullableId, afterPageId: nullableId.default(null) }),
  },

  {
    name: "tasks_list_scheduled",
    mcpName: "giraffle-tasks-list-scheduled",
    destructive: false,
    description: "List tasks whose local due date falls within an inclusive date range.",
    inputSchema: z.object({ startDay: z.string().min(10).max(10), endDay: z.string().min(10).max(10) }),
  },
  {
    name: "tasks_list_unscheduled",
    mcpName: "giraffle-tasks-list-unscheduled",
    destructive: false,
    description: "List active tasks that have no due date.",
    inputSchema: z.object({ limit: z.number().int().min(1).max(200).default(50) }),
  },
  {
    name: "tasks_create",
    mcpName: "giraffle-tasks-create",
    destructive: true,
    description: "Create a canonical task in a source page, defaulting to the visible Inbox page.",
    inputSchema: z.object({
      content: z.string().min(1).max(2_000),
      pageId: id.optional(),
      dueDate: dueDate.optional(),
      durationMinutes: duration.optional(),
      priority: TaskPrioritySchema.nullable().optional(),
    }),
  },
  {
    name: "tasks_update",
    mcpName: "giraffle-tasks-update",
    destructive: true,
    description: "Update canonical task content, description, completion, due date, duration, or priority.",
    inputSchema: z.object(taskFields),
  },
  {
    name: "tasks_delete",
    mcpName: "giraffle-tasks-delete",
    destructive: true,
    description: "Permanently delete a canonical task from its source page and every task view.",
    inputSchema: z.object({ taskId: id }),
  },

  {
    name: "priority_list",
    mcpName: "giraffle-priority-list",
    destructive: false,
    description: "List canonical tasks grouped by their optional Focus, Plan, Delegate, or Drop priority.",
    inputSchema: z.object({ includeCompleted: z.boolean().default(false) }),
  },
  {
    name: "priority_set",
    mcpName: "giraffle-priority-set",
    destructive: true,
    description: "Set or clear one canonical task's priority placement.",
    inputSchema: z.object({ taskId: id, priority: TaskPrioritySchema.nullable() }),
  },

  {
    name: "canvas_list",
    mcpName: "giraffle-canvas-list",
    destructive: false,
    description: "List canvases with ids, titles, timestamps, and element counts.",
    inputSchema: z.object({}),
  },
  {
    name: "canvas_get",
    mcpName: "giraffle-canvas-get",
    destructive: false,
    description: "Read one canvas, optionally including its complete Excalidraw scene.",
    inputSchema: z.object({ canvasId: id, includeElements: z.boolean().default(false) }),
  },
  {
    name: "canvas_create",
    mcpName: "giraffle-canvas-create",
    destructive: true,
    description: "Create an empty canvas with an optional title.",
    inputSchema: z.object({ title: z.string().min(1).max(220).default("New canvas") }),
  },
  {
    name: "canvas_rename",
    mcpName: "giraffle-canvas-rename",
    destructive: true,
    description: "Rename an existing canvas.",
    inputSchema: z.object({ canvasId: id, title: z.string().min(1).max(220) }),
  },
  {
    name: "canvas_delete",
    mcpName: "giraffle-canvas-delete",
    destructive: true,
    description: "Permanently delete a canvas and its entity references.",
    inputSchema: z.object({ canvasId: id }),
  },

  {
    name: "boards_list",
    mcpName: "giraffle-boards-list",
    destructive: false,
    description: "List boards with workflow column and canonical task counts.",
    inputSchema: z.object({}),
  },
  {
    name: "boards_list_statuses",
    mcpName: "giraffle-boards-list-statuses",
    destructive: false,
    description: "List the top-level statuses used to organize boards.",
    inputSchema: z.object({}),
  },
  {
    name: "boards_create_status",
    mcpName: "giraffle-boards-create-status",
    destructive: true,
    description: "Create a top-level board status.",
    inputSchema: z.object({ title: z.string().min(1).max(160) }),
  },
  {
    name: "boards_update_status",
    mcpName: "giraffle-boards-update-status",
    destructive: true,
    description: "Rename a top-level board status.",
    inputSchema: z.object({ statusId: id, title: z.string().min(1).max(160) }),
  },
  {
    name: "boards_delete_status",
    mcpName: "giraffle-boards-delete-status",
    destructive: true,
    description: "Delete a top-level status and move its boards to Unsorted.",
    inputSchema: z.object({ statusId: id }),
  },
  {
    name: "boards_get",
    mcpName: "giraffle-boards-get",
    destructive: false,
    description: "Read one board with ordered columns and canonical tasks.",
    inputSchema: z.object({ boardId: id }),
  },
  {
    name: "boards_create",
    mcpName: "giraffle-boards-create",
    destructive: true,
    description: "Create a board, its canonical page, and its initial To do column.",
    inputSchema: z.object({ title: z.string().min(1).max(220), statusId: nullableId.default(null) }),
  },
  {
    name: "boards_update",
    mcpName: "giraffle-boards-update",
    destructive: true,
    description: "Update a board title, icon, or top-level status.",
    inputSchema: z.object({
      boardId: id,
      title: z.string().min(1).max(220).optional(),
      icon: z.string().max(20).nullable().optional(),
      statusId: nullableId.optional(),
    }),
  },
  {
    name: "boards_move",
    mcpName: "giraffle-boards-move",
    destructive: true,
    description: "Move a board into a top-level status and place it after another board.",
    inputSchema: z.object({ boardId: id, statusId: nullableId, afterBoardId: nullableId }),
  },
  {
    name: "boards_delete",
    mcpName: "giraffle-boards-delete",
    destructive: true,
    description: "Delete a board and tasks sourced by its page; tasks added from other pages remain at their source.",
    inputSchema: z.object({ boardId: id }),
  },
  {
    name: "boards_add_column",
    mcpName: "giraffle-boards-add-column",
    destructive: true,
    description: "Add a workflow column to a board.",
    inputSchema: z.object({ boardId: id, title: z.string().min(1).max(160) }),
  },
  {
    name: "boards_update_column",
    mcpName: "giraffle-boards-update-column",
    destructive: true,
    description: "Rename a workflow column or change its accent color.",
    inputSchema: z.object({ columnId: id, title: z.string().min(1).max(160).optional(), color: z.string().max(32).nullable().optional() }),
  },
  {
    name: "boards_move_column",
    mcpName: "giraffle-boards-move-column",
    destructive: true,
    description: "Move a workflow column after another column, or to the first position.",
    inputSchema: z.object({ columnId: id, afterColumnId: nullableId }),
  },
  {
    name: "boards_delete_column",
    mcpName: "giraffle-boards-delete-column",
    destructive: true,
    description: "Delete a workflow column and move its tasks to another column on the same board.",
    inputSchema: z.object({ columnId: id, moveToColumnId: id }),
  },
  {
    name: "boards_add_task",
    mcpName: "giraffle-boards-add-task",
    destructive: true,
    description: "Create a canonical task in a specific board column.",
    inputSchema: z.object({ boardId: id, columnId: id, content: z.string().min(1).max(2_000) }),
  },
  {
    name: "boards_place_task",
    mcpName: "giraffle-boards-place-task",
    destructive: true,
    description: "Place an existing canonical task in a specific board column without changing its source page.",
    inputSchema: z.object({ taskId: id, boardId: id, columnId: id }),
  },
  {
    name: "boards_remove_task",
    mcpName: "giraffle-boards-remove-task",
    destructive: true,
    description: "Remove a task from its board while keeping it in its source page.",
    inputSchema: z.object({ taskId: id }),
  },
  {
    name: "boards_move_task",
    mcpName: "giraffle-boards-move-task",
    destructive: true,
    description: "Move a board task after another task in a target column, or to the first position.",
    inputSchema: z.object({ taskId: id, columnId: id, afterTaskId: nullableId }),
  },
];
