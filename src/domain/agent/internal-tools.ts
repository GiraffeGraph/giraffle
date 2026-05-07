import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { createFolder, getFolder } from "@/domain/folder/folder.service";
import { getBacklinks } from "@/domain/link/link.service";
import { buildNoteExportArtifact } from "@/domain/note/note.export";
import { blocksToMarkdown, markdownToBlocks } from "@/domain/note/note.serializer";
import {
  createNote,
  getNote,
  getNoteForExport,
  relocateNote,
  saveNoteContent,
  updateNote,
} from "@/domain/note/note.service";
import type { BlockNodeContent, TiptapDocument, UpdateNoteInput } from "@/domain/note/note.types";
import { insertBlockInDocument } from "@/domain/note/block-tree";
import { searchWorkspaceNotes } from "@/domain/search/search.service";
import { db } from "@/lib/db";
import { BlockNodeContentSchema } from "@/mcp/schemas";

import type { ApprovalPolicy } from "@/domain/agent/permissions";

export interface AgentToolContext {
  userId: string;
  approval?: ApprovalPolicy;
}

export interface InternalToolDefinition {
  name: string;
  description: string;
  // Zod schema — runtime-validated; declared as ZodTypeAny because we mix
  // ZodObject and refined ZodEffects across tools.
  inputSchema: z.ZodTypeAny;
  outputSchema?: z.ZodTypeAny;
  destructive: boolean;
  execute: (input: unknown, ctx: AgentToolContext) => Promise<unknown>;
}

function serializeNoteMetadata(note: NonNullable<Awaited<ReturnType<typeof getNote>>>) {
  return {
    id: note.id,
    title: note.title,
    slug: note.slug,
    icon: note.icon,
    coverImage: note.coverImage,
    folderId: note.folderId,
    categoryId: note.categoryId,
    position: note.position,
    isPinned: note.isPinned,
    isArchived: note.isArchived,
    isPublished: note.isPublished,
    quadrant: note.quadrant,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}

async function resolveNoteId(userId: string, input: { noteId?: string; slug?: string }) {
  if (input.noteId) return input.noteId;
  if (!input.slug) throw new Error("Provide noteId or slug");
  const found = await db.note.findFirst({
    where: { userId, slug: input.slug },
    select: { id: true },
  });
  if (!found) throw new Error("Note not found");
  return found.id;
}

const NoteIdOrSlug = z
  .object({
    noteId: z.string().min(1).optional(),
    slug: z.string().min(1).max(240).optional(),
  })
  .refine((v) => Boolean(v.noteId) !== Boolean(v.slug), {
    message: "Provide exactly one of noteId or slug.",
  });

export const INTERNAL_TOOL_DEFINITIONS: InternalToolDefinition[] = [
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
          slug: h.slug,
          folderId: h.folderId,
          folderPath: h.folderPath,
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
      "Retrieve one note by noteId or slug. Returns metadata, canonical Tiptap document, and Markdown rendering.",
    inputSchema: z
      .object({
        noteId: z.string().min(1).optional(),
        slug: z.string().min(1).max(240).optional(),
        includeArchived: z.boolean().optional(),
      })
      .refine((v) => Boolean(v.noteId) !== Boolean(v.slug), {
        message: "Provide exactly one of noteId or slug.",
      }),
    execute: async (raw, { userId }) => {
      const input = raw as { noteId?: string; slug?: string; includeArchived?: boolean };
      const noteId = await resolveNoteId(userId, input);
      const note = await getNote(userId, noteId);
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
    inputSchema: z
      .object({
        noteId: z.string().min(1).optional(),
        slug: z.string().min(1).max(240).optional(),
        format: z.enum(["markdown", "mdx"]).default("markdown"),
      })
      .refine((v) => Boolean(v.noteId) !== Boolean(v.slug), {
        message: "Provide exactly one of noteId or slug.",
      }),
    execute: async (raw, { userId }) => {
      const input = raw as { noteId?: string; slug?: string; format: "markdown" | "mdx" };
      const noteId = await resolveNoteId(userId, input);
      const note = await getNoteForExport(userId, noteId);
      if (!note) throw new Error("Note not found");
      const artifact = buildNoteExportArtifact(note);
      return {
        noteId: artifact.noteId,
        title: artifact.title,
        format: input.format,
        publishPath: artifact.publishPath,
        content: input.format === "mdx" ? artifact.mdx : artifact.markdown,
      };
    },
  },
  {
    name: "notes_backlinks",
    destructive: false,
    description: "Get persisted backlinks pointing to a note.",
    inputSchema: NoteIdOrSlug,
    execute: async (raw, { userId }) => {
      const input = raw as { noteId?: string; slug?: string };
      const noteId = await resolveNoteId(userId, input);
      const backlinks = await getBacklinks(userId, noteId);
      return { noteId, backlinks };
    },
  },
  {
    name: "folders_list",
    destructive: false,
    description:
      "List one folder's child folders and notes. If folderId is omitted or null, lists root folders and inbox notes.",
    inputSchema: z.object({
      folderId: z.string().min(1).nullable().optional(),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { folderId?: string | null };
      if (input.folderId) {
        const folder = await getFolder(userId, input.folderId);
        if (!folder) throw new Error("Folder not found");
        return {
          folder: {
            id: folder.id,
            name: folder.name,
            icon: folder.icon,
            parentId: folder.parentId,
            position: folder.position,
            createdAt: folder.createdAt.toISOString(),
            updatedAt: folder.updatedAt.toISOString(),
          },
          folders: folder.children.map((c) => ({
            id: c.id,
            name: c.name,
            icon: c.icon,
            parentId: c.parentId,
            position: c.position,
            createdAt: c.createdAt.toISOString(),
            updatedAt: c.updatedAt.toISOString(),
          })),
          notes: folder.notes.map((n) => ({ ...n, updatedAt: n.updatedAt.toISOString() })),
        };
      }
      const [folders, notes] = await Promise.all([
        db.folder.findMany({
          where: { userId, parentId: null },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            icon: true,
            parentId: true,
            position: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { notes: { where: { isArchived: false } } } },
          },
        }),
        db.note.findMany({
          where: { userId, folderId: null, isArchived: false },
          orderBy: [{ isPinned: "desc" }, { position: "asc" }, { updatedAt: "desc" }],
          select: {
            id: true,
            title: true,
            slug: true,
            icon: true,
            folderId: true,
            isPinned: true,
            position: true,
            updatedAt: true,
          },
        }),
      ]);
      return {
        folder: null,
        folders: folders.map((f) => ({
          id: f.id,
          name: f.name,
          icon: f.icon,
          parentId: f.parentId,
          position: f.position,
          createdAt: f.createdAt.toISOString(),
          updatedAt: f.updatedAt.toISOString(),
          noteCount: f._count.notes,
        })),
        notes: notes.map((n) => ({ ...n, updatedAt: n.updatedAt.toISOString() })),
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
      folderId: z.string().min(1).optional(),
      categoryId: z.string().min(1).optional(),
      icon: z.string().max(20).optional(),
      slug: z.string().min(1).max(220).optional(),
      isPinned: z.boolean().optional(),
      isPublished: z.boolean().optional(),
      initialMarkdown: z.string().max(200_000).optional(),
      initialBlocks: z.array(BlockNodeContentSchema).max(200).optional(),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as {
        title: string;
        folderId?: string;
        categoryId?: string;
        icon?: string;
        slug?: string;
        isPinned?: boolean;
        isPublished?: boolean;
        initialMarkdown?: string;
        initialBlocks?: BlockNodeContent[];
      };
      const noteId = await createNote(userId, {
        title: input.title,
        folderId: input.folderId,
        categoryId: input.categoryId,
        icon: input.icon,
      });
      const patch: UpdateNoteInput = {};
      if (input.slug) patch.slug = input.slug;
      if (typeof input.isPinned === "boolean") patch.isPinned = input.isPinned;
      if (typeof input.isPublished === "boolean") patch.isPublished = input.isPublished;
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
      "Update note metadata such as title, slug, publish/pin state, folder, category, icon, cover image, archive state, or quadrant.",
    inputSchema: z
      .object({
        noteId: z.string().min(1).optional(),
        lookupSlug: z.string().min(1).max(240).optional(),
        title: z.string().min(1).max(220).optional(),
        slug: z.string().min(1).max(220).nullable().optional(),
        icon: z.string().max(20).nullable().optional(),
        coverImage: z.string().max(2_000).nullable().optional(),
        folderId: z.string().min(1).nullable().optional(),
        categoryId: z.string().min(1).nullable().optional(),
        isPinned: z.boolean().optional(),
        isArchived: z.boolean().optional(),
        isPublished: z.boolean().optional(),
        quadrant: z.enum(["DO", "SCHEDULE", "DELEGATE", "ELIMINATE"]).nullable().optional(),
      })
      .refine((v) => Boolean(v.noteId) !== Boolean(v.lookupSlug), {
        message: "Provide exactly one of noteId or lookupSlug.",
      }),
    execute: async (raw, { userId }) => {
      const input = raw as {
        noteId?: string;
        lookupSlug?: string;
      } & Partial<UpdateNoteInput>;
      const noteId = await resolveNoteId(userId, {
        noteId: input.noteId,
        slug: input.lookupSlug,
      });
      const patch = Object.fromEntries(
        Object.entries({
          title: input.title,
          slug: input.slug,
          icon: input.icon,
          coverImage: input.coverImage,
          folderId: input.folderId,
          categoryId: input.categoryId,
          isPinned: input.isPinned,
          isArchived: input.isArchived,
          isPublished: input.isPublished,
          quadrant: input.quadrant,
        }).filter(([, v]) => typeof v !== "undefined"),
      ) as UpdateNoteInput;
      await updateNote(userId, noteId, patch);
      const note = await getNote(userId, noteId);
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
        noteId: z.string().min(1).optional(),
        slug: z.string().min(1).max(240).optional(),
        parentBlockId: z.string().min(1).nullable().optional(),
        afterBlockId: z.string().min(1).nullable().optional(),
        markdown: z.string().max(200_000).optional(),
        blocks: z.array(BlockNodeContentSchema).max(100).optional(),
      })
      .refine((v) => Boolean(v.noteId) !== Boolean(v.slug), {
        message: "Provide exactly one of noteId or slug.",
      })
      .refine((v) => Boolean(v.markdown?.trim()) || Boolean(v.blocks?.length), {
        message: "Provide markdown or at least one block.",
      }),
    execute: async (raw, { userId }) => {
      const input = raw as {
        noteId?: string;
        slug?: string;
        parentBlockId?: string | null;
        afterBlockId?: string | null;
        markdown?: string;
        blocks?: BlockNodeContent[];
      };
      const noteId = await resolveNoteId(userId, input);
      const note = await getNote(userId, noteId);
      if (!note || note.isArchived) throw new Error("Note not found");
      let document: TiptapDocument = note.document;
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
      "Move a note to another folder, or to the inbox when targetFolderId is null. Use afterNoteId to position relative to a sibling.",
    inputSchema: z.object({
      noteId: z.string().min(1),
      targetFolderId: z.string().min(1).nullable().optional(),
      afterNoteId: z.string().min(1).nullable().optional(),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as {
        noteId: string;
        targetFolderId?: string | null;
        afterNoteId?: string | null;
      };
      await relocateNote(userId, input.noteId, {
        folderId: input.targetFolderId ?? null,
        afterNoteId: input.afterNoteId ?? null,
      });
      const note = await getNote(userId, input.noteId);
      if (!note) throw new Error("Note not found");
      return serializeNoteMetadata(note);
    },
  },
  {
    name: "folders_create",
    destructive: true,
    description: "Create a folder, optionally nested under a parent folder.",
    inputSchema: z.object({
      name: z.string().min(1).max(160),
      icon: z.string().max(20).optional(),
      parentId: z.string().min(1).optional(),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { name: string; icon?: string; parentId?: string };
      const folderId = await createFolder(userId, input);
      const folder = await db.folder.findFirst({
        where: { id: folderId, userId },
        select: {
          id: true,
          name: true,
          icon: true,
          parentId: true,
          position: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!folder) throw new Error("Folder not found");
      return {
        ...folder,
        createdAt: folder.createdAt.toISOString(),
        updatedAt: folder.updatedAt.toISOString(),
      };
    },
  },
];

export function buildInternalTools(ctx: AgentToolContext): ToolSet {
  const result: ToolSet = {};
  for (const def of INTERNAL_TOOL_DEFINITIONS) {
    const needsApproval = ctx.approval
      ? ctx.approval.needsApprovalFor(def.name, def.destructive)
      : def.destructive;
    result[def.name] = tool({
      description: def.description,
      inputSchema: def.inputSchema as never,
      needsApproval,
      execute: (async (input: unknown) => def.execute(input, ctx)) as never,
    });
  }
  return result;
}
