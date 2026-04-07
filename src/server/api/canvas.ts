"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/auth-session";

export async function getCanvasAction(id: string) {
  const { userId } = await requireAuthenticatedUser();
  const canvas = await db.canvas.findUnique({
    where: { id },
    include: {
      nodes: { include: { note: true } },
      edges: true,
    },
  });

  if (!canvas || canvas.userId !== userId) return null;
  return canvas;
}

export async function createMapFromNoteAction(noteId: string) {
  const { userId } = await requireAuthenticatedUser();
  
  const targetNote = await db.note.findUnique({ 
    where: { id: noteId },
    include: {
      incomingLinks: { include: { sourceNote: true } },
      outgoingLinks: { include: { targetNote: true } }
    }
  });

  if (!targetNote || targetNote.userId !== userId) throw new Error("Not bulunamadı");

  // A simple auto-layout for start
  const nodesCreateData = [{
    noteId: targetNote.id,
    x: 0,
    y: 0,
  }];

  let yOffset = -250;
  let edgesCreateData: any[] = [];

  // Outgoing links
  targetNote.outgoingLinks.forEach(link => {
    if(!link.targetNoteId) return;
    nodesCreateData.push({
      noteId: link.targetNoteId,
      x: 350,
      y: yOffset
    });
    // Edge will be handled below implicitly or manually after creation
    yOffset += 150;
  });

  const canvas = await db.canvas.create({
    data: {
      userId,
      title: `${targetNote.title} Haritası`,
      nodes: {
        create: nodesCreateData
      }
    },
    include: { nodes: true }
  });

  // Calculate edges
  if (targetNote.outgoingLinks.length > 0) {
    const centerNode = canvas.nodes.find((n: any) => n.noteId === targetNote.id);
    const edgesEdges = canvas.nodes
      .filter((n: any) => n.id !== centerNode?.id)
      .map((n: any) => ({
        canvasId: canvas.id,
        sourceNodeId: centerNode!.id,
        targetNodeId: n.id,
      }));
      
    if (edgesEdges.length > 0) {
      await db.canvasEdge.createMany({ data: edgesEdges });
    }
  }

  revalidatePath("/canvas");
  return canvas.id;
}
