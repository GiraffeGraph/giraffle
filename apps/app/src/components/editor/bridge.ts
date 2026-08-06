import { z } from "zod";

const node: z.ZodType<unknown> = z.lazy(() => z.object({
  type: z.string().min(1).max(64),
  attrs: z.record(z.string(), z.unknown()).optional(),
  content: z.array(node).optional(),
  text: z.string().max(1_000_000).optional(),
  marks: z.array(z.record(z.string(), z.unknown())).optional()
}).strict());

export const editorMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready"), bridgeVersion: z.literal(1) }).strict(),
  z.object({ type: z.literal("document-change"), bridgeVersion: z.literal(1), document: z.object({ type: z.literal("doc"), content: z.array(node).max(100_000) }).strict() }).strict(),
  z.object({ type: z.literal("task-toggle"), bridgeVersion: z.literal(1), blockId: z.string().uuid(), checked: z.boolean() }).strict(),
  z.object({ type: z.literal("open-link"), bridgeVersion: z.literal(1), target: z.string().min(1).max(512) }).strict(),
  z.object({ type: z.literal("attachment-request"), bridgeVersion: z.literal(1), accept: z.array(z.string()).max(32) }).strict(),
  z.object({ type: z.literal("focus-change"), bridgeVersion: z.literal(1), focused: z.boolean() }).strict(),
  z.object({ type: z.literal("bridge-error"), bridgeVersion: z.literal(1), message: z.string().min(1).max(300) }).strict()
]);
export type EditorMessage = z.infer<typeof editorMessageSchema>;
export function parseEditorMessage(raw: string): EditorMessage { return editorMessageSchema.parse(JSON.parse(raw)); }
