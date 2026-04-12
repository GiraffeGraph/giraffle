"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/lib/auth-session";
import { db } from "@/lib/db";

export async function getSavannasAction() {
  const { userId } = await requireAuthenticatedUser();
  return db.canvas.findMany({
    where: { userId },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { nodes: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createSavannaAction(title?: string) {
  const { userId } = await requireAuthenticatedUser();
  const canvas = await db.canvas.create({
    data: {
      userId,
      title: title?.trim() || "New Savanna",
    },
  });
  revalidatePath("/savanna");
  return canvas.id;
}

export async function deleteSavannaAction(id: string) {
  const { userId } = await requireAuthenticatedUser();
  await db.canvas.deleteMany({ where: { id, userId } });
  revalidatePath("/savanna");
}

export async function renameSavannaAction(id: string, title: string) {
  const { userId } = await requireAuthenticatedUser();
  await db.canvas.updateMany({
    where: { id, userId },
    data: { title: title.trim() || "New Savanna" },
  });
  revalidatePath("/savanna");
}

export async function getSavannaAction(id: string) {
  const { userId } = await requireAuthenticatedUser();
  const canvas = await db.canvas.findUnique({
    where: { id },
    include: {
      nodes: {
        include: {
          note: { select: { id: true, title: true, icon: true } },
        },
      },
      edges: true,
    },
  });
  if (!canvas || canvas.userId !== userId) return null;
  return canvas;
}

export interface SavannaNodeInput {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  noteId?: string | null;
  data: Record<string, unknown>;
  color?: string | null;
}

export interface SavannaEdgeInput {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export async function saveSavannaStateAction(
  canvasId: string,
  nodes: SavannaNodeInput[],
  edges: SavannaEdgeInput[],
  camera: { x: number; y: number; zoom: number }
) {
  const { userId } = await requireAuthenticatedUser();
  const canvas = await db.canvas.findUnique({ where: { id: canvasId } });
  if (!canvas || canvas.userId !== userId) throw new Error("Unauthorized");

  await db.$transaction(async (tx) => {
    await tx.canvasEdge.deleteMany({ where: { canvasId } });
    await tx.canvasNode.deleteMany({ where: { canvasId } });
    await tx.canvas.update({
      where: { id: canvasId },
      data: {
        cameraX: camera.x,
        cameraY: camera.y,
        zoom: camera.zoom,
      },
    });
    if (nodes.length > 0) {
      await tx.canvasNode.createMany({
        data: nodes.map((n) => ({
          id: n.id,
          canvasId,
          type: n.type,
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height,
          noteId: n.noteId ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: n.data as any,
          color: n.color ?? null,
        })),
      });
    }
    if (edges.length > 0) {
      await tx.canvasEdge.createMany({
        data: edges.map((e) => ({
          id: e.id,
          canvasId,
          sourceNodeId: e.sourceNodeId,
          targetNodeId: e.targetNodeId,
          sourceHandle: e.sourceHandle ?? null,
          targetHandle: e.targetHandle ?? null,
        })),
      });
    }
  });
}

export async function createSavannaFromNoteAction(noteId: string) {
  const { userId } = await requireAuthenticatedUser();

  const note = await db.note.findUnique({
    where: { id: noteId },
    include: {
      outgoingLinks: { include: { targetNote: { select: { id: true, title: true, icon: true } } } },
      incomingLinks: { include: { sourceNote: { select: { id: true, title: true, icon: true } } } },
    },
  });

  if (!note || note.userId !== userId) throw new Error("Unauthorized");

  const linkedNotes = [
    ...note.outgoingLinks.filter((l) => l.targetNote).map((l) => l.targetNote!),
    ...note.incomingLinks.filter((l) => l.sourceNote).map((l) => l.sourceNote),
  ].filter((n, i, arr) => arr.findIndex((x) => x.id === n.id) === i && n.id !== noteId);

  const centerNodeId = crypto.randomUUID();
  const nodeRows: {
    id: string; canvasId: string; type: string; x: number; y: number;
    width: number; height: number; noteId: string;
    data: { noteId: string; title: string; icon: string | null };
  }[] = [];

  nodeRows.push({
    id: centerNodeId,
    canvasId: "", // filled after canvas create
    type: "noteCard",
    x: 0,
    y: 0,
    width: 220,
    height: 80,
    noteId: note.id,
    data: { noteId: note.id, title: note.title, icon: note.icon },
  });

  const angleStep = linkedNotes.length > 0 ? (2 * Math.PI) / linkedNotes.length : 0;
  const radius = 340;
  const linkedNodeIds: string[] = [];

  linkedNotes.forEach((ln, idx) => {
    const angle = idx * angleStep - Math.PI / 2;
    const id = crypto.randomUUID();
    linkedNodeIds.push(id);
    nodeRows.push({
      id,
      canvasId: "",
      type: "noteCard",
      x: Math.round(Math.cos(angle) * radius),
      y: Math.round(Math.sin(angle) * radius),
      width: 220,
      height: 80,
      noteId: ln.id,
      data: { noteId: ln.id, title: ln.title, icon: ln.icon },
    });
  });

  const canvas = await db.canvas.create({
    data: {
      userId,
      title: `${note.title} — map`,
      nodes: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: nodeRows.map(({ canvasId: _c, ...n }) => ({ ...n, data: n.data as any })),
      },
    },
    include: { nodes: { select: { id: true } } },
  });

  if (linkedNodeIds.length > 0) {
    await db.canvasEdge.createMany({
      data: linkedNodeIds.map((targetId) => ({
        id: crypto.randomUUID(),
        canvasId: canvas.id,
        sourceNodeId: centerNodeId,
        targetNodeId: targetId,
      })),
    });
  }

  revalidatePath("/savanna");
  return canvas.id;
}
