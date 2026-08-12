import { z } from "zod";
import { EDITOR_NODE_TYPES } from "../document/document.types";

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
      type: z.enum(EDITOR_NODE_TYPES),
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

export const PageMetadataSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    icon: z.string().nullable(),
    parentId: z.string().nullable(),
    position: z.string(),
    isPinned: z.boolean(),
    isArchived: z.boolean(),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict();

export const PageWithDocumentSchema = z
  .object({
    metadata: PageMetadataSchema,
    document: TiptapDocumentSchema,
    markdown: z.string().optional(),
  })
  .strict();

export const TaskPrioritySchema = z.enum(["do", "schedule", "delegate", "eliminate"]);
