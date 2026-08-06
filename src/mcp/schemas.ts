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
    icon: z.string().nullable(),
    coverImage: z.string().nullable().optional(),
    parentId: z.string().nullable(),
    position: z.string().optional(),
    isPinned: z.boolean(),
    isArchived: z.boolean(),
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

export const NoteListItemSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    icon: z.string().nullable().optional(),
    parentId: z.string().nullable().optional(),
    isPinned: z.boolean().optional(),
    position: z.string().optional(),
    updatedAt: IsoDateStringSchema.optional(),
  })
  .strict();

export const NoteIdentifierInputSchema = z
  .object({
    noteId: z.string().min(1),
  })
  .strict();
