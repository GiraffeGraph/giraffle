"use server";

import { db } from "@/lib/db";
import { COAT_CELL_COLORS } from "./coat-canvas.types";
import type {
  CoatCanvas,
  CoatCanvasSummary,
  CoatCellColor,
  CreateCanvasInput,
  NotePreview,
  UpdateCellInput,
} from "./coat-canvas.types";

function extractBlockText(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const node = content as Record<string, unknown>;
  if (node.type === "text" && typeof node.text === "string") return node.text;
  if (Array.isArray(node.content)) {
    return (node.content as unknown[]).map(extractBlockText).join("");
  }
  return "";
}

function buildPreviewText(blocks: Array<{ type: string; content: unknown }>): string {
  const lines: string[] = [];
  for (const block of blocks) {
    const text = extractBlockText(block.content).trim();
    if (text) lines.push(text);
    if (lines.length >= 8) break;
  }
  return lines.join("\n");
}

function parseColor(color: string | null | undefined): CoatCellColor | null {
  return (COAT_CELL_COLORS as readonly string[]).includes(color ?? "")
    ? (color as CoatCellColor)
    : null;
}

async function assertOwnedCanvas(canvasId: string, userId: string) {
  const canvas = await db.coatCanvas.findFirst({
    where: { id: canvasId, userId },
    select: { id: true },
  });
  if (!canvas) throw new Error("Canvas not found");
  return canvas;
}

export async function getCoatCanvases(
  userId: string
): Promise<CoatCanvasSummary[]> {
  const rows = await db.coatCanvas.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      columns: true,
      updatedAt: true,
      _count: { select: { cells: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    columns: r.columns,
    cellCount: r._count.cells,
    updatedAt: r.updatedAt,
  }));
}

export async function getCoatCanvas(
  userId: string,
  canvasId: string
): Promise<CoatCanvas | null> {
  const canvas = await db.coatCanvas.findFirst({
    where: { id: canvasId, userId },
    include: {
      cells: {
        orderBy: { position: "asc" },
        include: {
          note: {
            select: {
              id: true,
              title: true,
              icon: true,
              blocks: {
                where: { parentId: null },
                orderBy: { position: "asc" },
                take: 10,
                select: { type: true, content: true },
              },
            },
          },
        },
      },
    },
  });

  if (!canvas) return null;

  return {
    ...canvas,
    cells: canvas.cells.map((c) => {
      const note = c.note;
      const notePreview: NotePreview | null = note
        ? {
            id: note.id,
            title: note.title,
            icon: note.icon,
            previewText: buildPreviewText(
              note.blocks.map((b) => ({ type: b.type, content: b.content }))
            ),
          }
        : null;

      return {
        ...c,
        noteId: c.noteId,
        note: notePreview,
        color: parseColor(c.color),
      };
    }),
  };
}

export async function createCoatCanvas(
  userId: string,
  input: CreateCanvasInput
): Promise<string> {
  const canvas = await db.coatCanvas.create({
    data: {
      userId,
      title: input.title ?? "Yeni Canvas",
      cells: {
        create: (input.cells ?? []).map((cell, i) => ({
          title: cell.title,
          content: cell.content ?? "",
          colSpan: cell.colSpan,
          rowSpan: cell.rowSpan,
          color: cell.color ?? null,
          position: i,
        })),
      },
    },
    select: { id: true },
  });

  return canvas.id;
}

export async function updateCanvasTitle(
  userId: string,
  canvasId: string,
  title: string
): Promise<void> {
  await db.coatCanvas.updateMany({
    where: { id: canvasId, userId },
    data: { title, updatedAt: new Date() },
  });
}

export async function addCoatCell(
  userId: string,
  canvasId: string,
  input: {
    title?: string;
    colSpan?: number;
    rowSpan?: number;
    color?: CoatCellColor;
    noteId?: string;
  }
): Promise<string> {
  await assertOwnedCanvas(canvasId, userId);

  const lastCell = await db.coatCell.findFirst({
    where: { canvasId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const nextPosition = (lastCell?.position ?? -1) + 1;

  let noteTitle = input.title;
  if (input.noteId) {
    const note = await db.note.findFirst({
      where: { id: input.noteId, userId },
      select: { title: true },
    });
    if (!note) throw new Error("Note not found");
    noteTitle = noteTitle ?? note.title;
  }

  const cell = await db.coatCell.create({
    data: {
      canvasId,
      noteId: input.noteId ?? null,
      title: noteTitle ?? "",
      content: "",
      colSpan: input.colSpan ?? 4,
      rowSpan: input.rowSpan ?? 1,
      color: input.color ?? null,
      position: nextPosition,
    },
    select: { id: true },
  });

  await db.coatCanvas.update({
    where: { id: canvasId },
    data: { updatedAt: new Date() },
  });

  return cell.id;
}

export async function updateCoatCell(
  userId: string,
  canvasId: string,
  cellId: string,
  input: UpdateCellInput
): Promise<void> {
  await assertOwnedCanvas(canvasId, userId);

  await db.coatCell.updateMany({
    where: { id: cellId, canvasId },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.content !== undefined && { content: input.content }),
      ...(input.colSpan !== undefined && { colSpan: input.colSpan }),
      ...(input.rowSpan !== undefined && { rowSpan: input.rowSpan }),
      ...(Object.prototype.hasOwnProperty.call(input, "color") && {
        color: input.color ?? null,
      }),
      ...(input.position !== undefined && { position: input.position }),
      ...(Object.prototype.hasOwnProperty.call(input, "noteId") && {
        noteId: input.noteId ?? null,
      }),
      updatedAt: new Date(),
    },
  });

  await db.coatCanvas.update({
    where: { id: canvasId },
    data: { updatedAt: new Date() },
  });
}

export async function removeCoatCell(
  userId: string,
  canvasId: string,
  cellId: string
): Promise<void> {
  await assertOwnedCanvas(canvasId, userId);
  await db.coatCell.deleteMany({ where: { id: cellId, canvasId } });
  await db.coatCanvas.update({
    where: { id: canvasId },
    data: { updatedAt: new Date() },
  });
}

export async function deleteCoatCanvas(
  userId: string,
  canvasId: string
): Promise<void> {
  await db.coatCanvas.deleteMany({ where: { id: canvasId, userId } });
}
