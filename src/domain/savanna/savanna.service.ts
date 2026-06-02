import { db } from "@/lib/db";

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
  await db.canvas.updateMany({
    where: { id, userId },
    data: { title: title.trim() || DEFAULT_TITLE },
  });
}

export async function getSavanna(userId: string, id: string) {
  const canvas = await db.canvas.findUnique({ where: { id } });
  if (!canvas || canvas.userId !== userId) return null;
  return canvas;
}
