import { z } from "zod";
import {
  createSavanna,
  deleteSavanna,
  getSavanna,
  listSavannas,
  renameSavanna,
} from "@/domain/savanna/savanna.service";
import type { InternalToolDefinition } from "../internal-tools";

/**
 * Savanna = infinite Excalidraw canvases. These tools expose the userId-scoped
 * canvas CRUD so any MCP client can manage the user's visual maps. Element
 * payloads are Excalidraw JSON and can be large, so the full array is only
 * returned when explicitly requested.
 */

function elementCount(elements: unknown): number {
  return Array.isArray(elements) ? elements.length : 0;
}

export const savannaTools: InternalToolDefinition[] = [
  {
    name: "savanna_list",
    destructive: false,
    description: "List the user's Savanna canvases (id, title, timestamps, element count).",
    inputSchema: z.object({}),
    execute: async (_raw, { userId }) => {
      const canvases = await listSavannas(userId);
      return {
        canvases: canvases.map((c) => ({
          id: c.id,
          title: c.title,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          elementCount: elementCount(c.elements),
        })),
      };
    },
  },
  {
    name: "savanna_get",
    destructive: false,
    description:
      "Get one Savanna canvas. By default returns metadata + element count; set includeElements to true to return the full Excalidraw element array and appState.",
    inputSchema: z.object({
      id: z.string().min(1),
      includeElements: z.boolean().optional(),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { id: string; includeElements?: boolean };
      const canvas = await getSavanna(userId, input.id);
      if (!canvas) throw new Error("Savanna not found");
      const base = {
        id: canvas.id,
        title: canvas.title,
        createdAt: canvas.createdAt.toISOString(),
        updatedAt: canvas.updatedAt.toISOString(),
        elementCount: elementCount(canvas.elements),
      };
      if (!input.includeElements) return base;
      // Guard the MCP token budget: very large canvases would blow the payload,
      // so refuse to inline the full element array past a sane cap.
      const ELEMENT_CAP = 1_500;
      if (base.elementCount > ELEMENT_CAP) {
        return {
          ...base,
          elementsOmitted: true,
          reason: `Canvas has ${base.elementCount} elements (cap ${ELEMENT_CAP}); too large to inline.`,
        };
      }
      return { ...base, elements: canvas.elements, appState: canvas.appState };
    },
  },
  {
    name: "savanna_create",
    destructive: true,
    description: "Create a new empty Savanna canvas with an optional title.",
    inputSchema: z.object({
      title: z.string().max(220).optional(),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { title?: string };
      const id = await createSavanna(userId, input.title);
      return { id };
    },
  },
  {
    name: "savanna_rename",
    destructive: true,
    description: "Rename a Savanna canvas.",
    inputSchema: z.object({
      id: z.string().min(1),
      title: z.string().min(1).max(220),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { id: string; title: string };
      await renameSavanna(userId, input.id, input.title);
      return { id: input.id, title: input.title };
    },
  },
  {
    name: "savanna_delete",
    destructive: true,
    description: "Permanently delete a Savanna canvas.",
    inputSchema: z.object({
      id: z.string().min(1),
    }),
    execute: async (raw, { userId }) => {
      const input = raw as { id: string };
      await deleteSavanna(userId, input.id);
      return { id: input.id, deleted: true };
    },
  },
];
