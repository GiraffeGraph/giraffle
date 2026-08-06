import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isRecord } from "@/lib/utils";

/**
 * Savanna = infinite Excalidraw canvas. userId-scoped service layer shared by
 * the server actions (the UI auth boundary) and the MCP tool registry, so any
 * client drives the same ownership-checked operations.
 */

const DEFAULT_TITLE = "New Savanna";

export async function listSavannas(userId: string) {
  return db.canvas.findMany({
    where: { userId },
    select: { id: true, title: true, createdAt: true, updatedAt: true, elements: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createSavanna(userId: string, title?: string): Promise<string> {
  const canvas = await db.canvas.create({
    data: { userId, title: title?.trim() || DEFAULT_TITLE },
  });
  return canvas.id;
}

export async function deleteSavanna(userId: string, id: string): Promise<void> {
  await db.canvas.deleteMany({ where: { id, userId } });
}

export async function renameSavanna(userId: string, id: string, title: string): Promise<void> {
  const result = await db.canvas.updateMany({
    where: { id, userId },
    data: { title: title.trim() || DEFAULT_TITLE },
  });
  if (result.count === 0) throw new Error(`Savanna not found: ${id}`);
}

export async function getSavanna(userId: string, id: string) {
  const canvas = await db.canvas.findUnique({ where: { id } });
  if (!canvas || canvas.userId !== userId) return null;
  return canvas;
}

type CanvasReferenceInput = { elementId: string; noteId: string };

export function extractCanvasReferences(elements: unknown[]): CanvasReferenceInput[] {
  const references = new Map<string, CanvasReferenceInput>();
  for (const element of elements) {
    if (!isRecord(element) || element.isDeleted === true) continue;
    if (typeof element.id !== "string" || typeof element.link !== "string") continue;

    let pathname = element.link;
    try {
      pathname = new URL(element.link, "https://giraffle.local").pathname;
    } catch {
      continue;
    }
    const match = pathname.match(/^\/notes\/([^/]+)(?:\/embed)?\/?$/);
    if (!match) continue;
    references.set(element.id, { elementId: element.id, noteId: match[1] });
  }
  return [...references.values()];
}

export async function saveSavannaState(
  userId: string,
  canvasId: string,
  elements: unknown[],
  elementsJson: Prisma.InputJsonValue,
  appStateJson: Prisma.InputJsonValue,
): Promise<void> {
  const extracted = extractCanvasReferences(elements);
  await db.$transaction(async (tx) => {
    const canvas = await tx.canvas.findFirst({
      where: { id: canvasId, userId },
      select: { id: true },
    });
    if (!canvas) throw new Error("Savanna not found");

    const validNotes = extracted.length > 0
      ? await tx.note.findMany({
          where: {
            userId,
            boardTaskSource: null,
            id: { in: extracted.map((reference) => reference.noteId) },
          },
          select: { id: true },
        })
      : [];
    const validNoteIds = new Set(validNotes.map((note) => note.id));
    const references = extracted.filter((reference) => validNoteIds.has(reference.noteId));

    await tx.canvas.update({
      where: { id: canvasId },
      data: { elements: elementsJson, appState: appStateJson },
    });
    await tx.canvasReference.deleteMany({ where: { canvasId } });
    if (references.length > 0) {
      await tx.canvasReference.createMany({
        data: references.map((reference) => ({ canvasId, ...reference })),
      });
    }
  });
}

export async function syncCanvasReferences(
  userId: string,
  canvasId: string,
  elements: unknown[],
): Promise<void> {
  const canvas = await db.canvas.findFirst({
    where: { id: canvasId, userId },
    select: { appState: true },
  });
  if (!canvas) throw new Error("Savanna not found");
  await saveSavannaState(
    userId,
    canvasId,
    elements,
    JSON.parse(JSON.stringify(elements)) as Prisma.InputJsonValue,
    canvas.appState as Prisma.InputJsonValue,
  );
}
