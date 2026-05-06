"use server";

import { getNoteCategories } from "@/domain/category/category.service";
import { normalizeNoteCategoryColor } from "@/domain/category/category.types";
import { getFolders } from "@/domain/folder/folder.service";
import { db } from "@/lib/db";
import { requireAuthenticatedUser } from "@/lib/auth-session";
import { buildLibraryWorkspaceSeed } from "./library.data";

function elementCount(elements: unknown): number {
  return Array.isArray(elements) ? elements.length : 0;
}

export async function getLibraryWorkspaceSeed() {
  const { userId } = await requireAuthenticatedUser();

  const [folders, categories, notes, canvases, assets] = await Promise.all([
    getFolders(userId),
    getNoteCategories(userId),
    db.note.findMany({
      where: {
        userId,
        isArchived: false,
      },
      orderBy: [
        { isPinned: "desc" },
        { position: "asc" },
        { updatedAt: "desc" },
      ],
      select: {
        id: true,
        title: true,
        slug: true,
        icon: true,
        folderId: true,
        position: true,
        isPinned: true,
        isPublished: true,
        updatedAt: true,
        createdAt: true,
        category: {
          select: {
            id: true,
            name: true,
            color: true,
            icon: true,
          },
        },
      },
    }),
    db.canvas.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        updatedAt: true,
        createdAt: true,
        elements: true,
      },
    }),
    db.mediaAsset.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        updatedAt: true,
        createdAt: true,
        note: {
          select: {
            id: true,
            title: true,
            folderId: true,
          },
        },
      },
    }),
  ]);

  return buildLibraryWorkspaceSeed({
    folders,
    categories,
    notes: notes.map((note) => ({
      ...note,
      category: note.category
        ? {
            ...note.category,
            color: normalizeNoteCategoryColor(note.category.color),
          }
        : null,
    })),
    canvases: canvases.map((canvas) => ({
      ...canvas,
      nodeCount: elementCount(canvas.elements),
    })),
    assets,
  });
}
