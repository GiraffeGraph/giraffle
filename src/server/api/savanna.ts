"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { persistedBlocksToDocument } from "@giraffle/domain";
import {
  createSavanna,
  deleteSavanna,
  getSavanna,
  listSavannas,
  renameSavanna,
  saveSavannaState,
  syncCanvasReferences,
} from "@/domain/savanna/savanna.service";
import { requireAuthenticatedUser } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { isRecord } from "@giraffle/domain";

function extractTextFromNode(node: unknown): string {
  if (!isRecord(node)) return "";

  const text = typeof node.text === "string" ? node.text : "";
  const children = Array.isArray(node.content)
    ? node.content.map((child) => extractTextFromNode(child)).join("")
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

function toJsonValue(value: unknown, fallback: Prisma.InputJsonValue): Prisma.InputJsonValue {
  if (value === undefined) return fallback;

  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return fallback;
  }
}

function sanitizeAppState(appState: unknown): Prisma.InputJsonObject {
  if (!isRecord(appState)) return {};

  const nextState: Record<string, Prisma.InputJsonValue> = {};

  if (typeof appState.viewBackgroundColor === "string") {
    nextState.viewBackgroundColor = appState.viewBackgroundColor;
  }

  if (typeof appState.scrollX === "number") {
    nextState.scrollX = appState.scrollX;
  }

  if (typeof appState.scrollY === "number") {
    nextState.scrollY = appState.scrollY;
  }

  if (isRecord(appState.zoom)) {
    const zoom = appState.zoom;
    if (typeof zoom.value === "number") {
      nextState.zoom = { value: zoom.value };
    }
  }

  if (typeof appState.theme === "string") {
    nextState.theme = appState.theme;
  }

  if (typeof appState.gridSize === "number") {
    nextState.gridSize = appState.gridSize;
  }

  if (typeof appState.gridStep === "number") {
    nextState.gridStep = appState.gridStep;
  }

  return nextState;
}

function randomSeed() {
  return Math.floor(Math.random() * 2_147_483_647);
}

function createExcalidrawTextElement(input: {
  id?: string;
  title: string;
  icon?: string | null;
  noteId: string;
  x: number;
  y: number;
}): Prisma.InputJsonObject {
  const id = input.id ?? crypto.randomUUID();
  const label = `${input.icon ?? "📄"} ${input.title || "Untitled"}`;
  const fontSize = 24;
  const width = Math.max(180, Math.min(520, Math.ceil(label.length * fontSize * 0.62)));
  const height = Math.ceil(fontSize * 1.35);

  return {
    id,
    type: "text",
    x: input.x,
    y: input.y,
    width,
    height,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: randomSeed(),
    version: 1,
    versionNonce: randomSeed(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: `/notes/${input.noteId}`,
    locked: false,
    text: label,
    fontSize,
    fontFamily: 5,
    textAlign: "left",
    verticalAlign: "top",
    containerId: null,
    originalText: label,
    autoResize: true,
    lineHeight: 1.25,
  };
}

function createExcalidrawArrowElement(input: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}): Prisma.InputJsonObject {
  return {
    id: crypto.randomUUID(),
    type: "arrow",
    x: input.x1,
    y: input.y1,
    width: input.x2 - input.x1,
    height: input.y2 - input.y1,
    angle: 0,
    strokeColor: "#8465d9",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: { type: 2 },
    seed: randomSeed(),
    version: 1,
    versionNonce: randomSeed(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    points: [
      [0, 0],
      [input.x2 - input.x1, input.y2 - input.y1],
    ],
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: "arrow",
  };
}

export async function getSavannasAction() {
  const { userId } = await requireAuthenticatedUser();
  return listSavannas(userId);
}

export async function createSavannaAction(title?: string) {
  const { userId } = await requireAuthenticatedUser();
  const canvasId = await createSavanna(userId, title);
  revalidatePath("/savanna");
  return canvasId;
}

export async function deleteSavannaAction(id: string) {
  const { userId } = await requireAuthenticatedUser();
  await deleteSavanna(userId, id);
  revalidatePath("/savanna");
}

export async function renameSavannaAction(id: string, title: string) {
  const { userId } = await requireAuthenticatedUser();
  await renameSavanna(userId, id, title);
  revalidatePath("/savanna");
}

export async function getSavannaAction(id: string) {
  const { userId } = await requireAuthenticatedUser();
  return getSavanna(userId, id);
}

export async function getSavannaNoteContentAction(noteId: string) {
  const { userId } = await requireAuthenticatedUser();
  const note = await db.note.findFirst({
    where: {
      id: noteId,
      userId,
      isArchived: false,
      boardTaskSource: null,
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
      boardTaskSource: null,
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

export async function saveSavannaStateAction(
  canvasId: string,
  elements: unknown[],
  appState: unknown,
) {
  const { userId } = await requireAuthenticatedUser();
  await saveSavannaState(
    userId,
    canvasId,
    elements,
    toJsonValue(elements, []),
    sanitizeAppState(appState),
  );
}

export async function createSavannaFromNoteAction(noteId: string) {
  const { userId } = await requireAuthenticatedUser();

  const note = await db.note.findUnique({
    where: { id: noteId },
    include: {
      boardTaskSource: { select: { id: true } },
      outgoingLinks: { include: { targetNote: { select: { id: true, title: true, icon: true } } } },
      incomingLinks: { include: { sourceNote: { select: { id: true, title: true, icon: true } } } },
    },
  });

  if (!note || note.userId !== userId || note.boardTaskSource) {
    throw new Error("Unauthorized");
  }

  const linkedNotes = [
    ...note.outgoingLinks.filter((link) => link.targetNote).map((link) => link.targetNote!),
    ...note.incomingLinks.filter((link) => link.sourceNote).map((link) => link.sourceNote),
  ].filter(
    (linkedNote, index, allNotes) =>
      allNotes.findIndex((candidate) => candidate.id === linkedNote.id) === index &&
      linkedNote.id !== noteId,
  );

  const center = { x: 0, y: 0 };
  const centerElement = createExcalidrawTextElement({
    id: crypto.randomUUID(),
    title: note.title,
    icon: note.icon,
    noteId: note.id,
    x: center.x,
    y: center.y,
  });

  const elements: Prisma.InputJsonValue[] = [centerElement];
  const radius = 360;
  const angleStep = linkedNotes.length > 0 ? (2 * Math.PI) / linkedNotes.length : 0;

  linkedNotes.forEach((linkedNote, index) => {
    const angle = index * angleStep - Math.PI / 2;
    const x = Math.round(Math.cos(angle) * radius);
    const y = Math.round(Math.sin(angle) * radius);

    elements.push(
      createExcalidrawTextElement({
        title: linkedNote.title,
        icon: linkedNote.icon,
        noteId: linkedNote.id,
        x,
        y,
      }),
    );

    elements.push(
      createExcalidrawArrowElement({
        x1: center.x + 110,
        y1: center.y + 18,
        x2: x + 90,
        y2: y + 18,
      }),
    );
  });

  const canvas = await db.canvas.create({
    data: {
      userId,
      title: `${note.title} — Savanna`,
      elements,
      appState: {
        viewBackgroundColor: "#ffffff",
        scrollX: 0,
        scrollY: 0,
        zoom: { value: 1 },
      },
    },
  });

  await syncCanvasReferences(userId, canvas.id, elements);
  revalidatePath("/savanna");
  return canvas.id;
}
