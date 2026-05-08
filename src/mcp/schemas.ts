import { z } from "zod";
import { BLOCK_TYPES, EISENHOWER_QUADRANTS } from "@/domain/note/note.types";

export const IsoDateStringSchema = z.string();

const JsonSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonSchema),
    z.record(z.string(), JsonSchema),
  ]),
);

const BlockMarkSchema = z
  .object({
    type: z.string().min(1).max(80),
    attrs: z.record(z.string(), JsonSchema).optional(),
  })
  .strict();

export const TextNodeSchema = z
  .object({
    type: z.literal("text"),
    text: z.string().max(20_000),
    marks: z.array(BlockMarkSchema).max(20).optional(),
  })
  .strict();

export const TiptapNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([TextNodeSchema, BlockNodeContentSchema]),
);

export const BlockNodeContentSchema: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      type: z.enum(BLOCK_TYPES),
      attrs: z.record(z.string(), JsonSchema).optional(),
      content: z.array(TiptapNodeSchema).max(500).optional(),
      marks: z.array(BlockMarkSchema).max(20).optional(),
    })
    .strict(),
);

export const TiptapDocumentSchema = z
  .object({
    type: z.literal("doc"),
    content: z.array(BlockNodeContentSchema).max(500),
  })
  .strict();

export const NoteMetadataSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    slug: z.string().nullable(),
    icon: z.string().nullable(),
    coverImage: z.string().nullable().optional(),
    folderId: z.string().nullable(),
    position: z.number().int().optional(),
    isPinned: z.boolean(),
    isArchived: z.boolean(),
    isPublished: z.boolean(),
    quadrant: z.enum(EISENHOWER_QUADRANTS).nullable().optional(),
    createdAt: IsoDateStringSchema,
    updatedAt: IsoDateStringSchema,
  })
  .strict();

export const NoteWithDocumentSchema = z
  .object({
    metadata: NoteMetadataSchema,
    document: TiptapDocumentSchema,
    markdown: z.string().optional(),
  })
  .strict();

export const FolderSummarySchema = z
  .object({
    id: z.string(),
    name: z.string(),
    icon: z.string().nullable(),
    parentId: z.string().nullable(),
    position: z.number().int(),
    createdAt: IsoDateStringSchema.optional(),
    updatedAt: IsoDateStringSchema.optional(),
    noteCount: z.number().int().optional(),
  })
  .strict();

export const NoteListItemSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    slug: z.string().nullable().optional(),
    icon: z.string().nullable().optional(),
    folderId: z.string().nullable().optional(),
    isPinned: z.boolean().optional(),
    position: z.number().int().optional(),
    updatedAt: IsoDateStringSchema.optional(),
  })
  .strict();

export const NoteIdentifierInputSchema = z
  .object({
    noteId: z.string().min(1).optional(),
    slug: z.string().min(1).max(240).optional(),
  })
  .strict()
  .refine((input) => Boolean(input.noteId) !== Boolean(input.slug), {
    message: "Provide exactly one of noteId or slug.",
  });
