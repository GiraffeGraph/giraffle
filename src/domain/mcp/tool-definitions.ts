import { z } from "zod";
import { getBacklinks } from "@/domain/link/link.service";
import { buildNoteExportArtifact } from "@giraffle/domain";
import { blocksToMarkdown, markdownToBlocks } from "@giraffle/domain";
import {
  createNote,
  getNote,
  getNoteForExport,
  relocateNote,
  saveNoteContent,
  updateNote,
} from "@/domain/note/page.service";
import type { BlockNodeContent, TiptapDocument, UpdateNoteInput } from "@giraffle/domain";
import { insertBlockInDocument } from "@giraffle/domain";
import { searchWorkspaceNotes } from "@/domain/search/search.service";
import { db } from "@/lib/db";
import { BlockNodeContentSchema } from "@/mcp/schemas";

import { strideTools } from "@/domain/mcp/tools/stride-tools";
import { towerMatrixTools } from "@/domain/mcp/tools/tower-tools";
import { savannaTools } from "@/domain/mcp/tools/savanna-tools";
import { kanbanTools } from "@/domain/mcp/tools/kanban-tools";

export interface McpToolContext {
  userId: string;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  // Zod schema — runtime-validated; declared as ZodTypeAny because we mix
  // ZodObject and refined ZodEffects across tools.
  inputSchema: z.ZodTypeAny;
  outputSchema?: z.ZodTypeAny;
  destructive: boolean;
  execute: (input: unknown, ctx: McpToolContext) => Promise<unknown>;
}

function serializeNoteMetadata(note: NonNullable<Awaited<ReturnType<typeof getNote>>>) {
  return {
    id: note.id,
    title: note.title,
    icon: note.icon,
    coverImage: note.coverImage,
    parentId: note.parentId,
    position: note.position,
    isPinned: note.isPinned,
    isArchived: note.isArchived,
    quadrant: note.quadrant,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

function documentHasBlockId(document: TiptapDocument, blockId: string): boolean {
  const walk = (nodes: unknown): boolean => {
    if (!Array.isArray(nodes)) return false;
    for (const n of nodes) {
      const node = n as { attrs?: { blockId?: unknown }; content?: unknown };
      if (node?.attrs?.blockId === blockId) return true;
      if (walk(node?.content)) return true;
    }
    return false;
  };
  return walk(document.content);
}

export const MCP_TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: "notes_search",
    destructive: false,
    description:
      "Search the user's workspace notes. Supports plain words, quoted phrases, /regex/, folder: filters, title: filters, -negative terms, and pinned:true/false.",
    inputSchema: z.object({
      query: z.string().max(220).default(""),
      limit: z.number().int().min(1).max(120).default(20),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { query: string; limit: number };
      const results = await searchWorkspaceNotes(userId, input.query, { limit: input.limit });
      return {
        query: results.query,
        mode: results.mode,
        scannedNotes: results.scannedNotes,
        regexError: results.regexError,
        hits: results.hits.map((h) => ({
          id: h.id,
          title: h.title,
          parentId: h.parentId,
          parentPath: h.parentPath,
          isPinned: h.isPinned,
          updatedAt: h.updatedAt.toISOString(),
          score: h.score,
          snippet: h.snippet,
          highlights: h.highlights,
        })),
      };
    },
  },
  {
    name: "notes_get",
    destructive: false,
    description:
      "Retrieve one note by noteId. Returns metadata, canonical Tiptap document, and Markdown rendering.",
    inputSchema: z.object({
      noteId: z.string().min(1),
      includeArchived: z.boolean().optional(),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { noteId: string; includeArchived?: boolean };
      const note = await getNote(userId, input.noteId);
      if (!note || (!input.includeArchived && note.isArchived)) {
        throw new Error("Note not found");
      }
      return {
        metadata: serializeNoteMetadata(note),
        document: note.document,
        markdown: blocksToMarkdown(note.document),
      };
    },
  },
  {
    name: "notes_export",
    destructive: false,
    description: "Export a note as Markdown or MDX from its canonical block document.",
    inputSchema: z.object({
      noteId: z.string().min(1),
      format: z.enum(["markdown", "mdx"]).default("markdown"),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { noteId: string; format: "markdown" | "mdx" };
      const note = await getNoteForExport(userId, input.noteId);
      if (!note) throw new Error("Note not found");
      const artifact = buildNoteExportArtifact(note);
      return {
        noteId: artifact.noteId,
        title: artifact.title,
        format: input.format,
        content: input.format === "mdx" ? artifact.mdx : artifact.markdown,
      };
    },
  },
  {
    name: "notes_backlinks",
    destructive: false,
    description: "Get persisted backlinks pointing to a note.",
    inputSchema: z.object({ noteId: z.string().min(1) }),
    execute: async (raw, { userId }) => {
      const input = raw as { noteId: string };
      const backlinks = await getBacklinks(userId, input.noteId);
      return { noteId: input.noteId, backlinks };
    },
  },
  {
    name: "pages_children",
    destructive: false,
    description:
      "List the child pages of one page. If pageId is omitted or null, lists the top-level pages.",
    inputSchema: z.object({
      pageId: z.string().min(1).nullable().optional(),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { pageId?: string | null };

      if (input.pageId) {
        const page = await getNote(userId, input.pageId);
        if (!page) throw new Error("Page not found");
      }

      const children = await db.note.findMany({
        where: {
          userId,
          parentId: input.pageId ?? null,
          isArchived: false,
          boardTaskSource: null,
        },
        orderBy: [{ isPinned: "desc" }, { position: "asc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          title: true,
          icon: true,
          parentId: true,
          isPinned: true,
          position: true,
          updatedAt: true,
          _count: {
            select: {
              children: { where: { isArchived: false, boardTaskSource: null } },
            },
          },
        },
      });

      return {
        parentId: input.pageId ?? null,
        pages: children.map(({ _count, ...child }) => ({
          ...child,
          updatedAt: child.updatedAt.toISOString(),
          childCount: _count.children,
        })),
      };
    },
  },
  {
    name: "notes_create",
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
    execute: async (raw, { userId }) => {
      const input = raw as {
        title: string;
        parentId?: string;
        icon?: string;
        isPinned?: boolean;
        initialMarkdown?: string;
        initialBlocks?: BlockNodeContent[];
      };
      const noteId = await createNote(userId, {
        title: input.title,
        parentId: input.parentId,
        icon: input.icon,
      });
      const patch: UpdateNoteInput = {};
      if (typeof input.isPinned === "boolean") patch.isPinned = input.isPinned;
      if (Object.keys(patch).length > 0) await updateNote(userId, noteId, patch);

      const mdBlocks = input.initialMarkdown?.trim()
        ? markdownToBlocks(input.initialMarkdown).content
        : [];
      const initialBlocks = input.initialBlocks ?? [];
      if (mdBlocks.length > 0 || initialBlocks.length > 0) {
        await saveNoteContent(userId, noteId, {
          type: "doc",
          content: [...mdBlocks, ...initialBlocks],
        });
      }
      const note = await getNote(userId, noteId);
      if (!note) throw new Error("Note not found after create");
      return {
        metadata: serializeNoteMetadata(note),
        document: note.document,
        markdown: blocksToMarkdown(note.document),
      };
    },
  },
  {
    name: "notes_update",
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
    execute: async (raw, { userId }) => {
      const input = raw as { noteId: string } & Partial<UpdateNoteInput>;
      const patch = Object.fromEntries(
        Object.entries({
          title: input.title,
          icon: input.icon,
          coverImage: input.coverImage,
          parentId: input.parentId,
          isPinned: input.isPinned,
          isArchived: input.isArchived,
        }).filter(([, v]) => typeof v !== "undefined"),
      ) as UpdateNoteInput;
      await updateNote(userId, input.noteId, patch);
      const note = await getNote(userId, input.noteId);
      if (!note) throw new Error("Note not found");
      return serializeNoteMetadata(note);
    },
  },
  {
    name: "notes_append",
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
    execute: async (raw, { userId }) => {
      const input = raw as {
        noteId: string;
        parentBlockId?: string | null;
        afterBlockId?: string | null;
        markdown?: string;
        blocks?: BlockNodeContent[];
      };
      const note = await getNote(userId, input.noteId);
      if (!note || note.isArchived) throw new Error("Note not found");
      let document: TiptapDocument = note.document;
      // A missing afterBlockId would otherwise silently append at the end (and,
      // because the list is reversed for after-insert, in reverse order). Fail
      // loudly instead of corrupting the document.
      if (input.afterBlockId && !documentHasBlockId(document, input.afterBlockId)) {
        throw new Error(`afterBlockId not found: ${input.afterBlockId}`);
      }
      const mdBlocks = input.markdown?.trim() ? markdownToBlocks(input.markdown).content : [];
      const inputBlocks = input.blocks ?? [];
      const blocks = [...mdBlocks, ...inputBlocks];
      const blocksToInsert = input.afterBlockId ? [...blocks].reverse() : blocks;
      for (const block of blocksToInsert) {
        document = insertBlockInDocument(document, block, {
          parentBlockId: input.parentBlockId ?? null,
          afterBlockId: input.afterBlockId ?? null,
        });
      }
      await saveNoteContent(userId, note.id, document);
      const updated = await getNote(userId, note.id);
      if (!updated) throw new Error("Note not found after append");
      return {
        metadata: serializeNoteMetadata(updated),
        document: updated.document,
        markdown: blocksToMarkdown(updated.document),
        appendedCount: blocks.length,
      };
    },
  },
  {
    name: "notes_move",
    destructive: true,
    description:
      "Move a note inside another page, or to the workspace root when targetParentId is null. Use afterNoteId to position relative to a sibling.",
    inputSchema: z.object({
      noteId: z.string().min(1),
      targetParentId: z.string().min(1).nullable().optional(),
      afterNoteId: z.string().min(1).nullable().optional(),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as {
        noteId: string;
        targetParentId?: string | null;
        afterNoteId?: string | null;
      };
      await relocateNote(userId, input.noteId, {
        parentId: input.targetParentId ?? null,
        afterNoteId: input.afterNoteId ?? null,
      });
      const note = await getNote(userId, input.noteId);
      if (!note) throw new Error("Note not found");
      return serializeNoteMetadata(note);
    },
  },
  ...strideTools,
  ...towerMatrixTools,
  ...savannaTools,
  ...kanbanTools,
];
