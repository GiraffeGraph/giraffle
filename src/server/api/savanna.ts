"use server";

import { revalidatePath } from "next/cache";
import { persistedBlocksToDocument } from "@/domain/note/block-tree";
import { requireAuthenticatedUser } from "@/lib/auth-session";
import { db } from "@/lib/db";

function extractTextFromNode(node: unknown): string {
  if (!node || typeof node !== "object") return "";

  const value = node as Record<string, unknown>;
  const text = typeof value.text === "string" ? value.text : "";
  const children = Array.isArray(value.content)
    ? value.content.map((child) => extractTextFromNode(child)).join("")
    : "";

  return `${text}${children}`;
}

function summarizeBlocks(blocks: Array<{ content: unknown }>, maxLength = 6000): string {
  const body = blocks
    .map((block) => extractTextFromNode(block.content).trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (body.length <= maxLength) return body;
  return `${body.slice(0, maxLength).trimEnd()}…`;
}

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

  const noteNodes = canvas.nodes.filter(
    (node) => typeof node.noteId === "string" && node.noteId.length > 0,
  );
  const noteIds = Array.from(new Set(noteNodes.map((node) => node.noteId!)));

  if (noteIds.length < 2) return canvas;

  const noteLinks = await db.link.findMany({
    where: {
      sourceNoteId: { in: noteIds },
      targetNoteId: { in: noteIds },
      sourceNote: { userId },
      targetNote: { userId },
    },
    select: {
      sourceNoteId: true,
      targetNoteId: true,
    },
  });

  if (noteLinks.length === 0) return canvas;

  const noteIdByNodeId = new Map<string, string>();
  const primaryNodeIdByNoteId = new Map<string, string>();

  for (const node of noteNodes) {
    if (!node.noteId) continue;
    noteIdByNodeId.set(node.id, node.noteId);

    if (!primaryNodeIdByNoteId.has(node.noteId)) {
      primaryNodeIdByNoteId.set(node.noteId, node.id);
    }
  }

  const existingPairs = new Set<string>();
  for (const edge of canvas.edges) {
    const sourceNoteId = noteIdByNodeId.get(edge.sourceNodeId);
    const targetNoteId = noteIdByNodeId.get(edge.targetNodeId);
    if (!sourceNoteId || !targetNoteId) continue;
    existingPairs.add(`${sourceNoteId}->${targetNoteId}`);
  }

  const linkedEdges = noteLinks
    .filter((link) => typeof link.targetNoteId === "string")
    .flatMap((link) => {
      const sourceNodeId = primaryNodeIdByNoteId.get(link.sourceNoteId);
      const targetNoteId = link.targetNoteId as string;
      const targetNodeId = primaryNodeIdByNoteId.get(targetNoteId);

      if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) {
        return [];
      }

      const pairKey = `${link.sourceNoteId}->${targetNoteId}`;
      if (existingPairs.has(pairKey)) {
        return [];
      }

      existingPairs.add(pairKey);
      return [
        {
          id: `savanna-link:${link.sourceNoteId}:${targetNoteId}`,
          canvasId: canvas.id,
          sourceNodeId,
          targetNodeId,
          sourceHandle: null,
          targetHandle: null,
          data: { origin: "note-link" },
          type: "default",
        },
      ];
    });

  if (linkedEdges.length === 0) return canvas;

  return {
    ...canvas,
    edges: [...canvas.edges, ...linkedEdges],
  };
}

export async function getSavannaNoteContentAction(noteId: string) {
  const { userId } = await requireAuthenticatedUser();
  const note = await db.note.findFirst({
    where: {
      id: noteId,
      userId,
      isArchived: false,
    },
    select: {
      id: true,
      title: true,
      icon: true,
      updatedAt: true,
      blocks: {
        select: { content: true },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!note) return null;

  return {
    id: note.id,
    title: note.title,
    icon: note.icon,
    updatedAt: note.updatedAt,
    content: summarizeBlocks(note.blocks),
  };
}

export async function getSavannaNoteEditorAction(noteId: string) {
  const { userId } = await requireAuthenticatedUser();
  const note = await db.note.findFirst({
    where: {
      id: noteId,
      userId,
      isArchived: false,
    },
    select: {
      id: true,
      title: true,
      icon: true,
      updatedAt: true,
      blocks: {
        select: {
          id: true,
          type: true,
          content: true,
          attributes: true,
          parentId: true,
          position: true,
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!note) return null;

  return {
    id: note.id,
    title: note.title,
    icon: note.icon,
    updatedAt: note.updatedAt,
    summary: summarizeBlocks(note.blocks),
    document: persistedBlocksToDocument(
      note.blocks.map((block) => ({
        id: block.id,
        type: block.type,
        content: block.content,
        attributes: block.attributes,
        parentId: block.parentId,
        position: block.position,
      })),
    ),
  };
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

export async function saveSavannaCameraAction(
  canvasId: string,
  camera: { x: number; y: number; zoom: number },
) {
  const { userId } = await requireAuthenticatedUser();
  const result = await db.canvas.updateMany({
    where: { id: canvasId, userId },
    data: {
      cameraX: camera.x,
      cameraY: camera.y,
      zoom: camera.zoom,
    },
  });

  if (result.count === 0) {
    throw new Error("Unauthorized");
  }
}

async function syncSavannaLinksFromEdges(
  userId: string,
  nodes: SavannaNodeInput[],
  edges: SavannaEdgeInput[],
): Promise<number> {
  const noteIdByNodeId = new Map<string, string>();

  for (const node of nodes) {
    if (node.type !== "noteCard") continue;
    if (typeof node.noteId !== "string" || node.noteId.length === 0) continue;
    noteIdByNodeId.set(node.id, node.noteId);
  }

  if (noteIdByNodeId.size < 2 || edges.length === 0) {
    return 0;
  }

  const pairKeys = new Set<string>();

  for (const edge of edges) {
    const sourceNoteId = noteIdByNodeId.get(edge.sourceNodeId);
    const targetNoteId = noteIdByNodeId.get(edge.targetNodeId);

    if (!sourceNoteId || !targetNoteId || sourceNoteId === targetNoteId) continue;

    pairKeys.add(`${sourceNoteId}:::${targetNoteId}`);
  }

  if (pairKeys.size === 0) {
    return 0;
  }

  const pairs = Array.from(pairKeys).map((key) => {
    const [sourceNoteId, targetNoteId] = key.split(":::");
    return { sourceNoteId, targetNoteId };
  });

  const sourceNoteIds = Array.from(new Set(pairs.map((pair) => pair.sourceNoteId)));
  const targetNoteIds = Array.from(new Set(pairs.map((pair) => pair.targetNoteId)));
  const allNoteIds = Array.from(new Set([...sourceNoteIds, ...targetNoteIds]));

  const [ownedNotes, existingLinks] = await Promise.all([
    db.note.findMany({
      where: {
        id: { in: allNoteIds },
        userId,
        isArchived: false,
      },
      select: {
        id: true,
        title: true,
      },
    }),
    db.link.findMany({
      where: {
        sourceNoteId: { in: sourceNoteIds },
        targetNoteId: { in: targetNoteIds },
        sourceNote: { userId },
        targetNote: { userId },
      },
      select: {
        sourceNoteId: true,
        targetNoteId: true,
      },
    }),
  ]);

  const titleByNoteId = new Map(ownedNotes.map((note) => [note.id, note.title]));
  const existingPairSet = new Set(
    existingLinks
      .filter((link) => typeof link.targetNoteId === "string")
      .map((link) => `${link.sourceNoteId}->${link.targetNoteId as string}`),
  );

  const linksToCreate = pairs
    .filter((pair) => titleByNoteId.has(pair.sourceNoteId) && titleByNoteId.has(pair.targetNoteId))
    .filter((pair) => !existingPairSet.has(`${pair.sourceNoteId}->${pair.targetNoteId}`))
    .map((pair) => ({
      sourceNoteId: pair.sourceNoteId,
      sourceBlockId: null,
      targetRaw: titleByNoteId.get(pair.targetNoteId)!,
      targetNoteId: pair.targetNoteId,
      linkType: "savanna",
    }));

  if (linksToCreate.length === 0) {
    return 0;
  }

  await db.link.createMany({ data: linksToCreate });
  return linksToCreate.length;
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

  const createdLinks = await syncSavannaLinksFromEdges(userId, nodes, edges);
  if (createdLinks > 0) {
    revalidatePath("/graph");
  }
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
      title: `${note.title} — Savanna`,
      nodes: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
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
