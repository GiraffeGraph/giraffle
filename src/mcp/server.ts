import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { CallToolResult, ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
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
import {
  BlockNodeContentSchema,
  FolderSummarySchema,
  NoteIdentifierInputSchema,
  NoteListItemSchema,
  NoteMetadataSchema,
  NoteWithDocumentSchema,
} from "./schemas";

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

function requireMcpUserId(extra: ToolExtra) {
  const userId = extra.authInfo?.extra?.userId;

  if (typeof userId !== "string" || !userId) {
    throw new Error("Unauthorized MCP request.");
  }

  return userId;
}

function serializeNoteMetadata(note: Awaited<ReturnType<typeof getNote>>) {
  if (!note) {
    throw new Error("Note not found");
  }

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

async function resolveNoteId(
  userId: string,
  input: z.infer<typeof NoteIdentifierInputSchema>,
) {
  if (input.noteId) {
    return input.noteId;
  }

  const note = await db.note.findFirst({
    where: {
      userId,
      slug: input.slug,
    },
    select: { id: true },
  });

  if (!note) {
    throw new Error("Note not found");
  }

  return note.id;
}

async function getMcpNote(
  userId: string,
  input: z.infer<typeof NoteIdentifierInputSchema> & { includeArchived?: boolean },
) {
  const noteId = await resolveNoteId(userId, input);
  const note = await getNote(userId, noteId);

  if (!note || (!input.includeArchived && note.isArchived)) {
    throw new Error("Note not found");
  }

  return note;
}

function textResult(
  text: string,
  structuredContent?: Record<string, unknown>,
): CallToolResult {
  return {
    content: [{ type: "text", text }],
    ...(structuredContent ? { structuredContent } : {}),
  };
}

export function createGiraffleMcpServer() {
  const server = new McpServer({
    name: "giraffle-mcp",
    version: "0.1.0",
    title: "Giraffle MCP",
  });

  registerNoteTools(server);
  registerFolderTools(server);

  return server;
}

function registerNoteTools(server: McpServer) {
  server.registerTool(
    "giraffle-create-note",
    {
      title: "Create note",
      description:
        "Create a Giraffle note. Optional initialMarkdown is parsed into canonical blocks; optional initialBlocks must be Tiptap block JSON.",
      inputSchema: z
        .object({
          title: z.string().min(1).max(220),
          folderId: z.string().min(1).optional(),
          categoryId: z.string().min(1).optional(),
          icon: z.string().max(20).optional(),
          slug: z.string().min(1).max(220).optional(),
          isPinned: z.boolean().optional(),
          isPublished: z.boolean().optional(),
          initialMarkdown: z.string().max(200_000).optional(),
          initialBlocks: z.array(BlockNodeContentSchema).max(200).optional(),
        })
        .strict(),
      outputSchema: NoteWithDocumentSchema,
      annotations: {
        title: "Create note",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input, extra) => {
      const userId = requireMcpUserId(extra);
      const noteId = await createNote(userId, {
        title: input.title,
        folderId: input.folderId,
        categoryId: input.categoryId,
        icon: input.icon,
      });

      const metadataPatch: UpdateNoteInput = {};
      if (input.slug) metadataPatch.slug = input.slug;
      if (typeof input.isPinned === "boolean") metadataPatch.isPinned = input.isPinned;
      if (typeof input.isPublished === "boolean") metadataPatch.isPublished = input.isPublished;

      if (Object.keys(metadataPatch).length > 0) {
        await updateNote(userId, noteId, metadataPatch);
      }

      const markdownBlocks = input.initialMarkdown?.trim()
        ? markdownToBlocks(input.initialMarkdown).content
        : [];
      const initialBlocks = (input.initialBlocks ?? []) as BlockNodeContent[];

      if (markdownBlocks.length > 0 || initialBlocks.length > 0) {
        await saveNoteContent(userId, noteId, {
          type: "doc",
          content: [...markdownBlocks, ...initialBlocks],
        });
      }

      const note = await getNote(userId, noteId);
      const result = {
        metadata: serializeNoteMetadata(note),
        document: note!.document,
        markdown: blocksToMarkdown(note!.document),
      };

      return textResult(`Created note \"${result.metadata.title}\" (${noteId}).`, result);
    },
  );

  server.registerTool(
    "giraffle-update-note",
    {
      title: "Update note metadata",
      description:
        "Update note metadata such as title, slug, publish status, pinned status, folder, category, icon, cover image, archive state, or quadrant.",
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
        .strict()
        .refine((input) => Boolean(input.noteId) !== Boolean(input.lookupSlug), {
          message: "Provide exactly one of noteId or lookupSlug.",
        }),
      outputSchema: NoteMetadataSchema,
      annotations: {
        title: "Update note",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input, extra) => {
      const userId = requireMcpUserId(extra);
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
        }).filter(([, value]) => typeof value !== "undefined"),
      ) as UpdateNoteInput;

      await updateNote(userId, noteId, patch);
      const note = await getNote(userId, noteId);
      const result = serializeNoteMetadata(note);

      return textResult(`Updated note \"${result.title}\" (${result.id}).`, result);
    },
  );

  server.registerTool(
    "giraffle-append-blocks",
    {
      title: "Append blocks",
      description:
        "Append content to an existing note. Provide markdown for simple agent workflows or Tiptap block JSON for precise canonical blocks.",
      inputSchema: z
        .object({
          noteId: z.string().min(1).optional(),
          slug: z.string().min(1).max(240).optional(),
          parentBlockId: z.string().min(1).nullable().optional(),
          afterBlockId: z.string().min(1).nullable().optional(),
          markdown: z.string().max(200_000).optional(),
          blocks: z.array(BlockNodeContentSchema).max(100).optional(),
        })
        .strict()
        .refine((input) => Boolean(input.noteId) !== Boolean(input.slug), {
          message: "Provide exactly one of noteId or slug.",
        })
        .refine(
          (input) => Boolean(input.markdown?.trim()) || Boolean(input.blocks?.length),
          { message: "Provide markdown or at least one block." },
        ),
      outputSchema: NoteWithDocumentSchema,
      annotations: {
        title: "Append blocks",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input, extra) => {
      const userId = requireMcpUserId(extra);
      const note = await getMcpNote(userId, input);
      let document: TiptapDocument = note.document;
      const markdownBlocks = input.markdown?.trim()
        ? markdownToBlocks(input.markdown).content
        : [];
      const inputBlocks = (input.blocks ?? []) as BlockNodeContent[];
      const blocks = [...markdownBlocks, ...inputBlocks];
      const blocksToInsert = input.afterBlockId ? [...blocks].reverse() : blocks;

      for (const block of blocksToInsert) {
        document = insertBlockInDocument(document, block, {
          parentBlockId: input.parentBlockId ?? null,
          afterBlockId: input.afterBlockId ?? null,
        });
      }

      await saveNoteContent(userId, note.id, document);
      const updatedNote = await getNote(userId, note.id);
      const result = {
        metadata: serializeNoteMetadata(updatedNote),
        document: updatedNote!.document,
        markdown: blocksToMarkdown(updatedNote!.document),
      };

      return textResult(`Appended ${blocks.length} block(s) to \"${result.metadata.title}\".`, result);
    },
  );

  server.registerTool(
    "giraffle-get-note",
    {
      title: "Get note",
      description:
        "Retrieve one note by noteId or slug. Returns metadata, canonical Tiptap document, and Markdown for readability.",
      inputSchema: z
        .object({
          noteId: z.string().min(1).optional(),
          slug: z.string().min(1).max(240).optional(),
          includeArchived: z.boolean().optional(),
        })
        .strict()
        .refine((input) => Boolean(input.noteId) !== Boolean(input.slug), {
          message: "Provide exactly one of noteId or slug.",
        }),
      outputSchema: NoteWithDocumentSchema,
      annotations: {
        title: "Get note",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (input, extra) => {
      const userId = requireMcpUserId(extra);
      const note = await getMcpNote(userId, input);
      const result = {
        metadata: serializeNoteMetadata(note),
        document: note.document,
        markdown: blocksToMarkdown(note.document),
      };

      return textResult(`Loaded note \"${result.metadata.title}\" (${result.metadata.id}).`, result);
    },
  );

  server.registerTool(
    "giraffle-search-notes",
    {
      title: "Search notes",
      description:
        "Search the workspace. Query supports words, quoted phrases, /regex/, folder: filters, title: filters, -negative terms, and pinned:true/false.",
      inputSchema: z
        .object({
          query: z.string().max(220).default(""),
          limit: z.number().int().min(1).max(120).default(40),
        })
        .strict(),
      outputSchema: z.object({
        query: z.string(),
        mode: z.string(),
        scannedNotes: z.number().int(),
        regexError: z.string().nullable(),
        hits: z.array(
          z.object({
            id: z.string(),
            title: z.string(),
            slug: z.string().nullable(),
            folderId: z.string().nullable(),
            folderPath: z.string().nullable(),
            isPinned: z.boolean(),
            updatedAt: z.string(),
            score: z.number(),
            snippet: z.string(),
            highlights: z.array(z.string()),
          }),
        ),
      }),
      annotations: {
        title: "Search notes",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (input, extra) => {
      const userId = requireMcpUserId(extra);
      const results = await searchWorkspaceNotes(userId, input.query, {
        limit: input.limit,
      });
      const structured = {
        query: results.query,
        mode: results.mode,
        scannedNotes: results.scannedNotes,
        regexError: results.regexError,
        hits: results.hits.map((hit) => ({
          id: hit.id,
          title: hit.title,
          slug: hit.slug,
          folderId: hit.folderId,
          folderPath: hit.folderPath,
          isPinned: hit.isPinned,
          updatedAt: hit.updatedAt.toISOString(),
          score: hit.score,
          snippet: hit.snippet,
          highlights: hit.highlights,
        })),
      };

      return textResult(`Found ${structured.hits.length} note(s).`, structured);
    },
  );

  server.registerTool(
    "giraffle-export-note",
    {
      title: "Export note",
      description: "Export a note as Markdown or MDX derived from the canonical block document.",
      inputSchema: z
        .object({
          noteId: z.string().min(1).optional(),
          slug: z.string().min(1).max(240).optional(),
          format: z.enum(["markdown", "mdx"]).default("markdown"),
        })
        .strict()
        .refine((input) => Boolean(input.noteId) !== Boolean(input.slug), {
          message: "Provide exactly one of noteId or slug.",
        }),
      outputSchema: z
        .object({
          noteId: z.string(),
          title: z.string(),
          format: z.enum(["markdown", "mdx"]),
          publishPath: z.string(),
          content: z.string(),
        })
        .strict(),
      annotations: {
        title: "Export note",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (input, extra) => {
      const userId = requireMcpUserId(extra);
      const noteId = await resolveNoteId(userId, input);
      const note = await getNoteForExport(userId, noteId);

      if (!note) {
        throw new Error("Note not found");
      }

      const artifact = buildNoteExportArtifact(note);
      const result = {
        noteId: artifact.noteId,
        title: artifact.title,
        format: input.format,
        publishPath: artifact.publishPath,
        content: input.format === "mdx" ? artifact.mdx : artifact.markdown,
      };

      return textResult(`Exported \"${result.title}\" as ${input.format}.`, result);
    },
  );

  server.registerTool(
    "giraffle-get-backlinks",
    {
      title: "Get backlinks",
      description: "Get persisted backlinks pointing to a note.",
      inputSchema: NoteIdentifierInputSchema,
      outputSchema: z.object({
        noteId: z.string(),
        backlinks: z.array(
          z.object({
            sourceNoteId: z.string(),
            sourceNoteTitle: z.string(),
            sourceBlockId: z.string().nullable(),
            targetRaw: z.string(),
            linkType: z.string(),
          }),
        ),
      }),
      annotations: {
        title: "Get backlinks",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (input, extra) => {
      const userId = requireMcpUserId(extra);
      const noteId = await resolveNoteId(userId, input);
      const backlinks = await getBacklinks(userId, noteId);
      const result = { noteId, backlinks };

      return textResult(`Found ${backlinks.length} backlink(s).`, result);
    },
  );
}

function registerFolderTools(server: McpServer) {
  server.registerTool(
    "giraffle-create-folder",
    {
      title: "Create folder",
      description: "Create a folder, optionally nested under another folder.",
      inputSchema: z
        .object({
          name: z.string().min(1).max(160),
          icon: z.string().max(20).optional(),
          parentId: z.string().min(1).optional(),
        })
        .strict(),
      outputSchema: FolderSummarySchema,
      annotations: {
        title: "Create folder",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input, extra) => {
      const userId = requireMcpUserId(extra);
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

      if (!folder) {
        throw new Error("Folder not found");
      }

      const result = {
        ...folder,
        createdAt: folder.createdAt.toISOString(),
        updatedAt: folder.updatedAt.toISOString(),
      };

      return textResult(`Created folder \"${result.name}\" (${result.id}).`, result);
    },
  );

  server.registerTool(
    "giraffle-move-note",
    {
      title: "Move note to folder",
      description:
        "Move a note to another folder or to the root/inbox when targetFolderId is null. Use afterNoteId to place it after a sibling.",
      inputSchema: z
        .object({
          noteId: z.string().min(1),
          targetFolderId: z.string().min(1).nullable().optional(),
          afterNoteId: z.string().min(1).nullable().optional(),
        })
        .strict(),
      outputSchema: NoteMetadataSchema,
      annotations: {
        title: "Move note",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input, extra) => {
      const userId = requireMcpUserId(extra);
      await relocateNote(userId, input.noteId, {
        folderId: input.targetFolderId ?? null,
        afterNoteId: input.afterNoteId ?? null,
      });
      const note = await getNote(userId, input.noteId);
      const result = serializeNoteMetadata(note);

      return textResult(`Moved note \"${result.title}\".`, result);
    },
  );

  server.registerTool(
    "giraffle-list-folder",
    {
      title: "List folder",
      description:
        "List one folder's child folders and notes. Use folderId null or omit it to list the root/inbox.",
      inputSchema: z
        .object({
          folderId: z.string().min(1).nullable().optional(),
        })
        .strict(),
      outputSchema: z
        .object({
          folder: FolderSummarySchema.nullable(),
          folders: z.array(FolderSummarySchema),
          notes: z.array(NoteListItemSchema),
        })
        .strict(),
      annotations: {
        title: "List folder",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (input, extra) => {
      const userId = requireMcpUserId(extra);

      if (input.folderId) {
        const folder = await getFolder(userId, input.folderId);

        if (!folder) {
          throw new Error("Folder not found");
        }

        const result = {
          folder: {
            id: folder.id,
            name: folder.name,
            icon: folder.icon,
            parentId: folder.parentId,
            position: folder.position,
            createdAt: folder.createdAt.toISOString(),
            updatedAt: folder.updatedAt.toISOString(),
          },
          folders: folder.children.map((child) => ({
            id: child.id,
            name: child.name,
            icon: child.icon,
            parentId: child.parentId,
            position: child.position,
            createdAt: child.createdAt.toISOString(),
            updatedAt: child.updatedAt.toISOString(),
          })),
          notes: folder.notes.map((note) => ({
            ...note,
            updatedAt: note.updatedAt.toISOString(),
          })),
        };

        return textResult(`Listed folder \"${folder.name}\".`, result);
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

      const result = {
        folder: null,
        folders: folders.map((folder) => ({
          id: folder.id,
          name: folder.name,
          icon: folder.icon,
          parentId: folder.parentId,
          position: folder.position,
          createdAt: folder.createdAt.toISOString(),
          updatedAt: folder.updatedAt.toISOString(),
          noteCount: folder._count.notes,
        })),
        notes: notes.map((note) => ({
          ...note,
          updatedAt: note.updatedAt.toISOString(),
        })),
      };

      return textResult("Listed root folders and inbox notes.", result);
    },
  );
}
