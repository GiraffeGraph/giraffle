"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/lib/auth-session";
import { db } from "@/lib/db";

export async function getCanvasAction(id: string) {
  const { userId } = await requireAuthenticatedUser();
  const canvas = await db.canvas.findUnique({
    where: { id },
    include: {
      nodes: { include: { note: true } },
      edges: true,
    },
  });

  if (!canvas || canvas.userId !== userId) {
    return null;
  }

  return canvas;
}

export async function createMapFromNoteAction(noteId: string) {
  const { userId } = await requireAuthenticatedUser();

  const targetNote = await db.note.findUnique({
    where: { id: noteId },
    include: {
      incomingLinks: { include: { sourceNote: true } },
      outgoingLinks: { include: { targetNote: true } },
    },
  });

  if (!targetNote || targetNote.userId !== userId) {
    throw new Error("Not bulunamadı");
  }

  const nodesCreateData = [
    {
      noteId: targetNote.id,
      x: 0,
      y: 0,
    },
  ];

  let yOffset = -250;

  for (const link of targetNote.outgoingLinks) {
    if (!link.targetNoteId) {
      continue;
    }

    nodesCreateData.push({
      noteId: link.targetNoteId,
      x: 350,
      y: yOffset,
    });
    yOffset += 150;
  }

  const canvas = await db.canvas.create({
    data: {
      userId,
      title: `${targetNote.title} Haritası`,
      nodes: {
        create: nodesCreateData,
      },
    },
    include: { nodes: true },
  });

  const centerNode = canvas.nodes.find((node) => node.noteId === targetNote.id);

  if (centerNode) {
    const edges = canvas.nodes
      .filter((node) => node.id !== centerNode.id)
      .map((node) => ({
        canvasId: canvas.id,
        sourceNodeId: centerNode.id,
        targetNodeId: node.id,
      }));

    if (edges.length > 0) {
      await db.canvasEdge.createMany({ data: edges });
    }
  }

  revalidatePath("/canvas");
  return canvas.id;
}
