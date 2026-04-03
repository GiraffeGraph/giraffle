"use server";

import { db } from "@/lib/db";
import type { CreateFolderInput, UpdateFolderInput } from "./folder.types";

/**
 * Get all root-level folders with note counts.
 */
export async function getFolders() {
  return db.folder.findMany({
    where: { parentId: null },
    orderBy: { position: "asc" },
    include: {
      children: {
        orderBy: { position: "asc" },
      },
      _count: { select: { notes: true } },
    },
  });
}

/**
 * Get a folder with its children and notes.
 */
export async function getFolder(folderId: string) {
  return db.folder.findUnique({
    where: { id: folderId },
    include: {
      children: { orderBy: { position: "asc" } },
      notes: {
        where: { isArchived: false },
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, icon: true, updatedAt: true },
      },
    },
  });
}

/**
 * Create a new folder.
 */
export async function createFolder(input: CreateFolderInput): Promise<string> {
  const folder = await db.folder.create({
    data: {
      name: input.name,
      icon: input.icon,
      parentId: input.parentId,
    },
  });
  return folder.id;
}

/**
 * Update a folder.
 */
export async function updateFolder(
  folderId: string,
  input: UpdateFolderInput
): Promise<void> {
  await db.folder.update({
    where: { id: folderId },
    data: input,
  });
}

/**
 * Delete a folder and cascade to children.
 */
export async function deleteFolder(folderId: string): Promise<void> {
  await db.folder.delete({ where: { id: folderId } });
}
